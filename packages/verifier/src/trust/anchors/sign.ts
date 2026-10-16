/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Producing a signed trust-anchor document. Callers supply one
 * `AnchorSigner` per root key. `createLocalEd25519Signer` is for tests
 * and tooling with throwaway keys only.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { canonicalJSON } from '@crawcus/spec';
import { preAuthenticationEncoding } from '../../dsse.js';
import { keyIdFor, spkiBase64FromRaw } from '../keyid.js';
import { TRUST_ANCHORS_PAYLOAD_TYPE, type AnchorKey, type AnchorSigner, type KeyPurpose, type KeyStatus, type RevocationReason } from './types.js';

/** Signature input (TA-4): PAE(application/vnd.crawcus.trust-anchors+json, JCS(signed)). */
export function trustAnchorsSigningInput(signed: unknown): Uint8Array {
  return preAuthenticationEncoding(TRUST_ANCHORS_PAYLOAD_TYPE, new TextEncoder().encode(canonicalJSON(signed)));
}

export function anchorKeyFromPublicKey(
  publicKey: Uint8Array,
  fields: {
    readonly purpose: KeyPurpose;
    readonly notBefore: string;
    readonly notAfter: string;
    readonly status?: KeyStatus;
    readonly deployment?: string;
    readonly revokedAt?: string;
    readonly revocationReason?: RevocationReason;
    readonly supersededBy?: string;
    readonly custody?: string;
    readonly kmsResource?: string;
  },
): AnchorKey {
  return {
    keyid: keyIdFor(publicKey),
    alg: 'ed25519',
    public_key: spkiBase64FromRaw(publicKey),
    purpose: fields.purpose,
    deployment: fields.deployment ?? null,
    custody: fields.custody ?? null,
    kms_resource: fields.kmsResource ?? null,
    not_before: fields.notBefore,
    not_after: fields.notAfter,
    status: fields.status ?? 'active',
    revoked_at: fields.revokedAt ?? null,
    revocation_reason: fields.revocationReason ?? null,
    superseded_by: fields.supersededBy ?? null,
  };
}

/** Sign a `signed` body (plain JSON object) with each signer. */
export async function signTrustAnchors(
  signed: Readonly<Record<string, unknown>>,
  signers: readonly AnchorSigner[],
): Promise<{ signed: Readonly<Record<string, unknown>>; signatures: { keyid: string; sig: string }[] }> {
  const message = trustAnchorsSigningInput(signed);
  const signatures: { keyid: string; sig: string }[] = [];
  for (const signer of signers) {
    const sig = await signer.sign(message);
    if (sig.length !== 64) throw new Error('signer returned a signature that is not 64 bytes');
    signatures.push({ keyid: keyIdFor(signer.publicKey), sig: Buffer.from(sig).toString('base64') });
  }
  return { signed, signatures };
}

/** TEST / tooling only. Wraps a raw 32-byte ed25519 secret key. */
export function createLocalEd25519Signer(secretKey: Uint8Array): AnchorSigner {
  if (secretKey.length !== 32) throw new Error('ed25519 secret key must be 32 bytes');
  const publicKey = ed25519.getPublicKey(secretKey);
  return { publicKey, sign: (message) => Promise.resolve(ed25519.sign(message, secretKey)) };
}
