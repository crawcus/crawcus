<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# CRAWCUS format — the canonical contract

> **CRAWCUS is the open standard format for AI Application Compliance
> Infrastructure (AACI). A `CrawcusSpec` is one instance: a typed
> declaration of what a Witness Intent collects, how it's collected,
> and what completion means.**
>
> Slated for W3C Community Group / IEEE working group submission within
> 12 months (per `00-canon/identity.md` and `09-operating/decision-log.md`).
> This document is the reference draft.

## Status

- **Format version:** 0.2 (pre-release; subject to non-breaking refinement
  before v1.0). Bumped from 0.1 on 2026-05-20 to add first-class
  Contracts and Wire-format-stability sections — see
  `02-product/crawcus-contracts.md` (design memo) and `09-operating/
  decision-log.md` for the rationale.
- **Stability:** Internal / Codicil Zero (HF) only. Not yet a public
  commitment.
- **Reference implementation:** `packages/core/src/intent/` in this repo
  (planned commit 4b per `07-engineering/core-v0.0.1-type-surface.md`).
- **Standards intent:** open spec, MIT licensed, royalty-free; adopters
  may build alternative implementations. Wire format normatively defined
  in §"Wire-format stability" below; reference RFC 8785 (JSON
  Canonicalization Scheme) for byte-identical re-serialisation across
  TS / Go / Rust / Python implementations.

## What a CrawcusSpec is

A pure declarative TypeScript module that names a typed completion
contract for a conversational flow. **No control flow, no side effects,
no imperative code.** The runtime (Witness Core) interprets the spec to
drive the graph evaluator, AI extractor, readiness gate, and reducer.

```ts
import { defineCrawcusSpec, field } from 'internal-package';

export default defineCrawcusSpec({
  key: 'CreateCourse',
  projection: 'Course',
  version: 1,
  classification: 'high-risk',          // EU AI Act Annex III §3 (education)

  fields: {
    title: field
      .string()
      .required()
      .askHint({
        en: 'What\'s the course called?',
        de: 'Wie heißt der Kurs?',
      }),
    subject: field
      .enum(['math', 'english', 'science', 'history'])
      .required()
      .askHint({ en: 'Which subject?' }),
    level: field
      .string()
      .required()
      .askHint({ en: 'What level — beginner, intermediate, advanced?' }),
    learnerAge: field
      .number()
      .optional()
      .askHint({ en: 'How old is the learner?' })
      .dependsOn({ when: ({ has }) => has('parentalConsentEventId') }),
  },

  readiness: ({ has }) => has('title', 'subject', 'level'),
});
```

## Top-level shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `key` | `string` (PascalCase) | Yes | Globally unique within a customer manifest. Becomes the Intent's `kind`. |
| `projection` | `string` | Yes | The projection-table name the reducer writes to (e.g. `Course`, `Patient`, `Loan`). Must exist in customer schema. |
| `version` | `integer ≥ 1` | Yes | Semver-major analog. Breaking changes increment; migrations required. |
| `classification` | `'standard' \| 'high-risk' \| 'prohibited'` | No (default `'standard'`) | Drives which regulation modules apply (`@tallyseal/regulations`). `'high-risk'` triggers AI Act Art. 14 readiness-gate enforcement. |
| `fields` | `Record<string, FieldSpec>` | Yes | The structural contract — see *Field types* below. |
| `readiness` | `(ctx: ReadinessCtx) => boolean` | Yes | Pure predicate. Returns `true` iff the Intent is complete enough to write. |
| `customReducer` | `(snapshot, ctx) => Promise<ProjectionRef>` | No | Tier-2 escape hatch: invokes host service-layer function instead of direct projection write. See `02-product/integration-tiers.md`. |
| `i18nDefault` | `Locale` | No (default `'en'`) | Fallback locale when an `askHint` doesn't supply the requested locale. |
| `tags` | `string[]` | No | Free-form labels for search, filtering, marketplace categorisation. |
| `extends` | `IntentKey \| null` | No | Optional inheritance for sector-pack overlays. Child overrides parent fields; readiness predicate composes. |

## Field types

Field metadata is *attached* to a base type via a chainable builder.
The base types are deliberately small; richer shapes are composed.

| Base | Builder | Use for |
|---|---|---|
| `string` | `field.string()` | Free text |
| `number` | `field.number()` | Numeric (integer or float; distinguished by `.integer()`) |
| `boolean` | `field.boolean()` | Yes/no |
| `date` | `field.date()` | Calendar dates (no time) |
| `datetime` | `field.datetime()` | Point in time |
| `enum` | `field.enum([...])` | Closed set of choices |
| `array` | `field.array(of)` | Multi-value; `of` is itself a `FieldSpec` |
| `object` | `field.object({...})` | Nested struct; map of named subfields |
| `reference` | `field.reference('OtherProjection')` | FK to another projection |
| `attachment` | `field.attachment({ mime: [...] })` | File upload; triggers `SourceCaptured` event + Task |

### Field metadata (chainable)

| Method | Effect |
|---|---|
| `.required()` | Field must be present at readiness; `required` is the default for any field unless `.optional()` called |
| `.optional()` | May be absent; readiness still evaluates true |
| `.askHint(string \| Record<Locale, string>)` | Per-locale prompt text shown by AI extractor. **Always a record** for i18n; single string is sugar for `{ en: string }`. |
| `.refineHint(string \| Record<Locale, string>)` | Per-locale re-ask text when extractor produces low-confidence value |
| `.dependsOn({ when: predicate })` | Field becomes askable only when predicate returns true (e.g. age only after consent) |
| `.askWhen({ priority: 'early' \| 'normal' \| 'late' })` | Hint to the graph evaluator on ordering preference |
| `.validates(fn)` | Pure predicate run at runtime; failure produces `FieldRejected` event |
| `.default(value \| (ctx) => value)` | Default applied if field absent at readiness |
| `.options([...])` | For `enum`: list of choices. For `string`: known-good values (extractor preferred to match). |
| `.label(string \| Record<Locale, string>)` | Display label in UI (distinct from askHint, which is the AI prompt) |
| `.help(string \| Record<Locale, string>)` | Long-form help text below the field |
| `.placeholder(string \| Record<Locale, string>)` | Input placeholder |
| `.confidential()` | Hint to UI: don't echo back in scrollback summaries |

### Field metadata that **must** match the compliance manifest

The CrawcusSpec **does not** declare PII level, retention, or lawful basis
inline. Those properties live in `codicil.compliance.ts` (see
`02-product/compliance-manifest-schema.md`). At build time, the spec
compiler validates:

1. Every field declared in `fields` has a matching entry in
   `compliance.fields['<projection>.<field>']`.
2. If `compliance.fields[…].pii === 'special-art-9'` (special category),
   the CrawcusSpec must declare a `dependsOn` that gates the field on a
   consent event (`when: ({ has }) => has('<consentEventId>')`).
3. Fields declared as `forbidden-for: <purpose>` in the compliance
   manifest cannot be referenced from this Intent if its purpose
   matches.

**Compliance violations are compile errors, not runtime issues.**

## Readiness predicate

```ts
type ReadinessCtx = {
  has: (...keys: FieldKey[]) => boolean;
  value: <K extends FieldKey>(key: K) => FieldValue<K> | undefined;
  consentFor: (purpose: string) => boolean;
  events: EventSummary[];   // typed by event kind
};
```

The predicate is **pure** — it cannot read external state or perform I/O.
This is what makes the readiness gate hash-testable (per
the project's engineering ratchets #3) and replayable.

The runtime enforces readiness in three places (per
`00-canon/architecture-primitives.md` "Readiness gate"):

1. **UI** — CTA button greyed until predicate returns true.
2. **AI extractor prompt** — extractor told which fields remain.
3. **Reducer atomic guard** — `writeEvent` for `ProjectionCommit` rejects
   the event transactionally if predicate is false. Cannot be bypassed.

## Versioning

Each CrawcusSpec carries an integer `version`. Customer codebases pin
which version they're on; upgrades are explicit.

| Change | Bump | Migration required? |
|---|---|---|
| Add an optional field | None (additive) | No |
| Add a required field | `version + 1` | Yes — supply default or backfill |
| Remove a field | `version + 1` | Yes — two-release deprecation per ratchet #4 |
| Change a field's type | `version + 1` | Yes — coercion or backfill |
| Tighten a validator | `version + 1` | Yes if existing data fails new validator |
| Change `askHint` text only | None | No (UI / extractor only) |
| Change `readiness` predicate | `version + 1` | Yes if existing in-flight Intents would fail new predicate |

Multiple versions can coexist in production. The Event log records
which `(intentKey, version)` produced each event; replay uses the
historical version.

## Inheritance + sector packs

`extends` lets a sector pack overlay a base spec:

```ts
// @tallyseal/spec-ferpa-edu/intents/create-course.ts
export default defineCrawcusSpec({
  key: 'CreateCourse',
  extends: 'internal-package/intents/create-course',
  version: 1,
  fields: {
    parentalConsentEventId: field
      .reference('ConsentEvent')
      .required()
      .dependsOn({ when: ({ value }) => (value('learnerAge') ?? 99) < 16 }),
  },
});
```

Composition rules:

- **Fields**: child fields are merged with parent; same-named fields are
  overridden.
- **Readiness**: child predicate ANDs with parent predicate (default).
  Explicit `readiness` in child fully replaces if `replaceParent: true`.
- **customReducer**: child overrides parent if both present.
- **classification**: child must be ≥ parent (cannot downgrade `high-risk`
  to `standard`).

## Contracts (added v0.2)

> **A Contract is a named, citable, pure synchronous predicate that an
> CrawcusSpec commits to. Contracts are evaluated by the runtime at
> well-defined checkpoints, rendered into audit bundles, and recorded
> as `ContractViolation` events on failure. They make an Intent
> *defensible*, not just *describable*.**
>
> Design rationale: `02-product/crawcus-contracts.md`. This section
> is the canonical specification — read the design memo for the *why*.

### What Contracts add to v0.1

v0.1 described what an Intent **collects** (fields) and **when it's
complete** (readiness). v0.2 adds what an Intent **commits to**:
which predicates must hold *before* the Intent opens, *during* every
event write, and *after* the Intent commits — and which regulation
each commitment honours by citation.

| v0.1 construct | v0.2 status | Relationship to Contracts |
|---|---|---|
| `readiness` | Unchanged | Intent-level postcondition over field presence; distinct from `contracts.post` which evaluates against the projection after commit |
| `field.X().dependsOn({ when })` | Unchanged | Askability gate; controls whether the field is *asked* — Contracts control whether structural commitments *hold* |
| `field.X().validates(fn)` | Unchanged — sugar | Implicitly creates an anonymous field-level Contract with `id = <intentKey>/<fieldKey>/validates-N`, no citation, severity `'block'` |
| `classification: 'high-risk'` | Unchanged | Triggers **default Contracts** from regulation modules cited in `compliance.regulations` — e.g., EU AI Act Art. 14 readiness-gate-enforcement Contract is auto-applied |

### Top-level shape

```ts
defineCrawcusSpec({
  // ... all v0.1 fields ...

  contracts: {
    pre: [
      gdpr.art6.lawfulBasisDeclared({ purpose: 'course-setup' }),
    ],
    invariants: [
      gdpr.art8.minorConsent({ ageField: 'learnerAge', consentField: 'parentalConsentEventId' }),
      ferpa['99.31'].disclosureConsent(),
    ],
    post: [
      ({ snapshot }) => snapshot.status === 'created',
    ],
  },
});
```

| Slot | Checked when | Common uses |
|---|---|---|
| `contracts.pre` | When the Intent opens (first event for the `intentId`) | "This Intent requires consent-for-purpose Y was previously granted"; "Tenant must be in allowed-residency for this Intent type" |
| `contracts.invariants` | On every `writeEvent` for the `intentId` | "If learnerAge < 16 ⟹ parentalConsentEventId present"; "End date > start date"; "Consent referenced by this event has not been revoked" |
| `contracts.post` | On `ProjectionCommit` | "Projection.status === 'created'"; "A `CourseCreated` event exists in the log"; "All Article-22 explanation fields are present" |

### Contract shape

```ts
type Contract<TCtx = ContractCtx> = {
  /** Stable identifier. Convention: '<module>.<reference>' (e.g.
   *  'gdpr.art8.minorConsent') for regulation-module Contracts;
   *  '<spec-package>/<name>' for sector-pack Contracts;
   *  '<name>' for Intent-local Contracts. Audit-bundle render
   *  fully qualifies: '<intentKey>:<id>:v<event.version>'.
   */
  id: string;

  /** Human-readable description; auditor + regulator + underwriter
   *  read this. Single string or per-locale record (i18n per v0.1
   *  LOCKED discipline). */
  description: LocalisedText;

  /** Optional regulator citation. Strongly preferred for any
   *  contract that exists *because* of a regulation. */
  citation?: RegulationCitation;

  /** The predicate itself. PURE + SYNC. Operates only on the
   *  materialised ContractCtx; no I/O; no closures over external
   *  state. Determinism is the W3C/IEEE-credible invariant. */
  predicate: (ctx: TCtx) => boolean;

  /** 'block' (default) — violation throws ContractViolationError +
   *  emits ContractViolation event + rolls back the surrounding
   *  transaction. 'warn' — emits ContractViolation event + execution
   *  continues; use only for aspirational or deprecation-window
   *  contracts. */
  severity?: 'block' | 'warn';
};

type RegulationCitation = {
  regulation: RegulationVersion;  // 'gdpr@2025-Q1'
  article: string;                 // 'Art. 8'
  paragraph?: string;              // '§3(a)'
  /** Case-law citation (e.g., 'ECJ Case C-311/18') for jurisdictions
   *  whose binding interpretations come from courts. */
  decisionId?: string;
  /** Binding regulator FAQ / guidance reference (e.g., 'ICO FAQ 2024/3'). */
  guidanceId?: string;
  url?: string;                    // canonical regulator-published source
};
```

### Field-level Contracts

```ts
field.string()
  .required()
  .askHint({ en: "What's the course called?" })
  .contract({
    id: 'title-non-empty',
    description: { en: 'Course title must be non-empty after trim' },
    predicate: ({ fieldValue }) => typeof fieldValue === 'string' && fieldValue.trim().length > 0,
  });
```

Field-level Contracts evaluate on every `FieldProposed` /
`SuggestionAccepted` / `SuggestionEdited` event for that field.

### ContractCtx — what's materialised

```ts
type ContractCtx = {
  intent: Readonly<Intent>;
  spec: Readonly<CrawcusSpec>;
  tenant: Readonly<Tenant>;
  events: readonly Event[];                  // chronological for this intentId
  snapshot: Readonly<Record<string, unknown>>;
  has: (...keys: readonly string[]) => boolean;
  value: <T = unknown>(key: string) => T | undefined;
  consentFor: (purpose: Purpose) => boolean;
  eventsOfKind: (kind: EventKind) => readonly Event[];
};

type FieldContractCtx<T> = ContractCtx & {
  fieldValue: T;
  compliance?: FieldCompliance;
};
```

The runtime is responsible for materialising the context once per
checkpoint; predicates are pure functions over the materialisation.
**Predicates that need external state must consume it from `ctx`;
they may not perform I/O.**

### Sector-pack composition (monotonic + explicit derogations)

`extends` already allows sector packs to override fields + extend
readiness predicates. v0.2 adds discipline for Contracts:

- Child packs may **ADD** Contracts to parents.
- Child packs may **INCREASE** a parent Contract's severity (`'warn'`
  → `'block'`).
- Child packs may **NOT REMOVE** parent Contracts silently.
- Child packs may **NOT LOWER** a parent's severity silently.

The rule: `extends` is monotonic over commitments **by default**.
Composition cannot weaken guarantees without explicit declaration;
otherwise sector-pack composition becomes a vector for hidden
weakening. **Enforced at build-time by the spec compiler.**

#### Explicit derogations (the legitimate-weakening escape valve)

Some regulations *require* the ability to weaken a Contract under
specific basis — GDPR Art. 89 (research/archiving exemptions), HIPAA
45 CFR 164.512(i) (research with IRB waiver), FDA IND/IDE
expanded-access provisions, FCA Consumer Duty research exemptions.
Forcing the spec to forbid these would force forking the parent
pack, which destroys the audit story.

Sector packs may declare derogations as a separate, explicit field:

```ts
defineCrawcusSpec({
  extends: '@tallyseal/spec-hipaa-clinical/patient-intake',
  derogations: [
    {
      contractId: 'hipaa.164-508.authorisationRequired',
      basis: {
        regulation: 'hipaa@2024',
        article: '45 CFR',
        paragraph: '§164.512(i)',
        decisionId: 'IRB-2026-042',
      },
      justification: 'IRB-waived research protocol; subjects de-identified per Safe Harbor.',
    },
  ],
});
```

Each derogation MUST carry:
- `contractId`: the parent Contract being weakened
- `basis`: a RegulationCitation justifying the derogation (citing the
  regulation that *grants* the exemption, not the one being weakened)
- `justification`: human-readable explanation surfaced in the audit
  bundle

Derogations are **first-class in audit bundles** — every render shows
the full derogation list with citations, so an auditor sees the
explicit weakening immediately. Silent weakening (removing a contract
or lowering severity without a derogation entry) remains a build-time
error.

Derogations may NOT be used to bypass a `'block'` Contract entirely
unless the basis citation is to a regulation that *explicitly* grants
the exemption. The spec compiler does not verify the legal validity
of the basis (that's the customer's compliance officer's job + their
auditor's job + their counsel's job) — but the basis MUST be present.

### Evaluation order within a checkpoint (Q-T lock)

When a checkpoint (`pre` / `invariants` / `post`) contains multiple
Contracts, they evaluate in **declaration order** — the order they
appear in the `contracts.pre` / `contracts.invariants` /
`contracts.post` arrays. Field-level Contracts evaluate in the order
declared on the field builder.

This is normative — replay determinism requires a canonical order.
Implementations MUST evaluate in declaration order; parallel
evaluation is permitted only if the implementation guarantees the
same result-sequence as serial declaration-order evaluation.

### Replay semantics for `'warn'` Contract violations (Q-U lock)

When an audit bundle is replayed (e.g., for verification, regulator
inspection, or eval-corpus regression testing), `'warn'` Contract
violations re-evaluate against the **historical predicate** — the
predicate whose SHA-256 hash matches the `predicateHash` on the
recorded `ContractViolation` event, NOT against the current spec's
predicate.

This is load-bearing: predicates may change between spec versions
(`version + 1` bump per the versioning rules). A bundle generated
against spec v3 must replay-verify against v3's predicates, not v4's
— otherwise replay produces non-deterministic results.

Implementations achieve this by:
1. Storing each Contract's normalised predicate source in the audit
   bundle alongside the predicate hash.
2. During replay, recompiling and evaluating the historical predicate.
3. If the historical predicate source is missing from the bundle (e.g.,
   bundle generated by an older implementation that didn't include
   source), replay reports the violation as `'historical-unverifiable'`
   rather than `'pass'` or `'fail'`.

### ContractViolation event

When a Contract's predicate returns `false`, the runtime emits a
`ContractViolation` event before the surrounding transaction's
outcome (rollback for `'block'`, continued for `'warn'`):

```ts
{
  kind: 'ContractViolation',
  payload: {
    contractId: 'gdpr.art8.minorConsent',
    contractDescription: '...',
    citation: { regulation: 'gdpr@2025-Q1', article: 'Art. 8', paragraph: '§3(a)' },
    predicateHash: 'sha256:...',
    severity: 'block',
    triggeringEventId: 'evt_...',
    contextSummary: { intentId, snapshot, missingFields: ['parentalConsentEventId'] },
  },
}
```

ContractViolation is a first-class `EventKind` in core's
`event/event-kinds.ts`. Audit-bundle extractors surface a per-Intent
summary of all ContractViolations. MGA telemetry treats violation
rate as a priceable signal.

### Audit-bundle output

The audit bundle includes a top-level `contracts` section per Intent:

```json
{
  "intentId": "int_01H...",
  "intentKey": "CreateCourse",
  "specVersion": 2,
  "contracts": {
    "pre": [/* Contract + evaluation history */],
    "invariants": [/* ... */],
    "post": [/* ... */]
  },
  "violations": [/* extracted ContractViolation events */]
}
```

Each rendered Contract carries: `id` (fully qualified),
`description`, `citation`, `severity`, `predicateSource`
(Prettier-normalised), `predicateHash` (SHA-256 over normalised
source), `evaluations` (per-event pass/fail history). Auditors read
the description + can verify the hash matches the source they see;
tampering with either is detectable. Predicate-source render rules
owned by the audit-bundle layer (deferred package).

### Defaults from regulations + ergonomic discipline

**Most Contracts come from regulation modules.** A regulation module
exports typed Contract factories that take the spec-specific binding
(which field is the age, which is the consent event ID, etc.):

```ts
// @tallyseal/regulations/gdpr/art8.ts (exported)
export function minorConsent(opts: {
  ageField: string;
  consentField: string;
  minorAge?: number;
}): Contract { /* ... */ }
```

The Intent author composes them like Lego (see "Top-level shape"
above). Hand-written Contracts are reserved for domain-specific
invariants the regulation modules don't cover. The discipline:
**predicates are the noun; everything else is sugar**.

### Versioning interaction with Contracts

| Change | Bump | Migration required? |
|---|---|---|
| Add an optional Contract | None (additive; new commitment doesn't invalidate prior events) | No, but audit-bundle prior periods will show the Contract absent |
| Add a required Contract (severity 'block') | `version + 1` | Yes — confirm existing in-flight Intents satisfy the new Contract or supply remediation |
| Remove a Contract | `version + 1` + ADR documenting the weakening | Yes — explicit acknowledgement that audit-bundle prior periods showed a Contract that no longer applies |
| Raise a Contract's severity ('warn' → 'block') | `version + 1` | Same as adding a block Contract |
| Lower a Contract's severity ('block' → 'warn') | `version + 1` + ADR | Yes — weakening |
| Edit a Contract's predicate | `version + 1` (predicate hash changes) | Replay log shows the version transition; auditor reads both predicate hashes in bundle |
| Edit a Contract's description (text only) | None | No |

## Wire-format stability (added v0.2)

> **The CrawcusSpec wire format is normatively a UTF-8 JSON document
> canonicalised per RFC 8785 (JSON Canonicalization Scheme). Hash
> equivalence across implementations is a load-bearing property.**

### Why a wire format

CrawcusSpec is authored in TypeScript but **distributed as a wire
format**. Sector packs cross machine boundaries (npm install);
audit bundles cross organisation boundaries (federation); the spec
crosses language boundaries (Go / Rust / Python reference
implementations are required for W3C/IEEE submission credibility).
Hash-identical re-serialisation across implementations is the
property that makes all of this work.

### The format

| Property | Rule |
|---|---|
| Encoding | UTF-8, Unicode NFC normalised |
| Structure | JSON, per RFC 8259 |
| Canonicalisation | RFC 8785 (JCS): keys sorted lexicographically by UTF-8 code-point; no insignificant whitespace; numbers per IEEE 754 + RFC 8785's number serialisation; strings per RFC 8785's string serialisation |
| Predicates | Source code normalised by the **`internal-package` canonical TS-AST normaliser** (in-house; rules normatively defined in this spec — see §"Predicate canonicalisation" below) + SHA-256 content hash over the normalised source. **Not** Prettier-dependent — Prettier ships breaking format changes between minor versions, which would silently re-hash every Contract in every deployed audit bundle. The in-house normaliser is part of the spec and pinned to a Codicil version. Reference implementations carry their own evaluator (a TS implementation cannot run a Rust predicate, by design — predicates compile to evaluator-native artefacts at adapter publish-time) |
| Dates | ISO-8601 strings, UTC, sub-second precision in `Z`-terminated format |
| Numbers | JSON numbers without trailing zeros (`1`, not `1.0`); integers and floats distinguishable by presence of decimal point |
| Locale strings (`askHint`, `description`, etc.) | Plain UTF-8 strings; keys are BCP-47 locale identifiers |
| References (`extends`, `references`) | Spec-package paths (`'@tallyseal/spec-ferpa-edu/intents/create-course'`) or canonical-URI form (`'urn:codicil:spec:gdpr-art8-base'`) |

### Predicate canonicalisation (in-house TS-AST normaliser)

The Codicil canonical TS-AST normaliser is part of the format spec
(`internal-package/contract/normalise.ts`). It is **not** Prettier and
**not** any other third-party formatter — version drift in third-party
formatters silently invalidates predicate hashes across audit bundles,
which is a chain-break-shaped problem.

Normalisation rules (normative; v0.2 lock):

| Rule | Action |
|---|---|
| Whitespace | Single space between tokens; one newline between statements; no trailing whitespace |
| Indentation | Two spaces, never tabs |
| Quotes | Single quotes for strings (escape via `\'`); never template literals unless interpolation is present |
| Object keys | Sorted lexicographically by UTF-8 code-point (matches RFC 8785 sorting) |
| Trailing commas | Always — last array element + last object property + last function argument |
| Semicolons | Always — every statement, including the last in a block |
| Arrow function bodies | If body is a single return expression, use expression-body (`x => x.foo`); else block-body (`x => { return ... }`) |
| Parameter parens | Always required (`(x) =>` not `x =>`) |
| Comments | Removed entirely — comments are non-normative; if a contract needs explanation, it lives in `description` |
| Type annotations | Removed entirely — predicates are evaluated by type-erasure; type annotations exist for authoring ergonomics, not runtime |
| `const`/`let`/`var` | All normalised to `const` for top-level temp bindings; `let` only inside loops (rare in pure predicates) |
| Identifier order | Stable (preserves author's binding order); no reordering of independent statements |

Implementations of `internal-package` ship a normalisation engine that
implements every rule above; the TCK enforces byte-identical output
across reference implementations.

**Predicate size limit (Q-S lock)**: a single predicate's normalised
source MUST NOT exceed **4 KB**. Enforced at build-time by the spec
compiler. Larger predicates are an anti-pattern (they're hard to
audit, hard to test, hard to render in audit bundles); refactor into
multiple smaller named Contracts.

### Hash equivalence test

A v0.2 reference implementation passes the wire-format conformance
test if:
1. Reading a CrawcusSpec JSON document
2. Re-serialising via the implementation's JCS canonicaliser
3. Computing SHA-256 over the serialisation

produces a `contentHash` byte-identical to the TS reference
implementation's output. `@crawcus/tck` ships the
fixture suite for this test.

### Implications for predicates

Predicates **cannot cross language boundaries directly** — a
TypeScript predicate `({ has }) => has('x') && has('y')` is not
syntactically valid Rust. The wire format carries the predicate's
**source text + content hash**; each language's reference
implementation ships its own translator (a TS reference impl can
evaluate the JS source directly; a Go reference impl translates
canonical predicate shapes to Go; etc.). The set of *canonical
predicate shapes* is a constrained subset of TS expressions (no
async, no I/O, no closures over external state); this constraint
makes cross-language translation tractable. The full constrained
subset is normatively defined by the TCK.

### What this rules out (additional to v0.1)

- Predicate source containing language-specific features not in the
  canonical subset (e.g., TS decorators, generators, dynamic
  `import()`)
- Wire-format hashes computed via non-RFC-8785 canonicalisers
  (`JSON.stringify` is non-canonical — do not use)
- Cross-implementation rounds with whitespace differences (RFC 8785
  is strict — no insignificant whitespace)

### Wire-format stability — signed bundle (v0.2)

> *Added per the Q-VERIFIER-CLI-OSS-LOCK Open Q-1 memo (hypothesis-pending-lock 2026-06-03). That memo is not published in this repository. This section is the normative source for the signed-bundle envelope shape for any CRAWCUS-conformant verifier.*

The unsigned canonical-JSON bundle (above) is the **payload**. To make audit bundles transportable, tamper-evident, and third-party-verifiable, CRAWCUS adopts the **[DSSE (Dead Simple Signing Envelope)](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md)** specification — the same envelope used by [in-toto](https://in-toto.io/), [SLSA](https://github.com/slsa-framework/slsa-verifier), and [Sigstore cosign](https://docs.sigstore.dev/cosign/verifying/verify/) for chain-of-custody attestations.

#### Envelope shape

```jsonc
{
  "payloadType": "application/vnd.crawcus.bundle+jsonl",
  "payload": "<base64-encoded JCS-canonical JSONL bundle>",
  "signatures": [
    {
      "keyid": "<ed25519 public-key fingerprint>",
      "sig": "<base64-encoded ed25519 signature over PAE(payloadType, decoded(payload))>"
    }
  ]
}
```

Where DSSE Pre-Authentication Encoding (PAE) is defined as:

```
PAE(type, payload) = "DSSEv1" + SP + LEN(type) + SP + type + SP + LEN(payload) + SP + payload
```

The signature is computed over the bytes of `PAE(payloadType, decoded(payload))` — not over the JSON envelope. This preserves the JCS-canonical payload bytes byte-identically; the verifier base64-decodes once and the resulting bytes hash-equate to the original JCS bundle (per §"Hash equivalence test" above).

#### Payload-type family (open enum per Q-CR9 discipline)

CRAWCUS-conformant verifiers MUST NOT hardcode a single `payloadType` string. The verifier accepts the `application/vnd.crawcus.*+jsonl` family with explicit subtype dispatch:

| `payloadType` subtype | v0.2 status | Verifier behaviour |
|---|---|---|
| `application/vnd.crawcus.bundle+jsonl` | Shipped (audit bundle — this section) | Verify hash chain + Contract pre/inv/post per the unsigned format above |
| `application/vnd.crawcus.disclosure-bundle+jsonl` | Reserved (post-v0.2) | Envelope signature verified; subtype-specific verification deferred with `unknown-subtype` warning + manifest reference |
| `application/vnd.crawcus.warrant-bundle+jsonl` | Reserved (post-v0.2) | Same fall-through |
| `application/vnd.crawcus.attestation-bundle+jsonl` | Reserved (post-v0.2) | Same fall-through |
| Other `application/vnd.crawcus.*+jsonl` | Forward-compat reserved | Envelope verification holds even if subtype semantics are not yet shipped — chain-of-custody on the wrapper is preserved |

This is the Q-CR9-style discriminator pattern applied to the payload-type axis: one canon entry covers all future bundle types without re-lock.

#### Signature suite (v0.2)

**ed25519** is the default + only required Wave-1 signature suite. 32-byte public keys + 64-byte signatures. Native to Node.js crypto, Web Crypto API, and most TS DSSE libraries.

Adding additional suites (ECDSA-P256, Ed25519ph, post-quantum candidates such as ML-DSA) is **additive-MINOR per ratchet #16** — Wave-2+ engineering memo. The DSSE envelope supports multiple signatures per bundle (`signatures: []` is an array), so dual-signing (e.g., ed25519 + ML-DSA) is *additive*, not *deprecating*, and does not interact with ratchet #4's two-release-deprecation discipline.

#### Cross-vendor verification

A bundle signed under this envelope is verifiable by:

- The reference CRAWCUS verifier (`crawcus-verify` — see Q-VERIFIER-CLI-OSS-LOCK memo)
- Any second-vendor CRAWCUS-conformant verifier implementing this section
- Sigstore cosign DSSE-envelope verification (CLI invocation depends on cosign version + cert-mode; in keyless mode `cosign verify-blob --bundle <envelope> <payload>` accepts a bare DSSE envelope and verifies the embedded signature against the included public key — cosign treats CRAWCUS bundles as a generic DSSE envelope; subtype-specific verification stays CRAWCUS-side)
- `slsa-verifier verify-artifact --provenance <bundle>` for SLSA-pipeline interop (when the bundle includes SLSA-provenance subtype, per future spec extension)

#### IANA media-type registration

The `application/vnd.crawcus.*+jsonl` family uses the `vnd.` prefix, which per [RFC 6838 §3.2](https://www.rfc-editor.org/rfc/rfc6838#section-3.2) is for vendor-specific media types and does **not** require IANA registration to be deployed. Formal IANA registration is queued for the Y1 H2 CRAWCUS spec spin-out (when `@crawcus/spec` becomes the canonical source) per `identity.md` Y1 H2 milestone.

#### What this rules out (additional to the unsigned format)

- Bundles signed under non-DSSE envelopes (e.g., bare JWS, COSE, bespoke) — see Open Q-1 memo §"Why DSSE" for rejected alternatives
- Re-canonicalising the payload bytes between sign and verify (DSSE PAE preserves payload byte-identical)
- Hardcoding `application/vnd.crawcus.bundle+jsonl` as the only acceptable `payloadType` — forward-compat family dispatch is mandatory
- Removing signature suites in a backwards-incompatible way without a ratchet #4 two-release deprecation window
- **Nested DSSE envelopes** (DSSE-in-DSSE) — the verifier MUST reject a `payload` that itself decodes to a DSSE envelope. The verifier-output countersign use case uses a *parallel* DSSE wrap (separate envelope), not a nested one; this rule-out forecloses a known DSSE foot-gun while preserving the parallel-wrap pattern

## What this rules out

- Imperative logic inside a spec (loops, mutations, I/O)
- Runtime construction of specs (specs are static modules)
- Cross-spec field references except via `extends`
- PII / retention annotations on fields (those live in compliance manifest)
- Locale-free `askHint` strings in production (i18n is mandatory per
  `09-operating/decision-log.md` LOCKED row)
- **Async predicates** (v0.2 addition — see Contracts §)
- **Wire-format hashes via non-RFC-8785 canonicalisers** (v0.2 addition)
- **Sector-pack Contract removal or severity-lowering** (v0.2 addition)

## GDPR erasure

> **TODO.** A crypto-shred and tombstone mechanism for GDPR erasure is
> not specified as part of this format. This heading exists so documentation
> that mentions the pattern has a real anchor. It is not normative, and
> it does not define fields, algorithms, or verifier behaviour.
>
> A proposal is written up in
> [ADR-0053](../adr/ADR-0053-merkle-transparency-log.md). It is not
> accepted. The hash chain in this document is unchanged.

## Open questions deferred for v1.0

| Question | Owner | Notes |
|---|---|---|
| Optional `pre`/`post` hooks for field-level extractor tuning | Founder | Risk: invites imperative logic; defer until proven necessary |
| Declarative `dependencies` graph (DAG) vs imperative `dependsOn` | Founder | Current `dependsOn` predicate is pragmatic; DAG may be needed for visualisation |
| Standard "completion" events beyond `ProjectionCommit` | Founder | E.g. `IntentParked` for incomplete-but-saved flows |
| Spec marketplace identity (registry, signing, attestation) | Founder | Becomes load-bearing once third-party specs ship |

## References

- `00-canon/architecture-primitives.md` — primitives 1 and 2 (Intent, CrawcusSpec)
- `02-product/compliance-manifest-schema.md` — the companion contract
- `02-product/integration-tiers.md` — Tier 2 / customReducer pattern
- `02-product/three-adoption-modes.md` — how `npx @tallyseal/generator migrate-form` generates a spec
- the project's engineering ratchets — disciplines #3, #4, #13
- `09-operating/decision-log.md` — LOCKED rows for i18n, W3C/IEEE submission
- `HANDOFF-NEXT-SESSION.md` — commit-4 build plan for `packages/core/src/intent/` (replacing the prior in-HF `lib/witness/intents/` path)
