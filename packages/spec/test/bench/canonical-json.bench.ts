/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { bench, describe } from 'vitest';
import { canonicalJSON, normaliseForCanonical } from '../../src/event/canonical-json.js';

describe('canonical-json bench', () => {
  const small = { a: 1, b: 'hello', c: true, d: null };
  const medium = {
    intentId: 'int_abc',
    eventKind: 'CapturedTurn',
    payload: {
      message: 'Hi there, my course is Intro to Algebra',
      metadata: { learnerAge: 14, parentalConsent: 'evt_consent_xyz' },
    },
    actor: { id: 'act_xyz', kind: 'human' },
    timestamp: '2026-05-21T00:00:00.000Z',
  };
  const large = {
    cases: Array.from({ length: 50 }, (_, i) => ({
      id: `case-${i}`,
      input: { msg: `synthetic input ${i}`, n: i, tags: ['a', 'b', 'c'] },
      expectations: [
        { fieldKey: 'title', value: `T${i}`, minConfidence: 0.85 },
        { fieldKey: 'subject', value: i % 2 === 0 ? 'math' : 'history' },
      ],
    })),
  };

  bench('canonicalJSON — small object (4 keys, primitives)', () => {
    canonicalJSON(small);
  });

  bench('canonicalJSON — medium event payload (typical writeEvent input)', () => {
    canonicalJSON(medium);
  });

  bench('canonicalJSON — large nested (50 cases × 5 fields)', () => {
    canonicalJSON(large);
  });

  bench('normaliseForCanonical — medium with Date', () => {
    normaliseForCanonical({ ...medium, at: new Date() });
  });
});
