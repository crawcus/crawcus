/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineContract, type Contract, type DisclosureDeliveredPayload } from '@crawcus/core';
import { EU_AI_ACT_VERSION } from './version.js';

/**
 * # EU AI Act Article 50 — Transparency obligations
 *
 * Article 50 imposes four discrete disclosure / marking obligations on
 * **providers** (50(1), 50(2)) and **deployers** (50(3), 50(4)) of
 * certain AI systems. Unlike Art. 14, these obligations are **not**
 * gated on the high-risk classification — they apply to broad classes
 * of AI systems irrespective of risk tier (Art. 50 has its own scope
 * triggers per paragraph).
 *
 * Each Contract below targets one Art. 50 sub-clause. They are
 * deliberately fine-grained so a CrawcusSpec opts into precisely the
 * obligations relevant to its system.
 *
 * The Disclosure-event predicates filter `DisclosureDelivered` events
 * by the configured `disclosureRequirementId`. The configurable id
 * approach decouples the regulation Contract from any specific
 * disclosure registry naming convention — deployers wire the id to
 * their own `DisclosureRequirement` records.
 */

// ============ Helper: locate a satisfying DisclosureDelivered event ============

/**
 * Returns true iff at least one `DisclosureDelivered` event exists on
 * the log whose payload `requirementId` matches the configured id.
 * Filtering by `requirementId` is what binds the generic delivery
 * primitive to a specific regulation obligation.
 */
function hasDisclosureForRequirement(
  events: readonly { readonly kind: string; readonly payload: unknown }[],
  requirementId: string,
): boolean {
  return events.some((e) => {
    if (e.kind !== 'DisclosureDelivered') return false;
    const payload = e.payload as Partial<DisclosureDeliveredPayload> | undefined;
    return payload?.requirementId === requirementId;
  });
}

// ============ Art. 50(1) — AI-interaction disclosure (provider) ============

/**
 * EU AI Act Article 50(1) — AI-interaction disclosure (provider obligation).
 *
 * "Providers shall ensure that AI systems intended to interact directly
 * with natural persons are designed and developed in such a way that
 * the natural persons concerned are informed that they are interacting
 * with an AI system, unless this is obvious from the point of view of
 * a natural person who is reasonably well-informed, observant and
 * circumspect, taking into account the circumstances and the context
 * of use."
 *
 * Tallyseal v0.1 enforcement: before any AI-mediated event fires on
 * the intent, either (a) a `DisclosureDelivered` event with matching
 * `requirementId` must exist on the log, or (b) the snapshot must
 * carry a reference at the configured `disclosureField` (e.g., the
 * DisclosureDelivered event id, for sessions where the disclosure was
 * delivered out-of-band before the intent opened).
 *
 * **Path-shape philosophy** — mirrors `ferpa.99-31.disclosureConsent`
 * two-path pattern (snapshot reference OR event-log evidence). Failing
 * both = block. The "obvious from the point of view of a reasonably
 * well-informed natural person" derogation is NOT auto-applied at the
 * runtime layer — providers wishing to invoke it should declare a
 * `derogations` entry on the CrawcusSpec rather than removing this
 * Contract, so the audit bundle records the affirmative claim.
 *
 * @example
 * import { aiInteractionDisclosure } from '@crawcus/regulations-eu-ai-act';
 *
 * defineCrawcusSpec({
 *   key: 'ChatbotTurn',
 *   contracts: {
 *     pre: [
 *       aiInteractionDisclosure({
 *         disclosureRequirementId: 'eu-ai-act.art50-1.ai-interaction',
 *         disclosureField: 'aiDisclosureEventId',
 *       }),
 *     ],
 *   },
 * });
 */
export interface AiInteractionDisclosureOptions {
  /**
   * Identifier of the `DisclosureRequirement` covering this obligation.
   * The Contract passes if any `DisclosureDelivered` event on the
   * intent's log carries a payload with this `requirementId`.
   */
  readonly disclosureRequirementId: string;
  /**
   * Optional snapshot field carrying a reference to a prior
   * `DisclosureDelivered` event (e.g., one delivered at session start
   * before the intent opened). If present and populated, satisfies the
   * Contract without requiring an in-log event.
   */
  readonly disclosureField?: string;
}

export function aiInteractionDisclosure(opts: AiInteractionDisclosureOptions): Contract {
  const fieldClause = opts.disclosureField
    ? ` or reference at snapshot.${opts.disclosureField}`
    : '';
  return defineContract({
    id: 'eu-ai-act.art50.aiInteractionDisclosure',
    description: {
      en: `EU AI Act Art. 50(1): natural persons must be informed they are interacting with an AI system. Requires a DisclosureDelivered event for requirement '${opts.disclosureRequirementId}'${fieldClause}.`,
    },
    citation: {
      regulation: EU_AI_ACT_VERSION,
      article: 'Art. 50(1)',
      url: 'https://artificialintelligenceact.eu/article/50/',
    },
    predicate: ({ has, events }) => {
      if (opts.disclosureField && has(opts.disclosureField)) return true;
      return hasDisclosureForRequirement(events, opts.disclosureRequirementId);
    },
    severity: 'block',
  });
}

// ============ Art. 50(2) — synthetic-content marking (provider) ============

/**
 * EU AI Act Article 50(2) — synthetic-content marking (provider obligation).
 *
 * "Providers of AI systems, including general-purpose AI systems,
 * generating synthetic audio, image, video or text content, shall
 * ensure that the outputs of the AI system are marked in a machine-
 * readable format and detectable as artificially generated or
 * manipulated. [...] This obligation shall not apply to the extent the
 * AI systems perform an assistive function for standard editing or do
 * not substantially alter the input data provided by the deployer or
 * the semantics thereof, or where authorised by law to detect, prevent,
 * investigate or prosecute criminal offences."
 *
 * Tallyseal v0.1 enforcement: the intent snapshot must carry a non-
 * empty value at the configured `markerField` — typically a C2PA
 * manifest URL, watermark hash, or signed-provenance pointer the
 * runtime / downstream verifier can resolve.
 *
 * **Fail-loud philosophy** — mirrors `ferpa.99-31.schoolOfficial`:
 * Art. 50(2) is an affirmative provider claim that synthetic content
 * IS machine-readably marked. Missing field = fail; the audit bundle
 * needs a positive record of the marker used. The assistive-editing /
 * non-substantial-alteration / law-enforcement derogations should be
 * declared via the CrawcusSpec's `derogations` entry rather than by
 * removing this Contract.
 *
 * @example
 * import { syntheticContentMarker } from '@crawcus/regulations-eu-ai-act';
 *
 * defineCrawcusSpec({
 *   key: 'GenerateImage',
 *   contracts: {
 *     invariants: [
 *       syntheticContentMarker({ markerField: 'c2paManifestUrl' }),
 *     ],
 *   },
 * });
 */
export interface SyntheticContentMarkerOptions {
  /**
   * Snapshot field carrying the machine-readable provenance marker
   * (e.g., C2PA manifest URL, watermark hash, signed-manifest pointer).
   * The Contract requires a non-empty string at this field.
   */
  readonly markerField: string;
}

export function syntheticContentMarker(opts: SyntheticContentMarkerOptions): Contract {
  return defineContract({
    id: 'eu-ai-act.art50.syntheticContentMarker',
    description: {
      en: `EU AI Act Art. 50(2): synthetic AI-generated audio/image/video/text output must be marked in a machine-readable format. Requires a non-empty provenance marker at snapshot.${opts.markerField}.`,
    },
    citation: {
      regulation: EU_AI_ACT_VERSION,
      article: 'Art. 50(2)',
      url: 'https://artificialintelligenceact.eu/article/50/',
    },
    predicate: ({ value }) => {
      const marker = value<string>(opts.markerField);
      if (marker === undefined) return false;
      return typeof marker === 'string' && marker.length > 0;
    },
    severity: 'block',
  });
}

// ============ Art. 50(3) — emotion-recognition / biometric-categorisation (deployer) ============

/**
 * EU AI Act Article 50(3) — emotion-recognition or biometric-
 * categorisation disclosure (deployer obligation).
 *
 * "Deployers of an emotion recognition system or a biometric
 * categorisation system shall inform of the operation of the system
 * the natural persons exposed thereto and shall process the personal
 * data in accordance with Regulations (EU) 2016/679 and (EU) 2018/1725
 * and Directive (EU) 2016/680, as applicable. [...]"
 *
 * Tallyseal v0.1 enforcement: only fires when the intent snapshot has
 * the configured `triggerField` set truthy (e.g., `emotionRecognition:
 * true` or `biometricCategorisation: true`). When triggered, requires
 * a `DisclosureDelivered` event with matching `disclosureRequirementId`
 * on the log.
 *
 * **Permissive-scoping philosophy** — mirrors Art. 14's
 * `if (spec.classification !== 'high-risk') return true` skip. The
 * trigger field is the spec author's declaration that this system
 * performs emotion-recognition / biometric-categorisation; absence of
 * the trigger means Art. 50(3) does not apply to this intent and the
 * Contract passes vacuously. Compare to Art. 50(1)/50(2)/50(4) which
 * always fire — Art. 50(3) is scoped to specific system types.
 *
 * **Voice-modality note** — surfaces a known coverage gap with the
 * voice-modality expansion vector (see notebook
 * `06-expansion-vectors/voice-modality.md` Q-VOICE) — voice systems
 * frequently classify as emotion-recognition under Art. 50(3) by
 * inferring tone/affect from acoustic features. Wedge customers using
 * voice should evaluate whether the trigger should default to true.
 *
 * @example
 * import { emotionRecognitionDisclosure } from '@crawcus/regulations-eu-ai-act';
 *
 * defineCrawcusSpec({
 *   key: 'AnalyseTone',
 *   contracts: {
 *     pre: [
 *       emotionRecognitionDisclosure({
 *         triggerField: 'emotionRecognition',
 *         disclosureRequirementId: 'eu-ai-act.art50-3.emotion-notice',
 *       }),
 *     ],
 *   },
 * });
 */
export interface EmotionRecognitionDisclosureOptions {
  /**
   * Snapshot field whose truthy value indicates this intent performs
   * emotion-recognition or biometric-categorisation processing.
   * Common values: `'emotionRecognition'`, `'biometricCategorisation'`.
   * When the field is absent or falsy, the Contract passes vacuously.
   */
  readonly triggerField: string;
  /**
   * Identifier of the `DisclosureRequirement` covering the Art. 50(3)
   * notice obligation. The Contract requires a `DisclosureDelivered`
   * event on the log carrying this `requirementId`.
   */
  readonly disclosureRequirementId: string;
}

export function emotionRecognitionDisclosure(opts: EmotionRecognitionDisclosureOptions): Contract {
  return defineContract({
    id: 'eu-ai-act.art50.emotionRecognitionDisclosure',
    description: {
      en: `EU AI Act Art. 50(3): when snapshot.${opts.triggerField} indicates emotion-recognition or biometric-categorisation, natural persons must be informed of the system's operation. Requires a DisclosureDelivered event for requirement '${opts.disclosureRequirementId}'.`,
    },
    citation: {
      regulation: EU_AI_ACT_VERSION,
      article: 'Art. 50(3)',
      url: 'https://artificialintelligenceact.eu/article/50/',
    },
    predicate: ({ value, events }) => {
      const trigger = value<unknown>(opts.triggerField);
      if (!trigger) return true; // not in scope for this intent
      return hasDisclosureForRequirement(events, opts.disclosureRequirementId);
    },
    severity: 'block',
  });
}

// ============ Art. 50(4) — deepfake disclosure (deployer) ============

/**
 * EU AI Act Article 50(4) — deepfake disclosure (deployer obligation).
 *
 * "Deployers of an AI system that generates or manipulates image,
 * audio or video content constituting a deep fake, shall disclose
 * that the content has been artificially generated or manipulated.
 * This obligation shall not apply where the use is authorised by law
 * to detect, prevent, investigate or prosecute criminal offence. Where
 * the content forms part of an evidently artistic, creative, satirical,
 * fictional or analogous work or programme, the transparency
 * obligations set out in this paragraph are limited to disclosure of
 * the existence of such generated or manipulated content in an
 * appropriate manner that does not hamper the display or enjoyment of
 * the work."
 *
 * Tallyseal v0.1 enforcement: same two-path shape as
 * {@link aiInteractionDisclosure} but at the **deployer** layer with a
 * distinct citation. Either (a) a `DisclosureDelivered` event with
 * matching `requirementId` on the log, or (b) a reference in the
 * snapshot's configured `disclosureField`.
 *
 * **Distinct from Art. 50(2)** — Art. 50(2) is the *provider's*
 * machine-readable marking obligation (an inline provenance pointer
 * the system itself carries); Art. 50(4) is the *deployer's* notice-
 * to-natural-persons obligation (a delivered disclosure to the human
 * audience). Both can apply to the same generation event; encode each
 * separately so the audit bundle records both compliances.
 *
 * **Fail-loud philosophy** — same as Art. 50(1). The artistic /
 * law-enforcement derogations should be declared via the CrawcusSpec's
 * `derogations` entry rather than by removing this Contract.
 *
 * @example
 * import { deepFakeDisclosure } from '@crawcus/regulations-eu-ai-act';
 *
 * defineCrawcusSpec({
 *   key: 'PublishGeneratedVideo',
 *   contracts: {
 *     pre: [
 *       deepFakeDisclosure({
 *         disclosureRequirementId: 'eu-ai-act.art50-4.deepfake-notice',
 *         disclosureField: 'deepFakeDisclosureEventId',
 *       }),
 *     ],
 *   },
 * });
 */
export interface DeepFakeDisclosureOptions {
  /**
   * Identifier of the `DisclosureRequirement` covering the Art. 50(4)
   * deepfake notice. The Contract accepts a `DisclosureDelivered`
   * event on the log carrying this `requirementId`.
   */
  readonly disclosureRequirementId: string;
  /**
   * Optional snapshot field carrying a reference to a prior
   * `DisclosureDelivered` event (e.g., one delivered at publication
   * time on an upstream platform). If present and populated, satisfies
   * the Contract without requiring an in-log event.
   */
  readonly disclosureField?: string;
}

export function deepFakeDisclosure(opts: DeepFakeDisclosureOptions): Contract {
  const fieldClause = opts.disclosureField
    ? ` or reference at snapshot.${opts.disclosureField}`
    : '';
  return defineContract({
    id: 'eu-ai-act.art50.deepFakeDisclosure',
    description: {
      en: `EU AI Act Art. 50(4): deployers of AI systems generating deepfake image/audio/video content shall disclose that the content is artificially generated or manipulated. Requires a DisclosureDelivered event for requirement '${opts.disclosureRequirementId}'${fieldClause}.`,
    },
    citation: {
      regulation: EU_AI_ACT_VERSION,
      article: 'Art. 50(4)',
      url: 'https://artificialintelligenceact.eu/article/50/',
    },
    predicate: ({ has, events }) => {
      if (opts.disclosureField && has(opts.disclosureField)) return true;
      return hasDisclosureForRequirement(events, opts.disclosureRequirementId);
    },
    severity: 'block',
  });
}
