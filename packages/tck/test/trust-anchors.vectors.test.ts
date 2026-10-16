/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * trust-anchors.json conformance vectors (TEST ONLY keys). Built here
 * from @noble/curves + JCS + DSSE PAE, independently of the verifier,
 * then checked against the reference verifier. JSON copies live in
 * `vectors/trust-anchors/` for other implementations.
 *
 * Each vector: `trusted` (null → bootstrap from `pinnedRoot`) and a
 * `candidate`. Expected result is ok or a failure code.
 *
 * Regenerate with:
 *   UPDATE_TRUST_ANCHOR_VECTORS=1 pnpm --filter @crawcus/tck exec vitest run test/trust-anchors.vectors.test.ts
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalJSON } from '@crawcus/spec';
import { bootstrapTrustAnchors, updateTrustAnchors } from '@crawcus/verifier';
import { describe, expect, it } from 'vitest';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'vectors', 'trust-anchors');
const NOW = '2026-10-15T00:00:00Z';

interface Vector {
  name: string;
  description: string;
  keyLabel: 'TEST ONLY';
  now: string;
  pinnedRoot: { keyids: string[]; threshold: number };
  trusted: unknown;
  candidate: unknown;
  expected: { kind: 'ok' | 'fail'; code?: string };
}

const seed = (tag: number, n: number) => { const s = new Uint8Array(32); s.set([0x54, 0x45, 0x53, 0x54, tag]); s[31] = n; return s; };
const pub = (s: Uint8Array) => ed25519.getPublicKey(s);
const kid = (s: Uint8Array) => `sha256:${bytesToHex(sha256(pub(s)))}`;
const spki = (s: Uint8Array) => Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub(s))]).toString('base64');
const key = (s: Uint8Array, purpose: string, extra: Record<string, unknown> = {}) => ({
  keyid: kid(s), alg: 'ed25519', public_key: spki(s), purpose, deployment: null,
  not_before: '2026-01-01T00:00:00Z', not_after: '2028-01-01T00:00:00Z', status: 'active',
  revoked_at: null, revocation_reason: null, ...extra,
});
const ROOT = [1, 2, 3, 4].map((n) => seed(0xa0, n));
const NEWROOT = [1, 2, 3].map((n) => seed(0xa1, n));
const EVIL = [seed(0xee, 1), seed(0xee, 2)];

function body(version: number, roots = ROOT, over: Record<string, unknown> = {}) {
  return {
    _type: 'crawcus-trust-anchors', spec_version: '1.0.0', issuer: 'test.invalid', version,
    issued_at: '2026-10-01T00:00:00Z', expires: '2027-04-01T00:00:00Z',
    roles: { root: { keyids: roots.map(kid), threshold: 2 } },
    keys: [...roots.map((s) => key(s, 'root')), key(seed(0xb0, 1), 'release')],
    ...over,
  };
}
function pae(body: string): Uint8Array {
  const type = 'application/vnd.crawcus.trust-anchors+json';
  const b = Buffer.from(body, 'utf8');
  return new Uint8Array(Buffer.concat([Buffer.from(`DSSEv1 ${String(type.length)} ${type} ${String(b.length)} `), b]));
}
function signDoc(signed: object, seeds: Uint8Array[]) {
  const msg = pae(canonicalJSON(signed));
  return { signed, signatures: seeds.map((s) => ({ keyid: kid(s), sig: Buffer.from(ed25519.sign(msg, s)).toString('base64') })) };
}

function build(): Vector[] {
  const pinnedRoot = { keyids: ROOT.map(kid), threshold: 2 };
  const v = (name: string, description: string, trusted: unknown, candidate: unknown, expected: Vector['expected'], now = NOW): Vector =>
    ({ name, description, keyLabel: 'TEST ONLY', now, pinnedRoot, trusted, candidate, expected });
  const v3 = signDoc(body(3), [ROOT[0], ROOT[1]]);
  const tampered = JSON.parse(JSON.stringify(v3)) as { signed: { keys: { purpose: string }[] } };
  tampered.signed.keys[4].purpose = 'test-vectors';
  const rotated = body(4, NEWROOT);
  const unknownPurpose = body(3, ROOT, { keys: [...body(3).keys, key(seed(0xb0, 9), 'future-purpose')] });
  return [
    v('bootstrap-valid', '2-of-4 root signatures matching the pin.', null, v3, { kind: 'ok' }),
    v('bootstrap-threshold-unmet', 'One root signature.', null, signDoc(body(3), [ROOT[0]]), { kind: 'fail', code: 'anchors-threshold-unmet' }),
    v('bootstrap-wrong-root', 'Self-signed by a non-pinned root.', null, signDoc(body(3, EVIL), EVIL), { kind: 'fail', code: 'anchors-root-mismatch' }),
    v('bootstrap-tampered', 'Purpose changed after signing.', null, tampered, { kind: 'fail', code: 'anchors-threshold-unmet' }),
    v('bootstrap-expired', 'Evaluated at expires.', null, v3, { kind: 'fail', code: 'anchors-expired' }, '2027-04-01T00:00:00Z'),
    v('bootstrap-unknown-purpose-ignored', 'A key with an unknown purpose is ignored, not the file.', null, signDoc(unknownPurpose, [ROOT[0], ROOT[1]]), { kind: 'ok' }),
    v('update-valid', 'Version 4 signed by the trusted root.', v3, signDoc(body(4), [ROOT[2], ROOT[3]]), { kind: 'ok' }),
    v('update-rollback', 'Version 2 after version 3.', v3, signDoc(body(2), [ROOT[0], ROOT[1]]), { kind: 'fail', code: 'anchors-rollback' }),
    v('update-fork', 'Same version, different body.', v3, signDoc(body(3, ROOT, { expires: '2027-03-01T00:00:00Z' }), [ROOT[0], ROOT[1]]), { kind: 'fail', code: 'anchors-fork' }),
    v('update-foreign-root', 'Signed only by an unrelated root.', v3, signDoc(body(4, EVIL), EVIL), { kind: 'fail', code: 'anchors-threshold-unmet' }),
    v('rotation-new-root-only', 'Root rotation signed only by the new root.', v3, signDoc(rotated, [NEWROOT[0], NEWROOT[1]]), { kind: 'fail', code: 'anchors-threshold-unmet' }),
    v('rotation-old-root-only', 'Root rotation signed only by the old root.', v3, signDoc(rotated, [ROOT[0], ROOT[1]]), { kind: 'fail', code: 'anchors-new-root-threshold-unmet' }),
    v('rotation-both', 'Root rotation signed by old and new roots.', v3, signDoc(rotated, [ROOT[0], ROOT[1], NEWROOT[0], NEWROOT[1]]), { kind: 'ok' }),
  ];
}

const VECTORS = build();

describe('trust-anchor conformance vectors', () => {
  it('match the reference verifier', () => {
    for (const vec of VECTORS) {
      let r;
      if (vec.trusted === null) {
        r = bootstrapTrustAnchors(vec.candidate, vec.pinnedRoot, { now: vec.now });
      } else {
        const t = bootstrapTrustAnchors(vec.trusted, vec.pinnedRoot, { now: vec.now });
        if (t.kind !== 'ok') throw new Error(`${vec.name}: trusted copy invalid: ${t.detail}`);
        r = updateTrustAnchors(t.anchors, vec.candidate, { now: vec.now });
      }
      expect(r.kind, vec.name).toBe(vec.expected.kind);
      if (r.kind === 'fail') expect(r.code, vec.name).toBe(vec.expected.code);
    }
  });

  it('match the committed JSON copies', () => {
    if (process.env['UPDATE_TRUST_ANCHOR_VECTORS'] === '1') {
      mkdirSync(DIR, { recursive: true });
      for (const vec of VECTORS) writeFileSync(join(DIR, `${vec.name}.json`), `${JSON.stringify(vec, null, 2)}\n`);
    }
    const names = readdirSync(DIR).filter((n) => n.endsWith('.json')).sort();
    expect(names).toEqual(VECTORS.map((x) => `${x.name}.json`).sort());
    for (const vec of VECTORS) expect(JSON.parse(readFileSync(join(DIR, `${vec.name}.json`), 'utf8'))).toEqual(vec);
  });
});
