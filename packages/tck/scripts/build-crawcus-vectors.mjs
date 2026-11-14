/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

// Writes CRAWCUS's own conformance vectors as plain JSON, so a runtime in any
// language can check itself without importing the TypeScript fixtures:
//
//   packages/tck/vectors/hash-chain/<case>/         the golden 5-event chain of
//                                                    src/fixtures/hash-chain.fixture.ts,
//                                                    and the ways a chain breaks
//   packages/tck/vectors/disclosure-signal/<case>/  the §6.A predicate and the
//                                                    SIGNAL-not-gate name lint of
//                                                    src/fixtures/disclosure-signal.fixture.ts
//
//   node packages/tck/scripts/build-crawcus-vectors.mjs [--check]
//
// Every case states its expected result here, from the contract's prose, not
// from a run. The script then runs the reference (@crawcus/spec) on each case
// and refuses to write if any result differs, or if the golden chain's hashes
// are not the fixture's EXPECTED_CONTENT_HASHES. `--check` rebuilds in memory
// and fails unless every file on disk is byte-equal to the rebuild.
//
// Needs the spec and tck builds: pnpm --filter @crawcus/spec --filter @crawcus/tck build

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../vectors');
const spec = await import('@crawcus/spec');
const fixtures = await import(pathToFileURL(resolve(HERE, '../dist/fixtures/index.js')).href);

const sha = (b) => createHash('sha256').update(b).digest('hex');
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
const clone = (v) => JSON.parse(JSON.stringify(v));
const rehash = (e) => {
  const { id: _id, contentHash: _c, ...h } = e;
  return { ...e, contentHash: spec.computeContentHash(h) };
};

// ---------------------------------------------------------------- hash chain

const GOLDEN_INTENT = 'tck-golden-intent';
const golden = clone(fixtures.buildGoldenSequence(GOLDEN_INTENT));
if (JSON.stringify(golden.map((e) => e.contentHash)) !== JSON.stringify(fixtures.EXPECTED_CONTENT_HASHES)) {
  throw new Error('golden chain: contentHashes are not EXPECTED_CONTENT_HASHES');
}

/** check: which rule of verifyChain breaks first — genesis, prevHash or contentHash. */
const HASH_CHAIN_CASES = [
  {
    name: 'golden',
    about: 'The five events of buildGoldenSequence("tck-golden-intent"), as written. Every link and every hash holds.',
    events: golden,
    expected: { valid: true, brokenAt: null, check: null },
  },
  {
    name: 'payload-edited',
    about: 'Event 2\'s payload is changed and its contentHash is left as it was. The recomputed hash differs.',
    events: golden.map((e, i) => (i === 2 ? { ...e, payload: { ...e.payload, tampered: true } } : e)),
    expected: { valid: false, brokenAt: 2, check: 'contentHash' },
  },
  {
    name: 'payload-edited-and-rehashed',
    about: 'Event 2\'s payload is changed and its contentHash recomputed. Event 2 now holds, so the break shows at event 3, whose prevHash names the old hash.',
    events: golden.map((e, i) => (i === 2 ? rehash({ ...e, payload: { ...e.payload, tampered: true } }) : e)),
    expected: { valid: false, brokenAt: 3, check: 'prevHash' },
  },
  {
    name: 'events-swapped',
    about: 'Events 1 and 2 change places. Event 1 (formerly 2) names a prevHash that is not event 0\'s.',
    events: [golden[0], golden[2], golden[1], golden[3], golden[4]],
    expected: { valid: false, brokenAt: 1, check: 'prevHash' },
  },
  {
    name: 'event-removed',
    about: 'Event 2 is removed. The event now at index 2 names the removed event\'s hash.',
    events: golden.filter((_, i) => i !== 2),
    expected: { valid: false, brokenAt: 2, check: 'prevHash' },
  },
  {
    name: 'genesis-removed',
    about: 'Event 0 is removed. The first event now has a non-null prevHash, which no genesis may have.',
    events: golden.slice(1),
    expected: { valid: false, brokenAt: 0, check: 'genesis' },
  },
  {
    name: 'genesis-prevhash-set',
    about: 'Event 0 is given a prevHash and its contentHash recomputed. Its own hash holds; the genesis rule does not.',
    events: [rehash({ ...golden[0], prevHash: golden[4].contentHash }), ...golden.slice(1)],
    expected: { valid: false, brokenAt: 0, check: 'genesis' },
  },
];

const checkOf = (reason) =>
  reason === undefined ? null : reason.startsWith('genesis') ? 'genesis' : reason.startsWith('prevHash') ? 'prevHash' : 'contentHash';

function hashChainFiles(c) {
  const r = spec.verifyChain(c.events);
  const got = { valid: r.valid, brokenAt: r.brokenAt, check: checkOf(r.reason) };
  if (JSON.stringify(got) !== JSON.stringify(c.expected)) {
    throw new Error(`hash-chain/${c.name}: the reference gives ${JSON.stringify(got)}, the case expects ${JSON.stringify(c.expected)}`);
  }
  const files = { 'events.json': json(c.events) };
  // The exact bytes each event's contentHash is the SHA-256 of: canonical JSON
  // of every field but id and contentHash. Published for the golden chain only.
  if (c.name === 'golden') {
    c.events.forEach((e, i) => {
      const { id: _id, contentHash: _c, ...h } = e;
      const bytes = spec.canonicalJSON(spec.normaliseForCanonical(h));
      if (sha(bytes) !== e.contentHash) throw new Error(`golden event ${i}: canonical bytes do not hash to its contentHash`);
      files[`canonical-${i}.txt`] = bytes;
    });
  }
  files['case.json'] = json({
    name: c.name,
    about: c.about,
    procedure: 'verifyChain',
    events: 'events.json',
    expected: c.expected,
  });
  return files;
}

// --------------------------------------------------------- disclosure signal

const ENV = {
  tenantId: 'tck-tenant',
  intentId: 'tck-intent',
  subject: 'tck-subject',
  requirementId: 'gdpr.art13.notice',
  now: new Date('2026-06-02T12:00:00.000Z'),
};
const later = (ms) => ({ ...ENV, now: new Date(ENV.now.getTime() + ms) });
const delivered = (hash, id = 'tck-d1', env = ENV) => fixtures.buildDeliveredEvent(env, hash, id);
const signal = (hash, type = 'read', id = 'tck-s1', env = ENV) => fixtures.buildSignalEvent(env, hash, type, { id, viewMs: 1800 });
const READ = { requirementId: ENV.requirementId, acceptedSignals: ['read'], requireHashMatch: true };

const PREDICATE_CASES = [
  {
    name: 'positive',
    about: 'Delivered with h_fresh; a read signal carries h_fresh. The subject had the opportunity to read it.',
    events: [delivered('h_fresh'), signal('h_fresh')],
    options: READ,
    expected: true,
  },
  {
    name: 'hash-mismatch',
    about: 'Delivered with h_fresh; the read signal carries h_stale. Under requireHashMatch the signal is for other content.',
    events: [delivered('h_fresh'), signal('h_stale')],
    options: READ,
    expected: false,
  },
  {
    name: 'hash-mismatch-not-required',
    about: 'As hash-mismatch, with requireHashMatch false. Any read signal for the requirement counts.',
    events: [delivered('h_fresh'), signal('h_stale')],
    options: { ...READ, requireHashMatch: false },
    expected: true,
  },
  {
    name: 'signal-type-not-accepted',
    about: 'The only signal is a click; acceptedSignals is [read].',
    events: [delivered('h_fresh'), signal('h_fresh', 'click')],
    options: READ,
    expected: false,
  },
  {
    name: 'no-delivery',
    about: 'A read signal with no DisclosureDelivered event at all.',
    events: [signal('h_fresh')],
    options: READ,
    expected: false,
  },
  {
    name: 'other-subject',
    about: 'The delivery is to another subject.',
    events: [delivered('h_fresh', 'tck-d1', { ...ENV, subject: 'tck-other-subject' }), signal('h_fresh')],
    options: READ,
    expected: false,
  },
  {
    name: 'other-requirement',
    about: 'The read signal is for another requirementId.',
    events: [delivered('h_fresh'), signal('h_fresh', 'read', 'tck-s1', { ...ENV, requirementId: 'gdpr.art14.notice' })],
    options: READ,
    expected: false,
  },
  {
    name: 'redelivered-signal-for-old',
    about: 'Delivered with h_old, then again a minute later with h_new. The read signal carries h_old; the most recent delivery decides.',
    events: [delivered('h_old', 'tck-d1'), delivered('h_new', 'tck-d2', later(60_000)), signal('h_old')],
    options: READ,
    expected: false,
  },
  {
    name: 'redelivered-signal-for-new',
    about: 'As redelivered-signal-for-old, with the read signal carrying h_new.',
    events: [delivered('h_old', 'tck-d1'), delivered('h_new', 'tck-d2', later(60_000)), signal('h_new')],
    options: READ,
    expected: true,
  },
];

/** Names the lint is given, and what §6.A says it returns. */
const LINT_CASES = [
  ...spec.SIGNAL_NOT_GATE_FORBIDDEN_TOKENS.map((t) => ({
    name: `userScroll${t.charAt(0).toUpperCase()}${t.slice(1)}NoticeBySignal`,
    expected: { ok: false, code: 'FORBIDDEN_TOKEN', token: t },
  })),
  { name: 'userScrollCONSENTEDNotice', expected: { ok: false, code: 'FORBIDDEN_TOKEN', token: 'consented' } },
  { name: 'disclosureWasObserved', expected: { ok: false, code: 'MISSING_REQUIRED_TOKEN', token: 'opportunity | signal' } },
  { name: 'disclosureHasOpportunityToBeRead', expected: { ok: true } },
  { name: 'disclosureSignalObserved', expected: { ok: true } },
];
const CITATION = 'crawcus-contracts.md §6.A';

const revive = (events) => events.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));

function predicateFiles(c) {
  const events = clone(c.events);
  const got = spec.disclosureHasOpportunityToBeRead(revive(events), ENV.subject, c.options);
  if (got !== c.expected) throw new Error(`disclosure-signal/${c.name}: the reference gives ${got}, the case expects ${c.expected}`);
  return {
    'events.json': json(events),
    'case.json': json({
      name: c.name,
      about: c.about,
      procedure: 'disclosureHasOpportunityToBeRead',
      events: 'events.json',
      subject: ENV.subject,
      options: c.options,
      expected: c.expected,
    }),
  };
}

function lintFiles() {
  for (const l of LINT_CASES) {
    const r = spec.lintDisclosureSignalPredicateName(l.name);
    const got = r.ok ? { ok: true } : { ok: false, code: r.code, token: r.token };
    if (JSON.stringify(got) !== JSON.stringify(l.expected)) {
      throw new Error(`disclosure-signal/name-lint ${l.name}: the reference gives ${JSON.stringify(got)}, the case expects ${JSON.stringify(l.expected)}`);
    }
    if (!r.ok && !r.message.includes(CITATION)) throw new Error(`name-lint ${l.name}: the message does not cite ${CITATION}`);
  }
  return {
    'case.json': json({
      name: 'name-lint',
      about: 'A predicate that consumes DisclosureSignal records an opportunity to perceive, never an acknowledgement. Its name must not carry a forbidden token and must carry a required one; a refusal cites the contract.',
      procedure: 'lintDisclosureSignalPredicateName',
      forbiddenTokens: [...spec.SIGNAL_NOT_GATE_FORBIDDEN_TOKENS],
      requiredTokens: [...spec.SIGNAL_NOT_GATE_REQUIRED_TOKENS],
      matching: 'case-insensitive',
      refusalCites: CITATION,
      names: LINT_CASES,
    }),
  };
}

// ---------------------------------------------------------------- write

const withManifest = (files) => {
  const manifest = Object.fromEntries(Object.keys(files).sort().map((f) => [f, sha(files[f])]));
  return { ...files, 'MANIFEST.json': json(manifest) };
};

export function build() {
  const out = {};
  for (const c of HASH_CHAIN_CASES) out[`hash-chain/${c.name}`] = withManifest(hashChainFiles(c));
  for (const c of PREDICATE_CASES) out[`disclosure-signal/${c.name}`] = withManifest(predicateFiles(c));
  out['disclosure-signal/name-lint'] = withManifest(lintFiles());
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = build();
  const n = Object.keys(out).length;
  if (process.argv.includes('--check')) {
    const bad = [];
    for (const set of ['hash-chain', 'disclosure-signal']) {
      const onDisk = existsSync(join(ROOT, set)) ? readdirSync(join(ROOT, set), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `${set}/${d.name}`) : [];
      for (const d of onDisk) if (!(d in out)) bad.push(`${d}: on disk, not in the rebuild`);
    }
    for (const [dir, files] of Object.entries(out)) {
      for (const [f, body] of Object.entries(files)) {
        const p = join(ROOT, dir, f);
        if (!existsSync(p) || readFileSync(p, 'utf8') !== body) bad.push(`${dir}/${f}`);
      }
      const extra = existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => !(f in files)) : [];
      for (const f of extra) bad.push(`${dir}/${f}: on disk, not in the rebuild`);
    }
    if (bad.length > 0) {
      console.error(`differs from a rebuild:\n  ${bad.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`${n} cases match a rebuild from the fixtures`);
  } else {
    for (const set of ['hash-chain', 'disclosure-signal']) rmSync(join(ROOT, set), { recursive: true, force: true });
    for (const [dir, files] of Object.entries(out)) {
      mkdirSync(join(ROOT, dir), { recursive: true });
      for (const [f, body] of Object.entries(files)) writeFileSync(join(ROOT, dir, f), body);
    }
    console.log(`every case agrees with the reference; wrote ${n} cases`);
  }
}
