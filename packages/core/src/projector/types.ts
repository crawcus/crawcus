/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Projector, ProjectorBaseCtx } from '@crawcus/spec';
import type { AIPort } from '../ports/ai.js';
import type { PIIPort } from '../ports/pii.js';

/**
 * Tallyseal's flavour of `ProjectorBaseCtx` — adds AI + PII port
 * capabilities so projectors can call AI extraction and PII
 * tokenisation during projection.
 *
 * Other CRAWCUS-conformant runtimes are free to define their own
 * extended ctx — the spec only requires that whatever ctx they
 * use extends `ProjectorBaseCtx`.
 */
export interface ProjectorCtx extends ProjectorBaseCtx {
  readonly ai: AIPort;
  readonly pii: PIIPort;
}

/**
 * A Tallyseal Projector — bound to `ProjectorCtx`. Customer code
 * authors projectors against this type when running on the
 * Tallyseal runtime.
 */
export type TallysealProjector<TPayload = unknown> = Projector<TPayload, ProjectorCtx>;
