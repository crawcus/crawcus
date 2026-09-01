# @crawcus/regulations-gdpr

GDPR Contract factories + FieldCompliance defaults for Tallyseal.

Pinned version: **`gdpr@2025-Q1`**.

## Install

```bash
pnpm add @crawcus/regulations-gdpr
```

## Use

```ts
import { defineCrawcusSpec, defineCompliance } from '/core';
import {
  minorConsent,
  gdprPersonalDataDefaults,
  GDPR_VERSION,
} from '@crawcus/regulations-gdpr';

// In your tallyseal.compliance.ts:
export default defineCompliance({
  regulations: [GDPR_VERSION],
  fields: {
    ...gdprPersonalDataDefaults('Course'),
    'Course.learnerAge': { pii: 'personal' },
    'Course.parentalConsentEventId': { pii: 'personal' },
  },
  // ... rest of the manifest
});

// In your CrawcusSpec:
defineCrawcusSpec({
  key: 'CreateCourse',
  // ...
  contracts: {
    invariants: [
      minorConsent({
        ageField: 'learnerAge',
        consentField: 'parentalConsentEventId',
        minorAge: 16,
      }),
    ],
  },
});
```

## What ships in 0.0.1 (commit 4d minimum)

- `minorConsent({ ageField, consentField, minorAge? })` — Art. 8(1)
- `gdprPersonalDataDefaults(projection)` — common personal-data fields
- `gdprSpecialCategoryDefaults(projection)` — Art. 9 special categories
- `GDPR_VERSION` — `'gdpr@2025-Q1'`

## Changelog

### 0.3.0 (2026-06-02) — additive

- `ageBand` field-builder helper + 3 rejection modes
  (`adultOnly` / `minorAware` / `passthrough`) per HF feedback 2026-06-02
  §6 (IDEA-013 → TKT-AGEBAND-FIELD-BUILDER).
- `AgeBandValue` discriminated union, `AGE_BAND_VALUES` tuple,
  `ageBandField()` typed `field.enum` builder, `isMinorBand()`
  classifier.
- `ageBand.adultOnly` rejects `'under-18'` with `severity: 'block'`;
  `'prefer-not-to-say'` allowed (defensible adult-only default).
- `ageBand.minorAware` routes `'under-18'` to the existing
  Art-8 `minorConsent` Contract (DRY — same citation, same severity);
  `'prefer-not-to-say'` falls through as adult.
- `ageBand.passthrough` captures the band with no policy
  (`severity: 'warn'` — declarable but permissive).

### 0.2.0 (reserved)

Reserved for `TKT-DISCLOSURE-TEMPLATES` (parallel ticket, lands first;
this package leapfrogs to 0.3.0 to avoid version collision).

### 0.1.0 (2026-05-21)

Initial publish — `minorConsent` (Art-8), `solelyAutomatedDecision` +
`contractNecessityException` + `explicitConsentException` +
`humanInterventionSafeguards` + `specialCategoryProhibition` (Art-22),
`gdprPersonalDataDefaults` + `gdprSpecialCategoryDefaults`,
`GDPR_VERSION`.

## Roadmap

- Art. 6 lawful-basis factories (per-purpose-keyed)
- Art. 9 explicit-consent gate (currently enforced at writeEvent level)
- Art. 15 DSAR helpers (request shape + response builders)
- Art. 17 erasure helpers
- Art. 22 automated-decision-explanation
- Art. 35 DPIA template
- Quarterly version refreshes (`gdpr@2025-Q2`, `gdpr@2025-Q3`, …)

## License

MIT.
