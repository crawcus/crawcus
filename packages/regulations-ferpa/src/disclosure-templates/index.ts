/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * # @crawcus/regulations-ferpa/disclosure-templates
 *
 * Typed disclosure boilerplate skeletons for FERPA notification
 * obligations. Sourced from HF feedback 2026-06-02 item 4 + IDEA-011
 * → TKT-DISCLOSURE-TEMPLATES.
 *
 * One namespace shipped:
 * - {@link ferpaAnnualNotice} — §99.7 annual notification of rights
 *   under FERPA, covering inspect/review, amendment, consent (with
 *   §99.31 exceptions), directory-information opt-out, and complaint
 *   to the U.S. Department of Education.
 *
 * Pairs with the §99.31 Contract factories in the parent pack
 * (`disclosureConsent`, `schoolOfficial`, `legitimateEducationalInterest`,
 * `auditEvaluation`, `researchException`) which run at intent-evaluation
 * time. The annual notice is the *upstream* prerequisite for relying
 * on the school-official + legitimate-educational-interest exception:
 * §99.31(a)(1)(i)(B) only permits non-consent disclosure to a school
 * official with legitimate educational interest "as defined by the
 * agency or institution in its annual notification of rights under
 * §99.7."
 *
 * @example
 * import { ferpaAnnualNotice } from '@crawcus/regulations-ferpa/disclosure-templates';
 *
 * const notice = ferpaAnnualNotice.fill({
 *   institutionName: 'HumanFirst Academy',
 *   institutionType: 'postsecondary',
 *   inspectReviewProcedure: 'Submit a written request to the Registrar.',
 *   amendmentProcedure: 'Write to the Registrar identifying the change.',
 *   schoolOfficialDefinition: 'A school official is a person employed by HumanFirst Academy in an administrative, supervisory, academic, research, or support staff position; a contractor, consultant, volunteer, or other party to whom HumanFirst Academy has outsourced institutional services or functions.',
 *   legitimateEducationalInterestDefinition: 'A school official has a legitimate educational interest if the official needs to review an education record in order to fulfil their professional responsibility.',
 * });
 */

import { fill as fillAnnualNotice } from './ferpa-annual-notice.js';

export const ferpaAnnualNotice = {
  fill: fillAnnualNotice,
} as const;

export type { FerpaAnnualNoticeInput, InstitutionType } from './ferpa-annual-notice.js';
export {
  RequiredSectionMissingError,
  type DisclosureSection,
  type DisclosureTemplate,
} from './types.js';
