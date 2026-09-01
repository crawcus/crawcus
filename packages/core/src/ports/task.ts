/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EventId, IntentId, TaskId, TenantId } from '@crawcus/spec';
import type { TenantCtx } from '@crawcus/spec';

/**
 * Task = durable async work (file parse, AI extraction, projection
 * rebuild, scheduled retention check). Workers emit events when done;
 * core treats Tasks as supporting primitives (canon: architecture-
 * primitives.md §"Task").
 *
 * `idempotencyKey` dedupes within a tenant — repeated `enqueue` calls
 * with the same key return the prior `TaskHandle`.
 */
export interface TaskSpec<TInput = unknown> {
  readonly kind: string;
  readonly input: TInput;
  readonly intentId?: IntentId;
  readonly tenantId: TenantId;
  readonly idempotencyKey?: string;
}

export interface TaskHandle {
  readonly id: TaskId;
  readonly kind: string;
  readonly enqueuedAt: Date;
}

export type TaskStatus =
  | { readonly state: 'queued' }
  | { readonly state: 'running'; readonly startedAt: Date }
  | {
      readonly state: 'succeeded';
      readonly completedAt: Date;
      readonly resultEventIds: readonly EventId[];
    }
  | { readonly state: 'failed'; readonly completedAt: Date; readonly error: string };

/**
 * Task port — durable async work adapter. Implementations:
 * `@tallyseal/task-inngest` (Y1), `@tallyseal/task-trigger-dev`,
 * `@tallyseal/task-temporal`, `@tallyseal/task-bullmq`,
 * `@tallyseal/task-cloud-tasks`, `@tallyseal/task-local-inline`.
 */
export interface TaskPort {
  enqueue(task: TaskSpec, ctx: TenantCtx): Promise<TaskHandle>;
  status(handle: TaskHandle): Promise<TaskStatus>;
  cancel(handle: TaskHandle): Promise<void>;
}
