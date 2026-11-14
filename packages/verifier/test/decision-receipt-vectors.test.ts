/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The decision-receipt verifier against draft-gruszka-audit-decision-receipts-05
 * Appendix A: the 7 vectors of A.3 and F1–F15 of A.5, each case asserting the
 * first failing check the draft names. The vectors on disk are rebuilt from the
 * draft's definitions by scripts/build-decision-receipt-vectors.mjs, which
 * refuses unless every payload and signature equals the published one; the
 * `--check` case below proves the files are that rebuild.
 *
 * Flip controls show each check can go red: a verifier that passes everything
 * disagrees on every rejecting vector; a duplicate member name, a byte order
 * mark and an unconsumed approval each move the result.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs runner shared with the CLI; no declaration file.
import { EXPECTED_CASES, VECTORS, loadCase, runAll, runCase } from '../../tck/scripts/run-decision-receipt-vectors.mjs';
import * as v from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const keys = JSON.parse(readFileSync(join(VECTORS, 'keys.json'), 'utf8')) as Record<string, { publicKey: string }>;
const GATE_SEED = createHash('sha256').update('draft-gruszka-audit-decision-receipts test key gate-1').digest();
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

type Result = { name: string; expected: string; got: string; agree: boolean; good: boolean };

const pae = (type: string, body: Uint8Array): Uint8Array => {
  const head = enc(`DSSEv1 ${enc(type).length} ${type} ${body.length} `);
  const out = new Uint8Array(head.length + body.length);
  out.set(head);
  out.set(body, head.length);
  return out;
};
const signedEnvelope = (payload: Uint8Array): Uint8Array =>
  enc(
    JSON.stringify({
      payload: Buffer.from(payload).toString('base64'),
      payloadType: v.IN_TOTO_PAYLOAD_TYPE,
      signatures: [{ keyid: 'k', sig: Buffer.from(ed25519.sign(pae(v.IN_TOTO_PAYLOAD_TYPE, payload), GATE_SEED)).toString('base64') }],
    }),
  );
const v1Inputs = (actionBytes: Uint8Array) => ({
  publicKey: new Uint8Array(Buffer.from(keys['gate-1']!.publicKey, 'base64')),
  decisionMakerId: 'gate-1',
  time: '2026-10-15T09:01:00Z',
  expectedAudience: 'observer-1',
  expectedNonce: 'dec-0001',
  actionBytes,
});

describe('decision-receipt vectors (draft-gruszka-audit-decision-receipts-05 Appendix A)', () => {
  const results = runAll(v) as Result[];

  it('the files on disk are a rebuild from the draft, every payload and signature equal to the published one', () => {
    const out = execFileSync(process.execPath, [resolve(HERE, '../scripts/build-decision-receipt-vectors.mjs'), '--check'], { encoding: 'utf8' });
    expect(out).toContain(`${EXPECTED_CASES} cases match a rebuild`);
  });

  it(`finds all ${EXPECTED_CASES} cases (a run that sees fewer is not green)`, () => {
    expect(results.map((r) => r.name).sort()).toEqual(
      ['V1-good', 'V1-bad', 'V2-good', 'V2-bad', 'V3-decision', 'V3-good', 'V3-bad', ...Array.from({ length: 15 }, (_, i) => `F${i + 1}`)].sort(),
    );
  });

  it.each(['V1-good', 'V2-good', 'V3-decision', 'V3-good'])('%s is accepted', (name) => {
    expect(results.find((r) => r.name === name)?.got).toBe('pass');
  });

  const rejecting = ['V1-bad', 'V2-bad', 'V3-bad', ...Array.from({ length: 15 }, (_, i) => `F${i + 1}`)];
  it.each(rejecting)('%s is rejected at the check the draft names', (name) => {
    const r = results.find((x) => x.name === name)!;
    expect(r.got).not.toBe('pass');
    expect(r.got).toBe(r.expected);
  });
});

describe('flip controls', () => {
  it('a verifier that accepts everything disagrees on every rejecting vector', () => {
    const pass = { ok: true } as const;
    const lax = {
      verifyDecisionReceipt: () => ({ ok: true, root: '', predicate: {}, publicKey: new Uint8Array() }),
      verifyOutcomeReceipt: () => ({ ok: true, root: '', predicate: {} }),
      checkApprovalCase: () => pass,
      checkDeclinedCase: () => pass,
      checkExecutedCase: () => pass,
      checkApprovalUnconsumed: () => pass,
    };
    const r = runAll(lax) as Result[];
    expect(r.filter((x) => !x.agree).map((x) => x.name).sort()).toEqual(r.filter((x) => !x.good).map((x) => x.name).sort());
    expect(r.filter((x) => !x.good)).toHaveLength(18);
  });

  it('a validly signed payload with a duplicate member name fails at 3.2 step 4', () => {
    const c = loadCase(join(VECTORS, 'V1-good'));
    const P = new TextDecoder().decode(c.bytes['decision_receipt.jcs']);
    const dup = enc(P.replace('{"_type":', '{"_type":"x","_type":'));
    const r = v.verifyDecisionReceipt(signedEnvelope(dup), v1Inputs(c.bytes['a1.txt']));
    expect(r.ok === false && r.at).toBe('3.2 step 4');
    // control: the same payload without the duplicate, signed the same way, passes
    expect(v.verifyDecisionReceipt(signedEnvelope(c.bytes['decision_receipt.jcs']), v1Inputs(c.bytes['a1.txt'])).ok).toBe(true);
  });

  it('an envelope that begins with a byte order mark fails at 3.2 step 1', () => {
    const c = loadCase(join(VECTORS, 'V1-good'));
    const env = c.bytes['decision_receipt.json'] as Uint8Array;
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...env]);
    expect(v.verifyDecisionReceipt(env, v1Inputs(c.bytes['a1.txt'])).ok).toBe(true);
    const r = v.verifyDecisionReceipt(bom, v1Inputs(c.bytes['a1.txt']));
    expect(r.ok === false && r.at).toBe('3.2 step 1');
  });

  it('F13 passes with an empty consumption state and fails at item 2 when the identity is current', () => {
    const c = loadCase(join(VECTORS, 'F13'));
    const ap = c.bytes['ap.json'] as Uint8Array;
    expect(v.checkApprovalUnconsumed(ap, enc('[]')).ok).toBe(true);
    expect(v.checkApprovalUnconsumed(ap, enc('{"current":[],"rotated":[]}')).ok).toBe(true);
    const id = JSON.parse(new TextDecoder().decode(ap)) as { actionDigest: unknown };
    const current = enc(JSON.stringify({ current: [{ actionDigest: id.actionDigest, approvalId: 'appr-001', session: 'sess-1' }] }));
    const r = v.checkApprovalUnconsumed(ap, current);
    expect(r.ok === false && r.at).toBe('4 item 2');
    const asCase = { ...c, spec: { ...c.spec, check: { ...c.spec.check, consumption: undefined } } };
    expect(runCase(asCase, keys, v)).toBe('pass');
  });

  it('a tampered vector file is refused before it is run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dr-vector-'));
    try {
      cpSync(join(VECTORS, 'V1-good'), dir, { recursive: true });
      expect(() => loadCase(dir)).not.toThrow();
      const f = join(dir, 'a1.txt');
      writeFileSync(f, readFileSync(f, 'utf8').replace('topic', 'tapic'));
      expect(() => loadCase(dir)).toThrow(/MANIFEST/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
