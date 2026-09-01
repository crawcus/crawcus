import type { Event, EventKind } from '../types/event.js';
import type { Purpose } from '../types/ids.js';

/**
 * Summary projection of an Event for readiness-predicate consumption.
 * Predicates don't need the full Event surface (hash chain, actor,
 * etc.); they need kind + timestamp + payload.
 */
export interface EventSummary {
  readonly kind: EventKind;
  readonly timestamp: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Context for CrawcusSpec.readiness predicates. Materialised by the
 * runtime per checkpoint; predicates are pure functions over this.
 *
 * Generic over the field map so `has` / `value` autocomplete the
 * spec's actual field keys.
 */
export interface ReadinessCtx {
  has: (...keys: readonly string[]) => boolean;
  value: <T = unknown>(key: string) => T | undefined;
  consentFor: (purpose: Purpose) => boolean;
  events: readonly EventSummary[];
}

/**
 * Materialise a ReadinessCtx from an events log + a derived snapshot.
 * Used by the readiness checker (4b) and the writeEvent invariant
 * guard (4c). Pure; deterministic.
 */
export function materialiseReadinessCtx(opts: {
  events: readonly Event[];
  snapshot: Readonly<Record<string, unknown>>;
}): ReadinessCtx {
  const { events, snapshot } = opts;
  const summaries: EventSummary[] = events.map((e) => ({
    kind: e.kind,
    timestamp: e.timestamp,
    payload: e.payload as Readonly<Record<string, unknown>>,
  }));
  const consentGrants = new Set<string>();
  const consentRevokes = new Set<string>();
  for (const e of events) {
    if (e.kind === 'ConsentGranted') {
      const p = (e.payload as { purpose?: string }).purpose;
      if (typeof p === 'string') consentGrants.add(p);
    } else if (e.kind === 'ConsentRevoked') {
      const p = (e.payload as { purpose?: string }).purpose;
      if (typeof p === 'string') consentRevokes.add(p);
    }
  }
  return {
    has: (...keys) => keys.every((k) => snapshot[k] !== undefined),
    value: <T = unknown>(key: string) => snapshot[key] as T | undefined,
    consentFor: (purpose) => consentGrants.has(purpose) && !consentRevokes.has(purpose),
    events: summaries,
  };
}
