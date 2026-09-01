import type { Event } from '@crawcus/spec';
import type { IntentKey } from '@crawcus/spec';
import type { ProjectionAdapter, ReducerCtx } from '../config/types.js';

/**
 * Route an Event to its per-intent reducer. Called by `writeEvent`
 * inside the active transaction (`ctx.tx`), so the projection write
 * commits together with the event append (ratchet #13 — sealed
 * mutation path; same-TX guarantee).
 *
 * If no reducer is registered for the event's IntentKey, returns
 * `undefined` (the writeEvent caller has not opted in to per-intent
 * projections). This is the case for system events like
 * `'ContractViolation'`, `'RetentionExpired'`, `'AIProxyRefused'`.
 */
export async function dispatchReducer(
  event: Event,
  intentKey: IntentKey,
  adapter: ProjectionAdapter,
  ctx: ReducerCtx,
): Promise<unknown> {
  const slot = adapter[intentKey as string];
  if (!slot) {
    // No reducer registered — silent no-op.
    return undefined;
  }
  return slot.apply(event, ctx);
}
