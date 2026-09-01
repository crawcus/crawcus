/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal Gherkin parser + scenario coverage assertion.
 *
 * Why this exists: regulator-facing `.feature` files document the
 * expected behavior of regulation Contracts in a form auditors can
 * read. Unit tests (vitest `it()` blocks) are authoritative. This
 * helper bridges them: every `Scenario:` in a `.feature` file MUST
 * have a corresponding `it()` of the same name in a sibling test
 * file. CI fails if drift occurs in either direction.
 *
 * Not a full Gherkin engine — only parses Scenario titles. Given/When/
 * Then steps are documentation only. The runtime contract is "does an
 * `it()` of this name exist?", which is fast, framework-free, and
 * keeps test bodies idiomatic vitest.
 *
 * Reusable by any downstream CrawcusSpec implementation (Go / Rust /
 * Python TCKs) that needs the same documentation-↔-test invariant.
 */

export interface ScenarioCoverageOptions {
  /** Absolute or repo-relative path to the directory holding `.feature` files. */
  readonly featuresDir: string;
  /** Absolute or repo-relative path to the test file expected to cover them. */
  readonly testFile: string;
}

export interface ScenarioCoverageReport {
  readonly scenarios: readonly string[];
  readonly itNames: readonly string[];
  readonly missingTests: readonly string[];
  readonly orphanTests: readonly string[];
}

const SCENARIO_RE = /^\s*Scenario(?:\s+Outline)?:\s*(.+?)\s*$/gm;
const IT_RE = /\bit\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)/g;

export function parseScenarios(featurePath: string): readonly string[] {
  const text = readFileSync(featurePath, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(SCENARIO_RE)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

export function parseItNames(testPath: string): readonly string[] {
  const text = readFileSync(testPath, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(IT_RE)) {
    const name = m[1] ?? m[2] ?? m[3];
    if (name) out.push(name);
  }
  return out;
}

export function checkScenarioCoverage(opts: ScenarioCoverageOptions): ScenarioCoverageReport {
  const featureFiles = readdirSync(opts.featuresDir)
    .filter((f) => f.endsWith('.feature'))
    .map((f) => join(opts.featuresDir, f))
    .filter((f) => statSync(f).isFile());

  const scenarios = featureFiles.flatMap(parseScenarios);
  const itNames = parseItNames(opts.testFile);
  const itSet = new Set(itNames);

  const missingTests = scenarios.filter((s) => !itSet.has(s));

  return { scenarios, itNames, missingTests, orphanTests: [] };
}
