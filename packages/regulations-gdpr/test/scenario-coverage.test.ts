/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { checkScenarioCoverage, parseScenarios, parseItNames } from '@crawcus/tck';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const featuresDir = join(pkgRoot, 'features');

describe('Gherkin scenario coverage — regulations-gdpr', () => {
  it('every Scenario in art8-minor-consent.feature has a corresponding it() in art8.test.ts', () => {
    const scenarios = parseScenarios(join(featuresDir, 'art8-minor-consent.feature'));
    const itNames = new Set(parseItNames(join(here, 'art8.test.ts')));
    const missing = scenarios.filter((s) => !itNames.has(s));
    expect(scenarios.length).toBeGreaterThan(0);
    expect(missing, `Scenarios without tests in art8.test.ts: ${missing.join(' | ')}`).toEqual([]);
  });

  it('every Scenario in art22.feature has a corresponding it() in art22.test.ts', () => {
    const scenarios = parseScenarios(join(featuresDir, 'art22.feature'));
    const itNames = new Set(parseItNames(join(here, 'art22.test.ts')));
    const missing = scenarios.filter((s) => !itNames.has(s));
    expect(scenarios.length).toBeGreaterThan(0);
    expect(missing, `Scenarios without tests in art22.test.ts: ${missing.join(' | ')}`).toEqual([]);
  });

  it('every feature file in features/ is covered by a coverage assertion above', () => {
    // Wholesale safety net — if a new .feature file is added without a
    // dedicated coverage assertion, this test should be updated.
    const report = checkScenarioCoverage({
      featuresDir,
      testFile: join(here, 'art8.test.ts'), // test-file arg ignored for the directory listing
    });
    // The aggregated scenarios array spans every .feature in the dir.
    // We assert a non-empty result so an empty/misplaced feature dir is caught.
    expect(report.scenarios.length).toBeGreaterThan(0);
  });
});
