import { EU_AI_ACT_VERSION } from '../version.js';
import {
  RequiredSectionMissingError,
  type DisclosureSection,
  type DisclosureTemplate,
} from './types.js';

/**
 * # EU AI Act Article 50 — transparency obligations for providers and deployers
 *
 * Covers the four disclosure / marking obligations:
 *
 * - 50(1) AI-interaction disclosure (provider) — natural persons
 *   informed they are interacting with an AI system
 * - 50(2) synthetic-content marking (provider) — machine-readable
 *   provenance marker on AI-generated audio/image/video/text
 * - 50(3) emotion-recognition / biometric-categorisation (deployer) —
 *   persons exposed informed of the system's operation
 * - 50(4) deepfake disclosure (deployer) — manipulated content
 *   disclosed to natural-person audience
 *
 * Section ordering follows the AI-Act-final-text recitals + Commission
 * implementing-guidance scaffolding: scope-of-system → which
 * obligation is being satisfied (50(1)/(2)/(3)/(4)) → user-facing
 * disclosure text → derogations claimed (if any) → effective-date.
 *
 * @example
 * import { euAiActArt50 } from '@crawcus/regulations-eu-ai-act/disclosure-templates';
 *
 * const notice = euAiActArt50.fill({
 *   providerName: 'HumanFirst Foundation',
 *   deployerName: 'HumanFirst Foundation',
 *   systemDescription: 'AI tutor for adult learners',
 *   obligations: ['art50-1'],
 *   userFacingDisclosure: 'You are interacting with an AI tutor. Responses are generated, not human-authored.',
 * });
 */

export type Art50Obligation = 'art50-1' | 'art50-2' | 'art50-3' | 'art50-4';

export interface EuAiActArt50Input {
  /**
   * Legal name of the provider per Art. 3(3). Required for 50(1)/(2);
   * accepted-empty for deployer-only disclosures.
   */
  readonly providerName: string;
  /**
   * Legal name of the deployer per Art. 3(4). Required for 50(3)/(4);
   * accepted-empty for provider-only disclosures.
   */
  readonly deployerName: string;
  /**
   * Plain-language description of the AI system the disclosure covers.
   */
  readonly systemDescription: string;
  /**
   * Art. 50 sub-clauses the controller is satisfying with this
   * disclosure. At least one required. Multiple clauses commonly
   * apply (e.g., a deepfake-generating chatbot covers 50(1) + 50(4)).
   */
  readonly obligations: readonly Art50Obligation[];
  /**
   * The user-facing disclosure text — what the natural person sees.
   * Required.
   */
  readonly userFacingDisclosure: string;
  /**
   * Machine-readable provenance marker per Art. 50(2) (e.g., C2PA
   * manifest URL). Required when `obligations` includes `'art50-2'`.
   */
  readonly provenanceMarker?: string;
  /**
   * Effective-date the disclosure obligation takes effect (or the
   * date the disclosure is delivered). Optional but recommended.
   */
  readonly effectiveDate?: string;
  /**
   * Derogation claimed under Art. 50(2)/(4) (e.g., 'artistic-work',
   * 'law-enforcement-authorised', 'assistive-editing'). Renders an
   * additional section.
   */
  readonly derogation?: string;
}

const ART50_OBLIGATION_LABELS: Readonly<Record<Art50Obligation, string>> = {
  'art50-1':
    'Article 50(1) — provider obligation to inform natural persons they are interacting with an AI system',
  'art50-2':
    'Article 50(2) — provider obligation to mark synthetic AI-generated audio/image/video/text content in a machine-readable format',
  'art50-3':
    'Article 50(3) — deployer obligation to inform natural persons exposed to an emotion-recognition or biometric-categorisation system',
  'art50-4':
    'Article 50(4) — deployer obligation to disclose AI-generated or manipulated deepfake content',
};

function assertRequiredString(article: string, fieldPath: string, value: string | undefined): void {
  if (value === undefined || value.length === 0) {
    throw new RequiredSectionMissingError(
      `EU AI Act ${article}: required field '${fieldPath}' is missing or empty.`,
      article,
      fieldPath,
    );
  }
}

/**
 * Render the Article 50 disclosure as a structured template.
 *
 * @throws RequiredSectionMissingError when a required field is missing
 *   or fails an obligation-specific structural check (e.g., 50(2) is
 *   declared but no provenance marker is provided).
 */
export function fill(input: EuAiActArt50Input): DisclosureTemplate {
  const article = 'Art. 50';
  assertRequiredString(article, 'systemDescription', input.systemDescription);
  assertRequiredString(article, 'userFacingDisclosure', input.userFacingDisclosure);

  if (input.obligations.length === 0) {
    throw new RequiredSectionMissingError(
      `EU AI Act ${article}: at least one Art. 50 sub-clause required in 'obligations'.`,
      article,
      'obligations',
    );
  }

  // Provider name required when 50(1) or 50(2) is claimed
  if (
    (input.obligations.includes('art50-1') || input.obligations.includes('art50-2')) &&
    (input.providerName === undefined || input.providerName.length === 0)
  ) {
    throw new RequiredSectionMissingError(
      `EU AI Act ${article}: 'providerName' required when obligations include Art. 50(1) or Art. 50(2).`,
      article,
      'providerName',
    );
  }

  // Deployer name required when 50(3) or 50(4) is claimed
  if (
    (input.obligations.includes('art50-3') || input.obligations.includes('art50-4')) &&
    (input.deployerName === undefined || input.deployerName.length === 0)
  ) {
    throw new RequiredSectionMissingError(
      `EU AI Act ${article}: 'deployerName' required when obligations include Art. 50(3) or Art. 50(4).`,
      article,
      'deployerName',
    );
  }

  // 50(2) requires provenance marker
  if (
    input.obligations.includes('art50-2') &&
    (input.provenanceMarker === undefined || input.provenanceMarker.length === 0)
  ) {
    throw new RequiredSectionMissingError(
      `EU AI Act ${article}: 'provenanceMarker' required when obligations include Art. 50(2) (synthetic-content marking).`,
      article,
      'provenanceMarker',
    );
  }

  const sections: DisclosureSection[] = [];

  // §1 System scope
  sections.push({
    heading: '1. The AI system this disclosure covers',
    paragraphs: [
      `Pursuant to EU AI Act Article 50, this disclosure relates to the following AI system: ${input.systemDescription}.`,
      ...(input.providerName.length > 0 ? [`Provider (Art. 3(3)): ${input.providerName}.`] : []),
      ...(input.deployerName.length > 0 ? [`Deployer (Art. 3(4)): ${input.deployerName}.`] : []),
    ],
  });

  // §2 Obligations covered
  sections.push({
    heading: '2. Transparency obligations satisfied',
    paragraphs: [
      `This disclosure satisfies the following EU AI Act Article 50 obligations:`,
      ...input.obligations.map((o) => `- ${ART50_OBLIGATION_LABELS[o]}`),
    ],
  });

  // §3 User-facing disclosure
  sections.push({
    heading: '3. Disclosure to natural persons',
    paragraphs: [
      `Pursuant to EU AI Act Article 50, the following information is disclosed to natural persons interacting with or exposed to the system:`,
      input.userFacingDisclosure,
    ],
  });

  // §4 Provenance marker (if 50(2))
  if (input.provenanceMarker !== undefined && input.provenanceMarker.length > 0) {
    sections.push({
      heading: '4. Machine-readable provenance marker',
      paragraphs: [
        `Pursuant to EU AI Act Article 50(2), the synthetic content carries the following machine-readable provenance marker: ${input.provenanceMarker}.`,
      ],
    });
  }

  // §5 Derogation (if claimed)
  if (input.derogation !== undefined && input.derogation.length > 0) {
    sections.push({
      heading: '5. Derogation claimed',
      paragraphs: [
        `Pursuant to EU AI Act Article 50, the following derogation is claimed: ${input.derogation}. The basis for this derogation is recorded in the controller's AI-Act risk register.`,
      ],
    });
  }

  // §6 Effective date (if provided)
  if (input.effectiveDate !== undefined && input.effectiveDate.length > 0) {
    sections.push({
      heading: '6. Effective date',
      paragraphs: [`This disclosure is effective from ${input.effectiveDate}.`],
    });
  }

  return {
    regulation: EU_AI_ACT_VERSION,
    article,
    title: 'Transparency obligations for providers and deployers of certain AI systems',
    sections,
  };
}
