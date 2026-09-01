import type { Event } from '../types/event.js';
import type { Intent } from '../types/intent.js';
import type { CrawcusSpec } from '../types/intent.js';
import { materialiseReadinessCtx } from './context.js';

/**
 * Result of a Layer-3 readiness check. `missing` enumerates the
 * required field keys that have not yet been satisfied.
 */
export interface ReadinessResult {
  readonly ready: boolean;
  readonly missing: readonly string[];
}

/**
 * Layer 3 (reducer atomic guard) — invoked by `writeEvent` (4c) when
 * the event kind is `'ProjectionCommit'`. Refuses the commit if the
 * CrawcusSpec's `readiness` predicate returns false.
 *
 * Layer 1 (UI grey-CTA) and Layer 2 (AI extractor prompt) consume
 * the same predicate from `CrawcusSpec.readiness` — call sites differ,
 * but the underlying function is identical (NFR C6).
 *
 * Pure; deterministic.
 */
export function checkReadiness(
  intent: Intent,
  spec: CrawcusSpec,
  events: readonly Event[],
): ReadinessResult {
  const ctx = materialiseReadinessCtx({ events, snapshot: intent.snapshot });
  const ready = spec.readiness(ctx);
  if (ready) return { ready: true, missing: [] };

  // Diagnostic: which required fields are not yet satisfied?
  const missing: string[] = [];
  for (const [key, fieldSpec] of Object.entries(spec.fields)) {
    if (fieldSpec.metadata.required && intent.snapshot[key] === undefined) {
      missing.push(key);
    }
  }
  return { ready: false, missing };
}
