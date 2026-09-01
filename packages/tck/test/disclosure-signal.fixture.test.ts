/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  runDisclosureSignalPositiveCase,
  runDisclosureSignalGateRejectionCase,
  runDisclosureSignalHashMismatchCase,
} from '../src/fixtures/disclosure-signal.fixture.js';

describe('TCK / disclosure-signal fixture (Q-CR9 LOCKED 2026-06-02)', () => {
  it('positive case — predicate resolves true on matching delivery + signal', () => {
    const result = runDisclosureSignalPositiveCase();
    expect(result.ok).toBe(true);
  });

  it('SIGNAL-not-gate rejection case — forbidden-token names rejected with §6.A citation', () => {
    const result = runDisclosureSignalGateRejectionCase();
    expect(result.ok).toBe(true);
  });

  it('hash-mismatch rejection case — stale-content signal does not satisfy predicate', () => {
    const result = runDisclosureSignalHashMismatchCase();
    expect(result.ok).toBe(true);
  });
});
