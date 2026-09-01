/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Event } from '@crawcus/spec';
import type { IntentId } from '@crawcus/spec';
import type { TxContext } from './tx-context.js';

/**
 * Projection port — read model adapter. One implementation per
 * customer-side database flavour: `@tallyseal/projection-prisma`,
 * `@tallyseal/projection-drizzle`, `@tallyseal/projection-mongo`, etc.
 *
 * Core's reducer dispatcher (4c) routes Events through `apply()`;
 * `current()` returns the latest materialised row; `rebuild()`
 * replays the event log from scratch to reconstruct the row.
 *
 * The `rebuild` operation IS the proof of the event-sourcing claim:
 * any projection can be reconstructed from the chain at any version.
 */
export interface ProjectionPort<T = unknown> {
  apply(event: Event, ctx: TxContext): Promise<T>;
  current(intentId: IntentId): Promise<T | null>;
  rebuild(intentId: IntentId): Promise<T>;
}
