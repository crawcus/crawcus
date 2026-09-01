/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FieldCompliance } from '@crawcus/core';

/**
 * Q-AC lock (2026-05-21): regulation modules ship default
 * `FieldCompliance` partials that customers extend in their
 * `tallyseal.compliance.ts`. Removes the boilerplate of typing out the
 * common fields by hand.
 *
 * Customer pattern:
 *
 * @example
 * import { defineCompliance } from '@crawcus/core';
 * import { gdprPersonalDataDefaults } from '@crawcus/regulations-gdpr';
 *
 * export default defineCompliance({
 *   regulations: ['gdpr@2025-Q1'],
 *   fields: {
 *     ...gdprPersonalDataDefaults('Course'),
 *     'Course.title': { pii: 'none' }, // override default for non-PII field
 *   },
 *   // ...
 * });
 *
 * The customer can still override any field-specific entry by
 * declaring it after the spread.
 */

/**
 * Common GDPR-shaped personal-data fields for any projection.
 * Generated per-projection-name so the keys are properly prefixed.
 *
 * Note: this is a **starter pack** — customers add domain-specific
 * fields. For a richer set (medical, financial, etc.), compose with
 * `@tallyseal/spec-hipaa-clinical` etc. (Y1 Q2+).
 */
export function gdprPersonalDataDefaults(
  projection: string,
): Readonly<Record<`${string}.${string}`, FieldCompliance>> {
  return {
    [`${projection}.fullName`]: { pii: 'personal', retention: 'P7Y' as never },
    [`${projection}.email`]: { pii: 'personal', retention: 'P7Y' as never },
    [`${projection}.phone`]: { pii: 'personal', retention: 'P7Y' as never },
    [`${projection}.address`]: { pii: 'personal', retention: 'P7Y' as never },
    [`${projection}.dateOfBirth`]: { pii: 'personal', retention: 'P7Y' as never },
    [`${projection}.ipAddress`]: { pii: 'personal', retention: 'P1Y' as never },
  } as Readonly<Record<`${string}.${string}`, FieldCompliance>>;
}

/**
 * GDPR Article 9 special-category defaults — these REQUIRE explicit
 * consent + the CrawcusSpec must gate them via `dependsOn`. The
 * compliance validator enforces this at build time.
 */
export function gdprSpecialCategoryDefaults(
  projection: string,
): Readonly<Record<`${string}.${string}`, FieldCompliance>> {
  return {
    [`${projection}.medicalNotes`]: {
      pii: 'special-art-9',
      retention: 'P6Y' as never,
      requireBAA: true,
    },
    [`${projection}.biometricData`]: { pii: 'special-art-9', retention: 'P1Y' as never },
    [`${projection}.geneticData`]: { pii: 'special-art-9', retention: 'P10Y' as never },
    [`${projection}.ethnicOrigin`]: { pii: 'special-art-9', retention: 'P3Y' as never },
    [`${projection}.religiousBelief`]: { pii: 'special-art-9', retention: 'P3Y' as never },
    [`${projection}.politicalOpinion`]: { pii: 'special-art-9', retention: 'P3Y' as never },
    [`${projection}.sexualOrientation`]: { pii: 'special-art-9', retention: 'P3Y' as never },
    [`${projection}.unionMembership`]: { pii: 'special-art-9', retention: 'P3Y' as never },
  } as Readonly<Record<`${string}.${string}`, FieldCompliance>>;
}
