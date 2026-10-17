/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TEST ONLY trust policies. The keys pinned here are test keys,
 * including the RFC 8032 §7.1 vector used by the static DSSE fixture.
 * None of these belong in a production policy.
 */

import { bytesToHex } from '@noble/hashes/utils';
import type { RevokedKey, TrustPolicy } from '../../src/trust/types.js';

/** RFC 8032 §7.1 public key. TEST ONLY. */
export const RFC8032_TEST_PUBLIC_KEY =
  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';

export function policyPinningKey(
  publicKey: Uint8Array | string,
  extras: {
    readonly id?: string;
    readonly notBefore?: string;
    readonly notAfter?: string;
    readonly payloadTypes?: readonly string[];
    readonly label?: string;
    readonly revoked?: readonly RevokedKey[];
    readonly policyId?: string;
  } = {},
): TrustPolicy {
  const hex = typeof publicKey === 'string' ? publicKey : bytesToHex(publicKey);
  return {
    crawcusTrustPolicy: 1,
    policyId: extras.policyId ?? 'test-only',
    description: 'TEST ONLY — not a production trust policy',
    anchors: [
      {
        type: 'ed25519-pinned',
        id: extras.id ?? 'test-signer',
        publicKey: hex,
        label: extras.label ?? 'TEST ONLY',
        ...(extras.notBefore !== undefined ? { notBefore: extras.notBefore } : {}),
        ...(extras.notAfter !== undefined ? { notAfter: extras.notAfter } : {}),
        ...(extras.payloadTypes !== undefined ? { payloadTypes: extras.payloadTypes } : {}),
      },
    ],
    ...(extras.revoked !== undefined ? { revoked: extras.revoked } : {}),
  };
}
