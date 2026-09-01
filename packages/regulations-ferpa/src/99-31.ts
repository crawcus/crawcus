import { defineContract, type Contract } from '@crawcus/core';
import { FERPA_VERSION } from './version.js';

/**
 * FERPA §99.31 — Conditions for disclosure of personally identifiable
 * information without consent.
 *
 * The default rule is that an educational agency or institution must
 * have **written consent** from the parent or eligible student before
 * disclosing personally identifiable information from a student's
 * education records (34 CFR §99.30). §99.31 enumerates the
 * exceptions; this Contract enforces the consent-or-exception
 * requirement at the runtime layer.
 *
 * Tallyseal's v0.0.1 implementation enforces the **consent path** only;
 * customers using §99.31 exceptions (e.g., legitimate educational
 * interest, audit/evaluation, judicial order) should declare them via
 * a `derogations` entry on the CrawcusSpec rather than removing this
 * Contract.
 *
 * @example
 * import { disclosureConsent } from '@crawcus/regulations-ferpa';
 *
 * defineCrawcusSpec({
 *   key: 'ShareTranscript',
 *   contracts: {
 *     invariants: [
 *       disclosureConsent({
 *         consentField: 'studentConsentEventId',
 *         disclosurePurpose: 'transcript-release',
 *       }),
 *     ],
 *   },
 * });
 */
export interface DisclosureConsentOptions {
  /**
   * Snapshot field carrying the written-consent event reference for
   * this disclosure. Customer is responsible for populating this via
   * a separate `ConsentGranted` event.
   */
  readonly consentField: string;
  /**
   * Purpose tag used by `ConsentGranted` events for this disclosure.
   * The Contract passes if a non-revoked `ConsentGranted` event with
   * this purpose exists on the intent's event log.
   */
  readonly disclosurePurpose: string;
}

export function disclosureConsent(opts: DisclosureConsentOptions): Contract {
  return defineContract({
    id: 'ferpa.99-31.disclosureConsent',
    description: {
      en: `FERPA §99.30 default: written consent required before disclosing personally identifiable education-record information. Reference event in '${opts.consentField}' or grant consent for purpose '${opts.disclosurePurpose}'. Exceptions per §99.31 require explicit derogation.`,
    },
    citation: {
      regulation: FERPA_VERSION,
      article: '§99.31',
      url: 'https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31',
    },
    predicate: ({ has, consentFor }) => {
      if (has(opts.consentField)) return true;
      // Coerce string -> Purpose brand at use site (helpers don't carry the brand).
      return consentFor(opts.disclosurePurpose as never);
    },
    severity: 'block',
  });
}

/**
 * FERPA §99.31(a)(1)(i)(A) — disclosure to **school officials** with
 * **legitimate educational interest** in the records.
 *
 * Pairs with {@link legitimateEducationalInterest}. Each enforces one
 * half of the two-part §99.31(a)(1) test; use both together to enforce
 * the full compound requirement at the runtime layer, or use one
 * independently if the other half is already enforced by upstream
 * access controls.
 *
 * The institution's published FERPA notice must enumerate which role
 * categories qualify as "school officials" (typically: teachers /
 * registrar / counselor / admin / principal / department-chair /
 * IT-systems-administrator / contracted-third-party-acting-as-official).
 * This Contract takes that enumeration as a `schoolOfficialRoles` set
 * and checks the accessing actor's role at runtime.
 *
 * **Fail-loud philosophy** — unlike {@link disclosureConsent}'s
 * permissive path (consent OR event), §99.31 exceptions are
 * affirmative claims the institution is invoking. If the
 * `actorRoleField` isn't populated OR the role isn't in the allowed
 * set, the Contract fails — there's no "deferred data quality" path
 * because the audit bundle needs a positive record of which exception
 * was invoked.
 *
 * @example
 * import { schoolOfficial, legitimateEducationalInterest } from '@crawcus/regulations-ferpa';
 *
 * defineCrawcusSpec({
 *   key: 'ViewTranscript',
 *   contracts: {
 *     invariants: [
 *       schoolOfficial({
 *         actorRoleField: 'accessorRole',
 *         schoolOfficialRoles: ['teacher', 'registrar', 'counselor', 'admin'],
 *       }),
 *       legitimateEducationalInterest({
 *         justificationField: 'accessJustification',
 *         legitimatePurposes: ['academic-advising', 'grade-entry', 'transcript-evaluation'],
 *       }),
 *     ],
 *   },
 * });
 */
export interface SchoolOfficialOptions {
  /**
   * Snapshot field carrying the accessing actor's role identifier
   * (a string drawn from the institution's role taxonomy).
   */
  readonly actorRoleField: string;
  /**
   * Role identifiers the institution has determined qualify as "school
   * officials" per its published FERPA notice (§99.31(a)(1)(i)(B)
   * delegates this enumeration to the institution). Common values:
   * `'teacher'`, `'registrar'`, `'counselor'`, `'admin'`, `'principal'`,
   * `'department-chair'`. Pure-string set; the institution controls
   * which roles map.
   */
  readonly schoolOfficialRoles: readonly string[];
}

export function schoolOfficial(opts: SchoolOfficialOptions): Contract {
  return defineContract({
    id: 'ferpa.99-31.schoolOfficial',
    description: {
      en: `FERPA §99.31(a)(1)(i)(B) exception: the accessor's role in '${opts.actorRoleField}' must be one of the institution's published school-official roles (${opts.schoolOfficialRoles.join(', ')}).`,
    },
    citation: {
      regulation: FERPA_VERSION,
      article: '§99.31(a)(1)(i)(B)',
      url: 'https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31',
    },
    predicate: ({ value }) => {
      const role = value<string>(opts.actorRoleField);
      if (role === undefined) return false;
      return opts.schoolOfficialRoles.includes(role);
    },
    severity: 'block',
  });
}

/**
 * FERPA §99.31(a)(1)(i)(A) — disclosure for **legitimate educational
 * interest**, the second half of the §99.31(a)(1) school-official
 * exception.
 *
 * Pairs with {@link schoolOfficial}. The institution's published FERPA
 * notice must enumerate which access justifications constitute
 * "legitimate educational interest" (typically: academic-advising /
 * grade-entry / transcript-evaluation / disciplinary-review /
 * accommodations-determination / financial-aid-processing). This
 * Contract takes that enumeration as a `legitimatePurposes` set and
 * checks the access-justification recorded for this specific
 * disclosure.
 *
 * **Fail-loud philosophy** — see {@link schoolOfficial}. If the
 * `justificationField` isn't populated OR the justification isn't in
 * the allowed set, the Contract fails. The institution's audit bundle
 * needs a positive record of *which* legitimate-educational-interest
 * was invoked.
 *
 * @see {@link schoolOfficial} for the role-half of the compound check.
 */
export interface LegitimateEducationalInterestOptions {
  /**
   * Snapshot field carrying the access justification string for this
   * specific disclosure. The institution's policy enumerates which
   * justifications qualify.
   */
  readonly justificationField: string;
  /**
   * Justification strings the institution has determined constitute
   * "legitimate educational interest" per §99.31(a)(1)(i)(A). Common
   * values: `'academic-advising'`, `'grade-entry'`,
   * `'transcript-evaluation'`, `'disciplinary-review'`,
   * `'accommodations-determination'`, `'financial-aid-processing'`.
   */
  readonly legitimatePurposes: readonly string[];
}

export function legitimateEducationalInterest(
  opts: LegitimateEducationalInterestOptions,
): Contract {
  return defineContract({
    id: 'ferpa.99-31.legitimateEducationalInterest',
    description: {
      en: `FERPA §99.31(a)(1)(i)(A) exception: the access justification in '${opts.justificationField}' must be one of the institution's published legitimate-educational-interest purposes (${opts.legitimatePurposes.join(', ')}).`,
    },
    citation: {
      regulation: FERPA_VERSION,
      article: '§99.31(a)(1)(i)(A)',
      url: 'https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31',
    },
    predicate: ({ value }) => {
      const justification = value<string>(opts.justificationField);
      if (justification === undefined) return false;
      return opts.legitimatePurposes.includes(justification);
    },
    severity: 'block',
  });
}

/**
 * FERPA §99.31(a)(1)(ii) — disclosure to **authorised representatives**
 * of the Comptroller General, the Secretary, State or local educational
 * authorities, or institutional authorised representatives, for
 * **audit / evaluation / compliance / accreditation** purposes
 * connected to a Federal- or State-supported education program.
 *
 * This exception is *compound*: the statute requires BOTH (a) the
 * recipient be one of the enumerated authorities (or an authorised
 * representative thereof) AND (b) the disclosure purpose be one of
 * the enumerated purposes (audit, evaluation, compliance,
 * accreditation). A school official handing transcripts to a state
 * agency for an unrelated reason is *not* covered; nor is an audit
 * by a body the institution has never recognised as an authorised
 * authority. We enforce both halves at the runtime layer.
 *
 * **Fail-loud philosophy** — see {@link schoolOfficial}. Either half
 * missing or out-of-set fails the Contract: the audit bundle needs a
 * positive record of which authority invoked the exception and for
 * which audit-eligible purpose.
 *
 * @example
 * import { auditEvaluation } from '@crawcus/regulations-ferpa';
 *
 * defineCrawcusSpec({
 *   key: 'DiscloseToAuditor',
 *   contracts: {
 *     invariants: [
 *       auditEvaluation({
 *         authorityField: 'requestingAuthority',
 *         recognisedAuthorities: [
 *           'Comptroller General',
 *           'Secretary of Education',
 *           'State Education Agency',
 *           'Local Education Agency',
 *           'authorised representatives',
 *         ],
 *         purposeField: 'disclosurePurpose',
 *         recognisedPurposes: [
 *           'state-audit',
 *           'federal-evaluation',
 *           'compliance-review',
 *           'accreditation-review',
 *         ],
 *       }),
 *     ],
 *   },
 * });
 */
export interface AuditEvaluationOptions {
  /**
   * Snapshot field carrying the requesting authority's identifier
   * (a string drawn from the institution's recognised-authorities
   * taxonomy).
   */
  readonly authorityField: string;
  /**
   * Authority identifiers the institution has determined qualify
   * under §99.31(a)(1)(ii). The statute enumerates four classes:
   * Comptroller General, Secretary of Education, State/Local
   * educational authorities, and authorised representatives of any
   * of the above. The institution's policy fixes the exact strings.
   */
  readonly recognisedAuthorities: readonly string[];
  /**
   * Snapshot field carrying the audit/evaluation/compliance/
   * accreditation purpose declaration for this specific disclosure.
   */
  readonly purposeField: string;
  /**
   * Purpose identifiers the institution has determined qualify under
   * §99.31(a)(1)(ii). The statute scopes purposes to audit,
   * evaluation, compliance, and accreditation in connection with a
   * Federal- or State-supported education program; the institution's
   * policy fixes the exact strings.
   */
  readonly recognisedPurposes: readonly string[];
}

export function auditEvaluation(opts: AuditEvaluationOptions): Contract {
  return defineContract({
    id: 'ferpa.99-31.auditEvaluation',
    description: {
      en: `FERPA §99.31(a)(1)(ii) exception: the requesting authority in '${opts.authorityField}' must be one of (${opts.recognisedAuthorities.join(', ')}) AND the purpose in '${opts.purposeField}' must be one of (${opts.recognisedPurposes.join(', ')}). Both halves required — audit/evaluation/compliance/accreditation exception is a compound check.`,
    },
    citation: {
      regulation: FERPA_VERSION,
      article: '§99.31(a)(1)(ii)',
      url: 'https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31',
    },
    predicate: ({ value }) => {
      const authority = value<string>(opts.authorityField);
      if (authority === undefined || authority.length === 0) return false;
      if (!opts.recognisedAuthorities.includes(authority)) return false;
      const purpose = value<string>(opts.purposeField);
      if (purpose === undefined || purpose.length === 0) return false;
      return opts.recognisedPurposes.includes(purpose);
    },
    severity: 'block',
  });
}

/**
 * FERPA §99.31(a)(6) — disclosure to **organisations conducting
 * studies for, or on behalf of, educational agencies or institutions**
 * to (A) develop, validate, or administer predictive tests; (B)
 * administer student aid programs; or (C) improve instruction.
 *
 * The statute imposes a *written-agreement* precondition at
 * §99.31(a)(6)(iii): the institution and the research organisation
 * must execute an agreement that (i) specifies the study's purpose,
 * scope, and duration; (ii) limits PII access to those with a
 * legitimate interest; and (iii) requires destruction of PII when no
 * longer needed for the study. This Contract verifies that a
 * reference to such an agreement exists on the snapshot; the
 * agreement's actual *content* is validated by `Disclosure` records
 * (per the institution's policy).
 *
 * The optional `dataDestructionTimelineField` lets institutions
 * enforce that a runtime declaration of the post-study destruction
 * commitment is present on the snapshot — useful when the operator
 * tracks the destruction timeline alongside the agreement reference
 * rather than only inside the agreement text. Configuring this field
 * makes its presence required.
 *
 * **Fail-loud philosophy** — see {@link schoolOfficial}. Missing or
 * out-of-set study-purpose fails; missing written-agreement reference
 * fails; if configured, missing data-destruction-timeline fails. The
 * audit bundle needs a positive record of the research-exception
 * invocation AND the agreement that authorises it.
 *
 * @example
 * import { researchException } from '@crawcus/regulations-ferpa';
 *
 * defineCrawcusSpec({
 *   key: 'DiscloseToResearchPartner',
 *   contracts: {
 *     invariants: [
 *       researchException({
 *         studyPurposeField: 'studyPurpose',
 *         writtenAgreementField: 'researchAgreementId',
 *         dataDestructionTimelineField: 'destructionCommitment',
 *       }),
 *     ],
 *   },
 * });
 */
export interface ResearchExceptionOptions {
  /**
   * Snapshot field carrying the study's purpose declaration. Must
   * match one of {@link ResearchExceptionOptions.recognisedStudyPurposes}.
   */
  readonly studyPurposeField: string;
  /**
   * Study purposes recognised under §99.31(a)(6). Defaults to the
   * three enumerated statutory categories: predictive-test
   * development / validation / administration, student-aid program
   * administration, and instruction improvement. Institutions may
   * extend this list where state law allows.
   */
  readonly recognisedStudyPurposes?: readonly string[];
  /**
   * Snapshot field carrying the reference to the written agreement
   * required by §99.31(a)(6)(iii). The Contract verifies the
   * reference exists; the agreement's contents (purpose, scope,
   * duration, PII access limits, destruction timeline) are validated
   * by `Disclosure` records out-of-band.
   */
  readonly writtenAgreementField: string;
  /**
   * Optional snapshot field carrying a declaration of the post-study
   * PII-destruction commitment (per §99.31(a)(6)(iii)(C)). When
   * configured, its presence on the snapshot is required.
   */
  readonly dataDestructionTimelineField?: string;
}

/**
 * Default study-purpose set per §99.31(a)(6)(i)(A)-(C). Exported so
 * institutions can extend the default rather than re-typing the
 * statutory list.
 */
export const DEFAULT_RESEARCH_STUDY_PURPOSES: readonly string[] = [
  'develop-predictive-tests',
  'validate-predictive-tests',
  'administer-predictive-tests',
  'administer-student-aid',
  'improve-instruction',
];

export function researchException(opts: ResearchExceptionOptions): Contract {
  const recognisedStudyPurposes = opts.recognisedStudyPurposes ?? DEFAULT_RESEARCH_STUDY_PURPOSES;
  return defineContract({
    id: 'ferpa.99-31.researchException',
    description: {
      en: `FERPA §99.31(a)(6) exception: the study purpose in '${opts.studyPurposeField}' must be one of (${recognisedStudyPurposes.join(', ')}) AND a written-agreement reference must be present in '${opts.writtenAgreementField}' per §99.31(a)(6)(iii)${opts.dataDestructionTimelineField ? ` AND a data-destruction-timeline declaration must be present in '${opts.dataDestructionTimelineField}' per §99.31(a)(6)(iii)(C)` : ''}.`,
    },
    citation: {
      regulation: FERPA_VERSION,
      article: '§99.31(a)(6)',
      url: 'https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31',
    },
    predicate: ({ value, has }) => {
      const studyPurpose = value<string>(opts.studyPurposeField);
      if (studyPurpose === undefined || studyPurpose.length === 0) return false;
      if (!recognisedStudyPurposes.includes(studyPurpose)) return false;
      const agreement = value<string>(opts.writtenAgreementField);
      if (agreement === undefined || agreement.length === 0) return false;
      if (opts.dataDestructionTimelineField !== undefined) {
        if (!has(opts.dataDestructionTimelineField)) return false;
        const destruction = value<string>(opts.dataDestructionTimelineField);
        if (destruction !== undefined && destruction.length === 0) return false;
      }
      return true;
    },
    severity: 'block',
  });
}
