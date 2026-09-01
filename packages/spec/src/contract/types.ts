import type {
  ContentHash,
  EventId,
  IntentId,
  Purpose,
  RegulationVersion,
  ToolName,
} from '../types/ids.js';
import type { LocalisedText } from '../types/locale.js';
import type { Event, EventKind } from '../types/event.js';
import type { Intent, CrawcusSpec } from '../types/intent.js';
import type { Tenant } from '../types/tenant.js';
import type { FieldCompliance } from '../types/compliance.js';

/**
 * Regulator citation for a Contract. `decisionId` and `guidanceId`
 * support case-law and binding-FAQ jurisdictions respectively.
 */
export interface RegulationCitation {
  readonly regulation: RegulationVersion;
  readonly article: string;
  readonly paragraph?: string;
  /** e.g., 'ECJ Case C-311/18'. */
  readonly decisionId?: string;
  /** e.g., 'ICO FAQ 2024/3'. */
  readonly guidanceId?: string;
  readonly url?: string;
}

/**
 * Materialised context passed to a Contract predicate. The runtime
 * fetches all required state once per checkpoint and presents it
 * here. Predicates MUST be pure-sync; no I/O inside.
 *
 * `has` / `value` / `consentFor` / `eventsOfKind` are convenience
 * accessors over the same underlying `events` + `snapshot`.
 */
export interface ContractCtx {
  readonly intent: Intent;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly events: readonly Event[];
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly has: (...keys: readonly string[]) => boolean;
  readonly value: <T = unknown>(key: string) => T | undefined;
  readonly consentFor: (purpose: Purpose) => boolean;
  readonly eventsOfKind: (kind: EventKind) => readonly Event[];
}

/**
 * Field-level Contract context — adds the value being validated +
 * the field's compliance-manifest annotation if any.
 */
export type FieldContractCtx<T> = ContractCtx & {
  readonly fieldValue: T;
  readonly compliance?: FieldCompliance;
};

/**
 * `'tool_proposed'`-checkpoint Contract context (TKT-V6-ITEM-15).
 *
 * Materialised when the runtime is about to dispatch an AI-proposed
 * tool call whose `ToolSpec.gate` is `'contract'` (the spec-side
 * declaration from TKT-V6-ITEM-14). The Contract predicate inspects
 * `toolName` + `toolArgs` and returns `true` to allow the call to
 * proceed (the host then runs the tool + writes the resulting field)
 * or `false` to reject it (the host emits a `ContractViolation` event
 * + does NOT execute the tool + does NOT write the field).
 *
 * Tool args are typed `Readonly<Record<string, unknown>>` because the
 * AI's emitted args, while structurally JSON, are not yet validated
 * against `ToolDefinition.inputSchema` at this checkpoint — JSON
 * Schema validation runs DOWNSTREAM of Contract approval (a Contract
 * may legitimately want to reject a schema-valid call, e.g.,
 * "course.enrol with capacity:auto only when consent purpose ⊇
 * `'enrolment'`"). Predicates that need a typed view should narrow
 * `toolArgs` themselves; ratchet #19 still applies (no `any`).
 */
export interface ToolProposedCtx extends ContractCtx {
  readonly toolName: ToolName;
  readonly toolArgs: Readonly<Record<string, unknown>>;
}

/**
 * A named, citable, pure synchronous predicate that an CrawcusSpec
 * commits to. Canonical contract: `02-product/crawcus-format.md`
 * v0.2 §"Contracts".
 *
 * Predicates MUST be pure-sync; runtime enforces this at three layers:
 *   1. Type signature `(ctx) => boolean` (no Promise return)
 *   2. ESLint rule `no-async-contract-predicate` (backstops the type)
 *   3. Runtime evaluator wraps + asserts non-Promise result (4b)
 *
 * Predicate source size limit: 4 KB normalised (Q-S lock; build-time
 * enforced by 4b composition checker).
 */
export interface Contract<TCtx extends ContractCtx = ContractCtx> {
  /**
   * Stable identifier. Convention: `<module>.<reference>` for
   * regulation-module Contracts (e.g., `'gdpr.art8.minorConsent'`);
   * `<spec-package>/<name>` for sector packs; `<name>` for
   * Intent-local. Audit-bundle render fully qualifies:
   * `<intentKey>:<id>:v<event.version>`.
   */
  readonly id: string;

  /** Human-readable; auditor + regulator + insurance underwriter read. */
  readonly description: LocalisedText;

  /** Strongly preferred for any contract that exists *because* of a regulation. */
  readonly citation?: RegulationCitation;

  /** PURE + SYNC. */
  readonly predicate: (ctx: TCtx) => boolean;

  /**
   * `'block'` (default) — violation throws `ContractViolationError`
   * + emits `ContractViolation` event + rolls back transaction.
   * `'warn'` — emits `ContractViolation` event + continues.
   */
  readonly severity?: 'block' | 'warn';
}

/**
 * When in the writeEvent flow this Contract evaluates.
 *
 * - `'pre'`           — runs BEFORE the field write lands. Sees the
 *                       pre-write `snapshot`. Used for "is this write
 *                       allowed?" gates.
 * - `'invariants'`    — runs AFTER the field write would land (the
 *                       snapshot is the post-write view). Used for
 *                       "is the resulting state still legal?" checks.
 * - `'post'`          — runs after all `invariants` pass; carries the
 *                       same post-write snapshot. Used for emit-time
 *                       side-effect declarations (e.g., "lineage
 *                       record present for this AI-attributed
 *                       write?").
 * - `'tool_proposed'` — (TKT-V6-ITEM-15) runs when an AI emits a tool
 *                       call whose `ToolSpec.gate` is `'contract'`,
 *                       BEFORE the call executes + BEFORE any field
 *                       write lands. Sees `toolName` + `toolArgs` on
 *                       the context. A failing predicate rejects the
 *                       call (host emits `ContractViolation`, does
 *                       NOT execute the tool, does NOT write the
 *                       field). Pairs with TKT-V6-ITEM-14's `gate:
 *                       'contract'` semantic — the gate value
 *                       declares intent; this checkpoint is what the
 *                       declared intent hooks into.
 */
export type ContractCheckpoint = 'pre' | 'invariants' | 'post' | 'tool_proposed';

/**
 * Exhaustive runtime array of `ContractCheckpoint` values. The
 * `as const satisfies` form binds the array to the union — drift
 * between them fails the type-check, so adding a new union member
 * forces the array to be updated in the same PR (ratchet #19).
 *
 * Exported so dispatcher callers + audit-bundle renderers can
 * enumerate checkpoints without re-typing the union literally.
 */
export const CONTRACT_CHECKPOINTS = [
  'pre',
  'invariants',
  'post',
  'tool_proposed',
] as const satisfies readonly ContractCheckpoint[];

/**
 * Pure result from the evaluator. The evaluator does NOT throw or
 * write events — it returns results. `writeEvent` (4c) translates
 * `result: 'fail' && severity: 'block'` into ContractViolationError
 * + transaction rollback; `result: 'fail' && severity: 'warn'`
 * appends a ContractViolation event to the chain.
 *
 * `'historical-unverifiable'` is the replay result when an audit
 * bundle's recorded `predicateHash` doesn't match any predicate
 * source available at replay time.
 *
 * `contract` widens over `Contract<ContractCtx> |
 * Contract<ToolProposedCtx>` (TKT-V6-ITEM-15) so results from any
 * checkpoint slot — including `tool_proposed` — flow through the
 * same shape. Consumers reading `contract.id` / `contract.severity`
 * / `contract.description` / `contract.citation` are unaffected by
 * the widening; the audit-bundle render layer never invokes
 * `contract.predicate`.
 */
export type ContractEvaluationResult =
  | {
      readonly result: 'pass';
      readonly contract: Contract<ContractCtx> | Contract<ToolProposedCtx>;
      readonly ctx: ContractCtx;
    }
  | {
      readonly result: 'fail';
      readonly contract: Contract<ContractCtx> | Contract<ToolProposedCtx>;
      readonly ctx: ContractCtx;
      readonly severity: 'block' | 'warn';
    }
  | {
      readonly result: 'historical-unverifiable';
      readonly contractId: string;
      readonly predicateHashSeen: ContentHash;
      readonly reason: string;
    };

/**
 * Payload for the `ContractViolation` event kind. Surfaced in audit
 * bundles per Intent; auditor reads the description + citation +
 * predicate hash + context summary.
 */
export interface ContractViolationPayload {
  readonly contractId: string;
  readonly contractDescription: LocalisedText;
  readonly citation?: RegulationCitation;
  readonly predicateHash: ContentHash;
  readonly severity: 'block' | 'warn';
  readonly triggeringEventId: EventId;
  readonly contextSummary: {
    readonly intentId: IntentId;
    readonly snapshot: Readonly<Record<string, unknown>>;
    readonly missingFields?: readonly string[];
  };
}
