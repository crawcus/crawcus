/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineContract, type Contract } from '@crawcus/core';
import { EU_AI_ACT_VERSION } from './version.js';

/**
 * EU AI Act Article 14 — Human Oversight.
 *
 * "High-risk AI systems shall be designed and developed in such a
 * way, including with appropriate human-machine interface tools, that
 * they can be effectively overseen by natural persons during the
 * period in which they are in use."
 *
 * Tallyseal's Suggestion-lifecycle (accept / edit / reject) IS the
 * Article 14 implementation. This Contract asserts that for a
 * `'high-risk'` classified Intent, at least one Suggestion has been
 * processed by a human before `ProjectionCommit` fires.
 *
 * Skipped for `'standard'` classification — Art. 14 only applies to
 * high-risk systems per Art. 6 + Annex III scope.
 *
 * @example
 * import { humanOversight } from '@crawcus/regulations-eu-ai-act';
 *
 * defineCrawcusSpec({
 *   key: 'HiringScreen',
 *   classification: 'high-risk', // Annex III §4 (employment)
 *   contracts: {
 *     post: [humanOversight()],
 *   },
 * });
 */
export function humanOversight(): Contract {
  return defineContract({
    id: 'eu-ai-act.art14.humanOversight',
    description: {
      en: 'EU AI Act Art. 14: high-risk Intents require at least one human-processed Suggestion (accept/edit/reject) before ProjectionCommit.',
    },
    citation: {
      regulation: EU_AI_ACT_VERSION,
      article: 'Art. 14',
      url: 'https://artificialintelligenceact.eu/article/14/',
    },
    predicate: ({ spec, events }) => {
      // Skip for non-high-risk classifications
      if (spec.classification !== 'high-risk') return true;
      // Pass if at least one human-oversight event exists
      return events.some(
        (e) =>
          e.kind === 'SuggestionAccepted' ||
          e.kind === 'SuggestionEdited' ||
          e.kind === 'SuggestionRejected',
      );
    },
    severity: 'block',
  });
}
