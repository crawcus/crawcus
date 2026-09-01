/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Contract, ContractCtx, ToolProposedCtx } from './types.js';
import type { CrawcusSpec } from '../types/intent.js';
import { hashPredicate } from './hash.js';

/**
 * Internal: a Contract from ANY slot — `pre` / `invariants` / `post`
 * (which carry `Contract<ContractCtx>`) or `toolProposed` (which
 * carries `Contract<ToolProposedCtx>`). Composition cares only about
 * `id` + `severity` + `predicate.toString()` for hashing — it never
 * invokes the predicate — so widening over `ContractCtx |
 * ToolProposedCtx` is safe and accurate.
 */
type AnySlotContract = Contract<ContractCtx> | Contract<ToolProposedCtx>;

/**
 * Q-P + Q-AA enforcement: child specs may ADD contracts to parents
 * and INCREASE severity, but may not REMOVE contracts or LOWER
 * severity silently. Silent weakening becomes a build-time error;
 * explicit weakening goes through `derogations` (with cited basis).
 *
 * Called by `validateManifest` (build-time) against every spec pair
 * `(parent, child)` related by `extends`.
 */

export type CompositionViolationCode =
  | 'contract-removed'
  | 'severity-lowered'
  | 'derogation-without-basis'
  | 'derogation-without-justification'
  | 'derogation-references-nonexistent-contract';

export interface CompositionViolation {
  readonly code: CompositionViolationCode;
  readonly message: string;
  readonly contractId?: string;
}

/**
 * Validate that `child` does not weaken `parent`'s contracts except
 * via explicit `derogations`. Returns all violations found (empty
 * array iff composition is monotonic).
 */
export function validateComposition(
  parent: CrawcusSpec,
  child: CrawcusSpec,
): readonly CompositionViolation[] {
  const violations: CompositionViolation[] = [];

  // Index parent contracts by ID across all slots. `toolProposed`
  // (TKT-V6-ITEM-15) joins the same monotonicity discipline: a child
  // spec cannot silently drop a parent's `tool_proposed` Contract any
  // more than it can drop an `invariants` Contract.
  const parentContracts = new Map<
    string,
    { contract: AnySlotContract; slot: 'pre' | 'invariants' | 'post' | 'toolProposed' }
  >();
  for (const slot of ['pre', 'invariants', 'post', 'toolProposed'] as const) {
    const slotContracts: readonly AnySlotContract[] = parent.contracts?.[slot] ?? [];
    for (const c of slotContracts) {
      parentContracts.set(c.id, { contract: c, slot });
    }
  }

  // Index child contracts (by predicate hash, since IDs may collide)
  const childContracts = new Map<string, AnySlotContract>();
  for (const slot of ['pre', 'invariants', 'post', 'toolProposed'] as const) {
    const slotContracts: readonly AnySlotContract[] = child.contracts?.[slot] ?? [];
    for (const c of slotContracts) {
      childContracts.set(c.id, c);
    }
  }

  // Index child derogations
  const childDerogations = new Map<string, NonNullable<CrawcusSpec['derogations']>[number]>();
  for (const d of child.derogations ?? []) {
    childDerogations.set(d.contractId, d);
  }

  // Walk parent contracts — every one must appear in child OR be derogated
  for (const [id, { contract: parentContract }] of parentContracts) {
    const childMatch = childContracts.get(id);
    const derogation = childDerogations.get(id);

    if (!childMatch && !derogation) {
      violations.push({
        code: 'contract-removed',
        message: `child spec removed parent contract '${id}' without a derogation`,
        contractId: id,
      });
      continue;
    }

    if (childMatch) {
      const parentSeverity = parentContract.severity ?? 'block';
      const childSeverity = childMatch.severity ?? 'block';
      if (parentSeverity === 'block' && childSeverity === 'warn') {
        violations.push({
          code: 'severity-lowered',
          message: `child contract '${id}' lowered severity from 'block' to 'warn' — use a derogation instead`,
          contractId: id,
        });
      }

      // If predicate hash changed, that's an evolution — not a violation
      // per se (versioning rule kicks in instead). We don't enforce here.
      // No-op: hash inspection is informational only.
      void hashPredicate;
    }
  }

  // Walk derogations — each must reference an existing parent contract +
  // carry a basis + carry a justification.
  for (const derogation of child.derogations ?? []) {
    const parent = parentContracts.get(derogation.contractId);
    if (!parent) {
      violations.push({
        code: 'derogation-references-nonexistent-contract',
        message: `derogation references contract '${derogation.contractId}' that does not exist in parent`,
        contractId: derogation.contractId,
      });
    }

    if (!derogation.basis || !derogation.basis.regulation || !derogation.basis.article) {
      violations.push({
        code: 'derogation-without-basis',
        message: `derogation for '${derogation.contractId}' lacks a complete RegulationCitation basis`,
        contractId: derogation.contractId,
      });
    }

    if (!derogation.justification || derogation.justification.trim().length === 0) {
      violations.push({
        code: 'derogation-without-justification',
        message: `derogation for '${derogation.contractId}' lacks a justification`,
        contractId: derogation.contractId,
      });
    }
  }

  return violations;
}
