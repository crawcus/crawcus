import type { Contract, ContractCtx, RegulationCitation } from './types.js';
import type { LocalisedText } from '../types/locale.js';

/**
 * Factory helper for constructing a Contract with sane defaults.
 * Regulation modules (`@tallyseal/regulations/*`) export typed
 * wrappers around this — see the example below.
 *
 * Customers rarely call this directly; they call the regulation-
 * module factories (Lego-shaped composition).
 *
 * @example
 * // In @tallyseal/regulations/gdpr/art8.ts:
 * export function minorConsent(opts: {
 *   ageField: string;
 *   consentField: string;
 *   minorAge?: number;
 * }): Contract {
 *   const minorAge = opts.minorAge ?? 16;
 *   return defineContract({
 *     id: 'gdpr.art8.minorConsent',
 *     description: {
 *       en: `If learner age is below ${minorAge}, parental consent event ID must be present`,
 *     },
 *     citation: {
 *       regulation: 'gdpr@2025-Q1' as RegulationVersion,
 *       article: 'Art. 8',
 *       paragraph: '§3(a)',
 *     },
 *     predicate: ({ value, has }) => {
 *       const age = value<number>(opts.ageField);
 *       return age === undefined || age >= minorAge || has(opts.consentField);
 *     },
 *   });
 * }
 */
export function defineContract<TCtx extends ContractCtx>(spec: {
  id: string;
  description: LocalisedText;
  citation?: RegulationCitation;
  predicate: (ctx: TCtx) => boolean;
  severity?: 'block' | 'warn';
}): Contract<TCtx> {
  return {
    id: spec.id,
    description: spec.description,
    ...(spec.citation ? { citation: spec.citation } : {}),
    predicate: spec.predicate,
    severity: spec.severity ?? 'block',
  };
}
