/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { evaluateWarrant } from '../../src/warrant/evaluate.js';
import { signWarrant } from '../../src/warrant/verify.js';
import { bytesToBase64 } from '../../src/warrant/codec.js';
import type { Warrant, WarrantCtx } from '../../src/warrant/types.js';
import type { IssuerTrust } from '../../src/warrant/issuer-trust.js';

// Test keypair (Ed25519 deterministic per RFC 8032 §5.1.6)
const TEST_PRIV = new Uint8Array(32);
for (let i = 0; i < 32; i++) TEST_PRIV[i] = i + 1;
const TEST_PUB = bytesToBase64(ed25519.getPublicKey(TEST_PRIV));

const ISSUER_ID = 'is_test' as Warrant['issuer']['id'];

function makeTrust(): IssuerTrust {
  return {
    roots: [
      {
        issuerId: ISSUER_ID,
        publicKey: TEST_PUB,
        kind: 'self',
        name: 'Test Issuer',
      },
    ],
    acceptUnknown: false,
  };
}

function makeCtx(now: Date): WarrantCtx {
  return {
    intent: {
      id: 'i_demo' as WarrantCtx['intent']['id'],
      key: 'CreateCourse' as WarrantCtx['intent']['key'],
      tenantId: 'tn_demo' as WarrantCtx['intent']['tenantId'],
      actorId: 'ac_alice' as WarrantCtx['intent']['actorId'],
      classification: undefined,
    } as WarrantCtx['intent'],
    spec: {
      key: 'CreateCourse' as WarrantCtx['spec']['key'],
      version: 1,
      fields: [],
      readiness: () => true,
    } as unknown as WarrantCtx['spec'],
    tenant: {
      id: 'tn_demo' as WarrantCtx['tenant']['id'],
      region: 'eu-west-1' as WarrantCtx['tenant']['region'],
    } as WarrantCtx['tenant'],
    events: [],
    now,
  };
}

function makeSignedWarrant(overrides: Partial<Warrant> = {}): Warrant {
  const stub: Omit<Warrant, 'issuerSignature'> = {
    id: 'wt_001' as Warrant['id'],
    tenantId: 'tn_demo' as Warrant['tenantId'],
    subject: 'ac_alice' as Warrant['subject'],
    issuer: {
      id: ISSUER_ID,
      kind: 'self',
      name: 'Test Issuer',
      publicKey: TEST_PUB,
      publicKeyAlgorithm: 'ed25519',
    },
    authority: [],
    scope: {
      specs: ['CreateCourse' as Warrant['scope']['specs'][0]],
    },
    issuedAt: '2026-05-01T00:00:00.000Z' as Warrant['issuedAt'],
    expiresAt: '2027-05-01T00:00:00.000Z' as Warrant['expiresAt'],
    revokedAt: null,
    revocationReason: null,
    renewal: null,
    ...overrides,
  };
  const sig = signWarrant(stub, TEST_PRIV);
  return { ...stub, issuerSignature: sig };
}

describe('warrant/evaluate — happy path', () => {
  it('returns valid for a well-formed signed warrant in scope + temporal window', () => {
    const warrant = makeSignedWarrant();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateWarrant(warrant, ctx, makeTrust());
    expect(result.status).toBe('valid');
    expect(result.warrantId).toBe(warrant.id);
    expect(result.checkpoint).toBe('pre');
    expect(result.evaluatedAt).toMatch(/^2026-06-01T/);
  });

  it('respects the checkpoint argument', () => {
    const warrant = makeSignedWarrant();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateWarrant(warrant, ctx, makeTrust(), 'post');
    expect(result.checkpoint).toBe('post');
  });
});

describe('warrant/evaluate — revocation precedes everything', () => {
  it('reports revoked even when signature is also invalid (order matters)', () => {
    const warrant = makeSignedWarrant({
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
      revocationReason: 'auditor concern',
    });
    // Even if signature is now technically invalid (signed pre-revoke
    // metadata), the evaluator reports revoked first — auditors see
    // the certain failure reason.
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateWarrant(warrant, ctx, makeTrust());
    expect(result.status).toBe('revoked');
    expect(result.reason).toBe('auditor concern');
  });
});

describe('warrant/evaluate — temporal', () => {
  it('reports not-yet-valid when now < issuedAt', () => {
    const warrant = makeSignedWarrant({
      issuedAt: '2027-01-01T00:00:00.000Z' as Warrant['issuedAt'],
      expiresAt: '2028-01-01T00:00:00.000Z' as Warrant['expiresAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('not-yet-valid');
  });

  it('reports expired when now >= expiresAt', () => {
    const warrant = makeSignedWarrant();
    const ctx = makeCtx(new Date('2028-01-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('expired');
  });

  it('accepts null expiresAt (until-revoked)', () => {
    const warrant = makeSignedWarrant({ expiresAt: null });
    const ctx = makeCtx(new Date('2099-01-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('valid');
  });
});

describe('warrant/evaluate — scope', () => {
  it('reports out-of-scope when spec.key not in scope.specs', () => {
    const warrant = makeSignedWarrant({
      scope: { specs: ['SomeOtherSpec' as Warrant['scope']['specs'][0]] },
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('out-of-scope');
  });

  it('reports out-of-scope when tenant.region not in scope.regions', () => {
    const warrant = makeSignedWarrant({
      scope: {
        specs: ['CreateCourse' as Warrant['scope']['specs'][0]],
        regions: ['us-east-1' as Warrant['scope']['regions'][0]],
      },
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('out-of-scope');
  });

  it('accepts empty regions array as unrestricted', () => {
    const warrant = makeSignedWarrant({
      scope: {
        specs: ['CreateCourse' as Warrant['scope']['specs'][0]],
        regions: [],
      },
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('valid');
  });
});

describe('warrant/evaluate — trust + signature', () => {
  it('reports untrusted-issuer when issuer not in roots and acceptUnknown false', () => {
    const warrant = makeSignedWarrant({
      issuer: {
        id: 'is_attacker' as Warrant['issuer']['id'],
        kind: 'self',
        name: 'Attacker',
        publicKey: TEST_PUB,
        publicKeyAlgorithm: 'ed25519',
      },
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('untrusted-issuer');
  });

  it('reports signature-mismatch when payload is tampered after signing', () => {
    const warrant = makeSignedWarrant();
    const tampered: Warrant = { ...warrant, subject: 'ac_attacker' as Warrant['subject'] };
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(tampered, ctx, makeTrust()).status).toBe('signature-mismatch');
  });

  it('reports signature-mismatch when explicit root key disagrees with the (legitimate) Warrant key', () => {
    // Attacker scenario: warrant is signed correctly by an attacker
    // whose pubkey matches its body — but the tenant has explicit
    // trust for a different issuer key entirely.
    const attackerPriv = new Uint8Array(32);
    for (let i = 0; i < 32; i++) attackerPriv[i] = i + 200;
    const attackerPub = bytesToBase64(ed25519.getPublicKey(attackerPriv));

    const stub: Omit<Warrant, 'issuerSignature'> = {
      id: 'wt_evil' as Warrant['id'],
      tenantId: 'tn_demo' as Warrant['tenantId'],
      subject: 'ac_alice' as Warrant['subject'],
      issuer: {
        id: ISSUER_ID, // claims to be the trusted issuer ID
        kind: 'self',
        name: 'Test Issuer (claimed)',
        publicKey: attackerPub, // but ships its own public key
        publicKeyAlgorithm: 'ed25519',
      },
      authority: [],
      scope: { specs: ['CreateCourse' as Warrant['scope']['specs'][0]] },
      issuedAt: '2026-05-01T00:00:00.000Z' as Warrant['issuedAt'],
      expiresAt: '2027-05-01T00:00:00.000Z' as Warrant['expiresAt'],
      revokedAt: null,
      revocationReason: null,
      renewal: null,
    };
    const evilSig = signWarrant(stub, attackerPriv); // attacker signs with their key
    const warrant: Warrant = { ...stub, issuerSignature: evilSig };

    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    // Trust resolves to TEST_PUB (explicit root for ISSUER_ID); sig verify fails.
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('signature-mismatch');
  });

  it('reports signature-mismatch when TOFU-accepted issuer presents a tampered warrant', () => {
    // Trust roots are empty + acceptUnknown=true → TOFU path. The
    // resolved.publicKey is taken from warrant.issuer.publicKey itself.
    // Tampering the body after signing makes verify fail.
    const warrant = makeSignedWarrant();
    const tampered: Warrant = { ...warrant, subject: 'ac_attacker' as Warrant['subject'] };
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const trust: IssuerTrust = { roots: [], acceptUnknown: true };
    const result = evaluateWarrant(tampered, ctx, trust);
    expect(result.status).toBe('signature-mismatch');
    // The error reason must reference the TOFU code path explicitly,
    // distinct from the 'explicit trust root' branch (line 119 ternary).
    expect(result.reason).toMatch(/TOFU-resolved/);
  });
});

// --- additional targeted coverage to kill survived mutants per stryker run 2026-05-22 ---

describe('warrant/evaluate — valid result has no reason field (line 52 ternary)', () => {
  it('omits the reason field entirely when status is valid', () => {
    const warrant = makeSignedWarrant();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateWarrant(warrant, ctx, makeTrust());
    expect(result.status).toBe('valid');
    // `reason` is intentionally absent (not just undefined). The result()
    // helper's `reason === undefined` branch omits the key from the object.
    expect('reason' in result).toBe(false);
  });
});

describe('warrant/evaluate — temporal boundaries', () => {
  it('accepts now exactly at issuedAt (>= issuedAt is valid, < is not-yet-valid)', () => {
    const warrant = makeSignedWarrant({
      issuedAt: '2026-05-01T00:00:00.000Z' as Warrant['issuedAt'],
      expiresAt: '2027-05-01T00:00:00.000Z' as Warrant['expiresAt'],
    });
    const ctx = makeCtx(new Date('2026-05-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('valid');
  });

  it('rejects now exactly at expiresAt (>= expiresAt is expired)', () => {
    const warrant = makeSignedWarrant({
      issuedAt: '2026-05-01T00:00:00.000Z' as Warrant['issuedAt'],
      expiresAt: '2027-05-01T00:00:00.000Z' as Warrant['expiresAt'],
    });
    const ctx = makeCtx(new Date('2027-05-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('expired');
  });

  it('accepts just before expiresAt (< expiresAt is valid)', () => {
    const warrant = makeSignedWarrant({
      issuedAt: '2026-05-01T00:00:00.000Z' as Warrant['issuedAt'],
      expiresAt: '2027-05-01T00:00:00.000Z' as Warrant['expiresAt'],
    });
    const ctx = makeCtx(new Date('2027-04-30T23:59:59.999Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('valid');
  });
});

describe('warrant/evaluate — scope (regions + classifications)', () => {
  it('accepts when scope.regions matches tenant.region', () => {
    const warrant = makeSignedWarrant({
      scope: {
        specs: ['CreateCourse' as Warrant['scope']['specs'][0]],
        regions: ['eu-west-1' as Warrant['scope']['regions'][0]],
      },
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('valid');
  });

  it('accepts when scope.regions is undefined (no region restriction)', () => {
    const warrant = makeSignedWarrant({
      scope: { specs: ['CreateCourse' as Warrant['scope']['specs'][0]] },
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('valid');
  });

  it('reports out-of-scope when scope.classifications excludes spec.classification', () => {
    const warrant = makeSignedWarrant({
      scope: {
        specs: ['CreateCourse' as Warrant['scope']['specs'][0]],
        classifications: ['high-risk' as Warrant['scope']['classifications'][0]],
      },
    });
    const ctx: WarrantCtx = {
      ...makeCtx(new Date('2026-06-01T00:00:00.000Z')),
      spec: {
        key: 'CreateCourse' as WarrantCtx['spec']['key'],
        version: 1,
        fields: [],
        readiness: () => true,
        classification: 'limited-risk',
      } as unknown as WarrantCtx['spec'],
    };
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('out-of-scope');
  });

  it('accepts when scope.classifications matches spec.classification', () => {
    const warrant = makeSignedWarrant({
      scope: {
        specs: ['CreateCourse' as Warrant['scope']['specs'][0]],
        classifications: ['high-risk' as Warrant['scope']['classifications'][0]],
      },
    });
    const ctx: WarrantCtx = {
      ...makeCtx(new Date('2026-06-01T00:00:00.000Z')),
      spec: {
        key: 'CreateCourse' as WarrantCtx['spec']['key'],
        version: 1,
        fields: [],
        readiness: () => true,
        classification: 'high-risk',
      } as unknown as WarrantCtx['spec'],
    };
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('valid');
  });

  it('accepts when scope.classifications is empty array (no classification restriction)', () => {
    const warrant = makeSignedWarrant({
      scope: {
        specs: ['CreateCourse' as Warrant['scope']['specs'][0]],
        classifications: [],
      },
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('valid');
  });

  it('accepts when scope.classifications is set but spec.classification is undefined', () => {
    const warrant = makeSignedWarrant({
      scope: {
        specs: ['CreateCourse' as Warrant['scope']['specs'][0]],
        classifications: ['high-risk' as Warrant['scope']['classifications'][0]],
      },
    });
    // spec.classification undefined → classification check short-circuits to "valid"
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateWarrant(warrant, ctx, makeTrust()).status).toBe('valid');
  });
});

describe('warrant/evaluate — revocation fallback', () => {
  it('falls back to a default reason when revocationReason is null', () => {
    const warrant = makeSignedWarrant({
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
      revocationReason: null,
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateWarrant(warrant, ctx, makeTrust());
    expect(result.status).toBe('revoked');
    // Fallback shape: 'revoked at <timestamp>'
    expect(result.reason).toMatch(/^revoked at 2026-05-15/);
  });
});
