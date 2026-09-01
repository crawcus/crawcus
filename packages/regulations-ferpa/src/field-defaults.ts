/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FieldCompliance } from '@crawcus/core';

/**
 * Q-AC lock: FERPA-shaped education-record fields. Per 34 CFR §99.3
 * "education records" definition + the directory-information exception.
 *
 * Customers extend this in their `tallyseal.compliance.ts`. Fields not
 * in this default set (e.g., custom local-IDs) are added per-deployment.
 *
 * **Directory information caveat**: name, address, phone, etc. CAN be
 * disclosed without consent IF the institution has given annual public
 * notice AND the parent/student hasn't opted out. The defaults below
 * mark them as `'personal'` (not `'none'`) — the customer's CrawcusSpec
 * is responsible for the directory-information opt-out logic via
 * Contracts or `derogations`.
 */
export function ferpaEducationRecordDefaults(
  projection: string,
): Readonly<Record<`${string}.${string}`, FieldCompliance>> {
  return {
    [`${projection}.studentName`]: {
      pii: 'personal',
      retention: 'P50Y' as never, // education records: typically lifetime
    },
    [`${projection}.studentId`]: { pii: 'sensitive', retention: 'P50Y' as never },
    [`${projection}.dateOfBirth`]: { pii: 'personal', retention: 'P50Y' as never },
    [`${projection}.parentName`]: { pii: 'personal', retention: 'P50Y' as never },
    [`${projection}.grades`]: { pii: 'sensitive', retention: 'P50Y' as never },
    [`${projection}.disciplinaryRecord`]: { pii: 'sensitive', retention: 'P50Y' as never },
    [`${projection}.specialEducationRecord`]: {
      pii: 'special-art-9',
      retention: 'P50Y' as never,
    },
    [`${projection}.transcript`]: { pii: 'sensitive', retention: 'P50Y' as never },
  } as Readonly<Record<`${string}.${string}`, FieldCompliance>>;
}
