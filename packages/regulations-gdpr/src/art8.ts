import { defineContract, type Contract } from '@crawcus/core';
import { GDPR_VERSION } from './version.js';

/**
 * GDPR Article 8(1) — Conditions applicable to child's consent in
 * relation to information society services.
 *
 * "Where point (a) of Article 6(1) applies, in relation to the offer
 * of information society services directly to a child, the processing
 * of the personal data of a child shall be lawful where the child is
 * at least 16 years old. Where the child is below the age of 16
 * years, such processing shall be lawful only if and to the extent
 * that consent is given or authorised by the holder of parental
 * responsibility over the child."
 *
 * Member states may lower the age to 13 per Art. 8(1) sub-clause.
 *
 * @example
 * import { minorConsent } from '@crawcus/regulations-gdpr/art8';
 *
 * defineCrawcusSpec({
 *   key: 'CreateCourse',
 *   // ...
 *   contracts: {
 *     invariants: [
 *       minorConsent({
 *         ageField: 'learnerAge',
 *         consentField: 'parentalConsentEventId',
 *         minorAge: 16, // EU default; UK uses 13, IE uses 16
 *       }),
 *     ],
 *   },
 * });
 */
export interface MinorConsentOptions {
  /** Snapshot field carrying the data subject's age (a number). */
  readonly ageField: string;
  /**
   * Snapshot field carrying the parental-consent event reference.
   * Customer is responsible for ensuring this field is populated by
   * a separate `ConsentGranted` event when the subject is a minor.
   */
  readonly consentField: string;
  /**
   * Member-state minor age (GDPR Art. 8(1) — range 13-16).
   * Defaults to 16 (the EU baseline).
   */
  readonly minorAge?: number;
}

export function minorConsent(opts: MinorConsentOptions): Contract {
  const minorAge = opts.minorAge ?? 16;
  return defineContract({
    id: 'gdpr.art8.minorConsent',
    description: {
      en: `If learner age is below ${minorAge}, parental consent event reference must be present at '${opts.consentField}'.`,
    },
    citation: {
      regulation: GDPR_VERSION,
      article: 'Art. 8',
      paragraph: '§1',
      url: 'https://gdpr-info.eu/art-8-gdpr/',
    },
    predicate: ({ value, has }) => {
      const age = value<number>(opts.ageField);
      // Age unknown → defer to data-quality check elsewhere; this Contract
      // only fires when age is known AND below minorAge AND consent missing.
      if (age === undefined) return true;
      if (age >= minorAge) return true;
      return has(opts.consentField);
    },
    severity: 'block',
  });
}
