/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentHash, DisclosureRequirementId, SubjectId, Timestamp } from '../types/ids.js';
import type { Event } from '../types/event.js';
import type {
  DisclosureDeliveredPayload,
  DisclosureSignalPayload,
  DisclosureSignalType,
} from './types.js';

/**
 * # DisclosureSignal predicate helpers (Q-CR9 LOCKED 2026-06-02)
 *
 * Pure, total, side-effect-free predicate builders for use by Contract
 * authors who need a `pre` check that "a Disclosure was delivered AND
 * there is structured evidence the subject had an opportunity to read
 * it" — without claiming acknowledgment.
 *
 * **SIGNAL-not-gate discipline.** See `02-product/crawcus-contracts.md`
 * §6.A. The predicate name MUST contain `opportunity` or `signal` —
 * never `acknowledged` / `consented` / `confirmed` / `agreed`. The
 * lint check that backstops this discipline lives in
 * `lintDisclosureSignalPredicateName` below; it ships in the TCK as
 * the rejection-case fixture.
 *
 * Spec source: `07-engineering/primitives-audit-2026-05-21.md` §#11;
 * `02-product/crawcus-contracts.md` §6.A.
 */

// ============ Predicate options ============

/**
 * Options for `disclosureHasOpportunityToBeRead`. Mirrors the author
 * shape from §6.A. All defaults preserve the safest interpretation
 * (require hash match; only `'read'` signals count).
 */
export interface DisclosureHasOpportunityToBeReadOptions {
  /** Which `DisclosureRequirement` the predicate applies to. */
  readonly requirementId: DisclosureRequirementId;
  /**
   * Which signal types satisfy the predicate. Defaults to `['read']`;
   * controllers MAY widen to include `'click'` / `'dwell'` for cases
   * where any interaction-evidence is sufficient (e.g., regulator-
   * approved "view-time OR scroll-past" framing). Never include
   * affirmative-only signals here — there are none in the SIGNAL set.
   */
  readonly acceptedSignals?: readonly DisclosureSignalType[];
  /**
   * Whether the signal's `contentHash` MUST match the delivered
   * Disclosure's `contentHash`. Default `true`. Setting to `false`
   * permits signal-on-stale-content to satisfy the predicate; auditors
   * MUST be informed.
   */
  readonly requireHashMatch?: boolean;
}

// ============ Predicate evaluator ============

/**
 * Pure evaluator for the `pre.disclosureHasOpportunityToBeRead`
 * Contract pattern. Returns `true` if-and-only-if:
 *
 *   1. A `DisclosureDelivered` event for the named `requirementId`
 *      and the given `subject` exists in `events`, AND
 *   2. A `DisclosureSignal` event for the same `requirementId` exists
 *      with `signalType` in `acceptedSignals` (default `['read']`), AND
 *   3. If `requireHashMatch` is true (default), the signal's
 *      `contentHash` matches the delivered Disclosure's `contentHash`.
 *
 * Order matches the §6.A specification verbatim. Pure, total,
 * side-effect-free per ratchet #3 (deterministic reducer property).
 *
 * @example
 *   const ok = disclosureHasOpportunityToBeRead(events, subjectId, {
 *     requirementId: 'gdpr.art13.notice' as DisclosureRequirementId,
 *     acceptedSignals: ['read'],
 *     requireHashMatch: true,
 *   });
 */
export function disclosureHasOpportunityToBeRead(
  events: readonly Event<unknown>[],
  subject: SubjectId,
  options: DisclosureHasOpportunityToBeReadOptions,
): boolean {
  const acceptedSignals = options.acceptedSignals ?? (['read'] as const);
  const requireHashMatch = options.requireHashMatch ?? true;

  // ============ 1. Find the most recent delivered Disclosure ============
  const deliveries = events.filter(
    (e): e is Event<DisclosureDeliveredPayload> => e.kind === 'DisclosureDelivered',
  );

  type DeliveryHit = { readonly contentHash: ContentHash; readonly observedAt: Timestamp };
  const matchingDeliveries: readonly DeliveryHit[] = deliveries.flatMap((e) => {
    const payload = e.payload;
    if (payload.subject !== subject) return [];
    if (payload.requirementId !== options.requirementId) return [];
    return [
      {
        contentHash: payload.contentHash,
        observedAt: e.timestamp.toISOString() as Timestamp,
      },
    ];
  });

  if (matchingDeliveries.length === 0) return false;

  const mostRecentDelivery = matchingDeliveries.reduce((acc, d) =>
    d.observedAt > acc.observedAt ? d : acc,
  );

  // ============ 2. Find any accepted-signal event ============
  const signals = events.filter(
    (e): e is Event<DisclosureSignalPayload> => e.kind === 'DisclosureSignal',
  );

  const acceptedSignalSet = new Set<DisclosureSignalType>(acceptedSignals);
  const matchingSignals = signals.filter((e) => {
    const payload = e.payload;
    if (payload.requirementId !== options.requirementId) return false;
    if (!acceptedSignalSet.has(payload.signalType)) return false;
    if (requireHashMatch && payload.contentHash !== mostRecentDelivery.contentHash) return false;
    return true;
  });

  return matchingSignals.length > 0;
}

// ============ SIGNAL-not-gate predicate-name lint ============

/**
 * Tokens that MUST NOT appear in a `DisclosureSignal`-consuming
 * predicate name. Drawn directly from §6.A. Lower-cased; matched
 * case-insensitively in `lintDisclosureSignalPredicateName`.
 *
 * Exported as a frozen tuple so other tools (TCK, regulation packs,
 * lighthouse) can reference the canonical list.
 */
export const SIGNAL_NOT_GATE_FORBIDDEN_TOKENS = [
  'acknowledged',
  'consented',
  'agreed',
  'confirmed',
] as const;

/**
 * Tokens REQUIRED to appear in a `DisclosureSignal`-consuming
 * predicate name. At least one must be present to satisfy §6.A's
 * "the name carries the claim shape" rule.
 */
export const SIGNAL_NOT_GATE_REQUIRED_TOKENS = ['opportunity', 'signal'] as const;

/**
 * Result of `lintDisclosureSignalPredicateName`. Discriminated by
 * `ok`. Failure carries the diagnostic the TCK + audit-bundle lint
 * surface to authors.
 */
export type DisclosureSignalLintResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: 'FORBIDDEN_TOKEN' | 'MISSING_REQUIRED_TOKEN';
      readonly token: string;
      readonly message: string;
    };

/**
 * Pure lint check that backstops the SIGNAL-not-gate discipline. A
 * Contract that consumes `DisclosureSignal` events MUST pass this
 * check, OR the TCK rejects the Contract before it ships. Mirrors
 * the rule from `02-product/crawcus-contracts.md` §6.A:
 *
 *   - Reject if the predicate name contains any of `acknowledged` /
 *     `consented` / `agreed` / `confirmed` (would weaponise a signal
 *     as a gate predicate masquerading as affirmative consent).
 *   - Reject if the predicate name contains none of `opportunity` /
 *     `signal` (the name MUST carry the claim shape).
 *
 * Case-insensitive token match. Returns `{ ok: true }` on success;
 * `{ ok: false, code, token, message }` on failure with a message
 * that cites §6.A so the audit-bundle reader sees the framing.
 */
export function lintDisclosureSignalPredicateName(
  predicateName: string,
): DisclosureSignalLintResult {
  const lower = predicateName.toLowerCase();

  for (const forbidden of SIGNAL_NOT_GATE_FORBIDDEN_TOKENS) {
    if (lower.includes(forbidden)) {
      return {
        ok: false,
        code: 'FORBIDDEN_TOKEN',
        token: forbidden,
        message:
          `Predicate name '${predicateName}' contains forbidden token '${forbidden}'. ` +
          `DisclosureSignal predicates record SIGNAL (opportunity to perceive) — never ` +
          `GATE (affirmative acknowledgment). Use 'opportunity' or 'signal' in the name ` +
          `instead. See 02-product/crawcus-contracts.md §6.A.`,
      };
    }
  }

  const hasRequired = SIGNAL_NOT_GATE_REQUIRED_TOKENS.some((token) => lower.includes(token));
  if (!hasRequired) {
    return {
      ok: false,
      code: 'MISSING_REQUIRED_TOKEN',
      token: SIGNAL_NOT_GATE_REQUIRED_TOKENS.join(' | '),
      message:
        `Predicate name '${predicateName}' must contain 'opportunity' or 'signal' ` +
        `to carry the SIGNAL-not-gate claim shape. See 02-product/crawcus-contracts.md §6.A.`,
    };
  }

  return { ok: true };
}
