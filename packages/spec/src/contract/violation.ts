/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Contract, ContractCtx, ContractViolationPayload, ToolProposedCtx } from './types.js';
import type { EventId, IntentId } from '../types/ids.js';
import { hashPredicate } from './hash.js';

/**
 * Construct a `ContractViolation` event payload from a failed
 * evaluation. Used by:
 *
 *   - The evaluator (4b) to build the payload it returns alongside
 *     a `'fail'` result.
 *   - `writeEvent` (4c) to append the event to the chain when severity
 *     is `'warn'` (continues) or to throw with this payload attached
 *     when severity is `'block'` (rolls back).
 *
 * `contract` widens over `Contract<ContractCtx> |
 * Contract<ToolProposedCtx>` (TKT-V6-ITEM-15) so callers can pass a
 * result from any checkpoint slot — including `tool_proposed` — without
 * a cast. The body reads only `id` / `description` / `citation` /
 * `severity` / `predicate.toString()` (for hashing), all structurally
 * present on both shapes.
 */
export function makeContractViolationPayload(args: {
  contract: Contract<ContractCtx> | Contract<ToolProposedCtx>;
  ctx: ContractCtx;
  triggeringEventId: EventId;
  missingFields?: readonly string[];
}): ContractViolationPayload {
  const { contract, ctx, triggeringEventId, missingFields } = args;
  const intentId: IntentId = ctx.intent.id;
  return {
    contractId: `${ctx.spec.key}:${contract.id}:v${ctx.intent.specVersion}`,
    contractDescription: contract.description,
    ...(contract.citation ? { citation: contract.citation } : {}),
    predicateHash: hashPredicate(contract.predicate as (...args: never[]) => boolean),
    severity: contract.severity ?? 'block',
    triggeringEventId,
    contextSummary: {
      intentId,
      snapshot: ctx.snapshot,
      ...(missingFields ? { missingFields } : {}),
    },
  };
}
