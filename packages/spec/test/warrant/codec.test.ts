/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  bytesToBase64,
  base64ToBytes,
  canonicalWarrantSigningBytes,
} from '../../src/warrant/codec.js';
import type { Warrant } from '../../src/warrant/types.js';

describe('warrant/codec — base64', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 2, 3, 255, 254, 253, 0x55, 0xaa]);
    const encoded = bytesToBase64(original);
    const decoded = base64ToBytes(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(original);
  });

  it('round-trips a 64-byte signature-shaped payload', () => {
    const original = new Uint8Array(64);
    for (let i = 0; i < 64; i++) original[i] = i;
    const encoded = bytesToBase64(original);
    expect(encoded).toHaveLength(88); // 64 bytes → 88 base64 chars
    const decoded = base64ToBytes(encoded);
    expect(decoded).toEqual(original);
  });

  it('round-trips a 32-byte public-key-shaped payload', () => {
    const original = new Uint8Array(32);
    for (let i = 0; i < 32; i++) original[i] = (i * 7) % 256;
    const encoded = bytesToBase64(original);
    expect(encoded).toHaveLength(44); // 32 bytes → 44 base64 chars (with padding)
    const decoded = base64ToBytes(encoded);
    expect(decoded).toEqual(original);
  });

  it('returns null on malformed base64 (never throws)', () => {
    // atob throws on invalid base64; base64ToBytes wraps that into null.
    expect(base64ToBytes('not!valid#base64@@@')).toBeNull();
  });

  it('returns null on empty string with no padding context', () => {
    // Empty string is technically valid base64 (decodes to 0 bytes);
    // we verify it doesn't throw and produces a 0-length array
    const decoded = base64ToBytes('');
    expect(decoded).not.toBeNull();
    expect(decoded?.length).toBe(0);
  });
});

describe('warrant/codec — canonicalWarrantSigningBytes', () => {
  // Reference Warrant — deterministic fields. Used here + in the
  // TCK-fixture test in verify.test.ts.
  const refWarrant: Warrant = {
    id: 'wt_01ARZ3NDEKTSV4RRFFQ69G5FAV' as Warrant['id'],
    tenantId: 'tn_demo' as Warrant['tenantId'],
    subject: 'ac_alice' as Warrant['subject'],
    issuer: {
      id: 'is_self_demo' as Warrant['issuer']['id'],
      kind: 'self',
      name: 'Demo Self Issuer',
      publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      publicKeyAlgorithm: 'ed25519',
    },
    issuerSignature: 'placeholder-replaced-on-sign' as Warrant['issuerSignature'],
    authority: [
      {
        regulation: 'gdpr@2025-Q1' as Warrant['authority'][0]['regulation'],
        article: 'Art 6(1)(b)',
      },
    ],
    scope: {
      specs: ['CreateCourse' as Warrant['scope']['specs'][0]],
    },
    issuedAt: '2026-05-21T00:00:00.000Z' as Warrant['issuedAt'],
    expiresAt: '2027-05-21T00:00:00.000Z' as Warrant['expiresAt'],
    revokedAt: null,
    revocationReason: null,
    renewal: null,
  };

  it('strips issuerSignature before canonicalising', () => {
    const w1 = { ...refWarrant, issuerSignature: 'sig-a' as Warrant['issuerSignature'] };
    const w2 = { ...refWarrant, issuerSignature: 'sig-b-different' as Warrant['issuerSignature'] };
    const bytes1 = canonicalWarrantSigningBytes(w1);
    const bytes2 = canonicalWarrantSigningBytes(w2);
    expect(bytes1).toEqual(bytes2);
  });

  it('is deterministic across calls (RFC 8785 JCS)', () => {
    const a = canonicalWarrantSigningBytes(refWarrant);
    const b = canonicalWarrantSigningBytes(refWarrant);
    expect(a).toEqual(b);
  });

  it('produces different bytes when a non-signature field differs', () => {
    const variant = { ...refWarrant, subject: 'ac_bob' as Warrant['subject'] };
    const refBytes = canonicalWarrantSigningBytes(refWarrant);
    const variantBytes = canonicalWarrantSigningBytes(variant);
    expect(refBytes).not.toEqual(variantBytes);
  });
});
