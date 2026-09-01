/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Event } from '../types/event.js';
import type { Intent, CrawcusSpec } from '../types/intent.js';
import type { Tenant } from '../types/tenant.js';

/**
 * Projector — Layer 3 extractor (subject-specific, versioned, re-runnable).
 * Per `architecture-primitives.md` §"Projector":
 *
 *   "subject-specific extractor, versioned and re-runnable. Workers
 *    emit events when done."
 *
 * The spec defines the brand-neutral interface shape. Runtime
 * implementations (Tallyseal, future Go/Rust/Python) extend
 * `ProjectorBaseCtx` with implementation-specific capabilities
 * (e.g., Tallyseal adds `ai: AIPort` and `pii: PIIPort` via
 * `TallysealProjectorCtx` in `/core`).
 *
 * Versioning rule: re-running an older `version` against the same
 * input MUST produce the same `ProjectorOutput` (deterministic).
 * Hash-equality verified in CI via fixture playback (eval corpus).
 */

/**
 * The minimum context any CRAWCUS-conformant Projector receives.
 * Runtime implementations narrow this by intersecting with
 * implementation-specific capabilities.
 */
export interface ProjectorBaseCtx {
  readonly intent: Intent;
  readonly spec: CrawcusSpec;
  readonly events: readonly Event[];
  readonly tenant: Tenant;
}

/**
 * A Projector is generic in both its input payload type and its
 * context type. The context must extend `ProjectorBaseCtx` so that
 * any conformant Projector can rely on the four base fields.
 */
export interface Projector<TPayload = unknown, TCtx extends ProjectorBaseCtx = ProjectorBaseCtx> {
  readonly name: string;
  readonly version: number;
  extract(input: TPayload, ctx: TCtx): Promise<ProjectorOutput>;
}

export interface ProjectorOutput {
  /**
   * Proposals to add to the AI extractor's Suggestion queue.
   * Each proposal is a field value with a confidence score.
   */
  readonly proposals: readonly {
    readonly fieldKey: string;
    readonly value: unknown;
    /** 0..1 */
    readonly confidence: number;
  }[];

  /**
   * Optional events to emit alongside the proposals (e.g., a
   * `'BaselineExtracted'` event recording the projector run for
   * audit). `id` + `prevHash` + `contentHash` + `version` are
   * assigned by the runtime's writeEvent (or equivalent), not here.
   */
  readonly events?: readonly Omit<Event, 'id' | 'prevHash' | 'contentHash' | 'version'>[];
}
