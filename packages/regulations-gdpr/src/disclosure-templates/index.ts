/**
 * # @crawcus/regulations-gdpr/disclosure-templates
 *
 * Typed disclosure boilerplate skeletons per HF feedback 2026-06-02
 * item 4 + IDEA-011 → TKT-DISCLOSURE-TEMPLATES.
 *
 * Controllers fill blanks (controllerName, retention, lawful basis,
 * recipients) — they do not author from scratch and miss required
 * sections. Section structure follows ICO + EDPB Guidelines 05/2020
 * ordering; each rendered paragraph cites the source Article.
 *
 * Two namespaces shipped:
 * - {@link gdprArt13} — Article 13 information-at-collection notice
 *   with {@link gdprArt13.standardDataSubjectRights} helper for the
 *   canonical 7-right list.
 * - {@link gdprArt22} — Article 22 automated-decision-making
 *   explanation, pairs with the Art. 22 Contract factories in the
 *   parent pack.
 *
 * **What this module does NOT do** — generic Art. 13 / Art. 22
 * boilerplate "compliance in a box." Copy is only ever compliant when
 * the controller fills it with their specifics; the filler enforces
 * presence of required sections + structural ordering.
 *
 * @example
 * import { gdprArt13 } from '@crawcus/regulations-gdpr/disclosure-templates';
 *
 * const notice = gdprArt13.fill({
 *   controllerName: 'HumanFirst Foundation',
 *   controllerContact: 'dpo@humanfirstfoundation.com',
 *   purposes: ['adult-learner-enrolment'],
 *   legalBasis: { 'adult-learner-enrolment': 'contract' },
 *   retentions: { default: 'P7Y' },
 *   recipients: [],
 *   rights: gdprArt13.standardDataSubjectRights(),
 *   supervisoryAuthority: 'Information Commissioner\'s Office (UK)',
 * });
 */

import { fill as fillArt13, standardDataSubjectRights } from './gdpr-art-13.js';
import { fill as fillArt22 } from './gdpr-art-22.js';

export const gdprArt13 = {
  fill: fillArt13,
  standardDataSubjectRights,
} as const;

export const gdprArt22 = {
  fill: fillArt22,
} as const;

export type { GdprArt13Input } from './gdpr-art-13.js';
export type { Art22Basis, GdprArt22Input } from './gdpr-art-22.js';
export {
  RequiredSectionMissingError,
  isIsoDuration,
  type DataSubjectRight,
  type DisclosureSection,
  type DisclosureTemplate,
  type IsoDuration,
  type LawfulBasis,
  type RecipientClassification,
  type RecipientEntry,
} from './types.js';
