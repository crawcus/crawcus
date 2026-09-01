/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { checkScenarioCoverage, parseScenarios } from '@crawcus/tck';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const featuresDir = join(pkgRoot, 'features');

describe('Gherkin scenario coverage — regulations-eu-ai-act', () => {
  it('every Scenario in features/art14.feature has a corresponding it() in art14.test.ts', () => {
    const art14Scenarios = parseScenarios(join(featuresDir, 'art14-human-oversight.feature'));
    const art14Tests = checkScenarioCoverage({
      featuresDir,
      testFile: join(here, 'art14.test.ts'),
    });
    // Filter: only assert Art. 14 scenarios are present in art14.test.ts.
    // (The bundle report aggregates all features; we want the per-file slice.)
    const art14Set = new Set(art14Scenarios);
    const missingArt14 = art14Tests.missingTests.filter((s) => art14Set.has(s));
    expect(art14Scenarios.length).toBeGreaterThan(0);
    expect(missingArt14, `Art. 14 scenarios without tests: ${missingArt14.join(' | ')}`).toEqual(
      [],
    );
  });

  it('every Scenario in features/art50.feature has a corresponding it() in art50.test.ts', () => {
    const art50Scenarios = parseScenarios(join(featuresDir, 'art50.feature'));
    const art50Tests = checkScenarioCoverage({
      featuresDir,
      testFile: join(here, 'art50.test.ts'),
    });
    const art50Set = new Set(art50Scenarios);
    const missingArt50 = art50Tests.missingTests.filter((s) => art50Set.has(s));
    expect(art50Scenarios.length).toBeGreaterThan(0);
    expect(missingArt50, `Art. 50 scenarios without tests: ${missingArt50.join(' | ')}`).toEqual(
      [],
    );
  });
});
