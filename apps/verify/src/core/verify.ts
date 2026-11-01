/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure verify function: bytes in, `crawcus.verify-result/v1` out.
 * No DOM, no network, no storage. This is the module a future
 * server-side API would call to return the identical JSON.
 *
 * Note: @crawcus/verifier uses the global `Buffer`; browsers need the
 * polyfill installed by `src/polyfill.ts` before this runs.
 */

import { verifyBundle, verifyHashChain, VERIFIER_VERSION } from '@crawcus/verifier';
import type { VerifyCheck, VerifyResult } from '@crawcus/verifier';
import { computeContentHash } from '@crawcus/spec';
import { sha256 } from '@noble/hashes/sha256';
import {
  VERIFY_RESULT_SCHEMA,
  type ChainLinkV1,
  type CheckV1,
  type Verdict,
  type VerifyResultV1,
} from './schema.js';
import { base64ToBytes, bytesToHexStr, normalisePublicKey, type TrustAnchor } from './trust.js';

export interface VerifyOptionsV1 {
  readonly anchors?: readonly TrustAnchor[];
  /** Deterministic timestamp for tests. */
  readonly verifiedAt?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const hex = (b: Uint8Array): string => bytesToHexStr(sha256(b));

export function verify(bytes: Uint8Array, opts: VerifyOptionsV1 = {}): VerifyResultV1 {
  const verifiedAt = opts.verifiedAt ?? new Date().toISOString();
  const anchors = opts.anchors ?? [];
  const input = { byteLength: bytes.length, sha256: hex(bytes) };

  let text = '';
  let json: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    json = JSON.parse(text);
  } catch {
    json = parseJsonlBundle(text);
  }

  const isEnvelope = isObj(json) && 'payloadType' in json && 'payload' in json && 'signatures' in json;
  if (isEnvelope && isObj(json)) return fromEnvelope(bytes, json, anchors, verifiedAt, input);
  if (isObj(json) && Array.isArray(json['events'])) return fromPlainBundle(json, verifiedAt, input);

  // Unknown input — let the library produce its structured shape failure.
  const lib = verifyBundle({ bundle: bytes, options: { verifiedAt } });
  return assemble({
    lib, verifiedAt, input: { format: 'unknown', ...input }, envelope: null, signer: null,
    bundle: null, links: [], extra: [],
  });
}

/** A JSONL bundle export: one JSON object per line, the bundle = {events:[...lines]}. */
function parseJsonlBundle(text: string): unknown {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return undefined;
  try {
    const rows = lines.map((l) => JSON.parse(l) as unknown);
    if (rows.every(isObj)) return { events: rows };
  } catch {
    /* not JSONL */
  }
  return undefined;
}

function fromEnvelope(
  bytes: Uint8Array, env: Obj, anchors: readonly TrustAnchor[], verifiedAt: string,
  input: { byteLength: number; sha256: string },
): VerifyResultV1 {
  const lib = verifyBundle({ bundle: bytes, options: { verifiedAt } });
  const sigs = Array.isArray(env['signatures']) ? (env['signatures'] as unknown[]) : [];
  const first = isObj(sigs[0]) ? sigs[0] : {};
  const keyId = typeof first['keyid'] === 'string' ? first['keyid'] : '';
  const keyHex = normalisePublicKey(keyId);

  let payloadBytes: Uint8Array = new Uint8Array();
  let bundleObj: Obj | null = null;
  try {
    payloadBytes = base64ToBytes(String(env['payload'] ?? ''));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (isObj(parsed)) bundleObj = parsed;
  } catch {
    /* shape failure already reported by the library */
  }

  const anchor = keyHex ? anchors.find((a) => a.publicKeyHex === keyHex) : undefined;
  const trust = anchors.length === 0 ? 'no-anchors' : anchor ? 'trusted' : 'untrusted';
  const trustCheck: CheckV1 = {
    id: 'trust.signer-pinned',
    label: 'Signer key is a pinned trust anchor',
    source: 'app',
    verdict: trust === 'no-anchors' ? 'skipped' : trust === 'trusted' ? 'pass' : 'fail',
    detail:
      trust === 'no-anchors'
        ? 'no trust anchors pinned — signature proves integrity, not identity'
        : trust === 'trusted'
          ? `signer matches pinned anchor "${anchor?.label ?? ''}"`
          : `signer key is not among ${String(anchors.length)} pinned anchor(s)`,
    ...(trust === 'untrusted' ? { violationKind: 'Signer.untrusted' } : {}),
    cite: [{ kind: 'envelope-field', value: 'signatures[0].keyid' }],
  };

  const links = bundleObj ? walkRows(bundleObj) : [];
  return assemble({
    lib, verifiedAt, links,
    input: { format: 'dsse', ...input },
    envelope: {
      payloadType: String(env['payloadType'] ?? ''),
      payloadByteLength: payloadBytes.length,
      payloadSha256: hex(payloadBytes),
      signatureCount: sigs.length,
    },
    signer: {
      keyId, algorithm: 'ed25519',
      fingerprint: keyHex ? `sha256:${hex(hexToBytes(keyHex))}` : '',
      trust,
      ...(anchor ? { anchorLabel: anchor.label } : {}),
    },
    bundle: bundleObj ? bundleSummary(bundleObj, lib) : null,
    extra: [trustCheck, rowWalkCheck(links)],
  });
}

function fromPlainBundle(
  bundle: Obj, verifiedAt: string, input: { byteLength: number; sha256: string },
): VerifyResultV1 {
  const chain = verifyHashChain(bundle);
  const links = walkRows(bundle);
  const libChecks: VerifyCheck[] = [
    {
      id: 'dsse.signature', label: 'DSSE ed25519 signature', verdict: 'fail',
      violationKind: 'Envelope.shape.invalid',
      detail: 'input is an unsigned bundle (no DSSE envelope) — authorship cannot be verified',
    },
    {
      id: 'chain.hash-chain', label: 'Hash chain integrity', verdict: chain.verdict,
      detail: chain.detail,
      ...(chain.violationKind ? { violationKind: chain.violationKind } : {}),
    },
  ];
  const lib: VerifyResult = {
    verdict: 'fail', checks: libChecks, verifiedAt,
    verifierIdentity: { version: VERIFIER_VERSION, publicKeyFingerprint: '', buildSha: '' },
    bundleMetadata: {
      bundleId: '', schemaVersion: '', payloadType: '', signerKeyId: '',
      eventCount: links.length, contractCount: 0, earliestEventTs: '', latestEventTs: '',
    },
  };
  return assemble({
    lib, verifiedAt, links, input: { format: 'bundle-json', ...input },
    envelope: null, signer: null, bundle: bundleSummary(bundle, lib), extra: [rowWalkCheck(links)],
  });
}

/** Independent per-row walk — runs even when the signature fails, to pinpoint tampering. */
export function walkRows(bundle: Obj): ChainLinkV1[] {
  const events = Array.isArray(bundle['events']) ? (bundle['events'] as unknown[]) : [];
  const links: ChainLinkV1[] = [];
  let broken = false;
  events.forEach((e, index) => {
    const ev: Obj = isObj(e) ? e : {};
    const { id, contentHash, ...hashable } = ev;
    let recomputed = '';
    try {
      recomputed = computeContentHash(hashable as never);
    } catch {
      recomputed = '';
    }
    const prev = links[index - 1];
    const expectedPrevHash = prev ? prev.contentHash : null;
    const prevHash = typeof ev['prevHash'] === 'string' ? ev['prevHash'] : null;
    const contentHashOk = recomputed !== '' && recomputed === contentHash;
    const prevLinkOk = prevHash === expectedPrevHash;
    const ok = contentHashOk && prevLinkOk;
    links.push({
      index,
      id: typeof id === 'string' ? id : `#${String(index)}`,
      kind: typeof ev['kind'] === 'string' ? ev['kind'] : '',
      timestamp: typeof ev['timestamp'] === 'string' ? ev['timestamp'] : '',
      contentHash: typeof contentHash === 'string' ? contentHash : '',
      prevHash, recomputedHash: recomputed, expectedPrevHash, contentHashOk, prevLinkOk,
      status: !ok ? 'broken' : broken ? 'after-break' : 'ok',
    });
    if (!ok) broken = true;
  });
  return links;
}

function rowWalkCheck(links: readonly ChainLinkV1[]): CheckV1 {
  const bad = links.filter((l) => l.status === 'broken');
  const firstBad = bad[0];
  return {
    id: 'chain.row-walk',
    label: 'Per-row content hash recomputation',
    source: 'app',
    verdict: firstBad ? 'fail' : 'pass',
    detail: firstBad
      ? `${String(bad.length)} row(s) do not match their recorded hash; first at row ${String(firstBad.index)} (${firstBad.id})`
      : `recomputed ${String(links.length)} row hashes; all match and every prevHash links to its predecessor`,
    ...(firstBad ? { violationKind: 'Chain.hash.broken', cite: [{ kind: 'event-index', value: firstBad.index }] } : {}),
  };
}

function bundleSummary(bundle: Obj, lib: VerifyResult): NonNullable<VerifyResultV1['bundle']> {
  const events = Array.isArray(bundle['events']) ? (bundle['events'] as unknown[]) : [];
  let earliest = '';
  let latest = '';
  for (const e of events) {
    const ts = isObj(e) ? e['timestamp'] : undefined;
    if (typeof ts === 'string') {
      if (!earliest || ts < earliest) earliest = ts;
      if (ts > latest) latest = ts;
    }
  }
  const cp = bundle['chainProof'];
  const selfHash = isObj(cp) && typeof cp['bundleSelfHash'] === 'string' ? cp['bundleSelfHash'] : '';
  return {
    bundleId: lib.bundleMetadata.bundleId,
    schemaVersion: lib.bundleMetadata.schemaVersion || (typeof bundle['bundleVersion'] === 'string' ? bundle['bundleVersion'] : ''),
    selfHash,
    rowCount: events.length,
    contractCount: Array.isArray(bundle['contractResults']) ? bundle['contractResults'].length : 0,
    timeRange: { earliest, latest },
    regulations: collectRegulations(bundle),
  };
}

/** Regulations referenced: top-level `regulations[]` + any `regulation` string anywhere. */
export function collectRegulations(bundle: Obj): string[] {
  const out = new Set<string>();
  const top = bundle['regulations'];
  if (Array.isArray(top)) for (const r of top) if (typeof r === 'string') out.add(r);
  const visit = (v: unknown, depth: number): void => {
    if (depth > 12) return;
    if (Array.isArray(v)) v.forEach((x) => visit(x, depth + 1));
    else if (isObj(v))
      for (const [k, x] of Object.entries(v)) {
        if ((k === 'regulation' || k === 'regulationId') && typeof x === 'string') out.add(x);
        else visit(x, depth + 1);
      }
  };
  visit(bundle['events'], 0);
  visit(bundle['contractResults'], 0);
  return [...out].sort();
}

const REASONS: Record<string, string> = {
  'dsse.envelope.shape': 'The file is not a well-formed crawcus DSSE envelope.',
  'dsse.signature': 'The signature does not match the contents: the bundle was altered after it was signed, or signed by a different key.',
  'chain.jcs-hash-equivalence': "The bundle's self-hash does not match its canonical (RFC 8785) contents.",
  'chain.hash-chain': 'The hash chain is broken: a row was modified, removed, or reordered.',
  'chain.row-walk': 'At least one row no longer hashes to its recorded content hash.',
  'trust.signer-pinned': 'The signature is valid, but the signing key is not one you trust.',
};

function explain(verdict: Verdict, checks: readonly CheckV1[], links: readonly ChainLinkV1[]): string {
  if (verdict === 'pass') {
    const pinned = checks.some((c) => c.id === 'trust.signer-pinned' && c.verdict === 'pass');
    return `Signature valid, ${String(links.length)} rows hash-chained intact${pinned ? ', signed by a pinned trusted key' : ' (no trust anchor pinned)'}.`;
  }
  if (verdict === 'historical-unverifiable')
    return 'Integrity checks pass, but some contract predicates cannot be re-evaluated against today\u2019s rules.';
  const first = checks.find((c) => c.verdict === 'fail');
  if (!first) return 'Verification failed.';
  const base = REASONS[first.id] ?? (first.id.startsWith('contract.') ? 'A contract predicate did not hold on re-evaluation.' : 'Verification failed.');
  const broken = links.find((l) => l.status === 'broken');
  return broken && first.id !== 'trust.signer-pinned' ? `${base} First broken row: #${String(broken.index)} (${broken.id}).` : base;
}

function assemble(a: {
  lib: VerifyResult;
  verifiedAt: string;
  input: VerifyResultV1['input'];
  envelope: VerifyResultV1['envelope'];
  signer: VerifyResultV1['signer'];
  bundle: VerifyResultV1['bundle'];
  links: ChainLinkV1[];
  extra: CheckV1[];
}): VerifyResultV1 {
  const checks: CheckV1[] = [
    ...a.lib.checks.map((c): CheckV1 => ({
      id: c.id, label: c.label, verdict: c.verdict, detail: c.detail, source: 'library',
      ...(c.violationKind ? { violationKind: c.violationKind } : {}),
      ...(c.cite ? { cite: c.cite.map((x) => ({ kind: x.kind, value: x.value })) } : {}),
    })),
    ...a.extra,
  ];
  let verdict: Verdict = a.lib.verdict;
  if (a.extra.some((c) => c.verdict === 'fail')) verdict = 'fail';
  const brokenIdx = a.links.findIndex((l) => l.status === 'broken');
  return {
    schema: VERIFY_RESULT_SCHEMA,
    verdict,
    reason: explain(verdict, checks, a.links),
    verifiedAt: a.verifiedAt,
    verifier: { name: 'crawcus-verify', libraryVersion: a.lib.verifierIdentity.version, buildSha: a.lib.verifierIdentity.buildSha },
    input: a.input,
    envelope: a.envelope,
    signer: a.signer,
    bundle: a.bundle,
    chain: { valid: brokenIdx === -1, brokenAt: brokenIdx === -1 ? null : brokenIdx, links: a.links },
    checks,
  };
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
