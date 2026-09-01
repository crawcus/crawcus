# @crawcus/spec

Reference content for the **CRAWCUS** open standard — Contract · Receipt · Attestation · Warrant — Compliance Unified Specification.

This package contains the vendor-neutral, brand-neutral spec layer:

- Wire-format types (Event, Intent, CrawcusSpec, Suggestion, Projection, Brand, Tainted/Untainted, IDs, Tenant, Field, Compliance, Locale, Duration)
- Contract primitive — types, evaluator algorithm, monotonic composition, predicate canonicalisation (RFC 8785 JCS), hashing, size-limit, violation shape
- Compliance Manifest schema + build-time validation
- Intent / CrawcusSpec factories (`defineCrawcusSpec`, `field`, `composeIntent`)
- Hash chain — SHA-256, canonical JSON (RFC 8785), tamper-evidence
- Readiness predicate evaluator
- Graph evaluator
- `Result<T, E>` utility (`neverthrow` re-export)

## What's NOT in this package

This is the **spec layer**. Tallyseal-specific implementation choices — ports / adapters, the `writeEvent` orchestrator, the `TallysealConfig` shape, PII tokenisation strategy, typed-error catalog, reducer dispatcher, audit-bundle composer — live in [`@crawcus/core`](../core), which depends on this package.

## Boundaries

- **Brand-neutral**: no `Tallyseal` identifier or string appears in source (enforced by `tallyseal/no-brand-leak` ESLint rule).
- **Self-contained**: imports only `@noble/hashes`, `canonicalize`, `neverthrow`, `uuidv7`, `valibot`, `tiny-invariant`. No internal imports from `@tallyseal/*` (enforced structurally by the package boundary — TypeScript compiler refuses).
- **Y10 marker**: any conformant CRAWCUS runtime implementation can be built on this package alone, plus its own runtime choices. The spec is portable to non-TypeScript implementations (Go / Rust target Y1 H2).

## Incoming primitives (action-board Sprint 1-5)

The 14-primitive lock (canon `00-canon/architecture-primitives.md`) lands 5 new primitives in v0.2.0 of this package. **All 5 land in `packages/spec/src/`, not in `@crawcus/core`** — they're spec content per the spec-vs-runtime categorization:

| Primitive | Sprint | Lives in (post-sprint) |
|---|---|---|
| **Warrant** | Sprint 1 | `packages/spec/src/warrant/` |
| **Disclosure** | Sprint 2 | `packages/spec/src/disclosure/` |
| **Consent** | Sprint 3 | `packages/spec/src/consent/` |
| **Lineage** | Sprint 4 | `packages/spec/src/lineage/` |
| **HumanOversight** | Sprint 5 | `packages/spec/src/human-oversight/` |

Each primitive contributes:
- Wire-format types (the artifact shape that the runtime emits)
- Pure evaluation semantics (validity checks, signature verification, etc.)
- TCK conformance suite extensions

Tallyseal runtime extensions (e.g., `writeEvent` extensions that emit each primitive, port interfaces for issuers/signatories) live in `@crawcus/core`. The runtime IMPLEMENTS the spec; the spec is what other CRAWCUS-conformant runtimes (future Go / Rust impls) implement against.

## Import policy

- **Spec authors** import directly from `@crawcus/spec` (this package).
- **Runtime consumers** (HF, third-party adopters using the Tallyseal runtime) import via `@crawcus/core` re-exports — `@crawcus/core` is the single-import-surface boundary for runtime use.
- This split preserves Y10 vendor-neutrality (`@crawcus/*` spec spin-out per ratchet #23) while giving runtime consumers a cleaner import boundary.

## `computeBundleVersion` — consent-bundle content hash

`computeBundleVersion(disclosures)` returns a deterministic SHA-256 hex string over the set of `(requirementId, contentHash)` pairs that were delivered to a data subject as a single "consent bundle". Stamp the result on `Caller.consentBundleVersion` so auditors can prove later which exact copy bundle the subject was shown at consent time.

```ts
import { computeBundleVersion, type DisclosureRequirementId } from '/core';

const bundle = [
  {
    requirementId: 'gdpr-art-13-notice' as DisclosureRequirementId,
    text: 'We collect …', format: 'markdown' as const, locale: 'en',
  },
  {
    requirementId: 'ferpa-§99.7-annual-notification' as DisclosureRequirementId,
    text: 'Annual notification …', format: 'markdown' as const, locale: 'en',
  },
];

const consentBundleVersion = computeBundleVersion(bundle);
// → 64-char hex; deterministic across input shuffles and process restarts;
//   parity with future Go / Rust / Python implementations (RFC 8785 + SHA-256).
```

**Naming-adjacency: `ConsentBundleVersion` vs `AuditBundleVersion`.** These are different concepts that happen to share the word *bundle*:

| Type | What it tags | Example value |
|---|---|---|
| `ConsentBundleVersion` (here) | Content-hash snapshot of the delivered disclosure copies | `"e3b0c44298fc…"` (SHA-256 hex) |
| `AuditBundleVersion` (`audit-bundle/types.ts`) | Wire-format version of the audit-bundle envelope | `"v0.4"` |

They never collide at the consumer site — they live on different fields (`Caller.consentBundleVersion` vs `AuditBundle.bundleVersion`) — and the `consent`-prefix disambiguates them everywhere they appear together.

## Y1 H2 spin-out

This package spins out to `github.com/crawcus/spec` (under the `@crawcus` npm scope, claimed defensively 2026-05-21) at W3C/IEEE submission time. The spin-out is a scope rename (`@crawcus/spec` → `@crawcus/spec`) plus a repo move. See [decision-log B1.3b](../../docs/notebook/09-operating/decision-log.md) and [ratchet #23](../../docs/notebook/07-engineering/ratchet-disciplines.md).

## License

MIT
