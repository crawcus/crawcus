/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CRAWCUS's own published vectors: the hash-chain cases and the disclosure-signal
 * cases under vectors/, run through @crawcus/spec. The files are written by
 * scripts/build-crawcus-vectors.mjs, which refuses unless the reference agrees
 * with every case's stated result; the `--check` case proves the files on disk
 * are that build.
 *
 * Flip controls show each case can go red: an implementation that skips one
 * rule disagrees on exactly the cases that rule decides.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as spec from '@crawcus/spec';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs runner shared with the CLI; no declaration file.
import { EXPECTED_CASES, EXPECTED_LINT_NAMES, VECTORS, loadCase, runAll } from '../scripts/run-crawcus-vectors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

type Row = { set: string; case: string; label: string; agree: boolean };
const disagreeing = (impl: unknown): string[] =>
  (runAll(impl) as Row[]).filter((r) => !r.agree).map((r) => r.label).sort();

describe('CRAWCUS vectors (hash-chain, disclosure-signal)', () => {
  const rows = runAll(spec) as Row[];

  it('the files on disk are a rebuild from the fixtures', () => {
    const out = execFileSync(process.execPath, [resolve(HERE, '../scripts/build-crawcus-vectors.mjs'), '--check'], { encoding: 'utf8' });
    expect(out).toContain('17 cases match a rebuild');
  });

  it('finds every case and every linted name (a run that sees fewer is not green)', () => {
    for (const set of ['hash-chain', 'disclosure-signal'] as const) {
      expect(new Set(rows.filter((r) => r.set === set).map((r) => r.case)).size).toBe(EXPECTED_CASES[set]);
    }
    expect(rows.filter((r) => r.case === 'name-lint')).toHaveLength(EXPECTED_LINT_NAMES);
  });

  it('@crawcus/spec agrees with every case', () => {
    expect(rows.filter((r) => !r.agree).map((r) => r.label)).toEqual([]);
  });
});

describe('flip controls', () => {
  it('a chain check that does not recompute hashes disagrees only on the edited payload', () => {
    const noRecompute = {
      ...spec,
      verifyChain: (events: readonly { prevHash: string | null; contentHash: string }[]) => {
        for (let i = 0; i < events.length; i++) {
          if (i === 0 && events[0]!.prevHash !== null) return { valid: false, brokenAt: 0, reason: 'genesis' };
          if (i > 0 && events[i]!.prevHash !== events[i - 1]!.contentHash) return { valid: false, brokenAt: i, reason: 'prevHash' };
        }
        return { valid: true, brokenAt: null };
      },
    };
    expect(disagreeing(noRecompute)).toEqual(['payload-edited']);
  });

  it('a chain check without the genesis rule disagrees on both genesis cases', () => {
    const noGenesis = {
      ...spec,
      verifyChain: (events: Parameters<typeof spec.verifyChain>[0]) =>
        spec.verifyChain(events.length > 0 ? [{ ...events[0]!, prevHash: null } as (typeof events)[number], ...events.slice(1)] : events),
    };
    expect(disagreeing(noGenesis)).toEqual(['genesis-prevhash-set', 'genesis-removed']);
  });

  it('a predicate that ignores requireHashMatch disagrees on the stale-hash cases', () => {
    const noHash = {
      ...spec,
      disclosureHasOpportunityToBeRead: (e: never, s: never, o: spec.DisclosureHasOpportunityToBeReadOptions) =>
        spec.disclosureHasOpportunityToBeRead(e, s, { ...o, requireHashMatch: false }),
    };
    expect(disagreeing(noHash)).toEqual(['hash-mismatch', 'redelivered-signal-for-old']);
  });

  it('a lint that forgets one forbidden token disagrees on its names', () => {
    const lax = {
      ...spec,
      lintDisclosureSignalPredicateName: (n: string) =>
        /consented/i.test(n) ? spec.lintDisclosureSignalPredicateName(n.replace(/consented/i, 'Signal')) : spec.lintDisclosureSignalPredicateName(n),
    };
    expect(disagreeing(lax)).toEqual(['name-lint: userScrollCONSENTEDNotice', 'name-lint: userScrollConsentedNoticeBySignal']);
  });

  it('a tampered vector file is refused before it is run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crawcus-vector-'));
    try {
      cpSync(join(VECTORS, 'hash-chain', 'golden'), dir, { recursive: true });
      expect(() => loadCase(dir)).not.toThrow();
      const f = join(dir, 'events.json');
      writeFileSync(f, readFileSync(f, 'utf8').replace('tck-tenant', 'tck-tenanT'));
      expect(() => loadCase(dir)).toThrow(/MANIFEST/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
