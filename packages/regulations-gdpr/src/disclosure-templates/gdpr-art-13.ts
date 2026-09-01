import { GDPR_VERSION } from '../version.js';
import {
  isIsoDuration,
  RequiredSectionMissingError,
  type DataSubjectRight,
  type DisclosureSection,
  type DisclosureTemplate,
  type IsoDuration,
  type LawfulBasis,
  type RecipientEntry,
} from './types.js';

/**
 * # GDPR Article 13 — information to be provided where personal data
 * are collected from the data subject
 *
 * Section ordering follows the ICO at-collection checklist + EDPB
 * Guidelines 05/2020 on Transparency: identity & contacts → purposes &
 * lawful basis → recipients → transfers → retention → rights →
 * complaints → automated decision-making → data-quality consequences.
 *
 * **Reference example shape from HF feedback 2026-06-02 line 71-84**:
 *
 * @example
 * import { gdprArt13 } from '@crawcus/regulations-gdpr/disclosure-templates';
 *
 * const notice = gdprArt13.fill({
 *   controllerName: 'HumanFirst Foundation',
 *   controllerContact: 'dpo@humanfirstfoundation.com',
 *   purposes: ['adult-learner-enrolment', 'ai-mediated-tutoring'],
 *   legalBasis: {
 *     'adult-learner-enrolment': 'contract',
 *     'ai-mediated-tutoring': 'contract',
 *   },
 *   retentions: { default: 'P7Y', specialCategory: 'P3Y' },
 *   recipients: [{ label: 'Anthropic', classification: 'sub-processor', country: 'EU' }],
 *   rights: gdprArt13.standardDataSubjectRights(),
 *   supervisoryAuthority: 'Information Commissioner\'s Office (UK)',
 * });
 */

export interface GdprArt13Input {
  /** Legal name of the data controller per Art. 13(1)(a). */
  readonly controllerName: string;
  /** Contact details for the controller (email / postal). Art. 13(1)(a). */
  readonly controllerContact: string;
  /** DPO contact if appointed. Art. 13(1)(b). Optional. */
  readonly dpoContact?: string;
  /**
   * Processing purposes the controller is disclosing. At least one
   * required. Art. 13(1)(c).
   */
  readonly purposes: readonly string[];
  /**
   * Per-purpose lawful basis. Every entry in `purposes` MUST have a
   * basis declared. Art. 13(1)(c) + Art. 6(1).
   */
  readonly legalBasis: Readonly<Record<string, LawfulBasis>>;
  /**
   * Retention periods. `default` is the headline retention; named
   * categories (e.g., `specialCategory`, `financialRecords`) can be
   * declared as additional ISO 8601 durations. Art. 13(2)(a).
   */
  readonly retentions: { readonly default: IsoDuration } & Readonly<
    Record<string, IsoDuration | undefined>
  >;
  /**
   * Recipients or categories of recipients. Art. 13(1)(e). Can be
   * empty if no third-party recipients (the filler renders a "no
   * disclosure" paragraph).
   */
  readonly recipients: readonly RecipientEntry[];
  /**
   * Rights the data subject can exercise. Defaults to
   * {@link standardDataSubjectRights} if omitted, but explicit
   * declaration is recommended for audit clarity.
   */
  readonly rights: readonly DataSubjectRight[];
  /**
   * Supervisory-authority name + (optional) URL. Art. 13(2)(d).
   * Required because every disclosure must name a complaint channel.
   */
  readonly supervisoryAuthority: string;
  /**
   * Indicates whether provision of the data is a statutory or
   * contractual requirement, and consequences of non-provision.
   * Art. 13(2)(e). Optional but recommended.
   */
  readonly dataProvisionRequirement?: string;
  /**
   * Existence of automated decision-making (including profiling) and
   * meaningful information about the logic. Art. 13(2)(f). When
   * present, renders a dedicated section; pair with `gdprArt22.fill`
   * for the Art. 22 explanation.
   */
  readonly automatedDecisionMaking?: string;
}

/**
 * Canonical 7-right list per GDPR Articles 15-22. Stable identifiers
 * + ICO-aligned descriptions. Controllers can pass this as-is or
 * append additional rights (e.g., for sector-specific extensions).
 */
export function standardDataSubjectRights(): readonly DataSubjectRight[] {
  return [
    {
      id: 'access',
      name: 'Right of access',
      description:
        'You have the right to confirm whether we process your personal data and obtain a copy of that data and information about how we use it.',
      article: 'Art. 15',
    },
    {
      id: 'rectification',
      name: 'Right to rectification',
      description:
        'You have the right to have inaccurate personal data corrected and incomplete personal data completed.',
      article: 'Art. 16',
    },
    {
      id: 'erasure',
      name: 'Right to erasure (right to be forgotten)',
      description:
        'You have the right to ask us to delete your personal data in the circumstances set out in Article 17.',
      article: 'Art. 17',
    },
    {
      id: 'restriction',
      name: 'Right to restriction of processing',
      description:
        'You have the right to ask us to suspend processing of your personal data in the circumstances set out in Article 18.',
      article: 'Art. 18',
    },
    {
      id: 'portability',
      name: 'Right to data portability',
      description:
        'Where processing is based on consent or contract and carried out by automated means, you have the right to receive your personal data in a structured, commonly used, machine-readable format.',
      article: 'Art. 20',
    },
    {
      id: 'object',
      name: 'Right to object',
      description:
        'You have the right to object to processing carried out on the basis of legitimate interests, public task, or for direct marketing purposes.',
      article: 'Art. 21',
    },
    {
      id: 'automated-decision',
      name: 'Rights related to automated decision-making',
      description:
        'You have the right not to be subject to a decision based solely on automated processing — including profiling — that produces legal effects concerning you or similarly significantly affects you, subject to the exceptions in Article 22(2).',
      article: 'Art. 22',
    },
  ];
}

function assertRequiredString(article: string, fieldPath: string, value: string | undefined): void {
  if (value === undefined || value.length === 0) {
    throw new RequiredSectionMissingError(
      `GDPR ${article}: required field '${fieldPath}' is missing or empty.`,
      article,
      fieldPath,
    );
  }
}

function validateRetentions(article: string, retentions: GdprArt13Input['retentions']): void {
  for (const [key, value] of Object.entries(retentions)) {
    if (value === undefined) continue;
    if (!isIsoDuration(value)) {
      throw new RequiredSectionMissingError(
        `GDPR ${article}: retention '${key}' must be a valid ISO 8601 duration (got '${value}').`,
        article,
        `retentions.${key}`,
      );
    }
  }
}

function validateLegalBasis(
  article: string,
  purposes: readonly string[],
  legalBasis: Readonly<Record<string, LawfulBasis>>,
): void {
  for (const purpose of purposes) {
    if (legalBasis[purpose] === undefined) {
      throw new RequiredSectionMissingError(
        `GDPR ${article}: purpose '${purpose}' has no lawful basis declared in 'legalBasis'.`,
        article,
        `legalBasis.${purpose}`,
      );
    }
  }
}

/**
 * Render the Article 13 disclosure as a structured template. Sections
 * are ordered per the ICO checklist + EDPB Guidelines 05/2020.
 *
 * @throws RequiredSectionMissingError when a required field is missing
 *   or fails an Article-specific structural check (e.g., a purpose has
 *   no lawful basis declared; a retention is not a valid ISO duration).
 */
export function fill(input: GdprArt13Input): DisclosureTemplate {
  const article = 'Art. 13';
  assertRequiredString(article, 'controllerName', input.controllerName);
  assertRequiredString(article, 'controllerContact', input.controllerContact);
  if (input.purposes.length === 0) {
    throw new RequiredSectionMissingError(
      `GDPR ${article}: at least one processing purpose required.`,
      article,
      'purposes',
    );
  }
  validateLegalBasis(article, input.purposes, input.legalBasis);
  validateRetentions(article, input.retentions);
  if (input.rights.length === 0) {
    throw new RequiredSectionMissingError(
      `GDPR ${article}: at least one data-subject right required; use standardDataSubjectRights() for the canonical list.`,
      article,
      'rights',
    );
  }
  assertRequiredString(article, 'supervisoryAuthority', input.supervisoryAuthority);

  const sections: DisclosureSection[] = [];

  // §1 Controller identity
  sections.push({
    heading: '1. Who we are',
    paragraphs: [
      `Pursuant to GDPR Article 13(1)(a), the controller of your personal data is ${input.controllerName}. You can contact us at ${input.controllerContact}.`,
      ...(input.dpoContact
        ? [
            `Our Data Protection Officer can be contacted at ${input.dpoContact} (Article 13(1)(b)).`,
          ]
        : []),
    ],
  });

  // §2 Purposes & lawful basis
  sections.push({
    heading: '2. Why we process your data and on what legal basis',
    paragraphs: [
      `Pursuant to GDPR Article 13(1)(c), we process your personal data for the following purposes, each relying on the lawful basis indicated in brackets:`,
      ...input.purposes.map((p) => `- ${p} (${input.legalBasis[p] ?? 'unspecified'})`),
    ],
  });

  // §3 Recipients
  sections.push({
    heading: '3. Who receives your data',
    paragraphs:
      input.recipients.length === 0
        ? [
            `Pursuant to GDPR Article 13(1)(e), we do not currently share your personal data with any third-party recipients beyond the controller.`,
          ]
        : [
            `Pursuant to GDPR Article 13(1)(e), we share your personal data with the following recipients or categories of recipients:`,
            ...input.recipients.map((r) =>
              r.country
                ? `- ${r.label} (${r.classification}, ${r.country})`
                : `- ${r.label} (${r.classification})`,
            ),
          ],
  });

  // §4 Retention
  const retentionLines: string[] = [`- Default retention: ${input.retentions.default}`];
  for (const [key, value] of Object.entries(input.retentions)) {
    if (key === 'default' || value === undefined) continue;
    retentionLines.push(`- ${key}: ${value}`);
  }
  sections.push({
    heading: '4. How long we keep your data',
    paragraphs: [
      `Pursuant to GDPR Article 13(2)(a), the periods for which your personal data will be stored, or — if that is not possible — the criteria used to determine that period, are:`,
      ...retentionLines,
    ],
  });

  // §5 Rights
  sections.push({
    heading: '5. Your rights',
    paragraphs: [
      `Pursuant to GDPR Article 13(2)(b), you have the following rights in respect of your personal data:`,
      ...input.rights.map((r) => `- ${r.name} (${r.article}): ${r.description}`),
    ],
  });

  // §6 Supervisory authority
  sections.push({
    heading: '6. Right to lodge a complaint',
    paragraphs: [
      `Pursuant to GDPR Article 13(2)(d), you have the right to lodge a complaint with a supervisory authority. The relevant authority is: ${input.supervisoryAuthority}.`,
    ],
  });

  // §7 Statutory / contractual requirement (optional)
  if (input.dataProvisionRequirement !== undefined && input.dataProvisionRequirement.length > 0) {
    sections.push({
      heading: '7. Whether you are required to provide your data',
      paragraphs: [`Pursuant to GDPR Article 13(2)(e): ${input.dataProvisionRequirement}`],
    });
  }

  // §8 Automated decision-making (optional)
  if (input.automatedDecisionMaking !== undefined && input.automatedDecisionMaking.length > 0) {
    sections.push({
      heading: '8. Automated decision-making',
      paragraphs: [`Pursuant to GDPR Article 13(2)(f): ${input.automatedDecisionMaking}`],
    });
  }

  return {
    regulation: GDPR_VERSION,
    article,
    title: 'Information to be provided where personal data are collected from the data subject',
    sections,
  };
}
