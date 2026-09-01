/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Contract, ContractCtx, ContractEvaluationResult, ToolProposedCtx } from './types.js';
import type { Event } from '../types/event.js';
import type { Intent, CrawcusSpec } from '../types/intent.js';
import type { Tenant } from '../types/tenant.js';
import type { Purpose, ToolName } from '../types/ids.js';
import { materialiseReadinessCtx } from '../readiness/context.js';

/**
 * Discriminated input shape for `evaluateContracts`. The base shape
 * is shared (spec + intent + tenant + events); `'tool_proposed'`
 * additionally requires the proposed `toolName` + `toolArgs` so the
 * evaluator can materialise the `ToolProposedCtx` that predicates
 * receive. Discriminator is `checkpoint`; ratchet #19 forces every
 * dispatcher to handle the new arm.
 *
 * Backward-compat note: the `'pre' | 'invariants' | 'post'` shape
 * matches the pre-V6-15 signature exactly — existing callers compile
 * unchanged. Only callers that opt in to `'tool_proposed'` must
 * supply the extra fields.
 */
export type EvaluateContractsArgs =
  | {
      readonly spec: CrawcusSpec;
      readonly intent: Intent;
      readonly tenant: Tenant;
      readonly events: readonly Event[];
      readonly checkpoint: 'pre' | 'invariants' | 'post';
    }
  | {
      readonly spec: CrawcusSpec;
      readonly intent: Intent;
      readonly tenant: Tenant;
      readonly events: readonly Event[];
      readonly checkpoint: 'tool_proposed';
      readonly toolName: ToolName;
      readonly toolArgs: Readonly<Record<string, unknown>>;
    };

/**
 * Pure evaluator. Returns results for every Contract in the slot
 * matching `checkpoint`; does NOT throw and does NOT write events.
 *
 * `writeEvent` (4c) translates `result: 'fail' && severity: 'block'`
 * into a `ContractViolationError` throw + transaction rollback;
 * `result: 'fail' && severity: 'warn'` into a `ContractViolation`
 * event written to the chain.
 *
 * Evaluation order within a slot is **declaration order** (Q-T lock):
 * the order Contracts appear in `spec.contracts.{pre,invariants,post,
 * toolProposed}`. Implementations may parallelise iff the result-
 * sequence matches serial declaration-order evaluation — but core's
 * reference implementation evaluates serially for simplicity.
 *
 * Aggregation: does NOT short-circuit on first failure — every
 * Contract in the slot evaluates so the audit bundle records the
 * full set of pass/fail results, not just the first blocker. The
 * `'tool_proposed'` checkpoint mirrors this discipline.
 *
 * Pure-sync: predicates must not return Promises (enforced by
 * `Contract['predicate']` return type + ESLint rule
 * `no-async-contract-predicate` once shipped).
 */
export function evaluateContracts(
  args: EvaluateContractsArgs,
): readonly ContractEvaluationResult[] {
  const { spec, intent, tenant, events, checkpoint } = args;

  switch (checkpoint) {
    case 'pre':
    case 'invariants':
    case 'post': {
      const slot = spec.contracts?.[checkpoint] ?? [];
      if (slot.length === 0) return [];
      const ctx: ContractCtx = buildContractCtx({ spec, intent, tenant, events });
      return slot.map((contract) => runPredicate(contract, ctx));
    }

    case 'tool_proposed': {
      const slot = spec.contracts?.toolProposed ?? [];
      if (slot.length === 0) return [];
      const baseCtx = buildContractCtx({ spec, intent, tenant, events });
      const ctx: ToolProposedCtx = {
        ...baseCtx,
        toolName: args.toolName,
        toolArgs: args.toolArgs,
      };
      return slot.map((contract) => runPredicate(contract, ctx));
    }

    default:
      return assertNever(checkpoint);
  }
}

/**
 * Helper exported for tests + the writeEvent invariant pipeline.
 * Materialises the full ContractCtx from the lower-level inputs.
 */
export function buildContractCtx(args: {
  spec: CrawcusSpec;
  intent: Intent;
  tenant: Tenant;
  events: readonly Event[];
}): ContractCtx {
  const { spec, intent, tenant, events } = args;
  const readinessCtx = materialiseReadinessCtx({
    events,
    snapshot: intent.snapshot,
  });
  const eventsByKind = new Map<string, Event[]>();
  for (const e of events) {
    const bucket = eventsByKind.get(e.kind) ?? [];
    bucket.push(e);
    eventsByKind.set(e.kind, bucket);
  }
  return {
    intent,
    spec,
    tenant,
    events,
    snapshot: intent.snapshot,
    has: readinessCtx.has,
    value: readinessCtx.value,
    consentFor: (purpose: Purpose) => readinessCtx.consentFor(purpose),
    eventsOfKind: (kind) => eventsByKind.get(kind) ?? [],
  };
}

/**
 * Any failure that should block? Convenience predicate for `writeEvent`.
 */
export function hasBlockingFailure(results: readonly ContractEvaluationResult[]): boolean {
  return results.some((r) => r.result === 'fail' && r.severity === 'block');
}

// ============ internals ============

/**
 * Run a single contract predicate against the supplied context. A
 * throwing predicate counts as failure — equivalent to returning
 * `false`. Shared between the field-write slot dispatch + the
 * `'tool_proposed'` slot dispatch so both kinds aggregate identically
 * (no short-circuit; severity carried through from the contract).
 *
 * `TCtx` is invariant in the predicate parameter position, so the
 * function is generic over the slot's concrete context type
 * (`ContractCtx` for pre/invariants/post; `ToolProposedCtx` for
 * tool_proposed). `ContractEvaluationResult.contract` widens to
 * `Contract<ContractCtx> | Contract<ToolProposedCtx>`, so the return
 * type fits without a cast.
 */
function runPredicate<TCtx extends ContractCtx>(
  contract: Contract<TCtx>,
  ctx: TCtx,
): ContractEvaluationResult {
  let passed: boolean;
  try {
    passed = contract.predicate(ctx);
  } catch {
    passed = false;
  }
  // `Contract<TCtx>` widens to `Contract<ContractCtx> |
  // Contract<ToolProposedCtx>` only for TCtx in those two concrete
  // shapes — which is exactly the dispatcher's call sites. A single
  // explicit widen at the result boundary keeps the public result
  // type stable.
  const widened = contract as Contract<ContractCtx> | Contract<ToolProposedCtx>;
  if (passed) {
    return { result: 'pass', contract: widened, ctx };
  }
  return {
    result: 'fail',
    contract: widened,
    ctx,
    severity: contract.severity ?? 'block',
  };
}

/**
 * Ratchet #19 — exhaustive-switch assertion. The compiler narrows
 * `value` to `never` here; if a new `ContractCheckpoint` arm is
 * added without updating the switch, this signature widens to a
 * non-`never` type and the build fails.
 */
function assertNever(value: never): never {
  throw new Error(`unreachable ContractCheckpoint: ${String(value)}`);
}
