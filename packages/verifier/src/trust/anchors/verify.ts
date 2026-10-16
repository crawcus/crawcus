/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trust-anchor verification (VER-1..VER-7) and mapping into the
 * pinned-key `TrustPolicy` (TA-9).
 *
 * Trust starts from an out-of-band root pin (README fingerprints or the
 * copy embedded in a verifier release) and moves forward only through
 * documents signed by a threshold of the currently trusted root and,
 * on every step, of the new document's own root (TUF root rotation).
 * Rollback is rejected, equal versions must be byte-identical, and an
 * expired trusted document fails closed, online or offline.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import { parseTrustPolicy } from '../parse-policy.js';
import { rawFromSpkiBase64 } from '../keyid.js';
import type { RevokedKey, TrustAnchor, TrustPolicy } from '../types.js';
import { parseTrustAnchors } from './parse.js';
import { trustAnchorsSigningInput } from './sign.js';
import type {
  KeyPurpose,
  ParsedTrustAnchors,
  PinnedRoot,
  TrustAnchorsErrorCode,
  TrustAnchorsSigned,
  TrustAnchorsStore,
} from './types.js';

export type AnchorsFail = { readonly kind: 'fail'; readonly code: TrustAnchorsErrorCode; readonly detail: string };
export type AnchorsOk = { readonly kind: 'ok'; readonly anchors: ParsedTrustAnchors };

export interface AnchorCheckOptions {
  /** Evaluation instant. Defaults to the current clock. */
  readonly now?: Date | string;
  /** Allows `roles.root.threshold` of 1 (TA-6). Never set in production. */
  readonly testMode?: boolean;
}

/** keyids of `rootOf`'s active root keys whose signatures over `doc` verify. */
export function validRootSignatures(doc: ParsedTrustAnchors, rootOf: TrustAnchorsSigned): string[] {
  const allowed = new Map<string, Uint8Array>();
  for (const key of rootOf.keys) {
    if (!rootOf.roles.root.keyids.includes(key.keyid)) continue;
    if (key.purpose !== 'root' || key.status !== 'active') continue;
    const raw = rawFromSpkiBase64(key.public_key);
    if (raw !== null) allowed.set(key.keyid, raw);
  }
  const message = trustAnchorsSigningInput(doc.rawSigned);
  const valid = new Set<string>();
  for (const s of doc.signatures) {
    const pub = allowed.get(s.keyid);
    if (pub === undefined || valid.has(s.keyid)) continue;
    try {
      const sig = new Uint8Array(Buffer.from(s.sig, 'base64'));
      if (sig.length === 64 && ed25519.verify(sig, message, pub)) valid.add(s.keyid);
    } catch {
      /* invalid signature bytes count as no signature */
    }
  }
  return [...valid].sort();
}

function thresholdProblem(root: TrustAnchorsSigned, testMode: boolean | undefined): AnchorsFail | null {
  if (root.roles.root.threshold < 2 && testMode !== true) {
    return fail('anchors-threshold-unmet', 'roles.root.threshold below 2 is accepted only in test mode');
  }
  return null;
}

function meetsThreshold(doc: ParsedTrustAnchors, rootOf: TrustAnchorsSigned, code: TrustAnchorsErrorCode, who: string): AnchorsFail | null {
  const n = validRootSignatures(doc, rootOf).length;
  if (n < rootOf.roles.root.threshold) {
    return fail(code, `${String(n)} valid signature(s) from the ${who} root; ${String(rootOf.roles.root.threshold)} required`);
  }
  return null;
}

/** Fail closed when `doc` has expired at `now` (VER-5). */
export function checkNotExpired(doc: ParsedTrustAnchors, now?: Date | string): AnchorsFail | null {
  const t = toMs(now);
  if (!Number.isFinite(t)) return fail('anchors-expired', 'evaluation time is not a valid instant');
  if (t >= Date.parse(doc.signed.expires)) return fail('anchors-expired', `trust anchors expired at ${doc.signed.expires}`);
  return null;
}

/**
 * Establish initial trust from an out-of-band pin. The document's root
 * role must equal the pin exactly and be self-signed to threshold.
 */
export function bootstrapTrustAnchors(
  input: unknown,
  pinnedRoot: PinnedRoot,
  options: AnchorCheckOptions & { readonly allowExpired?: boolean } = {},
): AnchorsOk | AnchorsFail {
  const parsed = parseTrustAnchors(input);
  if (parsed.kind === 'fail') return parsed;
  const doc = parsed.value;
  const declared = doc.signed.roles.root;
  const same =
    declared.threshold === pinnedRoot.threshold &&
    declared.keyids.length === pinnedRoot.keyids.length &&
    declared.keyids.every((k) => pinnedRoot.keyids.includes(k));
  if (!same) return fail('anchors-root-mismatch', 'root keyids or threshold differ from the pinned root');
  const problem =
    thresholdProblem(doc.signed, options.testMode) ??
    meetsThreshold(doc, doc.signed, 'anchors-threshold-unmet', 'pinned') ??
    (options.allowExpired === true ? null : checkNotExpired(doc, options.now));
  return problem ?? { kind: 'ok', anchors: doc };
}

/**
 * VER-3: accept candidate N over the trusted document T only if
 * (a) N is signed by a threshold of T's root, (b) N is signed by a
 * threshold of its own root, (c) N.version > T.version (equal versions
 * must be byte-identical), and (d) N has not expired.
 */
export function updateTrustAnchors(
  trusted: ParsedTrustAnchors,
  candidate: unknown,
  options: AnchorCheckOptions = {},
): AnchorsOk | AnchorsFail {
  const parsed = parseTrustAnchors(candidate);
  if (parsed.kind === 'fail') return parsed;
  const next = parsed.value;
  if (next.signed.issuer !== trusted.signed.issuer) {
    return fail('anchors-issuer-mismatch', `issuer ${next.signed.issuer} does not match ${trusted.signed.issuer}`);
  }
  if (next.signed.version < trusted.signed.version) {
    return fail('anchors-rollback', `version ${String(next.signed.version)} is lower than trusted version ${String(trusted.signed.version)}`);
  }
  if (next.signed.version === trusted.signed.version) {
    if (next.digest !== trusted.digest) return fail('anchors-fork', `version ${String(next.signed.version)} differs from the trusted copy`);
    return { kind: 'ok', anchors: trusted };
  }
  const problem =
    meetsThreshold(next, trusted.signed, 'anchors-threshold-unmet', 'currently trusted') ??
    thresholdProblem(next.signed, options.testMode) ??
    meetsThreshold(next, next.signed, 'anchors-new-root-threshold-unmet', 'new') ??
    checkNotExpired(next, options.now);
  return problem ?? { kind: 'ok', anchors: next };
}

export interface LoadTrustAnchorsOptions extends AnchorCheckOptions {
  readonly issuer: string;
  /** Out-of-band root pin for the issuer (built in for crawcus.org; caller-pinned for others, VER-12). */
  readonly pinnedRoot: PinnedRoot;
  /** Initial document (embedded copy, PUB-4). Used when the store is empty. */
  readonly bootstrap?: unknown;
  /** Trusted state (VER-1). Defaults to a fresh in-memory store. */
  readonly store?: TrustAnchorsStore;
  /** Local candidates applied in order, e.g. `--anchors <path>` or `trust/history/` steps (VER-4, VER-7). */
  readonly candidates?: readonly unknown[];
  /** Remote copy, e.g. https://crawcus.org/.well-known/crawcus-trust-anchors.json. */
  readonly url?: string;
  readonly fetch?: FetchLike;
  /** No network calls (VER-6). */
  readonly offline?: boolean;
  /** Override: an expired document yields `anchorsExpired: true` instead of failing. Never a default. */
  readonly allowExpiredAnchors?: boolean;
  /** Response cap (default 1 MiB). */
  readonly maxBytes?: number;
  /** Fetch timeout in ms (default 10000). */
  readonly timeoutMs?: number;
}

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; redirect: 'manual' | 'follow' | 'error' },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type LoadTrustAnchorsResult =
  | {
      readonly kind: 'ok';
      readonly anchors: ParsedTrustAnchors;
      readonly anchorsExpired: boolean;
      /** Set when a candidate was rejected; the previous trusted copy was kept (`anchors-update-rejected`). */
      readonly updateRejected?: { readonly code: TrustAnchorsErrorCode; readonly detail: string };
    }
  | AnchorsFail;

/** Resolve the trusted document for an issuer: store/bootstrap → local candidates → remote → expiry. */
export async function loadTrustAnchors(options: LoadTrustAnchorsOptions): Promise<LoadTrustAnchorsResult> {
  const store = options.store ?? createMemoryTrustAnchorsStore();
  const stored = await store.load(options.issuer);
  let trusted: ParsedTrustAnchors;
  if (stored !== undefined) {
    // Stored state may be a rotated root, so re-check self-signature only.
    const parsed = parseTrustAnchors(stored);
    if (parsed.kind === 'fail') return parsed;
    const problem =
      thresholdProblem(parsed.value.signed, options.testMode) ??
      meetsThreshold(parsed.value, parsed.value.signed, 'anchors-threshold-unmet', 'stored');
    if (problem !== null) return problem;
    trusted = parsed.value;
  } else {
    if (options.bootstrap === undefined) return fail('anchors-root-mismatch', 'no trusted or embedded trust anchors');
    const boot = bootstrapTrustAnchors(options.bootstrap, options.pinnedRoot, { ...options, allowExpired: true });
    if (boot.kind === 'fail') return boot;
    trusted = boot.anchors;
  }
  if (trusted.signed.issuer !== options.issuer) {
    return fail('anchors-issuer-mismatch', `trusted document issuer ${trusted.signed.issuer} is not ${options.issuer}`);
  }
  const initialDigest = stored === undefined ? null : trusted.digest;

  let updateRejected: { code: TrustAnchorsErrorCode; detail: string } | undefined;
  const tryUpdate = (candidate: unknown): boolean => {
    const r = updateTrustAnchors(trusted, candidate, options);
    if (r.kind === 'fail') {
      updateRejected = { code: r.code, detail: r.detail };
      return false;
    }
    trusted = r.anchors;
    return true;
  };

  for (const c of options.candidates ?? []) if (!tryUpdate(c)) break;

  if (updateRejected === undefined && options.offline !== true && options.url !== undefined) {
    const fetched = await fetchJson(options.url, options);
    if (fetched.kind === 'fail') updateRejected = { code: fetched.code, detail: fetched.detail };
    else tryUpdate(fetched.json);
  }

  if (trusted.digest !== initialDigest) await store.save(options.issuer, { signed: trusted.rawSigned, signatures: trusted.signatures });

  const expired = checkNotExpired(trusted, options.now);
  if (expired !== null && options.allowExpiredAnchors !== true) return expired;
  return {
    kind: 'ok',
    anchors: trusted,
    anchorsExpired: expired !== null,
    ...(updateRejected !== undefined ? { updateRejected } : {}),
  };
}

async function fetchJson(
  url: string,
  options: LoadTrustAnchorsOptions,
): Promise<{ kind: 'ok'; json: unknown } | AnchorsFail> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return fail('anchors-fetch-failed', 'URL is not valid');
  }
  if (u.protocol !== 'https:') return fail('anchors-fetch-failed', 'trust anchors must be fetched over https');
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== 'function') return fail('anchors-fetch-failed', 'no fetch implementation');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 10_000);
  try {
    // Redirects are not followed (no cross-origin redirects, VER-2).
    const res = await doFetch(u.toString(), { signal: ctrl.signal, redirect: 'manual' });
    if (!res.ok) return fail('anchors-fetch-failed', `HTTP ${String(res.status)}`);
    const body = await res.text();
    if (Buffer.byteLength(body, 'utf8') > (options.maxBytes ?? 1024 * 1024)) return fail('anchors-fetch-failed', 'response too large');
    try {
      return { kind: 'ok', json: JSON.parse(body) as unknown };
    } catch {
      return fail('anchors-malformed', 'response is not JSON');
    }
  } catch (e) {
    return fail('anchors-fetch-failed', e instanceof Error ? e.message.slice(0, 120) : 'fetch error');
  } finally {
    clearTimeout(timer);
  }
}

export interface TrustPolicyFromAnchorsOptions {
  /** The artifact's purpose (KEY-1). `root` is never accepted. */
  readonly purpose: Exclude<KeyPurpose, 'root'>;
  /** Required for `foundry-audit-export` (VER-8). */
  readonly deployment?: string;
  /** Optional exact payloadType allowlist. Omitted → crawcus `+jsonl` family default. */
  readonly payloadTypes?: readonly string[];
  readonly policyId?: string;
}

export type TrustPolicyFromAnchorsResult =
  | { readonly kind: 'ok'; readonly policy: TrustPolicy; readonly fingerprint: string }
  | AnchorsFail;

/**
 * TA-9: map a trusted document onto the PR #2 `TrustPolicy`. Keys of the
 * requested purpose (and deployment) become pinned anchors with their
 * window; revoked keys become `revoked` rows with their reason, so
 * `key-compromise` fails whatever the signing time and
 * `superseded`/`retired` accept only signing times before `revoked_at`.
 */
export function trustPolicyFromAnchors(
  signed: TrustAnchorsSigned,
  options: TrustPolicyFromAnchorsOptions,
): TrustPolicyFromAnchorsResult {
  if ((options.purpose as string) === 'root') return fail('anchors-no-keys-for-purpose', 'root keys sign only trust-anchors.json');
  if (options.purpose === 'foundry-audit-export' && options.deployment === undefined) {
    return fail('anchors-no-keys-for-purpose', 'foundry-audit-export requires a deployment');
  }
  const anchors: TrustAnchor[] = [];
  const revoked: RevokedKey[] = [];
  for (const key of signed.keys) {
    if (key.purpose !== options.purpose) continue;
    if (options.purpose === 'foundry-audit-export' && key.deployment !== options.deployment) continue;
    const raw = rawFromSpkiBase64(key.public_key);
    if (raw === null) continue;
    const hex = bytesToHex(raw);
    if (key.status === 'revoked') {
      revoked.push({ publicKey: hex, revokedAt: key.revoked_at as string, reason: key.revocation_reason! });
    }
    anchors.push({
      type: 'ed25519-pinned',
      id: `${key.purpose}.${key.keyid.slice(7, 23)}`,
      publicKey: hex,
      notBefore: key.not_before,
      notAfter: key.not_after,
      ...(options.payloadTypes !== undefined ? { payloadTypes: options.payloadTypes } : {}),
      label: `${key.keyid} (${key.status})`.slice(0, 512),
    });
  }
  if (anchors.length === 0) {
    return fail('anchors-no-keys-for-purpose', `no keys for purpose ${options.purpose}${options.deployment ? ` / ${options.deployment}` : ''}`);
  }
  const parsed = parseTrustPolicy({
    crawcusTrustPolicy: 1,
    policyId: options.policyId ?? `anchors.v${String(signed.version)}`,
    description: `Derived from ${signed.issuer} trust-anchors version ${String(signed.version)}`.slice(0, 512),
    anchors,
    ...(revoked.length > 0 ? { revoked } : {}),
  });
  if (parsed.kind === 'fail') return fail('anchors-malformed', parsed.detail);
  return parsed;
}

/** Default in-memory store (process lifetime). */
export function createMemoryTrustAnchorsStore(): TrustAnchorsStore & { readonly entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    entries,
    load: (issuer) => entries.get(issuer),
    save: (issuer, doc) => {
      entries.set(issuer, JSON.parse(JSON.stringify(doc)) as unknown);
    },
  };
}

function toMs(now: Date | string | undefined): number {
  if (now === undefined) return Date.now();
  return now instanceof Date ? now.getTime() : Date.parse(now);
}

function fail(code: TrustAnchorsErrorCode, detail: string): AnchorsFail {
  return { kind: 'fail', code, detail };
}
