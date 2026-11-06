/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Structural parser for `trust-anchors.json`. Signatures are checked in
 * `verify.ts`. Unknown fields inside `signed` are ignored (they are
 * covered by the signature, TA-8); a key with an unknown `purpose` or
 * `status` is dropped, not the file. Everything else malformed rejects
 * the whole file.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalJSON } from '@crawcus/spec';
import { KEYID_PATTERN, keyIdFor, rawFromSpkiBase64 } from '../keyid.js';
import {
  KNOWN_PURPOSES,
  KNOWN_STATUSES,
  TRUST_ANCHORS_SPEC_MAJOR,
  TRUST_ANCHORS_TYPE,
  type AnchorKey,
  type DetachedSignature,
  type ParsedTrustAnchors,
  type RevocationReason,
} from './types.js';

export type ParseTrustAnchorsResult =
  | { readonly kind: 'ok'; readonly value: ParsedTrustAnchors }
  | {
      readonly kind: 'fail';
      readonly code: 'anchors-malformed' | 'anchors-unsupported-version';
      readonly detail: string;
    };
type Fail = Extract<ParseTrustAnchorsResult, { kind: 'fail' }>;

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ISSUER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REASONS: readonly RevocationReason[] = ['key-compromise', 'superseded', 'retired'];

export const MAX_KEYS = 256;
export const MAX_SIGNATURES = 32;
export const MAX_ROOT_KEYS = 16;

export function parseTrustAnchors(input: unknown): ParseTrustAnchorsResult {
  if (!isRecord(input)) return bad('document must be a JSON object');
  for (const k of Object.keys(input)) {
    if (k !== 'signed' && k !== 'signatures') return bad(`unknown top-level field "${k}"`);
  }
  const s = input['signed'];
  if (!isRecord(s)) return bad('signed must be an object');
  if (s['_type'] !== TRUST_ANCHORS_TYPE) return bad(`_type must be "${TRUST_ANCHORS_TYPE}"`);
  const specVersion = s['spec_version'];
  if (typeof specVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(specVersion)) {
    return bad('spec_version must be MAJOR.MINOR.PATCH');
  }
  if (Number(specVersion.split('.')[0]) !== TRUST_ANCHORS_SPEC_MAJOR) {
    return { kind: 'fail', code: 'anchors-unsupported-version', detail: `spec_version ${specVersion} is not supported` };
  }
  const issuer = s['issuer'];
  if (typeof issuer !== 'string' || !ISSUER.test(issuer)) return bad('issuer must be a short identifier');
  const version = s['version'];
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return bad('version must be a positive integer');
  }
  if (!isTime(s['issued_at'])) return bad('issued_at is not RFC 3339');
  if (!isTime(s['expires'])) return bad('expires is not RFC 3339');
  const issuedAt = s['issued_at'];
  const expires = s['expires'];
  if (Date.parse(expires) <= Date.parse(issuedAt)) return bad('expires must be after issued_at');
  if (Date.parse(expires) > addMonths(Date.parse(issuedAt), 12)) {
    return bad('expires must be at most 12 months after issued_at');
  }

  const roles = s['roles'];
  if (!isRecord(roles) || !isRecord(roles['root'])) return bad('roles.root must be an object');
  const rootRaw = roles['root'];
  const keyidsRaw = rootRaw['keyids'];
  if (!Array.isArray(keyidsRaw) || keyidsRaw.length === 0 || keyidsRaw.length > MAX_ROOT_KEYS) {
    return bad(`roles.root.keyids must list 1..${String(MAX_ROOT_KEYS)} keyids`);
  }
  const rootKeyids: string[] = [];
  for (const id of keyidsRaw) {
    if (typeof id !== 'string' || !KEYID_PATTERN.test(id)) return bad('roles.root.keyids entries must be sha256:<hex>');
    if (rootKeyids.includes(id)) return bad('roles.root.keyids has a duplicate');
    rootKeyids.push(id);
  }
  const threshold = rootRaw['threshold'];
  if (typeof threshold !== 'number' || !Number.isSafeInteger(threshold) || threshold < 1) {
    return bad('roles.root.threshold must be a positive integer');
  }
  if (threshold > rootKeyids.length) return bad('roles.root.threshold exceeds the number of root keyids');

  const keysRaw = s['keys'];
  if (!Array.isArray(keysRaw) || keysRaw.length > MAX_KEYS) {
    return bad(`keys must be an array of at most ${String(MAX_KEYS)} entries`);
  }
  const keys: AnchorKey[] = [];
  const seen = new Set<string>();
  let ignoredKeys = 0;
  for (let i = 0; i < keysRaw.length; i++) {
    const parsed = parseKey(keysRaw[i], `keys[${String(i)}]`);
    if (parsed.kind === 'fail') return parsed;
    if (seen.has(parsed.keyid)) return bad(`keys[${String(i)}] duplicates keyid`);
    seen.add(parsed.keyid);
    if (parsed.kind === 'ignored') {
      ignoredKeys++;
      continue;
    }
    keys.push(parsed.key);
  }

  // superseded_by must name another key in this file that is active or revoked.
  const byId = new Map(keys.map((k) => [k.keyid, k]));
  for (const k of keys) {
    if (k.superseded_by == null) continue;
    const target = byId.get(k.superseded_by);
    if (target === undefined || target.keyid === k.keyid || (target.status !== 'active' && target.status !== 'revoked')) {
      return bad(`superseded_by of ${k.keyid} must name another active or revoked key in this file`);
    }
  }

  const sigsRaw = input['signatures'];
  if (!Array.isArray(sigsRaw) || sigsRaw.length === 0 || sigsRaw.length > MAX_SIGNATURES) {
    return bad(`signatures must hold 1..${String(MAX_SIGNATURES)} entries`);
  }
  const signatures: DetachedSignature[] = [];
  for (let i = 0; i < sigsRaw.length; i++) {
    const sig = sigsRaw[i];
    const where = `signatures[${String(i)}]`;
    if (!isRecord(sig)) return bad(`${where} must be an object`);
    for (const k of Object.keys(sig)) if (k !== 'keyid' && k !== 'sig') return bad(`${where} has unknown field "${k}"`);
    if (typeof sig['keyid'] !== 'string' || !KEYID_PATTERN.test(sig['keyid'])) return bad(`${where}.keyid must be sha256:<hex>`);
    if (typeof sig['sig'] !== 'string' || sig['sig'].length > 128 || !BASE64.test(sig['sig'])) return bad(`${where}.sig must be base64`);
    signatures.push({ keyid: sig['keyid'], sig: sig['sig'] });
  }

  let canonical: string;
  try {
    canonical = canonicalJSON(s);
  } catch {
    return bad('signed is not canonicalisable');
  }
  return {
    kind: 'ok',
    value: {
      signed: {
        _type: TRUST_ANCHORS_TYPE,
        spec_version: specVersion,
        issuer,
        version,
        issued_at: issuedAt,
        expires,
        roles: { root: { keyids: rootKeyids, threshold } },
        keys,
        ignoredKeys,
      },
      rawSigned: s,
      signatures,
      digest: bytesToHex(sha256(new TextEncoder().encode(canonical))),
    },
  };
}

function parseKey(
  k: unknown,
  where: string,
): { kind: 'ok'; keyid: string; key: AnchorKey } | { kind: 'ignored'; keyid: string } | Fail {
  if (!isRecord(k)) return bad(`${where} must be an object`);
  if (k['alg'] !== 'ed25519') return bad(`${where}.alg must be ed25519`);
  const raw = rawFromSpkiBase64(k['public_key'] as string);
  if (raw === null) return bad(`${where}.public_key must be base64 ed25519 SPKI DER`);
  const keyid = keyIdFor(raw);
  if (k['keyid'] !== keyid) return bad(`${where}.keyid does not match public_key`);
  const purpose = k['purpose'];
  const status = k['status'];
  if (typeof purpose !== 'string' || typeof status !== 'string') return bad(`${where}.purpose and status must be strings`);
  if (!(KNOWN_PURPOSES as readonly string[]).includes(purpose) || !(KNOWN_STATUSES as readonly string[]).includes(status)) {
    return { kind: 'ignored', keyid };
  }
  if (!isTime(k['not_before']) || !isTime(k['not_after'])) return bad(`${where}.not_before/not_after must be RFC 3339`);
  if (Date.parse(k['not_before']) >= Date.parse(k['not_after'])) return bad(`${where}.not_before must precede not_after`);
  const deployment = k['deployment'] ?? null;
  if (purpose === 'audit-export') {
    if (typeof deployment !== 'string' || !ISSUER.test(deployment)) return bad(`${where}.deployment is required for audit-export`);
  } else if (deployment !== null) {
    return bad(`${where}.deployment must be null for purpose ${purpose}`);
  }
  const revokedAt = k['revoked_at'] ?? null;
  const reason = k['revocation_reason'] ?? null;
  if (status === 'revoked') {
    if (!isTime(revokedAt)) return bad(`${where}.revoked_at is required when revoked`);
    if (typeof reason !== 'string' || !(REASONS as readonly string[]).includes(reason)) {
      return bad(`${where}.revocation_reason must be key-compromise, superseded or retired`);
    }
  } else if (revokedAt !== null || reason !== null) {
    return bad(`${where}.revoked_at/revocation_reason must be null unless revoked`);
  }
  for (const f of ['custody', 'kms_resource', 'superseded_by'] as const) {
    const v = k[f];
    if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > 512)) return bad(`${where}.${f} must be a string or null`);
  }
  if (k['superseded_by'] != null && !KEYID_PATTERN.test(k['superseded_by'] as string)) {
    return bad(`${where}.superseded_by must be a keyid`);
  }
  return {
    kind: 'ok',
    keyid,
    key: {
      keyid,
      alg: 'ed25519',
      public_key: k['public_key'] as string,
      purpose: purpose as AnchorKey['purpose'],
      deployment: deployment as string | null,
      custody: (k['custody'] as string | null | undefined) ?? null,
      kms_resource: (k['kms_resource'] as string | null | undefined) ?? null,
      not_before: k['not_before'],
      not_after: k['not_after'],
      status: status as AnchorKey['status'],
      revoked_at: revokedAt as string | null,
      revocation_reason: reason as RevocationReason | null,
      superseded_by: (k['superseded_by'] as string | null | undefined) ?? null,
    },
  };
}

/** Calendar-month addition in UTC. */
function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

function isTime(v: unknown): v is string {
  return typeof v === 'string' && RFC3339.test(v) && Number.isFinite(Date.parse(v));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function bad(detail: string): Fail {
  return { kind: 'fail', code: 'anchors-malformed', detail };
}
