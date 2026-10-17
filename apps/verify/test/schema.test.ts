/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verify, collectRegulations } from '../src/core/verify.js';
import { VERIFY_RESULT_SCHEMA } from '../src/core/schema.js';
import { normalisePublicKey, parseTrustAnchorsDocument, type TrustAnchor } from '../src/core/trust.js';

const sample = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../src/samples/${n}`, import.meta.url)));
const demo = JSON.parse(readFileSync(new URL('../src/samples/demo-anchor.json', import.meta.url), 'utf8')) as { label: string; publicKeyHex: string };
const anchors: TrustAnchor[] = [{ label: demo.label, publicKeyHex: demo.publicKeyHex, source: 'sample' }];
const AT = '2026-10-16T00:00:00.000Z';

describe('crawcus.verify-result/v1 mapping', () => {
  it('good bundle → pass with full summary', () => {
    const r = verify(sample('good.dsse.json'), { anchors, verifiedAt: AT });
    expect(r.schema).toBe(VERIFY_RESULT_SCHEMA);
    expect(r.verdict).toBe('pass');
    expect(r.verifiedAt).toBe(AT);
    expect(r.input.format).toBe('dsse');
    expect(r.input.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.envelope?.payloadType).toBe('application/vnd.crawcus.foundry-log+jsonl');
    expect(r.signer).toMatchObject({ algorithm: 'ed25519', trust: 'trusted', keyId: demo.publicKeyHex });
    expect(r.signer?.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r.bundle?.rowCount).toBe(8);
    expect(r.bundle?.selfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.bundle!.timeRange.earliest < r.bundle!.timeRange.latest).toBe(true);
    expect(r.bundle?.regulations).toEqual(expect.arrayContaining(['gdpr', 'EU AI Act Art. 12']));
    expect(r.chain).toMatchObject({ valid: true, brokenAt: null });
    expect(r.chain.links.every((l) => l.status === 'ok')).toBe(true);
    expect(r.chain.links[0]?.prevHash).toBeNull();
    expect(r.checks.map((c) => c.id)).toEqual([
      'dsse.envelope.shape', 'dsse.signature', 'chain.jcs-hash-equivalence', 'chain.hash-chain',
      'trust.signer-pinned', 'chain.row-walk',
    ]);
    expect(r.checks.every((c) => c.verdict === 'pass')).toBe(true);
  });

  it('tampered → fail on dsse.signature and pinpoints row 3', () => {
    const r = verify(sample('tampered.dsse.json'), { anchors, verifiedAt: AT });
    expect(r.verdict).toBe('fail');
    expect(r.checks.find((c) => c.id === 'dsse.signature')?.verdict).toBe('fail');
    expect(r.chain.brokenAt).toBe(3);
    expect(r.chain.links[3]).toMatchObject({ status: 'broken', contentHashOk: false, prevLinkOk: true });
    expect(r.chain.links[4]?.status).toBe('after-break');
    expect(r.reason).toMatch(/signature/i);
    expect(r.reason).toMatch(/#3/);
  });

  it('untrusted signer → fail via trust.signer-pinned only', () => {
    const r = verify(sample('untrusted.dsse.json'), { anchors, verifiedAt: AT });
    expect(r.verdict).toBe('fail');
    expect(r.signer?.trust).toBe('untrusted');
    expect(r.checks.filter((c) => c.verdict === 'fail').map((c) => c.id)).toEqual(['trust.signer-pinned']);
    expect(r.chain.valid).toBe(true);
  });

  it('no anchors → trust skipped, verdict from library', () => {
    const r = verify(sample('untrusted.dsse.json'), { verifiedAt: AT });
    expect(r.verdict).toBe('pass');
    expect(r.signer?.trust).toBe('no-anchors');
    expect(r.checks.find((c) => c.id === 'trust.signer-pinned')?.verdict).toBe('skipped');
  });

  it('cross-vendor cosign fixture verifies', () => {
    expect(verify(sample('cosign.dsse.json'), { verifiedAt: AT }).verdict).toBe('pass');
  });

  it('garbage → structured fail, never throws', () => {
    const r = verify(new TextEncoder().encode('not json'), { verifiedAt: AT });
    expect(r).toMatchObject({ schema: VERIFY_RESULT_SCHEMA, verdict: 'fail', envelope: null, bundle: null });
    expect(r.checks[0]?.id).toBe('dsse.envelope.shape');
  });

  it('plain bundle JSON → unsigned fail but chain walked', () => {
    const env = JSON.parse(new TextDecoder().decode(sample('good.dsse.json'))) as { payload: string };
    const bundle = Buffer.from(env.payload, 'base64');
    const r = verify(new Uint8Array(bundle), { verifiedAt: AT });
    expect(r.input.format).toBe('bundle-json');
    expect(r.verdict).toBe('fail');
    expect(r.chain.valid).toBe(true);
    expect(r.bundle?.rowCount).toBe(8);
  });

  it('result is JSON-round-trippable (API-stable)', () => {
    const r = verify(sample('good.dsse.json'), { anchors, verifiedAt: AT });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe('trust helpers', () => {
  it('normalises hex/base64 keys', () => {
    const b64 = Buffer.from(demo.publicKeyHex, 'hex').toString('base64');
    expect(normalisePublicKey(b64)).toBe(demo.publicKeyHex);
    expect(normalisePublicKey(demo.publicKeyHex.toUpperCase())).toBe(demo.publicKeyHex);
    expect(normalisePublicKey('nope')).toBeNull();
  });
  it('adapts the TUF-style trust-anchors document, dropping revoked keys', () => {
    const list = parseTrustAnchorsDocument({
      _type: 'crawcus.trust-anchors', version: 1, expires: '2027-01-01T00:00:00Z',
      root: { keys: [], threshold: 1 },
      keys: [
        { keyid: 'k1', alg: 'ed25519', pubkey: demo.publicKeyHex, purpose: 'bundle-signing', status: 'active' },
        { keyid: 'k2', alg: 'ed25519', pubkey: demo.publicKeyHex, status: 'revoked', revoked_at: '2026-01-01' },
      ],
      signatures: [],
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.publicKeyHex).toBe(demo.publicKeyHex);
  });
  it('collects regulations', () => {
    expect(collectRegulations({ regulations: ['b'], events: [{ payload: { regulation: 'a' } }] })).toEqual(['a', 'b']);
  });
});
