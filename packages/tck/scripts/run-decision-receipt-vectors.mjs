/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

// Runs every case under packages/tck/vectors/decision-receipt through a
// verifier and reports, per case, whether its first failing check (or pass)
// agrees with the one draft-gruszka-audit-decision-receipts-05 Appendix A names.
//
//   node packages/tck/scripts/run-decision-receipt-vectors.mjs [--report <file>]
//
// The verifier is @crawcus/verifier's build (packages/verifier/dist). Exit 0
// only when every case agrees and none is missing; 1 otherwise.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const VECTORS = resolve(HERE, '../vectors/decision-receipt');
/** The 7 vectors of A.3 and the 15 of A.5. A run that sees fewer is not green. */
export const EXPECTED_CASES = 22;

const sha = (b) => createHash('sha256').update(b).digest('hex');

/** Reads one case directory, checking every file against MANIFEST.json first. */
export function loadCase(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
  const bytes = {};
  for (const [f, want] of Object.entries(manifest)) {
    const b = new Uint8Array(readFileSync(join(dir, f)));
    if (sha(b) !== want) throw new Error(`${dir}/${f}: SHA-256 is not the one MANIFEST.json records`);
    bytes[f] = b;
  }
  return { spec: JSON.parse(new TextDecoder().decode(bytes['case.json'])), bytes };
}

/** Runs one case with verifier `v`; returns 'pass' or the first failing check. */
export function runCase(c, keys, v) {
  const { spec, bytes } = c;
  const file = (f) => {
    if (bytes[f] === undefined) throw new Error(`${spec.name}: ${f} is not in the case`);
    return bytes[f];
  };
  const key = (n) => new Uint8Array(Buffer.from(keys[n].publicKey, 'base64'));
  const decide = (chk, receipt) =>
    v.verifyDecisionReceipt(receipt, {
      publicKey: key(chk.decisionKey),
      decisionMakerId: chk.decisionMakerId,
      time: chk.time,
      expectedAudience: chk.expectedAudience,
      expectedNonce: chk.expectedNonce,
      ...(chk.actionBytes ? { actionBytes: file(chk.actionBytes) } : {}),
    });
  const outcomeInputs = (o) => ({
    publicKey: key(o.outcomeKey),
    expectedExecutorId: o.expectedExecutorId,
    permittedExecutorIds: o.permittedExecutorIds,
    ...(o.effectBytes ? { effectBytes: file(o.effectBytes) } : {}),
  });
  const chk = spec.check;

  if (chk.procedure === 'outcome') {
    const d = decide(chk.decision, file(chk.decision.receipt));
    if (!d.ok) return `decision ${d.at}`;
    const r = v.verifyOutcomeReceipt(file(spec.receipt), d, outcomeInputs(chk));
    return r.ok ? 'pass' : r.at;
  }

  const d = decide(chk, file(spec.receipt));
  if (!d.ok) return d.at;
  let r = { ok: true };
  if (chk.case?.kind === 'approval') r = v.checkApprovalCase(d, file(chk.case.approval), chk.time);
  else if (chk.case?.kind === 'declined') r = v.checkDeclinedCase(d);
  else if (chk.case?.kind === 'executed') r = v.checkExecutedCase(d, file(chk.case.outcome), outcomeInputs(chk.case));
  if (!r.ok) return r.at;
  if (chk.consumption) {
    const s = v.checkApprovalUnconsumed(file(chk.case.approval), file(chk.consumption));
    if (!s.ok) return s.at;
  }
  return 'pass';
}

/** Every case under `root`, run with `v`. */
export function runAll(v, root = VECTORS) {
  const keys = JSON.parse(readFileSync(join(root, 'keys.json'), 'utf8'));
  const dirs = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()).sort(byName);
  return dirs.map((d) => {
    const c = loadCase(join(root, d));
    let got;
    try {
      got = runCase(c, keys, v);
    } catch (e) {
      got = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
    return { name: c.spec.name, expected: c.spec.expected, got, agree: got === c.spec.expected, good: c.spec.expected === 'pass' };
  });
}

function byName(a, b) {
  const k = (s) => [s.startsWith('V') ? 0 : 1, Number(/\d+/.exec(s)?.[0] ?? 0), s];
  const [x, y] = [k(a), k(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

export function report(results) {
  const agreed = results.filter((r) => r.agree).length;
  const good = results.filter((r) => r.good);
  const bad = results.filter((r) => !r.good);
  const f = results.filter((r) => /^F\d+$/.test(r.name));
  const lines = [
    '# Decision-receipt vectors: report',
    '',
    'Each case of draft-gruszka-audit-decision-receipts-05 Appendix A, run through @crawcus/verifier.',
    '"Expected" is the first failing check the draft names (or pass); "got" is the verifier\'s.',
    '',
    '| Case | Expected | Got | Verdict |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.expected} | ${r.got} | ${r.agree ? 'agree' : 'DISAGREE'} |`),
    '',
    `Agree: ${agreed} of ${results.length} (expected ${EXPECTED_CASES} cases).`,
    `Accepting vectors accepted: ${good.filter((r) => r.got === 'pass').length} of ${good.length}.`,
    `Rejecting vectors rejected at the named check: ${bad.filter((r) => r.agree).length} of ${bad.length}.`,
    `F1–F15 rejected: ${f.filter((r) => r.got !== 'pass').length} of ${f.length}; at the named check: ${f.filter((r) => r.agree).length} of ${f.length}.`,
    '',
  ];
  return { text: lines.join('\n'), green: agreed === results.length && results.length === EXPECTED_CASES };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = resolve(HERE, '../../verifier/dist/index.js');
  if (!existsSync(dist)) {
    console.error(`no verifier build at ${dist}: run pnpm --filter @crawcus/verifier build`);
    process.exit(1);
  }
  const v = await import(pathToFileURL(dist).href);
  const results = runAll(v);
  const { text, green } = report(results);
  const i = process.argv.indexOf('--report');
  const out = i > 0 ? resolve(process.argv[i + 1]) : join(VECTORS, 'REPORT.md');
  writeFileSync(out, text);
  console.log(text);
  console.log(`report: ${out}`);
  process.exit(green ? 0 : 1);
}
