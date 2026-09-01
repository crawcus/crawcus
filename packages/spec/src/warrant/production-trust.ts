/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IssuerTrust } from './issuer-trust.js';

/**
 * # Production trust assertion
 *
 * Per Q-CR5 LOCKED 2026-05-21 + Lighthouse 2026-05-21 Warrant review:
 *
 *   "Production deployments setting acceptUnknown: true must surface
 *    a loud signal (boot-time warning at minimum, lint rule ideal)."
 *
 * The TOFU (`acceptUnknown: true`) escape hatch is **dev-mode only**.
 * Customers SHOULD call `assertProductionTrust` at production
 * bootstrap; it throws if the trust configuration permits TOFU.
 * Tests + fixtures + local dev quickstart pass `acceptUnknown: true`
 * and skip this assertion.
 *
 * Pure; total; never throws on `acceptUnknown: false`.
 */

export class InsecureTrustConfigError extends Error {
  override readonly name = 'InsecureTrustConfigError';
  /** CRAWCUS-spec-level error code (brand-neutral per ratchet #23). */
  readonly code = 'CRAWCUS_INSECURE_TRUST_CONFIG' as const;

  constructor() {
    super(
      'IssuerTrust.acceptUnknown is true — TOFU is a dev-mode escape hatch only. ' +
        'Production deployments MUST configure explicit trust roots and set ' +
        'acceptUnknown: false. Call assertProductionTrust(config.warrants.trust) ' +
        'in your production bootstrap (or run with NODE_ENV=development to skip).',
    );
  }
}

/**
 * Assert that a trust configuration is production-grade. Throws
 * `InsecureTrustConfigError` if `acceptUnknown` is `true`.
 *
 * Callers should invoke this in production bootstrap code — e.g., a
 * Next.js custom server's `server.ts`, a Fastify plugin's onReady
 * hook, a Lambda cold-start handler.
 */
export function assertProductionTrust(trust: IssuerTrust): void {
  if (trust.acceptUnknown) {
    throw new InsecureTrustConfigError();
  }
}

/**
 * Non-throwing variant. Returns `true` iff the trust configuration
 * is production-grade (no TOFU). Use when callers need to branch on
 * the result rather than fail closed.
 */
export function isProductionTrust(trust: IssuerTrust): boolean {
  return !trust.acceptUnknown;
}
