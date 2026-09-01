# @crawcus/regulations-ferpa

FERPA (US Family Educational Rights and Privacy Act, 20 USC §1232g
+ 34 CFR Part 99) Contract factories + FieldCompliance defaults.

Pinned version: **`ferpa@2024`**.

## Install

```bash
pnpm add @crawcus/regulations-ferpa
```

## Use

```ts
import { defineCrawcusSpec, defineCompliance } from '/core';
import {
  disclosureConsent,
  ferpaEducationRecordDefaults,
  FERPA_VERSION,
} from '@crawcus/regulations-ferpa';

// tallyseal.compliance.ts:
export default defineCompliance({
  regulations: ['gdpr@2025-Q1', FERPA_VERSION],
  fields: {
    ...ferpaEducationRecordDefaults('Course'),
    // override or add per-deployment fields:
  },
  // ...
});

// CrawcusSpec:
defineCrawcusSpec({
  key: 'ShareTranscript',
  contracts: {
    invariants: [
      disclosureConsent({
        consentField: 'studentConsentEventId',
        disclosurePurpose: 'transcript-release',
      }),
    ],
  },
});
```

## What ships in 0.0.1

- `disclosureConsent({ consentField, disclosurePurpose })` — §99.31 default
- `ferpaEducationRecordDefaults(projection)` — §99.3 record-class defaults
- `FERPA_VERSION` — `'ferpa@2024'`

## §99.31 exceptions

The default rule (§99.30) is written consent. §99.31 enumerates
exceptions (legitimate educational interest, audit/evaluation,
judicial order, health/safety emergency, etc.). Tallyseal v0.0.1
treats these as **derogations**: customers using an exception
declare it explicitly via `derogations` on the CrawcusSpec, with
basis citation + justification. Silent removal of the Contract
is a build-time error.

## Roadmap

- §99.30 written consent shape helpers
- §99.31(a)(1) legitimate-educational-interest derogation template
- §99.31(a)(9) judicial-order derogation template
- Directory-information opt-out Contract (§99.37)
- §99.32 record-of-disclosure event-emission helpers

## License

MIT.
