<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# CRAWCUS v0.2 — First-class Contracts (SCQS design memo)

| Field | Value |
|---|---|
| Date | 2026-05-20 |
| Status | **🔒 LOCKED 2026-05-20** (founder delegated; adversarial reviewer + self-challenge applied; recommendations + reviewer-flagged additions applied — see decision-log row for full diff) |
| Author | Paul + Claude |
| Decides | Whether CrawcusSpec v0.1 extends to v0.2 with Contracts as a first-class spec primitive, *before* W3C/IEEE submission (Y1 H2) and *before* any HF integration code consumes v0.1 |
| Memo style | Minto SCQS — Executive Summary → Situation → Complication → Question → Solution |
| Cascades | `02-product/crawcus-format.md` v0.1 → v0.2; `07-engineering/core-v0.0.1-type-surface.md` (`contract/` module added to commit 4); `00-canon/compliance-by-design.md` (12th architectural decision question surfaced); audit-bundle layer (deferred package); `@tallyseal/regulations/*` ship with reusable Contracts; sector packs override-via-add only |

---

# Page 1 — Executive summary

## Recommendation in one line

> **Promote CrawcusSpec format v0.1 → v0.2 with Contracts as a
> first-class primitive (Intent-level `pre` / `invariants` / `post` +
> field-level `.contract({...})`). Lock and ship before any
> `internal-package` code lands. Submit to W3C/IEEE with Contracts in
> the spec. Without Contracts, CrawcusSpec is field-list-shaped like
> every other agent-spec on the market; with Contracts, it is
> unforgeably the standards-grade artifact of the AACI category.**

## The three load-bearing points

1. **Adding Contracts later would be a breaking change to a public
   standard.** v0.1 is locked LOCKED 2026-05-19; W3C/IEEE submission
   is locked Y1 H2 per `00-canon/identity.md`. Any spec change that
   ships to W3C and is later extended with the moat feature is
   archetypal "we didn't know what we were building" energy. The
   window to add Contracts to CrawcusSpec is **now or at v1.0 (after
   public adoption)** — never the gap in between without permanent
   reputation cost. Since the strategic case for Contracts is decided
   (see §4 three-lens read), there is no defensible reason to defer.

2. **CrawcusSpec is already half-contract-shaped — the v0.2 work is
   *naming and completing what's there*, not adding a new concept.**
   `readiness` IS a postcondition. `dependsOn` IS a precondition.
   `validates(fn)` IS a field-level contract. `classification:
   'high-risk'` IS a regulation contract that triggers Art. 14
   enforcement. The v0.2 addition does four things: (a) names the
   pattern, (b) adds the missing pieces (Intent-level invariants,
   citable regulation references, named IDs for audit-bundle reference,
   regulator-visible descriptions), (c) makes the audit bundle
   self-verifying, (d) provides the trust protocol federation needs.

3. **Contracts compound across every Year-7 Max plan upside.** Per the
   three-lens read in §4: standards moat (W3C/IEEE submission),
   federation (cross-org trust protocol), insurance MGA (priceable
   per-tenant violation-rate signal), OEM Platform Edition
   (embedding partner sees Intent commitments at-a-glance), legal
   motion (contracts ARE the litigation story), platform sale
   (CISO sees the contract list as the demo), Anthropic-acquirability
   (clean format with self-verification is the v0-shaped acquisition
   pattern). The dev-wedge ergonomic risk — the only real downside —
   is mitigated by careful API design (see §5.2).

## What we sacrifice

A clean v0.1 lock that survives unchanged to W3C submission. (We were
24 hours into v0.1; the cost of revising is one notebook day, not
sunk customer migrations.) A simpler CrawcusSpec format spec doc (v0.2
adds ~200 lines of canonical text). A simpler core implementation
(commit 4 grows by ~300 LoC for the `contract/` module). The chance
to learn-by-using-v0.1 before adding Contracts — accepted because
Contracts are not exploratory (the pattern is 40-year-mature in
formal methods + 80-year-mature in legal contract law).

## The decision review trigger

Re-open this memo if:

1. **W3C/IEEE process reveals that Contracts conflict with adjacent
   in-flight standards** (e.g., MCP, AGNTCY) such that adoption is
   gated on harmonisation — re-shape Contracts to align.
2. **A wedge customer rejects the Contracts surface on adoption-cost
   grounds** within 90 days of v0.2 publication — re-evaluate
   ergonomics; do not pull the feature, but redesign the API.
3. **An adjacent vendor (Vercel AI SDK, assistant-ui, LangGraph,
   CrewAI) publishes a similar primitive** — accelerates our
   submission timeline; do not retreat.
4. **An IP-attorney class-9+42 review surfaces a "Contract" trademark
   blocker** (unlikely in this domain — Bertrand Meyer's "Contract"
   usage is generic, not trademarkable in compliance software) —
   rename to `commitments` or `assurances`.
5. **A specific Contract construct turns out to require async
   evaluation in real customer flows** (e.g., consent-server round-trip
   that can't be materialised pre-evaluation) — extend with `pre`/`post`
   async-allowed contract slots specifically scoped to identifiable
   I/O boundaries; do not contaminate the pure-sync core surface.

---

# Page 2 — Situation (what's true today)

## What v0.1 ships

Per `02-product/crawcus-format.md` (LOCKED 2026-05-19), an
CrawcusSpec declares: `key`, `projection`, `version`, `classification`,
`fields` (with chainable metadata), `readiness` (a pure predicate),
optional `customReducer`, `i18nDefault`, `tags`, `extends`. The field
builder has `.required`, `.optional`, `.askHint`, `.refineHint`,
`.dependsOn`, `.askWhen`, `.validates`, `.default`, `.options`,
`.label`, `.help`, `.placeholder`, `.confidential`.

The format is **pure declarative** — no imperative logic; no I/O at
construction time; predicates are pure and replayable. This is the
substrate that makes the spec hash-testable and W3C/IEEE submittable.

## What v0.1 already does (with a quiet contract semantics)

| Existing v0.1 construct | What it actually is, expressed in contract semantics |
|---|---|
| `readiness: ({ has }) => has('title', 'subject', 'level')` | Intent-level postcondition: *"Intent is ready when these fields are satisfied."* |
| `field.X().dependsOn({ when: predicate })` | Per-field precondition: *"This field is askable when predicate holds."* |
| `field.X().validates(fn)` | Per-field invariant: *"This value must satisfy fn."* |
| `classification: 'high-risk'` | Implicit regulation contract: *"This Intent commits to EU AI Act Art. 14 readiness-gate enforcement."* |
| Compliance-manifest validation that special-category fields require consent gating | Implicit cross-field contract: *"If field X is `pii: 'special-art-9'`, the spec must `dependsOn` a consent event."* |

Five out of seven of the canonical CrawcusSpec constructs are already
contracts in disguise. They are unnamed, uncitable, unauditable as
discrete commitments, and invisible to a verifier.

## What's missing

| Missing | Concrete consequence in production |
|---|---|
| Intent-level **preconditions** — checks at Intent open before any fields are touched | Cannot express *"this Intent requires consent-for-purpose Y was previously granted by this tenant"* without scattering checks into `dependsOn` on the first-required field |
| Intent-level **invariants** — checks that hold across every event | Cannot express *"learnerAge < 16 ⟹ parentalConsentEventId present"* as a single cross-field commitment; it's currently encoded as `dependsOn` on the consent field, which leaks the intent ("the consent is asked when") into the structural commitment ("the consent must be true") |
| Intent-level **postconditions** beyond readiness — checks after commit | Cannot express *"after ProjectionCommit, the projection's status is 'created' AND a `CourseCreated` event exists"* |
| **Named, citable** contracts | Cannot reference contract `gdpr.art8.minorConsent` in an audit bundle; cannot have the regulator read the bundle and see *"this Intent honoured GDPR Article 8(3)(a) — here is the predicate, here are the events where it fired"* |
| **Contract spec rendered in audit bundle** | Auditor sees events but not the explicit commitments the runtime enforced; their work is rebuilding the commitment shape from the events; their independence is reduced |
| **Contract spec as federation trust protocol** | Cross-org event exchange has no canonical declaration of *what the sender committed to* — receiving org must trust the sender's narrative rather than verify against published contracts |
| **Contract violation as a typed event** | Violations are currently throws; they leave no audit trail unless the surrounding code happens to capture; MGA telemetry cannot price violation rate |
| **Standards-grade differentiator** | Without Contracts, CrawcusSpec is a field-list-spec — comparable to OpenAI Function tool specs, Vercel AI SDK tool definitions, LangChain tool descriptors, MCP tool exposures, AGNTCY participant manifests. Each of these names *what a function does*; none names *what must hold around the call*. Contracts move CrawcusSpec one architectural floor up. |

## The W3C/IEEE submission constraint

Per `09-operating/decision-log.md` LOCKED 2026-05-19:
*"CrawcusSpec to W3C / IEEE draft within 12 months."*

Per the calendar: Y1 H2 (≈ Months 7-12) is the submission window. The
practical implication: the format submitted is the format we live
with through community group adoption (typically 18-36 months until
recommendation). Adding a primitive after submission is acceptable
**only as a non-breaking extension** — but Contracts are not
non-breaking, because they change how downstream tools (audit-bundle
verifier, sector packs, conformance test kit, registry) must work.

A v0.1 → v0.2 bump *now*, before any external consumer locks in,
costs ~1 day's notebook work and a refresh of our internal
implementation plan. A v0.1 → v0.2 bump *after* submission costs
publishing an Erratum, coordinating with the working group,
re-submitting reference implementations, and explaining the gap to
auditors who picked up v0.1.

## The wedge-customer constraint

HF is the first integration target. HF has not yet consumed any
CrawcusSpec. Pre-integration is the cheapest possible window to refine
the format. After HF's first PR ships against v0.1, the cost rises:
H-1 migration to v0.2 is plausible but introduces an "we just shipped
this and now we're changing it" reputational drag on the design partner.

---

# Page 3 — Complication (the tensions and risks)

## Tension 1 — Pure-sync vs needs-of-real-life-async

Contracts must be **pure synchronous predicates** to preserve
hash-testability + replayability (the load-bearing property that
makes CrawcusSpec W3C-credible per ratchet #3). But realistic checks
sometimes need state that's expensive to materialise — *"has this
tenant ever consented to purpose Y?"* might be a thousand events
deep.

**Resolution**: predicates take a **fully-materialised
ContractCtx** as input — the runtime is responsible for fetching
state once per evaluation and presenting it. Predicates are pure
functions over the materialisation. No I/O inside predicates. Cache
the materialisation per writeEvent so the cost is one fetch + N
predicate evaluations, not N fetches. This honours D2 (tamper
detection), D3 (reducer determinism), C6 (3-layer readiness — the
predicate is the same predicate the UI runs).

If a real flow surfaces a contract that fundamentally needs async
I/O (e.g., live consent-server round-trip), v0.2 stays pure-sync;
the I/O lives in a Task per `Task` supporting primitive, the result
materialises into ContractCtx, and the contract evaluates over the
materialisation. The contract surface itself never goes async.

## Tension 2 — Contract IDs and audit-bundle clarity

Should Contract IDs be globally unique (`urn:codicil:contract:gdpr.art8.minorConsent`),
spec-package-namespaced (`@tallyseal/spec-ferpa-edu/minorConsent`),
or Intent-namespaced (`CreateCourse/minorConsent`)?

**Resolution**: Contract IDs are spec-package-namespaced by
convention (e.g., `gdpr.art8.minorConsent` if defined in
`@tallyseal/regulations/gdpr`) and assigned a fully-qualified ID at
audit-bundle render (`<intentKey>:<contractId>:<event-version>`) for
reference precision. Allows reusable Contract objects (regulation
modules export them) while keeping audit-bundle output discrete.

## Tension 3 — Sector-pack override semantics

`extends` in v0.1 already allows sector packs to override fields +
extend readiness predicates. What happens to Contracts under
`extends`? Two failure modes:

| Failure mode | Mitigation |
|---|---|
| Child pack **removes** a parent contract to bypass it ("we're FERPA, we don't care about GDPR consent") | Children can ADD contracts, never REMOVE; predicate composition is AND |
| Child pack **lowers** a parent's severity ('block' → 'warn') | Severity can only INCREASE in children; never decrease |

The discipline: `extends` is monotonic over commitments. A child
pack can only become *more* restrictive than its parent. Otherwise
sector-pack composition becomes a vector for weakening guarantees,
which destroys the standards-grade claim.

## Tension 4 — Dev-wedge ergonomics

Contracts done badly read like JSDoc ceremony: 6 lines of metadata
per assertion. The Eiffel-style ergonomic discipline must hold:
**predicates are the noun; everything else is sugar**.

```ts
// BAD — ceremonious
contracts.invariants.push({
  id: 'minorAgeRequiresConsent',
  description: 'If learner age is under 16, parental consent event ID must be present',
  citation: { regulation: 'gdpr@2025-Q1', article: 'Art. 8', paragraph: '§3(a)' },
  severity: 'block',
  predicate: ({ value, has }) => {
    const age = value('learnerAge');
    return age === undefined || age >= 16 || has('parentalConsentEventId');
  },
});

// GOOD — terse; citation + description harvested from the regulation module
defineCrawcusSpec({
  key: 'CreateCourse',
  // ...
  contracts: {
    invariants: [
      gdpr.art8.minorConsent({ ageField: 'learnerAge', consentField: 'parentalConsentEventId' }),
    ],
  },
});
```

The discipline: **most Contracts come from regulation modules**.
Sector packs export typed Contract factories that take the
spec-specific binding (e.g., which field is the age, which is the
consent event ID). The Intent author rarely hand-writes a Contract;
they compose them like Lego. Hand-written Contracts are reserved for
domain-specific invariants the regulation modules don't cover.

## Tension 5 — The 12th architectural decision question

`00-canon/compliance-by-design.md` lists 11 day-1 architectural
decisions. Are Contracts the 12th?

| Read | Argument |
|---|---|
| **Yes — Contracts are a 12th compliance-by-design decision** | They name a structural commitment of the runtime; they're audit-bundle-load-bearing; they sit at the same architectural floor as "PII tokenisation at boundary" or "lawful basis on every Event" |
| **No — Contracts are a CrawcusSpec primitive evolution** | They're not new compliance behaviour; they're a way to *name* commitments the runtime already enforces. The 11 decisions cover what's enforced; Contracts cover how it's expressed |

**Resolution recommendation**: surface as an OPEN canon question;
do not edit canon unilaterally per CLAUDE.md discipline. Founder
decides whether to extend the canon doc with a 12th decision or to
treat Contracts as a v0.2 spec evolution within the existing canon
floor. Either resolves cleanly; the choice is editorial, not
substantive. Default until decided: treat as spec-evolution; revisit
when sector packs publish their first regulation-module Contract
libraries (Y1 Q2-Q3 probable).

## Tension 6 — Contract source in audit bundle: full predicate, hash, or both?

| Option | Pro | Con |
|---|---|---|
| **Source only** | Auditor reads predicate text | TS code in a regulator-facing artifact reads weird; predicates can be obfuscated to look stronger than they are |
| **Hash only** | Tamper-evident; small | Auditor cannot verify what they cannot read |
| **Both — predicate source + content hash** | Auditor reads + can verify the hash matches the source they see | Slight bundle-size cost |

**Resolution**: both. The predicate source is rendered as a normalised
TS expression (formatted via Prettier rules so two equivalent
predicates render identically); the content hash is SHA-256 over the
normalised expression. Auditors can recompute the hash from the
source they see; tampering with either is detectable.

---

# Page 4 — Question (what must be decided)

## The decideable question

> *Given that (i) CrawcusSpec v0.1 is LOCKED 2026-05-19 + W3C/IEEE
> submission is LOCKED Y1 H2, (ii) CrawcusSpec is already
> half-contract-shaped via readiness / dependsOn / validates /
> classification, (iii) no external consumer has integrated v0.1 yet,
> what is the right Contract primitive shape for CrawcusSpec v0.2 such
> that the format passes the three-lens test, supports the audit-
> bundle + federation + insurance-MGA cascades, and minimises
> dev-wedge adoption friction?*

## The four options

| | A — Keep v0.1; defer Contracts to v1.0 post-W3C | B — **v0.2 with first-class Contracts (locked recommendation)** | C — v0.2 with Contracts under `extends`-only (sector-pack-supplied) | D — v0.2 as decorator-style (annotations on existing constructs) |
|---|---|---|---|---|
| Standards-moat strength | ❌ Field-list spec like everyone else | ✅ Architectural floor moved up | 🟡 Moat exists but locked behind sector-pack adoption | 🟡 Decorators read as "ceremony" to W3C reviewers |
| Time to lock | (Never — only at v1.0) | **2 days** (this memo + format-spec extension + type-surface fold) | Same | Same |
| Migration cost to HF | None (HF on v0.1) | Negligible (HF not integrated yet) | None | None |
| Audit-bundle self-verification | ❌ | ✅ | 🟡 only if HF adopts a sector pack | 🟡 if decorators map to named contracts |
| Federation trust protocol | ❌ No canonical artefact | ✅ Contract spec IS the artefact | 🟡 partial | 🟡 partial |
| Insurance MGA priceability | ❌ No violation signal | ✅ Per-tenant violation rate is the priceable signal | 🟡 only for sector-pack-using tenants | ✅ but messier |
| Dev-wedge ergonomics | n/a (no extension) | ✅ if regulation-module factories ship (§5.2) | ✅ (sector-pack hidden) | ❌ Decorator surface in TS still rough |
| Three-lens compliance | ⚠️ L2 violation (standards default, federation default) | ✅ all three lenses honoured | 🟡 partial L2 honour | 🟡 partial L2 honour |
| W3C/IEEE submission integrity | ⚠️ Field-list submission ages badly | ✅ Submit with the moat | 🟡 Submit with hooks for moat | 🟡 Submit with decorator surface |
| Reversibility if v0.2 fails | (n/a) | High — v0.2 → v0.3 mechanical; no public consumers yet | High | High |
| Founder cognitive load | Lowest (defer) | Medium (one design memo + spec extension) | Highest (need to design extension hook + sector-pack examples) | Medium-high (decorator-surface design) |

Option A defers the strategic moat without saving meaningful
implementation time and burns the W3C-submission window. Option C
hides the moat behind sector-pack adoption; the dev-wedge sees a
plain field-list. Option D is awkward in TypeScript (decorator
support is incomplete and ergonomically uneven). **Option B is the
locked recommendation.**

## What an answer enables (cascades)

| Decision | How v0.2 + Contracts resolves it |
|---|---|
| W3C/IEEE submission content (Y1 H2) | Submit CrawcusSpec v0.2 with Contracts as the standards-grade differentiator |
| `internal-package` `contract/` module | Lands in commit 4b alongside `defineCrawcusSpec` + `defineCompliance` |
| `@tallyseal/regulations/gdpr` etc. | Ship reusable Contract factories per regulation article — `gdpr.art8.minorConsent`, `gdpr.art22.automatedDecisionExplanation`, `euAiAct.art14.humanOversight`, etc. |
| `@tallyseal/spec-*` sector packs | Use regulation-module Contract factories + add sector-specific Contracts; `extends`-monotonic composition |
| Audit-bundle layer | Renders Contract spec + violation log per Intent; contracts become a first-class section in the bundle |
| `@tallyseal/crawcus-tck` | Conformance tests include Contract semantics: monotonic composition, severity escalation, predicate hash stability |
| HF integration H-1 | HF's first CrawcusSpec adopts at least one Contract (e.g., FERPA minor-consent) — proves the surface in production-shape code |
| Insurance MGA (Y2 territory) | Premium pricing function takes per-tenant Contract-violation rate as primary signal |
| Federation protocol (Y2-3) | Cross-org event exchange schema carries the sender's Contract spec; receiver verifies inputs against its own policy |
| OEM Platform Edition (Y3+) | Embedding partner reads the host application's CrawcusSpec Contracts to surface "what does this AI commit to" UI |
| `internal-package` lint rules | `no-anonymous-contract` (push toward named contracts); `no-warn-severity-without-justification` (push toward block-default) |
| 11 → 12 compliance-by-design decisions question | Surfaced; founder decides whether to canonise Contracts as the 12th |

---

# Page 5 — Solution (the recommendation)

## 5.1 The Contract type — full shape

```ts
/**
 * A Contract is a named, citable, pure predicate that a CrawcusSpec
 * commits to. Contracts are evaluated by the runtime at well-defined
 * checkpoints, rendered into audit bundles by ID + description +
 * citation + predicate hash, and recorded as `ContractViolation`
 * events on failure.
 */
export type Contract<TCtx extends ContractCtx = ContractCtx> = {
  /**
   * Stable identifier. Convention: '<module>.<article>.<name>'
   * (e.g., 'gdpr.art8.minorConsent') if defined in a regulation
   * module; or '<spec-package>/<name>' if sector-pack specific; or
   * '<name>' if Intent-local. Audit-bundle render fully qualifies:
   * '<intentKey>:<contractId>:v<event.version>'.
   */
  id: string;

  /**
   * Human-readable description; auditor + regulator + insurance
   * underwriter read this. Single string or per-locale record.
   */
  description: LocalisedText;

  /**
   * Optional regulator citation. Strongly preferred for any contract
   * that exists *because* of a regulation — auditor-readability and
   * standards-grade defensibility both compound on this.
   */
  citation?: RegulationCitation;

  /**
   * The contract itself. PURE + SYNC. Operates only on materialised
   * ContractCtx; no I/O; no closures over external state.
   */
  predicate: (ctx: TCtx) => boolean;

  /**
   * 'block' — violation throws ContractViolationError + emits
   *           ContractViolation event + rolls back the surrounding
   *           transaction (default for all contracts unless explicitly
   *           authored as 'warn').
   * 'warn'  — violation emits ContractViolation event + execution
   *           continues. Use only when a contract is aspirational
   *           or being introduced behind a deprecation window.
   */
  severity?: 'block' | 'warn';
};

export type RegulationCitation = {
  regulation: RegulationVersion;   // 'gdpr@2025-Q1'
  article: string;                  // 'Art. 8'
  paragraph?: string;               // '§3(a)'
  /** Canonical regulator-published source, if any. */
  url?: string;
};
```

## 5.2 The CrawcusSpec extension

```ts
export type CrawcusSpec<TFields extends Record<string, FieldSpec>> = {
  // ... all v0.1 fields ...

  /**
   * v0.2 addition. Three checkpoint slots. Each may be omitted.
   */
  contracts?: {
    /** Checked when the Intent opens (first event for this intentId). */
    pre?: readonly Contract[];

    /** Checked on every writeEvent for this intentId. */
    invariants?: readonly Contract[];

    /** Checked on ProjectionCommit only. */
    post?: readonly Contract[];
  };
};

// Field builder gains:
export type FieldBuilder<T> = {
  // ... all v0.1 methods ...
  contract(c: Contract<FieldContractCtx<T>>): FieldBuilder<T>;
};
```

Composition with v0.1 constructs:

| v0.1 construct | v0.2 status | How they relate |
|---|---|---|
| `readiness` | Unchanged. Stays as Intent-level postcondition over field presence. | Distinct from `contracts.post`. `readiness` answers *"is the Intent complete enough to commit?"*; `contracts.post` answers *"after commit, what must hold of the projection + events?"* |
| `field.X().dependsOn({ when })` | Unchanged. Stays as askability gate. | Distinct from `contracts`. `dependsOn` controls *whether the field is asked*; a `contracts.invariants` entry like *"if learnerAge<16 then parentalConsentEventId present"* controls *whether the structural commitment holds*. Both can coexist. |
| `field.X().validates(fn)` | Unchanged. Implicitly creates an anonymous field-level Contract with `id = <intentKey>/<fieldKey>/validates-N`, no citation, severity `block`. | Convenience sugar; `.contract({...})` is preferred for any check worth naming. |
| `classification: 'high-risk'` | Unchanged. Triggers default Contracts from the regulation modules cited in `compliance.regulations` (e.g., EU AI Act Art. 14 readiness-gate-enforcement contract is auto-applied). | Source: regulation modules ship a `defaultContractsForClassification(c)` map. |

## 5.3 The ContractCtx — what's materialised

```ts
export type ContractCtx = {
  intent: Readonly<Intent>;
  spec: Readonly<CrawcusSpec>;
  tenant: Readonly<Tenant>;
  events: readonly Event[];                  // chronological for this intentId
  snapshot: Readonly<Record<string, unknown>>;  // accumulated field values
  /** has(...keys): true iff every key has been satisfied by events */
  has: (...keys: readonly string[]) => boolean;
  /** value(key): current value if any */
  value: <T = unknown>(key: string) => T | undefined;
  /** consentFor(purpose): true iff a non-revoked ConsentGranted event exists */
  consentFor: (purpose: Purpose) => boolean;
  /** Convenience for cross-event invariants */
  eventsOfKind: (kind: EventKind) => readonly Event[];
};

export type FieldContractCtx<T> = ContractCtx & {
  /** The value being validated. */
  fieldValue: T;
  /** The field's compliance-manifest annotation, if any. */
  compliance?: FieldCompliance;
};
```

Materialisation cost: O(events) per writeEvent. Mitigations: lazy
materialisation, snapshot cached after each event, contract evaluator
visits each contract once per checkpoint.

## 5.4 Audit-bundle output

The audit bundle gains a top-level `contracts` section per Intent:

```json
{
  "intentId": "int_01H...",
  "intentKey": "CreateCourse",
  "specVersion": 2,
  "contracts": {
    "pre": [
      {
        "id": "CreateCourse:gdpr.art8.minorConsent:v0",
        "description": "If learnerAge < 16, parental consent event ID must be present",
        "citation": { "regulation": "gdpr@2025-Q1", "article": "Art. 8", "paragraph": "§3(a)" },
        "severity": "block",
        "predicateSource": "({ value, has }) => { const age = value('learnerAge'); return age === undefined || age >= 16 || has('parentalConsentEventId'); }",
        "predicateHash": "sha256:abc...",
        "evaluations": [
          { "eventId": "evt_01H...", "result": "pass" },
          { "eventId": "evt_01H...", "result": "pass" }
        ]
      }
    ],
    "invariants": [/* ... */],
    "post": [/* ... */]
  },
  "violations": [
    /* any ContractViolation events extracted for convenience */
  ]
}
```

Auditor / regulator / insurance-underwriter reading the bundle gets:
- The explicit commitments the runtime enforced
- The predicate source (readable) + hash (verifiable)
- The full evaluation history with results
- A summary of all violations

This is the litigation artefact. Plaintiff cannot claim *"you didn't
say what you'd do"*; the contracts list is the spec. Plaintiff
cannot claim *"you said it but didn't do it"*; the evaluation history
is the proof. The bundle's signature (deferred to audit-bundle layer)
binds all of this.

## 5.5 Lock procedure

1. **Founder reads pages 1-5** of this memo.
2. **Founder answers the 8 open questions in §6** (recommendations included; "accept all" is a valid response).
3. **Update this memo's Status field** to `LOCKED 2026-MM-DD`.
4. **Extend `02-product/crawcus-format.md` v0.1 → v0.2** with a new "Contracts" section + new method on `field` builder; bump `Format version` to 0.2.
5. **Update `07-engineering/core-v0.0.1-type-surface.md`** to include `contract/` module in §18 module layout and §19 commit slicing (lands in 4b alongside `defineCompliance` + `validate`).
6. **Add decision-log row**: `CrawcusSpec v0.1 → v0.2: Contracts elevated to first-class primitive | 2026-MM-DD`.
7. **Update `docs/notebook/README.md`** index entry for this memo.
8. **Update `TRACEABILITY.md`** primitive table to include Contracts.
9. **Surface the 12th-decision question on `00-canon/compliance-by-design.md`** to the founder; do not edit canon without explicit go.

After lock, commit 4 proceeds against the updated type-surface spec
with `contract/` module included in 4b.

## 5.6 What this memo does NOT decide

- Specific Contract content for any individual regulation (e.g., the exact predicate for GDPR Art. 22 explanation) — owned by `@tallyseal/regulations/<reg>` modules; each module decided per-publish-cycle
- The runtime evaluator implementation details (lazy materialisation strategy, caching policy) — engineering choice at commit 4b
- The audit-bundle layer's predicate-source normalisation rules — owned by the audit-bundle package (deferred)
- Whether `@tallyseal/crawcus-tck` ships an out-of-the-box Contract conformance harness — decided at TCK scaffold time
- The W3C/IEEE submission package's exact framing of Contracts (W3C Community Group note vs IEEE Standards Association formal draft) — decided at C4 standards-timing memo
- Insurance MGA pricing-function specifics — decided when MGA design memo lands (Y2 territory per `09-operating/decision-log.md` DEFERRED)
- Federation protocol shape (signed cross-org Event format) — decided at federation memo (Y2-3 territory)

---

# 6. Open questions for v0.2 lock

These are surfaced by this memo; founder decision needed before lock.

### Q-K — Are async Contract predicates allowed?

**Recommendation: NO** for v0.2. Pure-sync only. External state
materialises into `ContractCtx` once per checkpoint; predicates
operate over the materialisation. Preserves replay determinism +
hash-testability. If a real flow surfaces an unavoidable async
need, address case-by-case via Task supporting primitive (materialise
into context); do not weaken the core surface.

### Q-L — Contract IDs: how namespaced?

**Recommendation: `<source-module>.<reference>` convention** (e.g.,
`gdpr.art8.minorConsent`). Sector-pack-published contracts namespace
under the pack (`@tallyseal/spec-ferpa-edu/minorConsentCheck`).
Intent-local contracts use a short slug (`title-non-empty`). Audit
bundle renders fully qualified
(`<intentKey>:<contractId>:v<event.version>`).

### Q-M — Severities: how many?

**Recommendation: two — `'block'` (default) and `'warn'`.** No
`'audit-only'` — silent contracts feel like dead code. If a contract
warrants warn-not-block, the spec author must justify in the
`description`. Avoid more than two for v0.2 — additional severities
can be added non-breakingly later if a real need surfaces.

### Q-N — Is `ContractViolation` a new EventKind?

**Recommendation: YES.** Adds to the EventKind union in core's
`event/event-kinds.ts`. Payload includes contract ID + predicate
hash + evaluation context summary + severity outcome. Enables
audit-bundle extraction, MGA telemetry, and incident-management
tooling. (Adjustment to `07-engineering/core-v0.0.1-type-surface.md`
§7.4 + §18 needed.)

### Q-O — Cross-Intent contracts?

**Recommendation: DEFER to v0.3.** Per-Intent scope only for v0.2.
Cross-Intent commitments (e.g., *"no patient may have two active
medication-order Intents simultaneously"*) require a different
materialisation strategy (cross-Intent event view) and complicate
sector-pack composition. Park.

### Q-P — Sector-pack override semantics

**Recommendation: monotonic — ADD only, severity can only INCREASE.**
Children may add contracts to parents. Children may raise a parent's
severity (`'warn'` → `'block'`). Children may NOT remove parent
contracts and may NOT lower severity. Preserves the standards-grade
claim that composition cannot weaken guarantees. Enforced by spec
compiler at build time.

### Q-Q — Audit-bundle predicate render

**Recommendation: predicate source (Prettier-normalised) + SHA-256
content hash.** Source is readable; hash is tamper-evident; auditor
can recompute hash from source they see. Bundle size cost is small.

### Q-R — TypeScript narrowing of ContractCtx

**Recommendation: defer.** v0.2 ships uniform ContractCtx (all
field-presence-dependent values typed as `T | undefined`).
Developers assert presence inside predicates. Type-level narrowing
based on which fields are present is interesting future work but
adds complexity to v0.2; revisit at v1.0 if pattern stabilises.

---

---

## 6.A — `pre.disclosure-has-opportunity-to-be-read` Contract pattern (Q-CR9 LOCKED 2026-06-02)

**Context.** Several controllers (HF first) need a Contract pattern that says *"a Disclosure exists AND there is structured evidence the user had the opportunity to read it"* — without claiming the user actually acknowledged it. The Disclosure primitive's `acknowledged` state is reserved for *affirmative* acknowledgment (explicit "I have read this" action). The weaker observational claim — scrolled past, clicked into, dwelt on, replayed — lives in a separate event kind.

**The pattern.** Pre-condition predicate that resolves true if:
1. A `DisclosureDelivered` event exists for the named `requirementId` within the relevant scope (subject + regulation + time window), AND
2. A `DisclosureSignal` event exists for the same `requirementId` with `signalType` in the set the predicate accepts (typically `'read'`, optionally `'click'` or `'dwell'`), AND
3. The signal's `contentHash` matches the delivered Disclosure's `contentHash` (so signal-on-stale-content does not count).

**Author shape (TS, illustrative)**:

```ts
pre.disclosureHasOpportunityToBeRead({
  requirementId: 'gdpr.art13.notice',
  acceptedSignals: ['read'],          // default — 'read' alone
  withinWindow: 'PT24H',              // optional — defaults to "session-scoped"
  requireHashMatch: true,             // default true; signal must reference current content
})
```

### Why SIGNAL and not gate — the load-bearing distinction

| Mode | Legal claim | Defensibility | Use as |
|---|---|---|---|
| **Signal** (this pattern) | *"User had the opportunity to perceive notice X — here is structured evidence (scroll-past + content-hash match + timestamp)."* | Defensible. PROV-O-compatible observational claim. Survives ICO + German rulings that reject scroll-as-affirmative-consent. | Pre-conditions on processing that requires *notice-was-available*, not *notice-was-affirmed*. Audit-bundle evidence of due transparency effort. |
| **Gate** (REJECTED at the Disclosure primitive layer) | *"User has acknowledged notice X."* | Contested. ICO Guidance 2024 + German LG Munich 2023 + CJEU Planet49 (2019) all hold that passive UI interaction cannot constitute valid consent or affirmative acknowledgment. | NEVER use `DisclosureSignal` as a gate predicate masquerading as `acknowledged`. If affirmative consent is required, use the `acknowledged` lifecycle state (which requires an explicit affirmative action — a button click on a labelled control, a typed confirmation, etc.). |

**Implementation discipline (for Contract authors using `DisclosureSignal`):**

- The predicate name MUST contain `opportunity` or `signal` — never `acknowledged`, `consented`, `confirmed`, `agreed`. The name carries the claim shape.
- Predicate failure messages MUST cite the SIGNAL-not-gate framing explicitly so the audit bundle reader sees the distinction.
- The TCK includes a fixture (`packages/crawcus-tck/fixtures/disclosure-signal.fixture.ts`) asserting both the positive case (signal exists + hash matches → predicate true) and the SIGNAL-not-gate negative case (predicate authored as a gate-style claim → audit-bundle lint rejects the Contract before it ships).

### Anchor citations for the SIGNAL-not-gate framing

- ICO, *Guidance on cookies and similar technologies* (UK ICO, 2024) — passive interaction does not constitute valid consent under PECR/UK GDPR.
- LG Munich I, *Bavarian Universities GDPR ruling*, Case 33 O 14893/23 (2023) — pre-checked / scroll-implied consent rejected; only affirmative action satisfies Art 7(1).
- CJEU, *Planet49 GmbH v Bundesverband der Verbraucherzentralen*, C-673/17 (2019) — implied consent through inaction insufficient under e-Privacy Directive / GDPR Art 4(11).
- *Tallyseal does not provide legal advice; controllers should engage counsel for jurisdiction-specific application.*

### Spec/runtime placement

- **Type definitions** ship in `@tallyseal/crawcus-spec` (the EventKind taxonomy is part of the open standard).
- **Runtime EventKind union extension** in `internal-package` (re-exports `DisclosureSignal` from `crawcus-spec`).
- **TCK fixture** in `@tallyseal/crawcus-tck` covering positive case + SIGNAL-not-gate lint rejection.
- **Adapter helper** in `@tallyseal/react-assistant-ui`: `TallysealBanner` gains `onReadSignal` callback wiring IntersectionObserver to emit `DisclosureSignal{signalType: 'read'}` events.

Source: HF feedback 2026-06-02 item 5; lighthouse SURFACE-FIRST verdict 2026-06-02; Q-CR9 LOCKED option (b) discriminator pattern 2026-06-02.

---

## 7. References

- `02-product/crawcus-format.md` — v0.1 canonical contract (extended by this memo to v0.2)
- `02-product/compliance-manifest-schema.md` — companion contract; Contracts cite RegulationVersions defined here
- `00-canon/architecture-primitives.md` — Intent + CrawcusSpec primitives (1 and 2)
- `00-canon/compliance-by-design.md` — 11 decisions (Contracts may become the 12th — surfaced as canon question, not pre-decided)
- `07-engineering/core-v0.0.1-type-surface.md` — receives the `contract/` module in §18 + §19 post-lock
- the project's engineering ratchets — #3 (deterministic reducer, hash-tested) is the property pure-sync predicates preserve
- `07-engineering/nfrs.md` — C6 (3-layer readiness) is structurally extended by Contracts; D2/D3 preserved by pure-sync discipline
- `09-operating/decision-log.md` — CrawcusSpec v0.1 LOCKED 2026-05-19; W3C/IEEE submission LOCKED Y1 H2
- `01-strategy/c5-anthropic-relationship.md` — co-author bilateral pattern that Contracts strengthens
- `01-strategy/q9-assistant-ui-posture.md` — three-way Article-14 reference architecture that Contracts gives a concrete artefact
