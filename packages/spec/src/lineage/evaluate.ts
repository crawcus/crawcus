/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Lineage,
  LineageCheckpoint,
  LineageCtx,
  LineageEvaluationResult,
  LineageEvaluationStatus,
  LineageRequirement,
  ProvNode,
  ProvOSerialization,
} from './types.js';
import type { Iri, Timestamp } from '../types/ids.js';
import { isoDate } from '../event/canonical-json.js';

/**
 * # evaluateLineage — the pre / inv / post pure evaluator
 *
 * Pure, total, side-effect-free. Given the spec's Lineage requirement,
 * the set of Lineage records the runtime has located for the current
 * intent, the materialised evaluation context, and the checkpoint —
 * return a `LineageEvaluationResult` discriminated by `status`.
 *
 * Mirrors `evaluateDisclosure` / `evaluateConsent` / `evaluateWarrant`
 * structurally. The semantics are PROV-O-shaped: an AI-mediated event
 * requires a Lineage record that meets the wire-format integrity bar
 * (no blank nodes, valid graph, enough inputs).
 *
 * ## Evaluation order (failures short-circuit)
 *
 *   1. **No AI provenance** — `ctx.hasAIProvenance === false` → `valid`
 *      (Lineage is only required for AI-mediated events; non-AI
 *      events skip the gate entirely.)
 *   2. **Missing** — no Lineage records present at all → `missing`.
 *   3. **Insufficient inputs** — pick the most recent Lineage record;
 *      if `inputs.length < requirement.minInputs` → `insufficient-inputs`.
 *   4. **Blank-node forbidden** — any PROV node in the graph lacks an
 *      explicit `@id` Iri → `blank-node-forbidden`. Per Q-CR7c +
 *      federation discipline.
 *   5. **Malformed PROV-O** — context missing or `@graph` empty →
 *      `malformed-prov-o`.
 *   6. Otherwise → `valid`.
 *
 * v0.4.0 ships the structural validators above; deep PROV-O semantic
 * validation (e.g., every `wasGeneratedBy` references a known
 * Activity) is deferred to v0.5.0 when we add the `jsonld` round-
 * trip test in the TCK.
 */
export function evaluateLineage(
  requirement: LineageRequirement,
  lineages: readonly Lineage[],
  ctx: LineageCtx,
  checkpoint: LineageCheckpoint = 'pre',
): LineageEvaluationResult {
  const evaluatedAt = isoDate(ctx.now) as Timestamp;

  function result(status: LineageEvaluationStatus, reason?: string): LineageEvaluationResult {
    return reason === undefined
      ? { checkpoint, status, evaluatedAt }
      : { checkpoint, status, reason, evaluatedAt };
  }

  // ============ 1. No AI provenance — gate skipped ============
  if (!ctx.hasAIProvenance) {
    return result('valid');
  }

  // ============ 2. Missing ============
  if (lineages.length === 0) {
    return result(
      'missing',
      `No Lineage record exists for intent '${ctx.intent.id}'; AI-mediated event requires one per spec.lineageRequirement`,
    );
  }

  // Pick the most-recent Lineage record by recordedAt.
  const mostRecent = lineages.reduce((acc, l) => (l.recordedAt > acc.recordedAt ? l : acc));

  // ============ 3. Insufficient inputs ============
  const minInputs = requirement.minInputs ?? 1;
  if (mostRecent.inputs.length < minInputs) {
    return result(
      'insufficient-inputs',
      `Lineage record has ${mostRecent.inputs.length} inputs; requirement.minInputs is ${minInputs}`,
    );
  }

  // ============ 4. PROV-O integrity ============
  const integrityCheck = checkProvOIntegrity(mostRecent.provO);
  if (integrityCheck.status !== 'ok') {
    return result(integrityCheck.status, integrityCheck.reason);
  }

  // ============ Valid ============
  return result('valid');
}

/**
 * Pure structural validator over a `ProvOSerialization` document.
 * Exposed as a helper so the TCK can re-validate fixtures.
 */
export function checkProvOIntegrity(doc: ProvOSerialization):
  | { readonly status: 'ok' }
  | {
      readonly status: 'malformed-prov-o' | 'blank-node-forbidden';
      readonly reason: string;
    } {
  // Empty graph or missing context = malformed
  if (!doc['@context']) {
    return { status: 'malformed-prov-o', reason: 'PROV-O document missing @context' };
  }
  if (!Array.isArray(doc['@graph']) || doc['@graph'].length === 0) {
    return {
      status: 'malformed-prov-o',
      reason: 'PROV-O document @graph is empty or not an array',
    };
  }

  // Every node must have an explicit @id (no blank nodes)
  for (const node of doc['@graph']) {
    if (!hasExplicitId(node)) {
      return {
        status: 'blank-node-forbidden',
        reason: `PROV node lacks explicit @id (blank node forbidden per Q-CR7c federation discipline)`,
      };
    }
  }

  return { status: 'ok' };
}

function hasExplicitId(node: ProvNode): node is ProvNode & { readonly '@id': Iri } {
  // ProvNodeBase requires '@id' at the type level; this runtime guard
  // catches violations that slipped past TS (e.g., raw JSON parsed
  // without validation).
  return typeof node['@id'] === 'string' && node['@id'].length > 0;
}
