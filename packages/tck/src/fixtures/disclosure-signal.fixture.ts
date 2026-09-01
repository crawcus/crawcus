/**
 * # disclosure-signal.fixture.ts
 *
 * Q-CR9 LOCKED 2026-06-02. TCK fixtures that any CRAWCUS-conformant
 * runtime must satisfy for the `DisclosureSignal` EventKind +
 * `pre.disclosureHasOpportunityToBeRead` Contract pattern.
 *
 * **Three runnable cases:**
 *
 *   1. `runDisclosureSignalPositiveCase` — `pre.disclosureHasOpportunityToBeRead`
 *      predicate resolves `true` when a `DisclosureDelivered` event exists
 *      for the named `requirementId`, a `DisclosureSignal{signalType:'read'}`
 *      event exists for the same `requirementId`, and the signal's
 *      `contentHash` matches the delivered Disclosure's `contentHash`.
 *
 *   2. `runDisclosureSignalGateRejectionCase` — A Contract authored with
 *      a predicate name containing `acknowledged` / `consented` / `agreed`
 *      / `confirmed` MUST be rejected by TCK lint with a message citing
 *      `02-product/crawcus-contracts.md` §6.A. This is the load-bearing
 *      semantic — without it, Contract authors can weaponise
 *      `DisclosureSignal` as a hidden gate.
 *
 *   3. `runDisclosureSignalHashMismatchCase` — A signal whose `contentHash`
 *      does not match the delivered Disclosure's `contentHash` MUST NOT
 *      satisfy the predicate when `requireHashMatch: true` (the default).
 *      Signal-on-stale-content is rejected per §6.A point 3.
 *
 * Spec sources:
 *   - `00-canon/architecture-primitives.md` §3 + §11
 *   - `02-product/crawcus-contracts.md` §6.A
 *   - `07-engineering/primitives-audit-2026-05-21.md` §#11
 *   - decision-log row Q-CR9 LOCKED 2026-06-02
 */

import {
  disclosureHasOpportunityToBeRead,
  lintDisclosureSignalPredicateName,
  SIGNAL_NOT_GATE_FORBIDDEN_TOKENS,
  type DisclosureDeliveredPayload,
  type DisclosureSignalPayload,
  type DisclosureSignalType,
} from '@crawcus/spec';
import type {
  ContentHash,
  DisclosureId,
  DisclosureRequirementId,
  Event,
  EventId,
  IntentId,
  SubjectId,
  TenantId,
  Timestamp,
  Actor,
} from '@crawcus/spec';
import type { TckResult } from './result.js';
import { TCK_RESULT_PASS } from './result.js';

// ============ Builders (exported for harness reuse) ============

/**
 * Minimal context any harness needs to instantiate a TCK run.
 * Intentionally fewer knobs than a real runtime — fixtures aim to
 * exercise the public spec surface, not the runtime's plumbing.
 */
export interface DisclosureSignalFixtureEnv {
  readonly tenantId: TenantId;
  readonly intentId: IntentId;
  readonly subject: SubjectId;
  readonly requirementId: DisclosureRequirementId;
  /** Wallclock used when stamping events; deterministic per run. */
  readonly now: Date;
}

const DEFAULT_ACTOR: Actor = { kind: 'human', id: 'tck-subject' as Actor['id'] };

/** Construct a `DisclosureDelivered` event for use by harnesses. */
export function buildDeliveredEvent(
  env: DisclosureSignalFixtureEnv,
  contentHash: ContentHash,
  id = 'tck-d1',
): Event<DisclosureDeliveredPayload> {
  return {
    id: id as EventId,
    tenantId: env.tenantId,
    intentId: env.intentId,
    kind: 'DisclosureDelivered',
    version: 1,
    timestamp: env.now,
    actor: DEFAULT_ACTOR,
    lawfulBasis: 'consent',
    purpose: 'tck' as Event['purpose'],
    dataSubjectIds: [env.subject],
    prevHash: null,
    contentHash: 'h_env_d1' as ContentHash,
    payload: {
      disclosureId: `disc_${id}` as DisclosureId,
      subject: env.subject,
      requirementId: env.requirementId,
      contentHash,
      deliveryMethod: 'in-app',
      locale: 'en',
    },
  };
}

/** Construct a `DisclosureSignal` event for use by harnesses. */
export function buildSignalEvent(
  env: DisclosureSignalFixtureEnv,
  contentHash: ContentHash,
  signalType: DisclosureSignalType,
  options: { readonly id?: string; readonly viewMs?: number; readonly offsetMs?: number } = {},
): Event<DisclosureSignalPayload> {
  const id = options.id ?? 'tck-s1';
  const observedAt = new Date(env.now.getTime() + (options.offsetMs ?? 2000));
  const payload: DisclosureSignalPayload =
    options.viewMs === undefined
      ? {
          disclosureId: `disc_${id}` as DisclosureId,
          requirementId: env.requirementId,
          contentHash,
          signalType,
          observedAt: observedAt.toISOString() as Timestamp,
        }
      : {
          disclosureId: `disc_${id}` as DisclosureId,
          requirementId: env.requirementId,
          contentHash,
          signalType,
          observedAt: observedAt.toISOString() as Timestamp,
          viewMs: options.viewMs,
        };
  return {
    id: id as EventId,
    tenantId: env.tenantId,
    intentId: env.intentId,
    kind: 'DisclosureSignal',
    version: 2,
    timestamp: observedAt,
    actor: DEFAULT_ACTOR,
    lawfulBasis: 'consent',
    purpose: 'tck' as Event['purpose'],
    dataSubjectIds: [env.subject],
    prevHash: null,
    contentHash: 'h_env_s1' as ContentHash,
    payload,
  };
}

function defaultEnv(): DisclosureSignalFixtureEnv {
  return {
    tenantId: 'tck-tenant' as TenantId,
    intentId: 'tck-intent' as IntentId,
    subject: 'tck-subject' as SubjectId,
    requirementId: 'gdpr.art13.notice' as DisclosureRequirementId,
    now: new Date('2026-06-02T12:00:00.000Z'),
  };
}

// ============ Case 1: positive predicate evaluation ============

/**
 * **Positive case.** Given a delivered Disclosure for the named
 * `requirementId` AND a `DisclosureSignal{signalType:'read'}` for the
 * same `requirementId` AND content hashes that match,
 * `disclosureHasOpportunityToBeRead({ requirementId, acceptedSignals:
 * ['read'], requireHashMatch: true })` MUST resolve `true`.
 *
 * Source: `02-product/crawcus-contracts.md` §6.A points 1, 2, 3.
 */
export function runDisclosureSignalPositiveCase(
  env: DisclosureSignalFixtureEnv = defaultEnv(),
): TckResult {
  const contentHash = 'h_fresh' as ContentHash;
  const events = [
    buildDeliveredEvent(env, contentHash, 'tck-d1'),
    buildSignalEvent(env, contentHash, 'read', { id: 'tck-s1', viewMs: 1800 }),
  ];

  const ok = disclosureHasOpportunityToBeRead(events, env.subject, {
    requirementId: env.requirementId,
    acceptedSignals: ['read'],
    requireHashMatch: true,
  });

  if (!ok) {
    return {
      ok: false,
      code: 'POSITIVE_CASE_FAILED',
      message:
        `disclosureHasOpportunityToBeRead returned false despite a matching ` +
        `DisclosureDelivered + DisclosureSignal{read} pair with identical ` +
        `contentHash for requirementId '${env.requirementId}'. ` +
        `Runtime fails CRAWCUS conformance per ` +
        `02-product/crawcus-contracts.md §6.A.`,
    };
  }

  return TCK_RESULT_PASS;
}

// ============ Case 2: SIGNAL-not-gate lint rejection ============

/**
 * **SIGNAL-not-gate rejection case.** A Contract authored with a
 * predicate name containing `acknowledged` / `consented` / `agreed` /
 * `confirmed` MUST be rejected by TCK lint with a message citing
 * `02-product/crawcus-contracts.md` §6.A. This prevents authors from
 * weaponising a `DisclosureSignal` as a hidden affirmative-consent
 * gate (ICO + LG Munich + CJEU Planet49 all reject scroll-as-gate).
 *
 * The fixture iterates over every forbidden token to make the
 * coverage exhaustive — any future addition to
 * `SIGNAL_NOT_GATE_FORBIDDEN_TOKENS` is automatically exercised.
 */
export function runDisclosureSignalGateRejectionCase(): TckResult {
  for (const forbidden of SIGNAL_NOT_GATE_FORBIDDEN_TOKENS) {
    const candidateName = `userScroll${forbidden.charAt(0).toUpperCase()}${forbidden.slice(1)}NoticeBySignal`;
    const result = lintDisclosureSignalPredicateName(candidateName);
    if (result.ok) {
      return {
        ok: false,
        code: 'GATE_REJECTION_FALSE_NEGATIVE',
        message:
          `Predicate name '${candidateName}' contains forbidden token ` +
          `'${forbidden}' but lintDisclosureSignalPredicateName accepted it. ` +
          `Runtime fails CRAWCUS conformance — SIGNAL-not-gate framing not ` +
          `enforced per 02-product/crawcus-contracts.md §6.A.`,
      };
    }
    if (!result.message.includes('crawcus-contracts.md §6.A')) {
      return {
        ok: false,
        code: 'GATE_REJECTION_MISSING_CITATION',
        message:
          `Predicate name '${candidateName}' was rejected as expected, but ` +
          `the diagnostic does not cite '02-product/crawcus-contracts.md §6.A'. ` +
          `Citation discipline mandates a §6.A reference so audit-bundle ` +
          `readers see the SIGNAL-not-gate framing explicitly. Got: ` +
          `'${result.message}'.`,
      };
    }
  }

  // Also verify a Contract whose predicate name carries no SIGNAL-shape
  // token at all is rejected — the name must carry the claim shape.
  const named = lintDisclosureSignalPredicateName('disclosureWasObserved');
  if (named.ok) {
    return {
      ok: false,
      code: 'MISSING_REQUIRED_FALSE_NEGATIVE',
      message:
        `Predicate name 'disclosureWasObserved' contains neither 'opportunity' ` +
        `nor 'signal' but was accepted. Per 02-product/crawcus-contracts.md §6.A ` +
        `the name MUST carry the SIGNAL-not-gate claim shape.`,
    };
  }

  return TCK_RESULT_PASS;
}

// ============ Case 3: hash mismatch rejection ============

/**
 * **Hash-mismatch rejection case.** When the signal's `contentHash`
 * does not match the delivered Disclosure's `contentHash` AND
 * `requireHashMatch: true` (the default per §6.A), the predicate MUST
 * resolve `false`. Signal-on-stale-content does not satisfy the
 * "opportunity to read" claim.
 *
 * Source: `02-product/crawcus-contracts.md` §6.A point 3.
 */
export function runDisclosureSignalHashMismatchCase(
  env: DisclosureSignalFixtureEnv = defaultEnv(),
): TckResult {
  const deliveredHash = 'h_fresh' as ContentHash;
  const staleHash = 'h_stale' as ContentHash;
  const events = [
    buildDeliveredEvent(env, deliveredHash, 'tck-d1'),
    buildSignalEvent(env, staleHash, 'read', { id: 'tck-s1' }),
  ];

  const ok = disclosureHasOpportunityToBeRead(events, env.subject, {
    requirementId: env.requirementId,
    acceptedSignals: ['read'],
    requireHashMatch: true,
  });

  if (ok) {
    return {
      ok: false,
      code: 'HASH_MISMATCH_FALSE_POSITIVE',
      message:
        `disclosureHasOpportunityToBeRead returned true despite the signal's ` +
        `contentHash ('${staleHash}') differing from the delivered Disclosure's ` +
        `contentHash ('${deliveredHash}') under requireHashMatch:true. Runtime ` +
        `fails CRAWCUS conformance per 02-product/crawcus-contracts.md §6.A ` +
        `point 3.`,
    };
  }

  return TCK_RESULT_PASS;
}
