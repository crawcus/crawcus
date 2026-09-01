import { describe, it, expect } from 'vitest';
import { checkScenarioCoverage } from '@crawcus/tck';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');

describe('Gherkin scenario coverage — regulations-ferpa', () => {
  it('every Scenario in features/ has a corresponding it() in 99-31.test.ts', () => {
    const report = checkScenarioCoverage({
      featuresDir: join(pkgRoot, 'features'),
      testFile: join(here, '99-31.test.ts'),
    });
    expect(report.scenarios.length).toBeGreaterThan(0);
    expect(
      report.missingTests,
      `Scenarios without tests: ${report.missingTests.join(' | ')}`,
    ).toEqual([]);
  });
});
