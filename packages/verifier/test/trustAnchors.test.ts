/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/** trust-anchors.json: bootstrap, rotation chain, rollback, expiry, mapping. TEST ONLY keys. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';
import {
  bootstrapTrustAnchors,
  CRAWCUS_ANCHOR_SOURCES,
  createMemoryTrustAnchorsStore,
  keyIdFor,
  loadTrustAnchors,
  parseTrustAnchors,
  rawFromSpkiBase64,
  spkiBase64FromRaw,
  trustPolicyFromAnchors,
  updateTrustAnchors,
  verifyBundle,
  type ParsedTrustAnchors,
  type TrustPolicy,
} from '../src/index.js';
import { buildSignedBundleWithKey } from './fixtures/build-bundle.js';
import {
  AX_SEED,
  COMPROMISED_SEED,
  NEW_ROOT_SEEDS,
  PINNED,
  RELEASE_SEED,
  RETIRED_SEED,
  ROOT_SEEDS,
  SUPERSEDED_SEED,
  TV_SEED,
  body,
  pinnedFor,
  rootKeys,
  sign,
  testSeed,
} from './fixtures/trust-anchors.js';

const NOW = '2026-10-15T00:00:00Z';
const here = dirname(fileURLToPath(import.meta.url));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

async function trusted(over: Record<string, unknown> = {}): Promise<ParsedTrustAnchors> {
  const r = bootstrapTrustAnchors(await sign(body(over)), PINNED, { now: NOW });
  if (r.kind !== 'ok') throw new Error(r.detail);
  return r.anchors;
}

describe('keyid (KEY-5) and SPKI (TA-1)', () => {
  it('keyid is sha256:<hex> of the raw key and round-trips through SPKI', () => {
    const p = ed25519.getPublicKey(RELEASE_SEED);
    expect(keyIdFor(p)).toMatch(/^sha256:[0-9a-f]{64}$/);
    const spki = spkiBase64FromRaw(p);
    expect(spki.startsWith('MCowBQYDK2VwAyEA')).toBe(true);
    expect(rawFromSpkiBase64(spki)).toEqual(p);
    expect(rawFromSpkiBase64('MCowBQYDK2VuAyEA' + spki.slice(16))).toBeNull(); // X25519 OID
  });

  it('PR #2 keyFingerprint uses the same derivation', () => {
    const f = buildSignedBundleWithKey(RELEASE_SEED);
    const r = verifyBundle({ bundle: f.bundleBytes, options: { verifiedAt: NOW } });
    expect(r.trust.signer?.keyFingerprint).toBe(keyIdFor(ed25519.getPublicKey(RELEASE_SEED)));
  });
});

describe('bootstrap from a pinned root (TA-5, TA-6)', () => {
  it('accepts 2-of-4 root signatures', async () => {
    expect(bootstrapTrustAnchors(await sign(body()), PINNED, { now: NOW }).kind).toBe('ok');
  });
  it('rejects one signature (threshold unmet)', async () => {
    expect(bootstrapTrustAnchors(await sign(body(), [ROOT_SEEDS[0]]), PINNED, { now: NOW })).toMatchObject({ code: 'anchors-threshold-unmet' });
  });
  it('counts a duplicated signature once', async () => {
    const one = await sign(body(), [ROOT_SEEDS[0]]);
    const dup = { ...one, signatures: [one.signatures[0], one.signatures[0]] };
    expect(bootstrapTrustAnchors(dup, PINNED, { now: NOW })).toMatchObject({ code: 'anchors-threshold-unmet' });
  });
  it('ignores signatures from keys outside roles.root', async () => {
    const r = bootstrapTrustAnchors(await sign(body(), [ROOT_SEEDS[0], RELEASE_SEED]), PINNED, { now: NOW });
    expect(r).toMatchObject({ code: 'anchors-threshold-unmet' });
  });
  it('does not count a root key that is not active', async () => {
    const keys = (body().keys as Record<string, unknown>[]).map((k, i) => (i === 1 ? { ...k, status: 'retired' } : k));
    const r = bootstrapTrustAnchors(await sign(body({ keys }), [ROOT_SEEDS[0], ROOT_SEEDS[1]]), PINNED, { now: NOW });
    expect(r).toMatchObject({ code: 'anchors-threshold-unmet' });
  });
  it('rejects a document whose root is not the pinned root (wrong root)', async () => {
    const attacker = [testSeed(0xee, 1), testSeed(0xee, 2)];
    const r = bootstrapTrustAnchors(await sign(body({}, attacker), attacker), PINNED, { now: NOW });
    expect(r).toMatchObject({ code: 'anchors-root-mismatch' });
  });
  it('threshold 1 only in test mode', async () => {
    const b = body({ roles: { root: { keyids: PINNED.keyids, threshold: 1 } } });
    const doc = await sign(b, [ROOT_SEEDS[0]]);
    const pin = { ...PINNED, threshold: 1 };
    expect(bootstrapTrustAnchors(doc, pin, { now: NOW })).toMatchObject({ code: 'anchors-threshold-unmet' });
    expect(bootstrapTrustAnchors(doc, pin, { now: NOW, testMode: true }).kind).toBe('ok');
  });
  it('rejects a tampered document', async () => {
    const doc = clone(await sign(body())) as { signed: { keys: { purpose: string }[] } };
    doc.signed.keys[5].purpose = 'release';
    expect(bootstrapTrustAnchors(doc, PINNED, { now: NOW }).kind).toBe('fail');
  });
  it('signatures are domain-separated: a raw JCS signature does not verify', async () => {
    const { canonicalJSON } = await import('@crawcus/spec');
    const b = body();
    const msg = new TextEncoder().encode(canonicalJSON(b));
    const sigs = [ROOT_SEEDS[0], ROOT_SEEDS[1]].map((s) => ({
      keyid: keyIdFor(ed25519.getPublicKey(s)), sig: Buffer.from(ed25519.sign(msg, s)).toString('base64'),
    }));
    expect(bootstrapTrustAnchors({ signed: b, signatures: sigs }, PINNED, { now: NOW })).toMatchObject({ code: 'anchors-threshold-unmet' });
  });
  it('fails closed when expired', async () => {
    expect(bootstrapTrustAnchors(await sign(body()), PINNED, { now: '2027-04-01T00:00:00Z' })).toMatchObject({ code: 'anchors-expired' });
  });
});

describe('structure (TA-1..TA-8)', () => {
  const k0 = (b: Record<string, unknown>) => (b.keys as Record<string, unknown>[]);
  const withKey = (mut: (k: Record<string, unknown>) => Record<string, unknown>) => {
    const b = body();
    const keys = k0(b).map((k, i) => (i === 4 ? mut({ ...k }) : k));
    return { ...b, keys };
  };
  it.each([
    ['wrong keyid', withKey((k) => ({ ...k, keyid: `sha256:${'a'.repeat(64)}` }))],
    ['non-SPKI key', withKey((k) => ({ ...k, public_key: 'AAAA' }))],
    ['revoked without reason', withKey((k) => ({ ...k, status: 'revoked', revoked_at: NOW }))],
    ['revoked_at on active', withKey((k) => ({ ...k, revoked_at: NOW }))],
    ['deployment on release key', withKey((k) => ({ ...k, deployment: 'dep-a' }))],
    ['window inverted', withKey((k) => ({ ...k, not_before: '2029-01-01T00:00:00Z' }))],
    ['expires > issued_at + 12 months', { ...body(), expires: '2027-10-02T00:00:00Z' }],
    ['version 0', { ...body(), version: 0 }],
    ['bad _type', { ...body(), _type: 'crawcus.trust-anchors' }],
  ])('rejects: %s', async (_n, b) => {
    const r = parseTrustAnchors(await sign(b as Record<string, unknown>));
    expect(r).toMatchObject({ kind: 'fail', code: 'anchors-malformed' });
  });
  it('superseded_by must name an active or revoked key in the same file', async () => {
    const keys = k0(body());
    const releaseId = keys[4].keyid as string;
    const retiredId = keys[7].keyid as string;
    const point = (target: string) => keys.map((k, i) => (i === 8 ? { ...k, superseded_by: target } : k));
    expect(parseTrustAnchors(await sign({ ...body(), keys: point(releaseId) })).kind).toBe('ok');
    expect(parseTrustAnchors(await sign({ ...body(), keys: point(`sha256:${'b'.repeat(64)}`) }))).toMatchObject({ code: 'anchors-malformed' });
    expect(parseTrustAnchors(await sign({ ...body(), keys: point(retiredId) }))).toMatchObject({ code: 'anchors-malformed' });
  });
  it('rejects unknown top-level fields and major version 2', async () => {
    expect(parseTrustAnchors({ ...(await sign(body())), extra: 1 }).kind).toBe('fail');
    expect(parseTrustAnchors(await sign(body({ spec_version: '2.0.0' })))).toMatchObject({ code: 'anchors-unsupported-version' });
  });
  it('ignores unknown signed fields and drops keys with unknown purpose/status (TA-8)', async () => {
    const b = body({ x_future: { a: 1 } });
    const extra = { ...(k0(b)[4]), purpose: 'quantum' };
    const r = bootstrapTrustAnchors(await sign({ ...b, keys: [...k0(b).slice(0, 4), ...k0(b).slice(5), extra] }), PINNED, { now: NOW });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.anchors.signed.ignoredKeys).toBe(1);
  });
});

describe('update chain (VER-3, VER-4)', () => {
  it('accepts a newer version signed by the current root', async () => {
    const t = await trusted();
    expect(updateTrustAnchors(t, await sign(body({ version: 4 })), { now: NOW }).kind).toBe('ok');
  });
  it('rejects rollback', async () => {
    const t = await trusted({ version: 5 });
    expect(updateTrustAnchors(t, await sign(body({ version: 4 })), { now: NOW })).toMatchObject({ code: 'anchors-rollback' });
  });
  it('equal version must be byte-identical (fork)', async () => {
    const t = await trusted();
    expect(updateTrustAnchors(t, await sign(body()), { now: NOW }).kind).toBe('ok');
    expect(updateTrustAnchors(t, await sign(body({ expires: '2027-03-01T00:00:00Z' })), { now: NOW })).toMatchObject({ code: 'anchors-fork' });
  });
  it('rejects an expired candidate', async () => {
    const t = await trusted();
    const c = await sign(body({ version: 4, issued_at: '2025-10-01T00:00:00Z', expires: '2026-10-01T00:00:00Z' }));
    expect(updateTrustAnchors(t, c, { now: NOW })).toMatchObject({ code: 'anchors-expired' });
  });
  it('root rotation: needs threshold of old AND new root', async () => {
    const t = await trusted();
    const rotated = body({ version: 4, roles: { root: { keyids: pinnedFor(NEW_ROOT_SEEDS).keyids, threshold: 2 } },
      keys: [...rootKeys(NEW_ROOT_SEEDS), ...(body().keys as unknown[]).slice(4)] }, NEW_ROOT_SEEDS);
    const onlyNew = await sign(rotated, [NEW_ROOT_SEEDS[0], NEW_ROOT_SEEDS[1]]);
    expect(updateTrustAnchors(t, onlyNew, { now: NOW })).toMatchObject({ code: 'anchors-threshold-unmet' });
    const onlyOld = await sign(rotated, [ROOT_SEEDS[0], ROOT_SEEDS[1]]);
    expect(updateTrustAnchors(t, onlyOld, { now: NOW })).toMatchObject({ code: 'anchors-new-root-threshold-unmet' });
    const both = await sign(rotated, [ROOT_SEEDS[0], ROOT_SEEDS[1], NEW_ROOT_SEEDS[0], NEW_ROOT_SEEDS[1]]);
    const r = updateTrustAnchors(t, both, { now: NOW });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    // After rotation the old root alone can no longer move trust forward.
    const v5 = body({ version: 5, roles: rotated.roles, keys: rotated.keys }, NEW_ROOT_SEEDS);
    expect(updateTrustAnchors(r.anchors, await sign(v5, [ROOT_SEEDS[0], ROOT_SEEDS[1]]), { now: NOW }).kind).toBe('fail');
    expect(updateTrustAnchors(r.anchors, await sign(v5, [NEW_ROOT_SEEDS[1], NEW_ROOT_SEEDS[2]]), { now: NOW }).kind).toBe('ok');
  });
  it('rejects an issuer change', async () => {
    const t = await trusted();
    expect(updateTrustAnchors(t, await sign(body({ version: 4, issuer: 'other.invalid' })), { now: NOW })).toMatchObject({ code: 'anchors-issuer-mismatch' });
  });
});

describe('loadTrustAnchors (VER-1..VER-7)', () => {
  const issuer = 'test.invalid';
  const url = 'https://crawcus.org/.well-known/crawcus-trust-anchors.json';
  const fetchOf = (doc: unknown) => async () => ({ ok: true, status: 200, text: async () => JSON.stringify(doc) });

  it('bootstraps, refreshes from the URL, and persists', async () => {
    const store = createMemoryTrustAnchorsStore();
    const r = await loadTrustAnchors({
      issuer, pinnedRoot: PINNED, bootstrap: await sign(body()), store, sources: [url], fetch: fetchOf(await sign(body({ version: 4 }))), now: NOW,
    });
    expect(r).toMatchObject({ kind: 'ok', anchorsExpired: false });
    if (r.kind === 'ok') expect(r.anchors.signed.version).toBe(4);
    expect((store.entries.get(issuer) as { signed: { version: number } }).signed.version).toBe(4);
  });

  it('keeps the trusted copy and reports anchors-update-rejected on rollback', async () => {
    const store = createMemoryTrustAnchorsStore();
    await loadTrustAnchors({ issuer, pinnedRoot: PINNED, bootstrap: await sign(body({ version: 6 })), store, now: NOW });
    const r = await loadTrustAnchors({ issuer, pinnedRoot: PINNED, store, sources: [url], fetch: fetchOf(await sign(body({ version: 5 }))), now: NOW });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.anchors.signed.version).toBe(6);
      expect(r.updateRejected?.code).toBe('anchors-rollback');
    }
  });

  it('a website serving a validly self-signed document from another root is rejected', async () => {
    const attacker = [testSeed(0xee, 1), testSeed(0xee, 2)];
    const evil = await sign(body({ version: 99 }, attacker), attacker);
    const r = await loadTrustAnchors({ issuer, pinnedRoot: PINNED, bootstrap: await sign(body()), sources: [url], fetch: fetchOf(evil), now: NOW });
    expect(r.kind === 'ok' && r.anchors.signed.version).toBe(3);
    expect(r.kind === 'ok' && r.updateRejected?.code).toBe('anchors-threshold-unmet');
  });

  it('expired trusted copy fails closed offline (VER-5, VER-6)', async () => {
    const opts = { issuer, pinnedRoot: PINNED, bootstrap: await sign(body()), offline: true, sources: [url], now: '2027-05-01T00:00:00Z' };
    let called = false;
    const r = await loadTrustAnchors({ ...opts, fetch: async () => { called = true; throw new Error('x'); } });
    expect(r).toMatchObject({ kind: 'fail', code: 'anchors-expired' });
    expect(called).toBe(false);
    const o = await loadTrustAnchors({ ...opts, allowExpiredAnchors: true });
    expect(o).toMatchObject({ kind: 'ok', anchorsExpired: true });
  });

  it('expired copy plus failed refresh fails closed', async () => {
    const r = await loadTrustAnchors({
      issuer, pinnedRoot: PINNED, bootstrap: await sign(body()), sources: [url], now: '2027-05-01T00:00:00Z',
      fetch: async () => ({ ok: false, status: 503, text: async () => '' }),
    });
    expect(r).toMatchObject({ code: 'anchors-expired' });
  });

  it('expired trusted copy recovers through a valid newer document', async () => {
    const r = await loadTrustAnchors({
      issuer, pinnedRoot: PINNED, bootstrap: await sign(body()), sources: [url], now: '2027-05-01T00:00:00Z',
      fetch: fetchOf(await sign(body({ version: 4, issued_at: '2027-04-15T00:00:00Z', expires: '2027-10-01T00:00:00Z' }))),
    });
    expect(r.kind === 'ok' && r.anchors.signed.version).toBe(4);
  });

  it('local --anchors candidates must chain (VER-7) and http: is refused', async () => {
    const attacker = [testSeed(0xee, 1), testSeed(0xee, 2)];
    const r = await loadTrustAnchors({
      issuer, pinnedRoot: PINNED, bootstrap: await sign(body()), now: NOW,
      candidates: [await sign(body({ version: 4 }, attacker), attacker)], sources: ['http://x.invalid/a.json'],
    });
    expect(r.kind === 'ok' && r.updateRejected?.code).toBe('anchors-threshold-unmet');
    const h = await loadTrustAnchors({ issuer, pinnedRoot: PINNED, bootstrap: await sign(body()), now: NOW, sources: ['http://x.invalid/a.json'] });
    expect(h.kind === 'ok' && h.updateRejected?.code).toBe('anchors-fetch-failed');
  });

  it('sources are tried in order; a bad first source falls through to the next', async () => {
    const good = JSON.stringify(await sign(body({ version: 4 })));
    const seen: string[] = [];
    const r = await loadTrustAnchors({
      issuer, pinnedRoot: PINNED, bootstrap: await sign(body()), now: NOW, sources: CRAWCUS_ANCHOR_SOURCES,
      fetch: async (u) => {
        seen.push(u);
        return u.includes('.well-known') ? { ok: false, status: 503, text: async () => '' } : { ok: true, status: 200, text: async () => good };
      },
    });
    expect(seen).toEqual([...CRAWCUS_ANCHOR_SOURCES]);
    expect(r.kind === 'ok' && r.anchors.signed.version).toBe(4);
    expect(r.kind === 'ok' && r.updateRejected).toBeUndefined();
  });

  it('every source must verify against the pinned chain', async () => {
    const attacker = [testSeed(0xee, 1), testSeed(0xee, 2)];
    const evil = JSON.stringify(await sign(body({ version: 9 }, attacker), attacker));
    const r = await loadTrustAnchors({
      issuer, pinnedRoot: PINNED, bootstrap: await sign(body()), now: NOW, sources: CRAWCUS_ANCHOR_SOURCES,
      fetch: async () => ({ ok: true, status: 200, text: async () => evil }),
    });
    expect(r.kind === 'ok' && r.anchors.signed.version).toBe(3);
    expect(r.kind === 'ok' && r.updateRejected?.code).toBe('anchors-threshold-unmet');
  });

  it('a tampered store entry is rejected', async () => {
    const store = createMemoryTrustAnchorsStore();
    const doc = clone(await sign(body())) as { signed: { version: number } };
    doc.signed.version = 50;
    store.entries.set(issuer, doc);
    expect(await loadTrustAnchors({ issuer, pinnedRoot: PINNED, store, now: NOW })).toMatchObject({ code: 'anchors-threshold-unmet' });
  });
});

describe('trustPolicyFromAnchors → verifyBundle (KEY-1, VER-8, VER-9, TA-9)', () => {
  async function policy(o: Partial<Parameters<typeof trustPolicyFromAnchors>[1]> = {}): Promise<TrustPolicy> {
    const p = trustPolicyFromAnchors((await trusted()).signed, { purpose: 'release', ...o } as Parameters<typeof trustPolicyFromAnchors>[1]);
    if (p.kind !== 'ok') throw new Error(p.detail);
    return p.policy;
  }
  const run = (seed: Uint8Array, p: TrustPolicy, ts = '2026-10-01T00:00:00.000Z') =>
    verifyBundle({ bundle: buildSignedBundleWithKey(seed, { eventTimestamp: ts }).bundleBytes, options: { verifiedAt: NOW, trustPolicy: p } });

  it('trusts an active release key', async () => {
    const r = run(RELEASE_SEED, await policy());
    expect(r.verdict).toBe('pass');
    expect(r.trust.policyId).toBe('anchors.v3');
  });
  it('purpose mismatch: test-vectors key is not trusted for release', async () => {
    expect(run(TV_SEED, await policy()).trust.reason).toBe('signer.untrusted.unknown-key');
  });
  it('key-compromise fails even when back-dated', async () => {
    const r = run(COMPROMISED_SEED, await policy(), '2026-02-01T00:00:00.000Z');
    expect(r.verdict).toBe('fail');
    expect(r.trust.reason).toBe('signer.untrusted.revoked');
  });
  it('superseded accepts only signing time before revoked_at, flagged self-asserted', async () => {
    const p = await policy();
    const before = run(SUPERSEDED_SEED, p, '2026-08-01T00:00:00.000Z');
    expect(before.verdict).toBe('pass');
    expect(before.trust.signer?.signingTimeSelfAsserted).toBe(true);
    expect(run(SUPERSEDED_SEED, p, '2026-09-02T00:00:00.000Z').trust.reason).toBe('signer.untrusted.revoked');
  });
  it('out-of-window: retired after not_after, active before not_before', async () => {
    const p = await policy();
    expect(run(RETIRED_SEED, p).trust.reason).toBe('signer.untrusted.expired');
    expect(run(RETIRED_SEED, p, '2026-02-01T00:00:00.000Z').verdict).toBe('pass');
    expect(run(RELEASE_SEED, p, '2025-12-31T00:00:00.000Z').trust.reason).toBe('signer.untrusted.not-yet-valid');
  });
  it('audit-export keys are bound to their deployment', async () => {
    expect(run(AX_SEED, await policy({ purpose: 'audit-export', deployment: 'dep-a' })).verdict).toBe('pass');
    const t = await trusted();
    expect(trustPolicyFromAnchors(t.signed, { purpose: 'audit-export', deployment: 'dep-b' })).toMatchObject({ code: 'anchors-no-keys-for-purpose' });
    expect(trustPolicyFromAnchors(t.signed, { purpose: 'audit-export' })).toMatchObject({ code: 'anchors-no-keys-for-purpose' });
    expect(trustPolicyFromAnchors(t.signed, { purpose: 'root' as never })).toMatchObject({ code: 'anchors-no-keys-for-purpose' });
  });
  it('root keys never become bundle anchors', async () => {
    expect(run(ROOT_SEEDS[0], await policy()).trust.reason).toBe('signer.untrusted.unknown-key');
  });
});

describe('repository copies', () => {
  const read = (p: string) => readFileSync(join(here, '../../..', p), 'utf8');
  it('trust/trust-anchors.json is a TEST placeholder, self-consistent, and mirrored byte-identically', () => {
    const repo = read('trust/trust-anchors.json');
    expect(read('docs/.well-known/crawcus-trust-anchors.json')).toBe(repo);
    const doc = JSON.parse(repo) as { signed: { issuer: string; roles: { root: { keyids: string[]; threshold: number } } } };
    expect(doc.signed.issuer).toMatch(/TEST/i);
    const parsed = parseTrustAnchors(doc);
    expect(parsed.kind).toBe('ok');
    const pin = JSON.parse(read('trust/pinned-root.json')) as { keyids: string[]; threshold: number };
    expect(pin.threshold).toBe(2);
    expect(pin.keyids).toHaveLength(2);
    const r = bootstrapTrustAnchors(doc, pin, { allowExpired: true });
    expect(r.kind).toBe('ok');
    // README lists the same root fingerprints and threshold (PUB-3, PUB-6).
    const readme = read('README.md');
    for (const id of doc.signed.roles.root.keyids) expect(readme).toContain(id);
    expect(readme).toContain(`threshold ${String(doc.signed.roles.root.threshold)}`);
  });
  it('JSON Schema lists the parser fields', () => {
    const schema = JSON.parse(read('spec/schemas/trust-anchors-1.0.json')) as { $defs: Record<string, { properties: object; required: string[] }> };
    expect(schema.$defs.signed.required.sort()).toEqual(['_type', 'expires', 'issued_at', 'issuer', 'keys', 'roles', 'spec_version', 'version']);
    expect(Object.keys(schema.$defs.key.properties).sort()).toEqual([
      'alg', 'custody', 'deployment', 'keyid', 'kms_resource', 'not_after', 'not_before', 'public_key', 'purpose',
      'revocation_reason', 'revoked_at', 'status', 'superseded_by',
    ]);
  });
});
