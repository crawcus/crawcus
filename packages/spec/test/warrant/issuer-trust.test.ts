/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { resolveTrustedPublicKey, type IssuerTrust } from '../../src/warrant/issuer-trust.js';
import type { Warrant } from '../../src/warrant/types.js';

function makeWarrantWithIssuer(issuerId: string, publicKey: string): Warrant {
  return {
    id: 'wt_test' as Warrant['id'],
    tenantId: 'tn_demo' as Warrant['tenantId'],
    subject: 'ac_alice' as Warrant['subject'],
    issuer: {
      id: issuerId as Warrant['issuer']['id'],
      kind: 'self',
      name: 'Test Issuer',
      publicKey,
      publicKeyAlgorithm: 'ed25519',
    },
    issuerSignature: 'placeholder' as Warrant['issuerSignature'],
    authority: [],
    scope: { specs: [] },
    issuedAt: '2026-05-21T00:00:00.000Z' as Warrant['issuedAt'],
    expiresAt: null,
    revokedAt: null,
    revocationReason: null,
    renewal: null,
  };
}

describe('warrant/issuer-trust — resolveTrustedPublicKey', () => {
  const trustedKey = 'AAAATRUSTED========================';
  const warrantBodyKey = 'BBBBWARRANTBODY===================='; // attacker-controllable

  it('returns the explicit root publicKey when issuer is in roots (ignores warrant.issuer.publicKey)', () => {
    const trust: IssuerTrust = {
      roots: [
        {
          issuerId: 'is_pwc' as IssuerTrust['roots'][0]['issuerId'],
          publicKey: trustedKey,
          kind: 'big-4',
          name: 'PwC AI Assurance',
        },
      ],
      acceptUnknown: false,
    };
    const warrant = makeWarrantWithIssuer('is_pwc', warrantBodyKey);
    const resolved = resolveTrustedPublicKey(trust, warrant);
    expect(resolved).not.toBeNull();
    expect(resolved?.publicKey).toBe(trustedKey);
    expect(resolved?.publicKey).not.toBe(warrantBodyKey); // critical security property
    expect(resolved?.trusted).toBe('explicit');
  });

  it('returns null when issuer not in roots and acceptUnknown is false', () => {
    const trust: IssuerTrust = {
      roots: [
        {
          issuerId: 'is_pwc' as IssuerTrust['roots'][0]['issuerId'],
          publicKey: trustedKey,
          kind: 'big-4',
          name: 'PwC AI Assurance',
        },
      ],
      acceptUnknown: false,
    };
    const warrant = makeWarrantWithIssuer('is_attacker', warrantBodyKey);
    expect(resolveTrustedPublicKey(trust, warrant)).toBeNull();
  });

  it('TOFU dev-mode: accepts unknown issuer; uses key from Warrant body', () => {
    const trust: IssuerTrust = {
      roots: [],
      acceptUnknown: true,
    };
    const warrant = makeWarrantWithIssuer('is_local_dev', warrantBodyKey);
    const resolved = resolveTrustedPublicKey(trust, warrant);
    expect(resolved).not.toBeNull();
    expect(resolved?.publicKey).toBe(warrantBodyKey);
    expect(resolved?.trusted).toBe('tofu');
  });

  it('explicit roots take precedence over TOFU when both are configured', () => {
    const trust: IssuerTrust = {
      roots: [
        {
          issuerId: 'is_pwc' as IssuerTrust['roots'][0]['issuerId'],
          publicKey: trustedKey,
          kind: 'big-4',
          name: 'PwC AI Assurance',
        },
      ],
      acceptUnknown: true, // dev mode flag accidentally still set
    };
    const warrant = makeWarrantWithIssuer('is_pwc', warrantBodyKey);
    const resolved = resolveTrustedPublicKey(trust, warrant);
    expect(resolved?.publicKey).toBe(trustedKey);
    expect(resolved?.trusted).toBe('explicit');
  });

  it('empty roots + acceptUnknown false ⇒ all warrants rejected (locked-down config)', () => {
    const trust: IssuerTrust = { roots: [], acceptUnknown: false };
    const warrant = makeWarrantWithIssuer('is_anything', warrantBodyKey);
    expect(resolveTrustedPublicKey(trust, warrant)).toBeNull();
  });
});
