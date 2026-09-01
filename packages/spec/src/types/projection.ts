import type { IntentId, ProjectionId, ProjectionName } from './ids.js';

/**
 * Reference to a projection-table row. Core does not own the
 * projection's shape — the customer's DB does. Projections are
 * rebuildable from the event log via `ProjectionPort.rebuild`.
 */
export interface ProjectionRef {
  readonly projection: ProjectionName;
  readonly id: ProjectionId;
  readonly intentId: IntentId;
  /** Monotonic per row; increments on each reducer apply. */
  readonly version: number;
}
