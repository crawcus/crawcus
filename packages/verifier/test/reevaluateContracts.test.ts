/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `reevaluateContracts` + `checkEmbeddedPredicates` +
 * `lintSignalAsGate`.
 *
 * Spec §6a row 4:
 *   - FERPA §99.31 school-official pre-check pass + fail (simulated
 *     via recorded ContractResult rows; verifier does NOT eval source)
 *   - GDPR Art 50 emotion-recognition disclosure inv check
 *   - Q-CR9 DisclosureSignal SIGNAL-not-gate lint
 *   - Predicate-retired historical-unverifiable flow
 */

import { describe, expect, it } from 'vitest';
import {
  checkEmbeddedPredicates,
  lintSignalAsGate,
  reevaluateContracts,
} from '../src/contracts.js';
import { parseSignedBundle } from '../src/parse.js';
import { buildSignedBundle, predHash } from './fixtures/build-bundle.js';

describe('checkEmbeddedPredicates', () => {
  it('passes when every referenced Contract has an embedded predicate source', () => {
    const source = "({ has }) => has('schoolOfficial');";
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'ferpa.99-31.schoolOfficial',
          predicateHash: predHash(source),
        },
      ],
      predicateSources: { 'ferpa.99-31.schoolOfficial': source },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = checkEmbeddedPredicates(parsed.parsed.bundle, {
      requireEmbeddedPredicates: true,
    });
    expect(results).toHaveLength(0);
  });

  it('reports Contract.predicate.unembedded for each missing predicate source', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'ferpa.99-31.schoolOfficial',
        },
        {
          result: 'fail',
          checkpoint: 'pre',
          contractId: 'gdpr.art50.emotionRecognition',
          severity: 'block',
        },
      ],
      // predicateSources omitted entirely
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = checkEmbeddedPredicates(parsed.parsed.bundle, {
      requireEmbeddedPredicates: true,
    });
    expect(results).toHaveLength(2);
    expect(results[0]?.violationKind).toBe('Contract.predicate.unembedded');
    expect(results[1]?.violationKind).toBe('Contract.predicate.unembedded');
  });

  it('returns no results when requireEmbeddedPredicates is false', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'ferpa.99-31.schoolOfficial',
        },
      ],
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = checkEmbeddedPredicates(parsed.parsed.bundle, {
      requireEmbeddedPredicates: false,
    });
    expect(results).toHaveLength(0);
  });
});

describe('reevaluateContracts', () => {
  it('emits a passing result for each historically-passing Contract', () => {
    const source = "({ has }) => has('schoolOfficial');";
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'ferpa.99-31.schoolOfficial',
          predicateHash: predHash(source),
        },
      ],
      predicateSources: { 'ferpa.99-31.schoolOfficial': source },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results).toHaveLength(1);
    expect(results[0]?.verdict).toBe('pass');
    expect(results[0]?.contractId).toBe('ferpa.99-31.schoolOfficial');
  });

  it('emits Contract.pre.unmet for historical pre-checkpoint fail', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'fail',
          checkpoint: 'pre',
          contractId: 'ferpa.99-31.schoolOfficial',
          severity: 'block',
        },
      ],
      predicateSources: { 'ferpa.99-31.schoolOfficial': '({ has }) => true;' },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results).toHaveLength(1);
    expect(results[0]?.violationKind).toBe('Contract.pre.unmet');
  });

  it('emits Contract.inv.violated for historical invariants fail (GDPR Art 50)', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'fail',
          checkpoint: 'invariants',
          contractId: 'gdpr.art50.emotionRecognition.notice',
          severity: 'block',
        },
      ],
      predicateSources: { 'gdpr.art50.emotionRecognition.notice': '({ has }) => true;' },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results[0]?.violationKind).toBe('Contract.inv.violated');
  });

  it('emits Contract.post.unmet for historical post fail', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'fail',
          checkpoint: 'post',
          contractId: 'eu-ai-act.art14.in-loop',
          severity: 'block',
        },
      ],
      predicateSources: { 'eu-ai-act.art14.in-loop': '({ has }) => true;' },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results[0]?.violationKind).toBe('Contract.post.unmet');
  });

  it('emits Contract.predicate.retired (historical-unverifiable) when source hash mismatches recorded hash', () => {
    const oldSource = "({ has }) => has('a');";
    const newSource = "({ has }) => has('b');"; // edited
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'rotated.predicate',
          predicateHash: predHash(oldSource),
        },
      ],
      predicateSources: { 'rotated.predicate': newSource },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results).toHaveLength(1);
    expect(results[0]?.verdict).toBe('historical-unverifiable');
    expect(results[0]?.violationKind).toBe('Contract.predicate.retired');
  });

  it('propagates recorded historical-unverifiable as Contract.predicate.retired', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'historical-unverifiable',
          contractId: 'gone.predicate',
          predicateHashSeen: 'sha256:somehash',
          reason: 'predicate retired',
        },
      ],
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results).toHaveLength(1);
    expect(results[0]?.verdict).toBe('historical-unverifiable');
    expect(results[0]?.violationKind).toBe('Contract.predicate.retired');
  });

  it('returns empty array when contractResults is absent', () => {
    const fixture = buildSignedBundle();
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results).toHaveLength(0);
  });

  it('handles unknown result kind as historical-unverifiable', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'wat',
          contractId: 'weird.contract',
        },
      ],
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results[0]?.verdict).toBe('historical-unverifiable');
  });
});

describe('lintSignalAsGate', () => {
  it('flags Contract.predicate.signal-as-gate when name contains "acknowledged" AND DisclosureSignal present', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'gdpr.disclosure.acknowledged',
          predicateHash: predHash('({ has }) => true;'),
        },
      ],
      predicateSources: { 'gdpr.disclosure.acknowledged': '({ has }) => true;' },
      addDisclosureSignal: true,
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = lintSignalAsGate(parsed.parsed.bundle);
    expect(results).toHaveLength(1);
    expect(results[0]?.violationKind).toBe('Contract.predicate.signal-as-gate');
  });

  it('does not flag when no DisclosureSignal event is present', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'gdpr.disclosure.acknowledged',
          predicateHash: predHash('({ has }) => true;'),
        },
      ],
      predicateSources: { 'gdpr.disclosure.acknowledged': '({ has }) => true;' },
      addDisclosureSignal: false,
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = lintSignalAsGate(parsed.parsed.bundle);
    expect(results).toHaveLength(0);
  });

  it('does not flag SIGNAL-named predicates', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'gdpr.disclosure.hasOpportunityToBeRead',
          predicateHash: predHash('({ has }) => true;'),
        },
      ],
      predicateSources: { 'gdpr.disclosure.hasOpportunityToBeRead': '({ has }) => true;' },
      addDisclosureSignal: true,
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = lintSignalAsGate(parsed.parsed.bundle);
    expect(results).toHaveLength(0);
  });
});
