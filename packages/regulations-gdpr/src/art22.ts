/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineContract, type Contract } from '@crawcus/core';
import { GDPR_VERSION } from './version.js';

/**
 * GDPR Article 22 — Automated individual decision-making, including
 * profiling. Five typed Contracts mapping the sub-clauses:
 *
 *   - {@link solelyAutomatedDecision}      — Art. 22(1)
 *   - {@link contractNecessityException}   — Art. 22(2)(a)
 *   - {@link explicitConsentException}     — Art. 22(2)(c)
 *   - {@link humanInterventionSafeguards}  — Art. 22(3)
 *   - {@link specialCategoryProhibition}   — Art. 22(4) → Art. 9(2)(a)/(g)
 *
 * Composition pattern (typical high-risk Intent): pair `solelyAutomatedDecision`
 * with at-least-one of {`contractNecessityException`, `explicitConsentException`,
 * derogated authorisation-by-Union-or-Member-State-law per Art. 22(2)(b)}
 * AND with `humanInterventionSafeguards` AND — if special-category PII is
 * in scope — `specialCategoryProhibition`.
 *
 * Per ratchet #23: this module sits at runtime; the spec itself
 * (`@crawcus/spec`) is unaware of Art. 22's predicate logic.
 */

// ============ Common option-naming convention ============
// All five Contracts follow the same shape as art8 / 99-31:
//   - `*Field` options name snapshot keys (string keys into intent.snapshot)
//   - `*Set` options enumerate institution-published valid claims
//   - everything is `readonly` — predicates must be pure-sync.

// ============ Art. 22(1) — solely-automated decision ============

/**
 * GDPR Art. 22(1) — "The data subject shall have the right not to be
 * subject to a decision based solely on automated processing, including
 * profiling, which produces legal effects concerning him or her or
 * similarly significantly affects him or her."
 *
 * Predicate shape: if the intent's snapshot declares
 * `solelyAutomatedField: true`, then EITHER an Art. 22(2) exception
 * must be claimed in `exceptionField` (drawn from the
 * `permittedExceptions` set) OR a human-oversight event must exist on
 * the event log (a `SuggestionAccepted` / `SuggestionEdited` /
 * `SuggestionRejected` event — these are the runtime's Art. 22(3)
 * human-intervention evidence carriers).
 *
 * **Fail-loud philosophy** — Art. 22(1) is a default *prohibition*;
 * the controller invoking solely-automated decisioning must
 * affirmatively claim an exception. If `solelyAutomatedField` is
 * missing, the Contract passes (this Contract only fires when
 * solely-automated is positively asserted; whether decisioning is
 * "solely automated" is a fact the controller must declare and other
 * Contracts can independently audit).
 *
 * @example
 * import { solelyAutomatedDecision } from '@crawcus/regulations-gdpr';
 *
 * defineCrawcusSpec({
 *   key: 'CreditDecision',
 *   classification: 'high-risk',
 *   contracts: {
 *     invariants: [
 *       solelyAutomatedDecision({
 *         solelyAutomatedField: 'isSolelyAutomated',
 *         exceptionField: 'art22ExceptionClaimed',
 *         permittedExceptions: [
 *           'contract-necessity',       // 22(2)(a)
 *           'union-or-member-state-law', // 22(2)(b)
 *           'explicit-consent',          // 22(2)(c)
 *         ],
 *       }),
 *     ],
 *   },
 * });
 */
export interface SolelyAutomatedDecisionOptions {
  /**
   * Snapshot field carrying a boolean — `true` when the decision is
   * based solely on automated processing per Art. 22(1).
   */
  readonly solelyAutomatedField: string;
  /**
   * Snapshot field carrying the Art. 22(2) exception identifier the
   * controller is invoking (e.g., `'contract-necessity'`,
   * `'explicit-consent'`). Must be in `permittedExceptions`.
   */
  readonly exceptionField: string;
  /**
   * Exception identifiers the institution has documented as available
   * under its DPIA. Per Art. 22(2): (a) contract-necessity,
   * (b) Union/Member-State law, (c) explicit consent.
   */
  readonly permittedExceptions: readonly string[];
}

export function solelyAutomatedDecision(opts: SolelyAutomatedDecisionOptions): Contract {
  return defineContract({
    id: 'gdpr.art22.solelyAutomatedDecision',
    description: {
      en: `GDPR Art. 22(1): if '${opts.solelyAutomatedField}' is true, controller must claim an Art. 22(2) exception in '${opts.exceptionField}' (one of: ${opts.permittedExceptions.join(', ')}) OR a human-oversight event must be present on the chain.`,
    },
    citation: {
      regulation: GDPR_VERSION,
      article: 'Art. 22(1)',
      url: 'https://gdpr-info.eu/art-22-gdpr/',
    },
    predicate: ({ value, events }) => {
      const solelyAutomated = value<boolean>(opts.solelyAutomatedField);
      // If not solely-automated (or unknown), Art. 22(1) does not fire.
      if (solelyAutomated !== true) return true;
      // Exception claimed in snapshot AND from the enumerated set?
      const claimed = value<string>(opts.exceptionField);
      if (claimed !== undefined && opts.permittedExceptions.includes(claimed)) {
        return true;
      }
      // Otherwise: human-oversight evidence on the chain satisfies Art. 22(3)
      // which lifts the Art. 22(1) prohibition (the decision is no longer
      // "solely" automated once a human intervenes).
      return events.some(
        (e) =>
          e.kind === 'SuggestionAccepted' ||
          e.kind === 'SuggestionEdited' ||
          e.kind === 'SuggestionRejected',
      );
    },
    severity: 'block',
  });
}

// ============ Art. 22(2)(a) — contract-necessity exception ============

/**
 * GDPR Art. 22(2)(a) — solely-automated decisioning is permitted where
 * it "is necessary for entering into, or performance of, a contract
 * between the data subject and a data controller."
 *
 * Predicate shape: mirrors FERPA `schoolOfficial` — the institution
 * enumerates the contract purposes for which Art. 22(2)(a) reliance is
 * pre-cleared (typically: `'credit-application'`, `'insurance-quote'`,
 * `'employment-screening'`), and the snapshot must declare a purpose
 * from that set.
 *
 * **Fail-loud philosophy** — affirmative exception claim. If the
 * `purposeField` is missing OR the purpose isn't in the enumerated
 * set, the Contract fails. The audit bundle needs a positive record
 * of which contract-necessity purpose was invoked.
 *
 * @example
 * import { contractNecessityException } from '@crawcus/regulations-gdpr';
 *
 * defineCrawcusSpec({
 *   key: 'CreditDecision',
 *   contracts: {
 *     invariants: [
 *       contractNecessityException({
 *         purposeField: 'contractPurpose',
 *         permittedContractPurposes: [
 *           'credit-application',
 *           'mortgage-pre-approval',
 *         ],
 *       }),
 *     ],
 *   },
 * });
 */
export interface ContractNecessityExceptionOptions {
  /**
   * Snapshot field carrying the contract purpose string the controller
   * is invoking for Art. 22(2)(a) reliance.
   */
  readonly purposeField: string;
  /**
   * Contract purposes the institution has determined satisfy Art.
   * 22(2)(a) "necessary for entering into, or performance of, a
   * contract." The institution's published Art. 13/14 notice and DPIA
   * should enumerate these.
   */
  readonly permittedContractPurposes: readonly string[];
}

export function contractNecessityException(opts: ContractNecessityExceptionOptions): Contract {
  return defineContract({
    id: 'gdpr.art22.contractNecessityException',
    description: {
      en: `GDPR Art. 22(2)(a) exception: the contract purpose in '${opts.purposeField}' must be one of the institution's published contract-necessity purposes (${opts.permittedContractPurposes.join(', ')}).`,
    },
    citation: {
      regulation: GDPR_VERSION,
      article: 'Art. 22(2)(a)',
      url: 'https://gdpr-info.eu/art-22-gdpr/',
    },
    predicate: ({ value }) => {
      const purpose = value<string>(opts.purposeField);
      if (purpose === undefined) return false;
      return opts.permittedContractPurposes.includes(purpose);
    },
    severity: 'block',
  });
}

// ============ Art. 22(2)(c) — explicit-consent exception ============

/**
 * GDPR Art. 22(2)(c) — solely-automated decisioning is permitted where
 * it "is based on the data subject's explicit consent."
 *
 * Predicate shape: a `ConsentGranted` event for the configured
 * `consentPurpose` must exist on the intent's event log. The helper
 * `consentFor(purpose)` reuses the existing Consent primitive's
 * event-log semantics — no parallel storage. The institution can
 * additionally accept a snapshot-side reference (a `consentField`
 * pointing to the consent event id) for ergonomics, mirroring the
 * FERPA `disclosureConsent` permissive shape.
 *
 * **GDPR-permissive philosophy** (similar to art8 and FERPA's
 * `disclosureConsent`) — consent can be evidenced either by an explicit
 * snapshot reference OR by a chain event. Either is sufficient; both
 * absent is failure.
 *
 * Note: Art. 22(2)(c)'s "explicit" qualifier is stronger than Art.
 * 6(1)(a) general consent — the Consent record must carry an
 * `'explicit-consent'` `SpecialCategoryBasis`-style purpose tag OR be
 * a Consent issued under an Art. 22-specific ConsentRequirement. The
 * institution is responsible for routing the right purpose string; this
 * Contract enforces the *presence* check.
 *
 * @example
 * import { explicitConsentException } from '@crawcus/regulations-gdpr';
 *
 * defineCrawcusSpec({
 *   key: 'CreditDecision',
 *   contracts: {
 *     invariants: [
 *       explicitConsentException({
 *         consentField: 'art22ConsentEventId',
 *         consentPurpose: 'explicit-consent-art22-credit-decision',
 *       }),
 *     ],
 *   },
 * });
 */
export interface ExplicitConsentExceptionOptions {
  /**
   * Snapshot field that may carry an explicit pointer to the
   * `ConsentGranted` event id. Optional ergonomics path; the chain
   * check below is the source of truth.
   */
  readonly consentField: string;
  /**
   * Purpose tag carried on the `ConsentGranted` event evidencing
   * explicit consent under Art. 22(2)(c). The institution publishes
   * which purpose string it uses (recommended: prefix with
   * `'explicit-consent-art22-'`).
   */
  readonly consentPurpose: string;
}

export function explicitConsentException(opts: ExplicitConsentExceptionOptions): Contract {
  return defineContract({
    id: 'gdpr.art22.explicitConsentException',
    description: {
      en: `GDPR Art. 22(2)(c) exception: explicit consent required. Reference event in '${opts.consentField}' or grant consent for purpose '${opts.consentPurpose}'.`,
    },
    citation: {
      regulation: GDPR_VERSION,
      article: 'Art. 22(2)(c)',
      url: 'https://gdpr-info.eu/art-22-gdpr/',
    },
    predicate: ({ has, consentFor }) => {
      if (has(opts.consentField)) return true;
      // Coerce string -> Purpose brand at use site (helpers don't carry the brand).
      return consentFor(opts.consentPurpose as never);
    },
    severity: 'block',
  });
}

// ============ Art. 22(3) — human-intervention safeguards ============

/**
 * GDPR Art. 22(3) — where Art. 22(2)(a) or (c) applies, the controller
 * "shall implement suitable measures to safeguard the data subject's
 * rights and freedoms and legitimate interests, at least the right to
 * obtain human intervention on the part of the controller, to express
 * his or her point of view and to contest the decision."
 *
 * **Why this is a structural-spec check, not a per-event check:**
 * Art. 22(3) is a *programme* requirement — it asks whether the
 * controller's system architecturally supports the three rights
 * (human intervention, expression of view, contestation). Per-event
 * evidence (did THIS decision receive human review?) is the domain of
 * the EU AI Act Art. 14 `humanOversight` Contract, which is already
 * shipped and gates `ProjectionCommit` on `Suggestion*` events.
 *
 * This Contract therefore verifies the spec's *declarative commitment*:
 * the spec must carry an `oversightRequirements` array containing at
 * least one requirement whose `acceptedRoles` set includes an oversight
 * role capable of fulfilling Art. 22(3)'s three rights. Failure to
 * declare an `oversightRequirement` at all means the spec is not
 * Art. 22(3)-conformant by structure; the runtime cannot defer the
 * decision into a human-review queue because there's nobody to route
 * it to.
 *
 * Pair with `eu-ai-act.art14.humanOversight` for the per-event check.
 *
 * @example
 * import { humanInterventionSafeguards } from '@crawcus/regulations-gdpr';
 *
 * defineCrawcusSpec({
 *   key: 'CreditDecision',
 *   oversightRequirements: [{
 *     id: 'art22-human-review' as never,
 *     regulation: { regulation: 'gdpr@2025-Q1' as never, article: 'Art. 22(3)' },
 *     acceptedRoles: ['individual', 'committee', 'compliance-officer'],
 *     mode: 'in-loop',
 *     maxGapDays: 1,
 *   }],
 *   contracts: {
 *     pre: [humanInterventionSafeguards()],
 *   },
 * });
 */
export function humanInterventionSafeguards(): Contract {
  return defineContract({
    id: 'gdpr.art22.humanInterventionSafeguards',
    description: {
      en: `GDPR Art. 22(3): spec must declare at least one oversightRequirement supporting in-loop human intervention so the data subject can obtain review, express their view, and contest the decision.`,
    },
    citation: {
      regulation: GDPR_VERSION,
      article: 'Art. 22(3)',
      url: 'https://gdpr-info.eu/art-22-gdpr/',
    },
    predicate: ({ spec }) => {
      const reqs = spec.oversightRequirements;
      if (reqs === undefined || reqs.length === 0) return false;
      // At least one requirement must be `'in-loop'` mode — this is the
      // architectural slot through which the data subject's right to
      // human intervention is routed. `'on-loop'` and `'retrospective'`
      // modes don't satisfy Art. 22(3) on their own because the data
      // subject must be able to obtain intervention *before* (or in
      // contest of) the decision, not merely audit it after.
      return reqs.some((r) => r.mode === 'in-loop');
    },
    severity: 'block',
  });
}

// ============ Art. 22(4) — special-category prohibition ============

/**
 * GDPR Art. 22(4) — "Decisions referred to in paragraph 2 shall not be
 * based on special categories of personal data referred to in Article
 * 9(1), unless point (a) [explicit consent] or (g) [substantial public
 * interest] of Article 9(2) applies and suitable measures to safeguard
 * the data subject's rights and freedoms and legitimate interests are
 * in place."
 *
 * Predicate shape: if the spec touches *any* special-category PII
 * (declared by the institution via `specialCategoryFieldsField` — a
 * snapshot-side declaration that this intent processes Art. 9(1) data),
 * then the snapshot must declare an Art. 9(2) exemption from the
 * `permittedArt9Exemptions` enumerated set (typically `'art9-2-a'` for
 * explicit consent or `'art9-2-g'` for substantial public interest).
 *
 * **Why not check the ComplianceManifest directly?** The manifest is
 * runtime configuration (`tallyseal.compliance.ts`), not part of the
 * `CrawcusSpec` itself, and is therefore not on the `ContractCtx`. The
 * institution declares per-intent special-category processing via a
 * boolean snapshot flag; the build-time manifest validator
 * (`validateManifest` in `/core`) is the second line of
 * defence that catches mis-declaration.
 *
 * **Fail-loud philosophy** — affirmative exception claim, mirroring
 * the `solelyAutomatedDecision` shape. If no special-category data is
 * declared (`processesSpecialCategoryField` missing or `false`), the
 * Contract passes (this Contract only fires when special-category
 * processing is positively asserted).
 *
 * @example
 * import { specialCategoryProhibition } from '@crawcus/regulations-gdpr';
 *
 * defineCrawcusSpec({
 *   key: 'HealthInsuranceUnderwriting',
 *   contracts: {
 *     invariants: [
 *       specialCategoryProhibition({
 *         processesSpecialCategoryField: 'usesArt9Data',
 *         art9ExemptionField: 'art9Exemption',
 *         permittedArt9Exemptions: ['art9-2-a', 'art9-2-g'],
 *       }),
 *     ],
 *   },
 * });
 */
export interface SpecialCategoryProhibitionOptions {
  /**
   * Snapshot field carrying a boolean — `true` when the intent
   * processes Art. 9(1) special-category personal data. The
   * institution's DPIA enumerates which spec keys carry this flag.
   */
  readonly processesSpecialCategoryField: string;
  /**
   * Snapshot field carrying the Art. 9(2) exemption identifier
   * (`'art9-2-a'` or `'art9-2-g'`).
   */
  readonly art9ExemptionField: string;
  /**
   * Art. 9(2) exemption identifiers the institution has documented as
   * available. Art. 22(4) restricts the universe to (a) explicit
   * consent and (g) substantial public interest, but the institution
   * publishes the actual identifier strings.
   */
  readonly permittedArt9Exemptions: readonly string[];
}

export function specialCategoryProhibition(opts: SpecialCategoryProhibitionOptions): Contract {
  return defineContract({
    id: 'gdpr.art22.specialCategoryProhibition',
    description: {
      en: `GDPR Art. 22(4): if '${opts.processesSpecialCategoryField}' is true, controller must claim an Art. 9(2) exemption in '${opts.art9ExemptionField}' (one of: ${opts.permittedArt9Exemptions.join(', ')}).`,
    },
    citation: {
      regulation: GDPR_VERSION,
      article: 'Art. 22(4)',
      url: 'https://gdpr-info.eu/art-22-gdpr/',
    },
    predicate: ({ value }) => {
      const usesSpecial = value<boolean>(opts.processesSpecialCategoryField);
      // If special-category processing is not asserted, Art. 22(4)'s
      // amplified prohibition does not fire.
      if (usesSpecial !== true) return true;
      const exemption = value<string>(opts.art9ExemptionField);
      if (exemption === undefined) return false;
      return opts.permittedArt9Exemptions.includes(exemption);
    },
    severity: 'block',
  });
}
