/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { FERPA_VERSION } from '../version.js';
import {
  RequiredSectionMissingError,
  type DisclosureSection,
  type DisclosureTemplate,
} from './types.js';

/**
 * # FERPA §99.7 — annual notification of rights under FERPA
 *
 * 34 CFR §99.7 requires every educational agency or institution to
 * notify parents (or eligible students) annually of their rights
 * under FERPA. The notice must include:
 *
 * - the right to inspect and review education records
 * - the right to seek amendment of education records
 * - the right to consent to disclosures (with §99.31 exceptions)
 * - the right to file a complaint with the U.S. Department of Education
 * - the procedure for exercising the right to inspect & review
 * - the criteria for who qualifies as a "school official" with
 *   "legitimate educational interest" (per §99.31(a)(1)(i)(B))
 *
 * Section ordering follows the Department of Education's model
 * notification template (PTAC FERPA Model Notification of Rights for
 * Elementary and Secondary Schools / Postsecondary Institutions).
 *
 * @example
 * import { ferpaAnnualNotice } from '@crawcus/regulations-ferpa/disclosure-templates';
 *
 * const notice = ferpaAnnualNotice.fill({
 *   institutionName: 'HumanFirst Academy',
 *   institutionType: 'postsecondary',
 *   inspectReviewProcedure:
 *     'Submit a written request to the Registrar identifying the records you wish to inspect.',
 *   amendmentProcedure:
 *     'Write to the Registrar identifying the part of the record you want changed and specify why.',
 *   schoolOfficialDefinition:
 *     'A school official is a person employed by HumanFirst Academy in an administrative, supervisory, academic, research, or support staff position; a contractor, consultant, volunteer, or other party to whom HumanFirst Academy has outsourced institutional services or functions.',
 *   legitimateEducationalInterestDefinition:
 *     'A school official has a legitimate educational interest if the official needs to review an education record in order to fulfil their professional responsibility.',
 * });
 */

export type InstitutionType = 'elementary-secondary' | 'postsecondary';

export interface FerpaAnnualNoticeInput {
  /** Legal name of the educational agency or institution. */
  readonly institutionName: string;
  /**
   * `'elementary-secondary'` triggers parent-or-eligible-student
   * language; `'postsecondary'` triggers student-as-eligible language.
   * Per §99.5(a) eligibility transfers when the student reaches 18 or
   * enrols in a postsecondary institution at any age.
   */
  readonly institutionType: InstitutionType;
  /** Procedure for requesting inspection / review of records. */
  readonly inspectReviewProcedure: string;
  /** Procedure for requesting amendment of records. */
  readonly amendmentProcedure: string;
  /**
   * The institution's published definition of "school official" per
   * §99.31(a)(1)(i)(B). Must be in the notice.
   */
  readonly schoolOfficialDefinition: string;
  /**
   * The institution's published definition of "legitimate educational
   * interest" per §99.31(a)(1)(i)(B). Must be in the notice.
   */
  readonly legitimateEducationalInterestDefinition: string;
  /**
   * Whether the institution discloses directory information per §99.37.
   * When provided, renders a directory-information opt-out section.
   * Optional but recommended.
   */
  readonly directoryInformationCategories?: readonly string[];
  /**
   * Procedure / deadline for opting out of directory-information
   * disclosure. Required if `directoryInformationCategories` set.
   */
  readonly directoryInformationOptOutProcedure?: string;
  /**
   * Effective date of this annual notice (academic year).
   */
  readonly effectiveDate?: string;
}

function assertRequiredString(article: string, fieldPath: string, value: string | undefined): void {
  if (value === undefined || value.length === 0) {
    throw new RequiredSectionMissingError(
      `FERPA ${article}: required field '${fieldPath}' is missing or empty.`,
      article,
      fieldPath,
    );
  }
}

/**
 * Render the FERPA §99.7 annual notice as a structured template.
 *
 * @throws RequiredSectionMissingError when a required field is missing
 *   or fails a structural check (e.g., directory-information
 *   categories declared but opt-out procedure missing).
 */
export function fill(input: FerpaAnnualNoticeInput): DisclosureTemplate {
  const article = '§99.7';
  assertRequiredString(article, 'institutionName', input.institutionName);
  assertRequiredString(article, 'inspectReviewProcedure', input.inspectReviewProcedure);
  assertRequiredString(article, 'amendmentProcedure', input.amendmentProcedure);
  assertRequiredString(article, 'schoolOfficialDefinition', input.schoolOfficialDefinition);
  assertRequiredString(
    article,
    'legitimateEducationalInterestDefinition',
    input.legitimateEducationalInterestDefinition,
  );

  if (
    input.directoryInformationCategories !== undefined &&
    input.directoryInformationCategories.length > 0 &&
    (input.directoryInformationOptOutProcedure === undefined ||
      input.directoryInformationOptOutProcedure.length === 0)
  ) {
    throw new RequiredSectionMissingError(
      `FERPA ${article}: 'directoryInformationOptOutProcedure' required when 'directoryInformationCategories' is set (§99.37(a)(2) opt-out notice).`,
      article,
      'directoryInformationOptOutProcedure',
    );
  }

  const subjectLabel =
    input.institutionType === 'elementary-secondary'
      ? 'parents and eligible students'
      : 'eligible students';

  const sections: DisclosureSection[] = [];

  // §1 Intro
  sections.push({
    heading: '1. Your rights under FERPA',
    paragraphs: [
      `Pursuant to 34 CFR §99.7, ${input.institutionName} provides this annual notification to ${subjectLabel} of their rights under the Family Educational Rights and Privacy Act ("FERPA").`,
    ],
  });

  // §2 Right to inspect and review
  sections.push({
    heading: '2. Right to inspect and review education records',
    paragraphs: [
      `Pursuant to 34 CFR §99.10, you have the right to inspect and review your education records within 45 days after the day ${input.institutionName} receives a request for access.`,
      `Procedure: ${input.inspectReviewProcedure}`,
    ],
  });

  // §3 Right to amendment
  sections.push({
    heading: '3. Right to request amendment of education records',
    paragraphs: [
      `Pursuant to 34 CFR §99.20, you have the right to request the amendment of education records you believe are inaccurate, misleading, or otherwise in violation of your privacy rights under FERPA.`,
      `Procedure: ${input.amendmentProcedure}`,
      `If ${input.institutionName} decides not to amend the record as requested, ${input.institutionName} will notify you in writing of the decision and your right to a hearing per 34 CFR §99.21.`,
    ],
  });

  // §4 Right to consent to disclosures
  sections.push({
    heading: '4. Right to consent to disclosures of personally identifiable information',
    paragraphs: [
      `Pursuant to 34 CFR §99.30, you have the right to consent to disclosures of personally identifiable information contained in your education records, except to the extent that FERPA authorises disclosure without consent under 34 CFR §99.31.`,
      `One exception that permits disclosure without consent is disclosure to school officials with legitimate educational interests.`,
      `School official (as defined by ${input.institutionName}): ${input.schoolOfficialDefinition}`,
      `Legitimate educational interest (as defined by ${input.institutionName}): ${input.legitimateEducationalInterestDefinition}`,
    ],
  });

  // §5 Directory information (if provided)
  if (
    input.directoryInformationCategories !== undefined &&
    input.directoryInformationCategories.length > 0
  ) {
    sections.push({
      heading: '5. Directory information and your right to opt out',
      paragraphs: [
        `Pursuant to 34 CFR §99.37, ${input.institutionName} may disclose without consent the following categories of "directory information":`,
        ...input.directoryInformationCategories.map((c) => `- ${c}`),
        `You may opt out of directory-information disclosure. Procedure: ${input.directoryInformationOptOutProcedure}`,
      ],
    });
  }

  // §6 Right to complain
  sections.push({
    heading: '6. Right to file a complaint with the U.S. Department of Education',
    paragraphs: [
      `Pursuant to 34 CFR §99.63, you have the right to file a complaint with the U.S. Department of Education concerning alleged failures by ${input.institutionName} to comply with the requirements of FERPA.`,
      `Address complaints to: Student Privacy Policy Office, U.S. Department of Education, 400 Maryland Avenue SW, Washington, DC 20202.`,
    ],
  });

  // §7 Effective date (if provided)
  if (input.effectiveDate !== undefined && input.effectiveDate.length > 0) {
    sections.push({
      heading: '7. Effective date',
      paragraphs: [`This annual notice is effective from ${input.effectiveDate}.`],
    });
  }

  return {
    regulation: FERPA_VERSION,
    article,
    title: 'Annual notification of rights under FERPA',
    sections,
  };
}
