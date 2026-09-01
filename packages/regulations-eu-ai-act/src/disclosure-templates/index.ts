/**
 * # @crawcus/regulations-eu-ai-act/disclosure-templates
 *
 * Typed disclosure boilerplate skeletons for EU AI Act Article 50
 * transparency obligations. Sourced from HF feedback 2026-06-02 item 4
 * + IDEA-011 → TKT-DISCLOSURE-TEMPLATES.
 *
 * One namespace shipped:
 * - {@link euAiActArt50} — Article 50 transparency disclosure covering
 *   50(1) AI-interaction, 50(2) synthetic-content marking,
 *   50(3) emotion-recognition / biometric-categorisation, and
 *   50(4) deepfake. Controller declares which obligations apply via
 *   the `obligations` array; the filler renders the appropriate
 *   sections and enforces obligation-specific required fields.
 *
 * Pairs with the Art. 50 Contract factories in the parent pack
 * (`aiInteractionDisclosure`, `syntheticContentMarker`,
 * `emotionRecognitionDisclosure`, `deepFakeDisclosure`) which run at
 * intent-evaluation time.
 *
 * @example
 * import { euAiActArt50 } from '@crawcus/regulations-eu-ai-act/disclosure-templates';
 *
 * const notice = euAiActArt50.fill({
 *   providerName: 'HumanFirst Foundation',
 *   deployerName: 'HumanFirst Foundation',
 *   systemDescription: 'AI tutor for adult learners',
 *   obligations: ['art50-1'],
 *   userFacingDisclosure:
 *     'You are interacting with an AI tutor. Responses are generated, not human-authored.',
 * });
 */

import { fill as fillArt50 } from './eu-ai-act-art-50.js';

export const euAiActArt50 = {
  fill: fillArt50,
} as const;

export type { Art50Obligation, EuAiActArt50Input } from './eu-ai-act-art-50.js';
export {
  RequiredSectionMissingError,
  type DisclosureSection,
  type DisclosureTemplate,
} from './types.js';
