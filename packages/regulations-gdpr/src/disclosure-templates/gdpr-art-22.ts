import { GDPR_VERSION } from '../version.js';
import {
  RequiredSectionMissingError,
  type DisclosureSection,
  type DisclosureTemplate,
} from './types.js';

/**
 * # GDPR Article 22 — automated individual decision-making, including profiling
 *
 * Section ordering follows the ICO Automated Decision-Making + Profiling
 * guidance + WP251rev.01: scope → logic explanation → significance &
 * envisaged consequences → safeguards (human intervention / view /
 * contest) → lawful-basis grounding → special-category note (if
 * applicable).
 *
 * **Pair with `gdprArt13.fill`** — Art. 13(2)(f) requires a short
 * statement that automated decision-making exists; Art. 22 then
 * requires the substantive explanation. Both sit on the same intent.
 *
 * @example
 * import { gdprArt22 } from '@crawcus/regulations-gdpr/disclosure-templates';
 *
 * const notice = gdprArt22.fill({
 *   decisionDescription: 'Adult-learner course-track recommendation',
 *   logicSummary:
 *     'Our recommender ranks course tracks by matching your stated goals + prior attainment against ~12,000 anonymised outcomes from past learners.',
 *   significance:
 *     'The recommendation is a suggestion only; you can accept, modify, or ignore it. It does not affect your enrolment status.',
 *   envisagedConsequences:
 *     'If accepted, the recommendation pre-fills your enrolment form. You can change any field.',
 *   art22Basis: 'explicit-consent',
 *   humanInterventionContact: 'learner-support@humanfirstfoundation.com',
 * });
 */

export type Art22Basis = 'contract-necessity' | 'union-or-member-state-law' | 'explicit-consent';

export interface GdprArt22Input {
  /** Short label for the decision (e.g., 'Credit eligibility check'). */
  readonly decisionDescription: string;
  /**
   * Meaningful information about the logic involved, in plain
   * language — per Art. 22(3) + Art. 15(1)(h). NOT a model-card; a
   * data-subject-comprehensible explanation.
   */
  readonly logicSummary: string;
  /**
   * The significance of the processing for the data subject — what
   * the decision means in practice.
   */
  readonly significance: string;
  /**
   * Envisaged consequences of the processing — what happens after the
   * automated decision.
   */
  readonly envisagedConsequences: string;
  /**
   * Lawful basis under Art. 22(2) for permitting the solely-automated
   * decision. Required.
   */
  readonly art22Basis: Art22Basis;
  /**
   * Contact / channel for exercising the Art. 22(3) right to human
   * intervention, express a view, and contest the decision. Required.
   */
  readonly humanInterventionContact: string;
  /**
   * If the decision processes special-category data per Art. 9, the
   * Art. 9(2) exemption invoked (typically `'art9-2-a'` or
   * `'art9-2-g'`). Triggers an additional section per Art. 22(4).
   */
  readonly art9Exemption?: 'art9-2-a' | 'art9-2-g';
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

const ART22_BASIS_LABELS: Readonly<Record<Art22Basis, string>> = {
  'contract-necessity':
    'necessity for entering into or performing a contract with you (Art. 22(2)(a))',
  'union-or-member-state-law': 'authorisation under Union or Member State law (Art. 22(2)(b))',
  'explicit-consent': 'your explicit consent (Art. 22(2)(c))',
};

/**
 * Render the Article 22 explanation as a structured template.
 *
 * @throws RequiredSectionMissingError when a required field is missing.
 */
export function fill(input: GdprArt22Input): DisclosureTemplate {
  const article = 'Art. 22';
  assertRequiredString(article, 'decisionDescription', input.decisionDescription);
  assertRequiredString(article, 'logicSummary', input.logicSummary);
  assertRequiredString(article, 'significance', input.significance);
  assertRequiredString(article, 'envisagedConsequences', input.envisagedConsequences);
  assertRequiredString(article, 'humanInterventionContact', input.humanInterventionContact);

  const sections: DisclosureSection[] = [];

  // §1 Scope
  sections.push({
    heading: '1. The automated decision-making process',
    paragraphs: [
      `Pursuant to GDPR Article 22(1), we inform you that the following process involves a decision based solely on automated processing, including profiling: ${input.decisionDescription}.`,
    ],
  });

  // §2 Logic explanation
  sections.push({
    heading: '2. The logic involved',
    paragraphs: [
      `Pursuant to GDPR Article 22(3) read with Article 15(1)(h), we provide the following meaningful information about the logic involved in the decision:`,
      input.logicSummary,
    ],
  });

  // §3 Significance & consequences
  sections.push({
    heading: '3. Significance and envisaged consequences',
    paragraphs: [
      `Pursuant to GDPR Article 22(3) read with Article 15(1)(h): ${input.significance}`,
      `Envisaged consequences: ${input.envisagedConsequences}`,
    ],
  });

  // §4 Lawful basis under Art. 22(2)
  sections.push({
    heading: '4. Lawful basis for the automated decision',
    paragraphs: [
      `Pursuant to GDPR Article 22(2), we rely on the following basis to permit a solely-automated decision: ${ART22_BASIS_LABELS[input.art22Basis]}.`,
    ],
  });

  // §5 Safeguards (Art. 22(3))
  sections.push({
    heading:
      '5. Your right to human intervention, to express your view, and to contest the decision',
    paragraphs: [
      `Pursuant to GDPR Article 22(3), you have the right to obtain human intervention on the part of the controller, to express your point of view, and to contest the decision.`,
      `To exercise these rights, contact: ${input.humanInterventionContact}.`,
    ],
  });

  // §6 Special-category note (if applicable)
  if (input.art9Exemption !== undefined) {
    const exemptionLabel =
      input.art9Exemption === 'art9-2-a'
        ? 'your explicit consent (Article 9(2)(a))'
        : 'reasons of substantial public interest (Article 9(2)(g))';
    sections.push({
      heading: '6. Processing of special-category data',
      paragraphs: [
        `Pursuant to GDPR Article 22(4), this automated decision is based on special-category personal data referred to in Article 9(1). The exemption permitting this processing is ${exemptionLabel}, accompanied by suitable measures to safeguard your rights and freedoms.`,
      ],
    });
  }

  return {
    regulation: GDPR_VERSION,
    article,
    title: 'Automated individual decision-making, including profiling',
    sections,
  };
}
