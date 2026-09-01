/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Event } from '../types/event.js';
import type { Intent, CrawcusSpec } from '../types/intent.js';
import { materialiseReadinessCtx } from '../readiness/context.js';

/**
 * Snapshot of where the CrawcusSpec's field graph stands at a moment
 * in time. The graph evaluator computes this; the AI extractor reads
 * `pending` to decide what to ask next.
 */
export interface GraphState {
  readonly satisfied: ReadonlySet<string>;
  readonly pending: readonly {
    readonly key: string;
    readonly priority: 'early' | 'normal' | 'late';
  }[];
  readonly blocked: readonly { readonly key: string; readonly reason: string }[];
}

/**
 * Per `00-canon/architecture-primitives.md` §"Graph evaluator":
 * "computes what to ask next based on dependencies + required-ness +
 * user's current focus."
 *
 * v0.0.1 implementation: simple bucket pass.
 *   - satisfied: key already present in snapshot
 *   - blocked: dependsOn predicate returns false
 *   - pending: required, not satisfied, not blocked (sorted by askWhen.priority)
 *
 * Future (v1.x): user-focus weighting, parallelisation hints,
 * cross-field dependency graph topo-sort.
 */
export function evaluateGraph(
  intent: Intent,
  spec: CrawcusSpec,
  events: readonly Event[],
): GraphState {
  const ctx = materialiseReadinessCtx({ events, snapshot: intent.snapshot });
  const satisfied = new Set<string>();
  const pending: { key: string; priority: 'early' | 'normal' | 'late' }[] = [];
  const blocked: { key: string; reason: string }[] = [];

  for (const [key, fieldSpec] of Object.entries(spec.fields)) {
    if (intent.snapshot[key] !== undefined) {
      satisfied.add(key);
      continue;
    }

    if (!fieldSpec.metadata.required) {
      // Optional field that's not satisfied — not blocked, not pending
      continue;
    }

    if (fieldSpec.metadata.dependsOn) {
      const askable = fieldSpec.metadata.dependsOn.when(ctx);
      if (!askable) {
        blocked.push({ key, reason: 'dependsOn predicate not yet satisfied' });
        continue;
      }
    }

    pending.push({ key, priority: fieldSpec.metadata.askWhen?.priority ?? 'normal' });
  }

  // Sort pending by priority: early < normal < late
  const priorityOrder = { early: 0, normal: 1, late: 2 };
  pending.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return { satisfied, pending, blocked };
}
