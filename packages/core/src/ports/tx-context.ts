/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Tenant } from '@crawcus/spec';

/**
 * Opaque transaction handle. Adapter-specific (Prisma `tx`, Drizzle
 * `tx`, Postgres native, etc.). Core never inspects the inner shape.
 *
 * `__tx` is `unknown` deliberately — adapters cast to their own
 * concrete transaction type at the boundary; core treats it as a
 * capability token.
 *
 * NOTE: `HashChainProof` lived here historically as a sibling type
 * but is part of the CRAWCUS open spec (the wire-format shape any
 * conformant runtime emits). It moved to `@crawcus/spec`
 * — import it from there. The `@crawcus/core` barrel still
 * re-exports it for back-compat.
 */
export interface TxContext {
  readonly __tx: unknown;
  readonly tenant: Tenant;
  readonly startedAt: Date;
}
