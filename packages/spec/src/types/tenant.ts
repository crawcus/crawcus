/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActorId, Purpose, Region, TenantId } from './ids.js';
import type { LawfulBasis } from './compliance.js';

/**
 * Year-7 architectural default: every primitive carries `tenantId`.
 * Tenants are resolved by the IdentityPort; core never constructs them.
 */
export interface Tenant {
  readonly id: TenantId;
  readonly region: Region;
  /** Adapter-opaque metadata; per-deployment extension point. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Who performed the action. Display name is non-authoritative — the
 * identity vendor (Clerk / Auth.js / WorkOS) owns truth.
 */
export interface Actor {
  readonly id: ActorId;
  readonly kind: 'human' | 'system' | 'agent';
  readonly displayName?: string;
}

/**
 * Capability-style context (ratchet #18 — no ambient authority).
 * Every public function in core that touches data takes either
 * `TenantCtx` or `AccessCtx`.
 */
export interface TenantCtx {
  readonly tenant: Tenant;
  readonly actor: Actor;
}

/**
 * Cross-tenant boundary context. Adds why-was-this-access-permitted
 * — GDPR Art. 6 lawful basis for *this access*, distinct from the
 * basis of any underlying event being accessed.
 */
export type AccessCtx = TenantCtx & {
  readonly lawfulBasis: LawfulBasis;
  readonly purpose: Purpose;
  readonly reason?: string;
};
