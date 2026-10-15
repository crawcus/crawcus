/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Signer-trust conformance vectors.
 *
 * Every key in this module is TEST ONLY. Seeds are 32 bytes beginning
 * with the ASCII prefix "TEST" and a single counter byte. They are not
 * production keys. Do not copy them into a deployed trust policy.
 * The RFC 8032 test vector is intentionally not used here.
 *
 * Vectors are pure data plus a deterministic builder so a second
 * implementation can replay `vectors/signer-trust/*.json` without
 * TypeScript.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalJSON, computeContentHash, normaliseForCanonical } from '@crawcus/spec';

export const SIGNER_TRUST_KEY_LABEL = 'TEST ONLY' as const;

export interface SignerTrustVector {
  readonly name: string;
  readonly description: string;
  readonly keyLabel: typeof SIGNER_TRUST_KEY_LABEL;
  readonly envelope: {
    readonly payloadType: string;
    readonly payload: string;
    readonly signatures: readonly { readonly keyid: string; readonly sig: string }[];
  };
  readonly policy: Record<string, unknown> | null;
  readonly expected: {
    readonly verdict: 'pass' | 'fail' | 'untrusted-signer';
    readonly reason: string;
  };
}

const PAYLOAD_TYPE = 'application/vnd.crawcus.bundle+jsonl';
const SIGNING_TIME = '2026-08-11T00:00:00.000Z';

interface SignedEnvelope {
  readonly envelope: SignerTrustVector['envelope'];
  readonly publicKeyHex: string;
}

/** Fixed TEST seed. `n` must be 1–255. */
export function testOnlySeed(n: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.set([0x54, 0x45, 0x53, 0x54], 0);
  seed[31] = n;
  return seed;
}

export function buildSignerTrustVectors(): readonly SignerTrustVector[] {
  const legit = testOnlySeed(1);
  const attacker = testOnlySeed(2);
  const unknown = testOnlySeed(4);
  const valid = signBundle(legit);
  const resigned = resign(valid.envelope, attacker);
  const unknownSigned = signBundle(unknown);
  const spoofed = resign(valid.envelope, attacker, valid.publicKeyHex);
  const rehashed = signBundle(attacker);
  const legitPolicy = pinned(valid.publicKeyHex);

  return [
    vector('valid-pinned', 'TEST key pinned by the policy.', valid.envelope, legitPolicy, 'pass', 'signer.trusted.pinned-key'),
    vector('no-policy', 'Signature verifies and no policy is supplied.', valid.envelope, null, 'untrusted-signer', 'signer.untrusted.no-policy'),
    vector('attacker-resigned', 'Same payload re-signed by a different TEST key.', resigned, legitPolicy, 'untrusted-signer', 'signer.untrusted.unknown-key'),
    vector('attacker-resigned-and-rehashed', 'A fully rebuilt bundle signed by an unpinned TEST key.', rehashed.envelope, legitPolicy, 'untrusted-signer', 'signer.untrusted.unknown-key'),
    vector('unknown-keyid', 'keyid is a TEST public key that the policy does not pin.', unknownSigned.envelope, legitPolicy, 'untrusted-signer', 'signer.untrusted.unknown-key'),
    vector('keyid-spoof', 'keyid copies the pinned TEST key, but the signature is from another TEST key.', spoofed, legitPolicy, 'fail', 'signature.invalid'),
    vector('expired-window', 'Pinned TEST key whose notAfter is before the bundle signing time.', valid.envelope, pinned(valid.publicKeyHex, { notAfter: '2026-01-01T00:00:00Z' }), 'untrusted-signer', 'signer.untrusted.expired'),
    vector('not-yet-valid', 'Pinned TEST key whose notBefore is after the bundle signing time.', valid.envelope, pinned(valid.publicKeyHex, { notBefore: '2026-09-01T00:00:00Z' }), 'untrusted-signer', 'signer.untrusted.not-yet-valid'),
    vector('revoked-compromise', 'Pinned TEST key also revoked for key-compromise.', valid.envelope, pinned(valid.publicKeyHex, { revokedReason: 'key-compromise' }), 'fail', 'signer.untrusted.revoked'),
    vector('rotated-old-key-within-overlap', 'Old TEST key still inside its notAfter.', valid.envelope, overlapPolicy(valid.publicKeyHex, signBundle(testOnlySeed(3)).publicKeyHex), 'pass', 'signer.trusted.pinned-key'),
    vector('rotated-old-key-after-supersede', 'Old TEST key revoked as superseded before the signing time.', signBundle(legit, '2026-09-10T00:00:00.000Z').envelope, supersededPolicy(valid.publicKeyHex), 'untrusted-signer', 'signer.untrusted.revoked'),
    vector('payload-type-not-allowed', 'Pinned TEST key does not allow the bundle payload type.', valid.envelope, pinned(valid.publicKeyHex, { payloadTypes: ['application/vnd.crawcus.disclosure-bundle+jsonl'] }), 'untrusted-signer', 'signer.untrusted.payload-type-not-allowed'),
    vector('malformed-unknown-field', 'Unknown top-level field.', valid.envelope, { ...legitPolicy, unexpected: true }, 'fail', 'policy.malformed'),
    vector('malformed-dup-id', 'Two anchors share an id.', valid.envelope, dupIdPolicy(valid.publicKeyHex), 'fail', 'policy.malformed'),
    vector('malformed-bad-key-len', 'Anchor public key is not 32 bytes.', valid.envelope, { ...legitPolicy, anchors: [{ type: 'ed25519-pinned', id: 'short', publicKey: 'aa'.repeat(31) }] }, 'fail', 'policy.malformed'),
    vector('malformed-bad-date', 'Anchor notAfter is not RFC 3339.', valid.envelope, pinned(valid.publicKeyHex, { notAfter: 'tomorrow' }), 'fail', 'policy.malformed'),
    vector('malformed-empty-anchors', 'anchors is empty.', valid.envelope, { ...legitPolicy, anchors: [] }, 'fail', 'policy.malformed'),
    vector('malformed-version-2', 'crawcusTrustPolicy is not 1.', valid.envelope, { ...legitPolicy, crawcusTrustPolicy: 2 }, 'fail', 'policy.malformed'),
  ];
}

export const SIGNER_TRUST_VECTORS: readonly SignerTrustVector[] = buildSignerTrustVectors();

function vector(
  name: string,
  description: string,
  envelope: SignerTrustVector['envelope'],
  policy: Record<string, unknown> | null,
  verdict: SignerTrustVector['expected']['verdict'],
  reason: string,
): SignerTrustVector {
  return {
    name,
    description,
    keyLabel: SIGNER_TRUST_KEY_LABEL,
    envelope,
    policy,
    expected: { verdict, reason },
  };
}

function pinned(
  publicKey: string,
  extras: { notBefore?: string; notAfter?: string; payloadTypes?: string[]; revokedReason?: 'key-compromise' | 'superseded' } = {},
): Record<string, unknown> {
  const anchor: Record<string, unknown> = {
    type: 'ed25519-pinned',
    id: 'test-signer',
    publicKey,
    label: SIGNER_TRUST_KEY_LABEL,
  };
  if (extras.notBefore !== undefined) anchor['notBefore'] = extras.notBefore;
  if (extras.notAfter !== undefined) anchor['notAfter'] = extras.notAfter;
  if (extras.payloadTypes !== undefined) anchor['payloadTypes'] = extras.payloadTypes;
  const policy: Record<string, unknown> = {
    crawcusTrustPolicy: 1,
    policyId: 'test-only',
    description: 'TEST ONLY — generated conformance keys, not a production policy',
    anchors: [anchor],
  };
  if (extras.revokedReason !== undefined) {
    policy['revoked'] = [
      { publicKey, revokedAt: '2026-01-01T00:00:00Z', reason: extras.revokedReason },
    ];
  }
  return policy;
}

function overlapPolicy(oldKey: string, newKey: string): Record<string, unknown> {
  return {
    crawcusTrustPolicy: 1,
    policyId: 'test-only',
    description: 'TEST ONLY',
    anchors: [
      {
        type: 'ed25519-pinned',
        id: 'old',
        publicKey: oldKey,
        notAfter: '2026-08-31T00:00:00Z',
        label: SIGNER_TRUST_KEY_LABEL,
      },
      {
        type: 'ed25519-pinned',
        id: 'new',
        publicKey: newKey,
        notBefore: '2026-08-01T00:00:00Z',
        label: SIGNER_TRUST_KEY_LABEL,
      },
    ],
  };
}

function supersededPolicy(publicKey: string): Record<string, unknown> {
  return {
    crawcusTrustPolicy: 1,
    policyId: 'test-only',
    description: 'TEST ONLY',
    anchors: [
      { type: 'ed25519-pinned', id: 'old', publicKey, label: SIGNER_TRUST_KEY_LABEL },
    ],
    revoked: [{ publicKey, revokedAt: '2026-08-31T00:00:00Z', reason: 'superseded' }],
  };
}

function dupIdPolicy(publicKey: string): Record<string, unknown> {
  return {
    crawcusTrustPolicy: 1,
    policyId: 'test-only',
    anchors: [
      { type: 'ed25519-pinned', id: 'same', publicKey },
      { type: 'ed25519-pinned', id: 'same', publicKey: publicKey.replace(/0/g, '1') },
    ],
  };
}

function signBundle(privateKey: Uint8Array, timestamp = SIGNING_TIME): SignedEnvelope {
  const publicKey = ed25519.getPublicKey(privateKey);
  const publicKeyHex = bytesToHex(publicKey);
  const hashable = {
    tenantId: 't_test',
    intentId: 'i_test',
    kind: 'ProjectionCommit',
    version: 0,
    timestamp,
    actor: { type: 'system', id: 'sys' },
    lawfulBasis: 'contract',
    purpose: 'service-delivery',
    dataSubjectIds: ['s_test'],
    prevHash: null,
    payload: { note: 'signer-trust conformance vector — TEST ONLY' },
  };
  const contentHash = computeContentHash(hashable as never);
  const bundle: Record<string, unknown> = {
    bundleVersion: '0.1.0',
    generatedAt: timestamp,
    tenant: { id: 't_test', region: 'us-west-2' },
    intent: { id: 'i_test', key: 'TestIntent' },
    spec: { key: 'TestIntent', version: 1, classification: 'unspecified' },
    events: [{ id: 'evt_0000', contentHash, ...hashable }],
    chainProof: {
      intentId: 'i_test',
      fromEventId: 'evt_0000',
      toEventId: 'evt_0000',
      rootHash: contentHash,
      hashes: [{ id: 'evt_0000', prevHash: null, contentHash }],
    },
  };
  const withoutSelf = normaliseForCanonical(bundle);
  const selfHash = bytesToHex(sha256(new TextEncoder().encode(canonicalJSON(withoutSelf))));
  bundle['chainProof'] = {
    ...(bundle['chainProof'] as Record<string, unknown>),
    bundleSelfHash: selfHash,
  };
  const payloadBytes = new TextEncoder().encode(canonicalJSON(normaliseForCanonical(bundle)));
  const pae = preAuthenticationEncoding(PAYLOAD_TYPE, payloadBytes);
  const sig = Buffer.from(ed25519.sign(pae, privateKey)).toString('base64');
  return {
    publicKeyHex,
    envelope: {
      payloadType: PAYLOAD_TYPE,
      payload: Buffer.from(payloadBytes).toString('base64'),
      signatures: [{ keyid: publicKeyHex, sig }],
    },
  };
}

function resign(
  envelope: SignerTrustVector['envelope'],
  privateKey: Uint8Array,
  keyid = bytesToHex(ed25519.getPublicKey(privateKey)),
): SignerTrustVector['envelope'] {
  const payloadBytes = new Uint8Array(Buffer.from(envelope.payload, 'base64'));
  const pae = preAuthenticationEncoding(envelope.payloadType, payloadBytes);
  const sig = Buffer.from(ed25519.sign(pae, privateKey)).toString('base64');
  return {
    ...envelope,
    signatures: [{ keyid, sig }],
  };
}

function preAuthenticationEncoding(payloadType: string, payload: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(payloadType);
  const header = new TextEncoder().encode(`DSSEv1 ${String(typeBytes.length)} `);
  const sep = new TextEncoder().encode(` ${String(payload.length)} `);
  const out = new Uint8Array(header.length + typeBytes.length + sep.length + payload.length);
  let offset = 0;
  out.set(header, offset);
  offset += header.length;
  out.set(typeBytes, offset);
  offset += typeBytes.length;
  out.set(sep, offset);
  offset += sep.length;
  out.set(payload, offset);
  return out;
}
