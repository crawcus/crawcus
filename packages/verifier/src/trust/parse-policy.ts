/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Strict parser for a CRAWCUS trust policy (schema version 1).
 *
 * Malformed input never becomes a permissive policy. The fingerprint is
 * sha256 over JCS of the normalised policy, so object key order and
 * insignificant whitespace do not change it. Public keys are normalised
 * to lowercase hex before fingerprinting.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalJSON } from '@crawcus/spec';
import { decodeEd25519PublicKey } from '../dsse.js';
import type {
  Ed25519PinnedAnchor,
  RevokedKey,
  SigstoreIdentityAnchor,
  TrustAnchor,
  TrustPolicy,
} from './types.js';

export type ParseTrustPolicyResult =
  | { readonly kind: 'ok'; readonly policy: TrustPolicy; readonly fingerprint: string }
  | { readonly kind: 'fail'; readonly detail: string };

const TOP_LEVEL_FIELDS = [
  'crawcusTrustPolicy',
  'policyId',
  'description',
  'requireTrustedSigner',
  'anchors',
  'revoked',
] as const;

const PINNED_FIELDS = [
  'type',
  'id',
  'publicKey',
  'notBefore',
  'notAfter',
  'payloadTypes',
  'label',
] as const;

const SIGSTORE_FIELDS = ['type', 'id', 'issuer', 'subject', 'subjectRegExp', 'requireTlog'] as const;

const REVOKED_FIELDS = ['publicKey', 'revokedAt', 'reason'] as const;

const ID_PATTERN = /^[a-z0-9._-]{1,64}$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const MAX_ANCHORS = 128;
const MAX_REVOKED = 128;

export function parseTrustPolicy(input: unknown): ParseTrustPolicyResult {
  if (!isRecord(input)) {
    return fail('trust policy must be a JSON object');
  }
  if (Object.hasOwn(input, 'threshold')) {
    return fail('threshold is reserved for a future policy version and is rejected in version 1');
  }
  const unknown = unknownField(input, TOP_LEVEL_FIELDS);
  if (unknown !== null) {
    return fail(`unknown field "${unknown}"`);
  }
  if (input['crawcusTrustPolicy'] !== 1) {
    return fail('crawcusTrustPolicy must be 1');
  }
  const policyId = input['policyId'];
  if (typeof policyId !== 'string' || !ID_PATTERN.test(policyId)) {
    return fail('policyId must match [a-z0-9._-]{1,64}');
  }

  let description: string | undefined;
  if (Object.hasOwn(input, 'description')) {
    const value = input['description'];
    if (typeof value !== 'string' || value.length === 0 || value.length > 512 || hasControl(value)) {
      return fail('description must be a short string without control characters');
    }
    description = value;
  }

  let requireTrustedSigner: boolean | undefined;
  if (Object.hasOwn(input, 'requireTrustedSigner')) {
    if (typeof input['requireTrustedSigner'] !== 'boolean') {
      return fail('requireTrustedSigner must be a boolean');
    }
    requireTrustedSigner = input['requireTrustedSigner'];
  }

  const anchorsRaw = input['anchors'];
  if (!Array.isArray(anchorsRaw) || anchorsRaw.length === 0) {
    return fail('anchors must be a non-empty array');
  }
  if (anchorsRaw.length > MAX_ANCHORS) {
    return fail(`anchors exceeds the limit of ${String(MAX_ANCHORS)}`);
  }

  const anchors: TrustAnchor[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < anchorsRaw.length; i++) {
    const parsed = parseAnchor(anchorsRaw[i], i);
    if (parsed.kind === 'fail') return parsed;
    if (seenIds.has(parsed.anchor.id)) {
      return fail(`duplicate anchor id "${parsed.anchor.id}"`);
    }
    seenIds.add(parsed.anchor.id);
    anchors.push(parsed.anchor);
  }

  let revoked: readonly RevokedKey[] | undefined;
  if (Object.hasOwn(input, 'revoked')) {
    const revokedRaw = input['revoked'];
    if (!Array.isArray(revokedRaw)) {
      return fail('revoked must be an array');
    }
    if (revokedRaw.length > MAX_REVOKED) {
      return fail(`revoked exceeds the limit of ${String(MAX_REVOKED)}`);
    }
    const rows: RevokedKey[] = [];
    const seenKeys = new Set<string>();
    for (let i = 0; i < revokedRaw.length; i++) {
      const parsed = parseRevoked(revokedRaw[i], i);
      if (parsed.kind === 'fail') return parsed;
      if (seenKeys.has(parsed.row.publicKey)) {
        return fail('duplicate revoked public key');
      }
      seenKeys.add(parsed.row.publicKey);
      rows.push(parsed.row);
    }
    revoked = rows;
  }

  const policy: TrustPolicy = {
    crawcusTrustPolicy: 1,
    policyId,
    ...(description !== undefined ? { description } : {}),
    ...(requireTrustedSigner !== undefined ? { requireTrustedSigner } : {}),
    anchors,
    ...(revoked !== undefined ? { revoked } : {}),
  };

  let canonical: string;
  try {
    canonical = canonicalJSON(policy);
  } catch (e) {
    return fail(`trust policy is not canonicalisable: ${messageOf(e)}`);
  }
  const fingerprint = bytesToHex(sha256(new TextEncoder().encode(canonical)));
  return { kind: 'ok', policy, fingerprint };
}

export function fingerprintTrustPolicy(policy: TrustPolicy): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJSON(policy))));
}

function parseAnchor(
  input: unknown,
  index: number,
): { kind: 'ok'; anchor: TrustAnchor } | { kind: 'fail'; detail: string } {
  if (!isRecord(input)) {
    return fail(`anchors[${String(index)}] must be an object`);
  }
  const type = input['type'];
  if (type === 'ed25519-pinned') return parsePinned(input, index);
  if (type === 'sigstore-identity') return parseSigstore(input, index);
  if (typeof type !== 'string') {
    return fail(`anchors[${String(index)}].type is missing`);
  }
  return fail(`anchors[${String(index)}].type "${type}" is not supported`);
}

function parsePinned(
  input: Record<string, unknown>,
  index: number,
): { kind: 'ok'; anchor: Ed25519PinnedAnchor } | { kind: 'fail'; detail: string } {
  const where = `anchors[${String(index)}]`;
  const unknown = unknownField(input, PINNED_FIELDS);
  if (unknown !== null) return fail(`${where} has unknown field "${unknown}"`);
  const id = readId(input['id'], where);
  if (typeof id !== 'string') return id;

  const publicKey = normalisePublicKey(input['publicKey']);
  if (publicKey === null) {
    return fail(`${where}.publicKey must be a 32-byte ed25519 key (hex or base64)`);
  }

  const notBefore = readOptionalTime(input, 'notBefore', where);
  if (typeof notBefore !== 'string' && notBefore !== undefined) return notBefore;
  const notAfter = readOptionalTime(input, 'notAfter', where);
  if (typeof notAfter !== 'string' && notAfter !== undefined) return notAfter;
  if (
    typeof notBefore === 'string' &&
    typeof notAfter === 'string' &&
    Date.parse(notBefore) >= Date.parse(notAfter)
  ) {
    return fail(`${where} notBefore must be earlier than notAfter (window is [notBefore, notAfter))`);
  }

  let payloadTypes: readonly string[] | undefined;
  if (Object.hasOwn(input, 'payloadTypes')) {
    const raw = input['payloadTypes'];
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 32) {
      return fail(`${where}.payloadTypes must be a non-empty array`);
    }
    const types: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string' || item.length === 0 || item.length > 128 || hasControl(item)) {
        return fail(`${where}.payloadTypes entries must be short strings`);
      }
      types.push(item);
    }
    payloadTypes = types;
  }

  let label: string | undefined;
  if (Object.hasOwn(input, 'label')) {
    const value = input['label'];
    if (typeof value !== 'string' || value.length === 0 || value.length > 128 || hasControl(value)) {
      return fail(`${where}.label must be a short string without control characters`);
    }
    label = value;
  }

  return {
    kind: 'ok',
    anchor: {
      type: 'ed25519-pinned',
      id,
      publicKey,
      ...(typeof notBefore === 'string' ? { notBefore } : {}),
      ...(typeof notAfter === 'string' ? { notAfter } : {}),
      ...(payloadTypes !== undefined ? { payloadTypes } : {}),
      ...(label !== undefined ? { label } : {}),
    },
  };
}

function parseSigstore(
  input: Record<string, unknown>,
  index: number,
): { kind: 'ok'; anchor: SigstoreIdentityAnchor } | { kind: 'fail'; detail: string } {
  const where = `anchors[${String(index)}]`;
  const unknown = unknownField(input, SIGSTORE_FIELDS);
  if (unknown !== null) return fail(`${where} has unknown field "${unknown}"`);
  const id = readId(input['id'], where);
  if (typeof id !== 'string') return id;
  const issuer = input['issuer'];
  if (typeof issuer !== 'string' || issuer.length === 0 || issuer.length > 512 || hasControl(issuer)) {
    return fail(`${where}.issuer must be a non-empty string`);
  }
  const hasSubject = Object.hasOwn(input, 'subject');
  const hasRegExp = Object.hasOwn(input, 'subjectRegExp');
  if (hasSubject === hasRegExp) {
    return fail(`${where} requires exactly one of subject or subjectRegExp`);
  }
  let subject: string | undefined;
  let subjectRegExp: string | undefined;
  if (hasSubject) {
    const value = input['subject'];
    if (typeof value !== 'string' || value.length === 0 || value.length > 512 || hasControl(value)) {
      return fail(`${where}.subject must be a non-empty string`);
    }
    subject = value;
  }
  if (hasRegExp) {
    const value = input['subjectRegExp'];
    if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
      return fail(`${where}.subjectRegExp must be a short regular expression`);
    }
    try {
      // Compiled only to reject a pattern that is not a regular expression.
      // Identity matching is not implemented in this version.
      new RegExp(value);
    } catch {
      return fail(`${where}.subjectRegExp is not a valid regular expression`);
    }
    subjectRegExp = value;
  }
  let requireTlog = true;
  if (Object.hasOwn(input, 'requireTlog')) {
    if (typeof input['requireTlog'] !== 'boolean') {
      return fail(`${where}.requireTlog must be a boolean`);
    }
    requireTlog = input['requireTlog'];
  }
  return {
    kind: 'ok',
    anchor: {
      type: 'sigstore-identity',
      id,
      issuer,
      ...(subject !== undefined ? { subject } : {}),
      ...(subjectRegExp !== undefined ? { subjectRegExp } : {}),
      requireTlog,
    },
  };
}

function parseRevoked(
  input: unknown,
  index: number,
): { kind: 'ok'; row: RevokedKey } | { kind: 'fail'; detail: string } {
  const where = `revoked[${String(index)}]`;
  if (!isRecord(input)) return fail(`${where} must be an object`);
  const unknown = unknownField(input, REVOKED_FIELDS);
  if (unknown !== null) return fail(`${where} has unknown field "${unknown}"`);
  const publicKey = normalisePublicKey(input['publicKey']);
  if (publicKey === null) {
    return fail(`${where}.publicKey must be a 32-byte ed25519 key (hex or base64)`);
  }
  const revokedAt = input['revokedAt'];
  if (!isRfc3339(revokedAt)) return fail(`${where}.revokedAt is not RFC 3339`);
  const reason = input['reason'];
  if (reason !== 'key-compromise' && reason !== 'superseded' && reason !== 'retired') {
    return fail(`${where}.reason must be key-compromise, superseded, or retired`);
  }
  return { kind: 'ok', row: { publicKey, revokedAt, reason } };
}

function readId(
  value: unknown,
  where: string,
): string | { kind: 'fail'; detail: string } {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    return fail(`${where}.id must match [a-z0-9._-]{1,64}`);
  }
  return value;
}

function readOptionalTime(
  input: Record<string, unknown>,
  field: 'notBefore' | 'notAfter',
  where: string,
): string | undefined | { kind: 'fail'; detail: string } {
  if (!Object.hasOwn(input, field)) return undefined;
  const value = input[field];
  if (!isRfc3339(value)) return fail(`${where}.${field} is not RFC 3339`);
  return value;
}

export function normalisePublicKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const decoded = decodeEd25519PublicKey(value.trim());
  if (decoded === null) return null;
  return bytesToHex(decoded);
}

function isRfc3339(value: unknown): value is string {
  if (typeof value !== 'string' || !RFC3339_PATTERN.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function unknownField(obj: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return key;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasControl(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'unknown error';
}

function fail(detail: string): { kind: 'fail'; detail: string } {
  return { kind: 'fail', detail };
}
