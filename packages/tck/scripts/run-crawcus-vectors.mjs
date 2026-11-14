/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

// Runs every case under packages/tck/vectors/hash-chain and
// packages/tck/vectors/disclosure-signal through an implementation and reports,
// per case, whether its result agrees with the one the case expects.
//
//   node packages/tck/scripts/run-crawcus-vectors.mjs [--report <file>]
//
// The implementation is @crawcus/spec's build. Another runtime is checked by
// passing its own { verifyChain, disclosureHasOpportunityToBeRead,
// lintDisclosureSignalPredicateName } to runAll. Exit 0 only when every case
// agrees and none is missing; 1 otherwise.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const VECTORS = resolve(HERE, '../vectors');
export const SETS = ['hash-chain', 'disclosure-signal'];
/** 7 hash-chain cases, 9 predicate cases and the name lint. A run that sees fewer is not green. */
export const EXPECTED_CASES = { 'hash-chain': 7, 'disclosure-signal': 10 };
/** The name lint is one case holding this many names; each is checked. */
export const EXPECTED_LINT_NAMES = 8;

const sha = (b) => createHash('sha256').update(b).digest('hex');

/** Reads one case directory, checking every file against MANIFEST.json first. */
export function loadCase(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
  const text = {};
  for (const [f, want] of Object.entries(manifest)) {
    const b = readFileSync(join(dir, f));
    if (sha(b) !== want) throw new Error(`${dir}/${f}: SHA-256 is not the one MANIFEST.json records`);
    text[f] = b.toString('utf8');
  }
  const spec = JSON.parse(text['case.json']);
  const events = spec.events === undefined ? undefined : JSON.parse(text[spec.events]);
  return { spec, events, text };
}

/** Event timestamps are ISO strings on the wire; the predicate reads them as Dates. */
const revive = (events) => events.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));

const checkOf = (reason) =>
  reason === undefined ? null : reason.startsWith('genesis') ? 'genesis' : reason.startsWith('prevHash') ? 'prevHash' : 'contentHash';

/** Runs one case with implementation `impl`; returns [{label, expected, got}]. */
export function runCase(c, impl) {
  const { spec, events } = c;
  switch (spec.procedure) {
    case 'verifyChain': {
      const r = impl.verifyChain(events);
      return [{ label: spec.name, expected: spec.expected, got: { valid: r.valid, brokenAt: r.brokenAt, check: checkOf(r.reason) } }];
    }
    case 'disclosureHasOpportunityToBeRead':
      return [{ label: spec.name, expected: spec.expected, got: impl.disclosureHasOpportunityToBeRead(revive(events), spec.subject, spec.options) }];
    case 'lintDisclosureSignalPredicateName':
      return spec.names.map((n) => {
        const r = impl.lintDisclosureSignalPredicateName(n.name);
        const got = r.ok ? { ok: true } : { ok: false, code: r.code, token: r.token, cites: r.message.includes(spec.refusalCites) };
        const expected = n.expected.ok ? n.expected : { ...n.expected, cites: true };
        return { label: `${spec.name}: ${n.name}`, expected, got };
      });
    default:
      throw new Error(`${spec.name}: unknown procedure ${spec.procedure}`);
  }
}

/** Every case under `root`, run with `impl`. */
export function runAll(impl, root = VECTORS) {
  const out = [];
  for (const set of SETS) {
    const dirs = readdirSync(join(root, set)).filter((d) => statSync(join(root, set, d)).isDirectory()).sort();
    for (const d of dirs) {
      const c = loadCase(join(root, set, d));
      let rows;
      try {
        rows = runCase(c, impl);
      } catch (e) {
        rows = [{ label: c.spec.name, expected: c.spec.expected, got: `error: ${e instanceof Error ? e.message : String(e)}` }];
      }
      for (const r of rows) {
        const agree = JSON.stringify(r.got) === JSON.stringify(r.expected);
        out.push({ set, case: c.spec.name, ...r, agree });
      }
    }
  }
  return out;
}

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v).replaceAll('|', '\\|'));

export function report(results) {
  const lines = [
    '# CRAWCUS vectors: report',
    '',
    'Each case under hash-chain/ and disclosure-signal/, run through @crawcus/spec.',
    '',
    '| Set | Case | Expected | Got | Verdict |',
    '|---|---|---|---|---|',
    ...results.map((r) => `| ${r.set} | ${r.label} | ${show(r.expected)} | ${show(r.got)} | ${r.agree ? 'agree' : 'DISAGREE'} |`),
    '',
  ];
  let green = true;
  for (const set of SETS) {
    const rows = results.filter((r) => r.set === set);
    const cases = new Set(rows.map((r) => r.case)).size;
    const agreed = rows.filter((r) => r.agree).length;
    if (cases !== EXPECTED_CASES[set] || agreed !== rows.length) green = false;
    lines.push(`${set}: ${cases} cases (expected ${EXPECTED_CASES[set]}); ${agreed} of ${rows.length} checks agree.`);
  }
  const lint = results.filter((r) => r.case === 'name-lint').length;
  if (lint !== EXPECTED_LINT_NAMES) green = false;
  const valid = results.filter((r) => r.set === 'hash-chain' && r.expected.valid);
  const broken = results.filter((r) => r.set === 'hash-chain' && !r.expected.valid);
  lines.push(
    `Chains accepted: ${valid.filter((r) => r.agree).length} of ${valid.length}; broken chains rejected at the expected event and rule: ${broken.filter((r) => r.agree).length} of ${broken.length}.`,
    `Names linted as expected: ${results.filter((r) => r.case === 'name-lint' && r.agree).length} of ${lint} (expected ${EXPECTED_LINT_NAMES}).`,
    '',
  );
  return { text: lines.join('\n'), green };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const impl = await import('@crawcus/spec');
  const results = runAll(impl);
  const { text, green } = report(results);
  const i = process.argv.indexOf('--report');
  const out = i > 0 ? resolve(process.argv[i + 1]) : join(VECTORS, 'CRAWCUS-REPORT.md');
  writeFileSync(out, text);
  console.log(text);
  console.log(`report: ${out}`);
  process.exit(green ? 0 : 1);
}
