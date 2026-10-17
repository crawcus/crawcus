<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# Architecture primitives — the 14 cores

> **Extended 2026-05-21** from 7 → 14 primitives. The original 7 cores
> remain load-bearing; **Contract** and **Attestation** were added with
> CRAWCUS v0.2 spec lock (2026-05-20–21); **Warrant**, **Disclosure**,
> **Consent**, **Lineage**, **HumanOversight** committed by the
> primitives-audit memo 2026-05-21 (not published in this repository)
> as the lighthouse-driven architectural surface for v0.1.0.

## The fractal claim

The same primitives — applied at different scales / surfaces — cover: wizards, form transmogrification, voice intake, multi-agent systems, embedded systems, federated multi-org, and regulator-side ingestion. The primitive set expands as the standards-grade surface formalises; the *pattern* remains constant.

## The primitive bar

Something is a **first-class architectural primitive** if it meets all four tests:

1. **Emit / store / evaluate** — runtime explicitly emits, stores, or evaluates it as a discrete artifact (not derived from other primitives)
2. **TCK-testable** — the Conformance Test Kit verifies it as a distinct surface
3. **Auditor-requestable** — regulator / DPO / underwriter can request it standalone, with its own audit story
4. **Discrete lifecycle** — has its own lifecycle (created → exercised → expired / revoked)

The primitives-audit memo is not published in this repository. It is the source named for the explicit-exclusions list (Delegation, Override, Revocation, DSAR Response, Snapshot, External Signature, Eval Witness).

## The 14 primitives

### 1. Intent

A conversational thread with a typed completion contract. Has a **CrawcusSpec** declaring required fields, dependencies, askHints, options.

**Examples:** `CreateCourse`, `OriginateLoan`, `ScreenCandidate`, `IntakePatient`.

### 2. CrawcusSpec

Declarative TypeScript / YAML data — list of fields with metadata. Pure data, not code. Build-time validated. The format is part of **CRAWCUS, an open spec we publish (CC-BY-4.0).** (Renamed from `IntentSpec` 2026-05-21 per B1.2; the canonical contract for `defineCrawcusSpec({...})` lives at [`crawcus-format.md`](../spec/crawcus-format.md).)

```ts
defineCrawcusSpec({
  key: "CreateCourse",
  projection: "Course",
  fields: {
    title: field.string().required().askHint("What's the course called?"),
    // ...
  },
  readiness: ({ has }) => has("title", "subject", "level"),
});
```

### 3. Event (a.k.a. Receipt)

Immutable log entry. The only public mutation path is `writeEvent()`. Events include:

- Lawful basis (GDPR Art. 6)
- Data subject IDs (for DSAR indexing)
- Hash chain back to previous event (tamper-evidence)
- PII as tokens, never raw

Kinds: `CapturedTurn`, `FieldProposed`, `SuggestionAccepted`, `SuggestionRejected`, `SourceCaptured`, `BaselineExtracted`, `ProjectionRun`, `CourseCreated`, `WarrantIssued`, `WarrantRevoked`, `DisclosureDelivered`, `DisclosureSignal` (extensible — `signalType: 'read' | 'click' | 'dwell' | 'replay' | ...`; SIGNAL-not-gate semantics per Q-CR9 LOCKED 2026-06-02), `ConsentGranted`, `ConsentRevoked`, `LineageRecorded`, `OversightConducted`, `ContractViolation`, etc.

**Receipt** is the CRAWCUS-vocabulary alias for Event. They are the same primitive; the alias lands when the standards-facing API surfaces (TCK, audit-bundle render).

### 4. Suggestion

A pending field value proposed by AI extractor, awaiting user accept / edit / reject. Becomes a chip in the UI. Lifecycle:

```
proposed → (accepted | edited | rejected | superseded)
```

The Suggestion → Acceptance lifecycle is the **EU AI Act Article 14 in-loop oversight** implementation. (For on-loop and retrospective oversight, see #14 **HumanOversight**.)

### 5. Reducer

Pure function: `applyEvent(event, tx) → projection writes`. Runs in the **same transaction** as the event write. Three rules:

1. **Same transaction** — event + projection commit together
2. **Deterministic** — same input → same output (hash-tested in CI)
3. **Only mutation path** — no code writes a projection table directly

### 6. Projection

The entity table itself (e.g. `Course`, `Patient`, `Loan`). A regular Prisma / Drizzle table with FKs and indexes. **Never written directly** — only by the reducer. **Rebuildable** from the event log:

```bash
npx codicil rebuild Course --since=v3
```

### 7. Compliance Manifest

`codicil.compliance.ts` — declarative, build-time checked. Maps fields to PII levels + retention + lawful basis. Build fails if a CrawcusSpec uses a special-category field without consent.

```ts
defineCompliance({
  regulations: ['gdpr', 'eu-ai-act-art-14', 'iso-42001'],
  fields: {
    'Course.learnerName': { pii: 'personal', retention: '7y' },
    'Course.medicalNotes': { pii: 'special-art-9', retention: '6y', requireBAA: true },
  },
});
```

### 8. Contract

A named, citable, pure predicate that a CrawcusSpec commits to. Three checkpoint slots — `pre` / `inv` / `post` — evaluated at writeEvent time. Built-in to v0.2 of the CRAWCUS format spec. Composed from typed factories in `@tallyseal/regulations-*` packages (GDPR, FERPA, EU AI Act, etc.). Audit-bundle render includes predicate source + SHA-256 hash + per-event evaluation history.

```ts
import { minorConsent } from '@tallyseal/regulations-gdpr';
import { disclosureConsent } from '@tallyseal/regulations-ferpa';

defineCrawcusSpec({
  // ...
  contracts: {
    pre: [minorConsent(), disclosureConsent()],
  },
});
```

See [`crawcus-contracts.md`](../spec/crawcus-contracts.md) for the design memo.

### 9. Attestation (a.k.a. AuditBundle)

Composed audit artifact rendering Events + Contracts + Warrants + Disclosures + Consents + Lineage + HumanOversight reviews for a given Intent / period / data subject. Signed by the system that produced it, so a third party can verify it offline. An Attestation is a machine-checkable statement by the signing system, not an auditor's opinion or assurance report; an external auditor or Notified Body that reviews it does so separately and signs its own, separate artefact. In non-technical copy, call it an "audit bundle" (see the [glossary](../glossary.md)). (`composeAuditBundle()` shipped commit `220f7089`.) **Attestation** is the CRAWCUS-vocabulary name; **AuditBundle** is the implementation type. Both refer to the same primitive.

### 10. Warrant

A verifiable, time-bounded, revocable, issuer-signed authorization that some authority attaches to a tenant's runtime, stating *"it is authorized to operate under our authority until T."* In non-technical copy, call it a "signed, expiring authorisation" (see the [glossary](../glossary.md)).

**Distinct from Contract** (Contract = per-event predicate; Warrant = continuing authorization). **Distinct from Consent** (Consent = data-subject-issued; Warrant = authority-issued).

**Issuers:** self / Big-4 (PwC, EY, Deloitte, KPMG) / Notified Body / Insurance MGA / Regulator / Cloud / OEM platform.

**Lifecycle:** issued → exercised → expired / revoked. Three checkpoint slots — `pre` / `inv` / `post` — configurable per CrawcusSpec.

**Commercial framing:** Warrant is the **marketplace anchor primitive**. Authorities issue Warrants for fees; lapse → Warrant expires → operations halt. Auto-incentivized renewal loop. Turns CRAWCUS from a runtime into a *protocol*.

The primitives-audit memo §#10 is not published in this repository.

### 11. Disclosure

A discrete, demonstrably-delivered notice from the system to a user / data subject (notice of AI processing, transparency information, FERPA annual notification, GDPR Art 13/14 information).

**Distinct from Contract** (Contract pre-check says "notice will be shown"; Disclosure records that it *was*).

**Lifecycle:** drafted → delivered → acknowledged → retracted. Discrete states.

**Side-channel observation:** `DisclosureSignal` EventKind (Q-CR9 LOCKED 2026-06-02) captures weaker observational signals about a delivered Disclosure — `read` (scrolled past, IntersectionObserver-detected), `click` (link followed), `dwell` (view-time threshold), `replay` (re-opened) — discriminated by `signalType`. **SIGNAL-not-gate semantics**: signals are *evidence the data subject had an opportunity to perceive the notice*, not affirmative acknowledgments. ICO + recent German rulings make scroll-as-gate contested; scroll-as-signal is defensible. Signals never replace `acknowledged` in the lifecycle; they sit alongside `delivered` as supporting evidence. See [`crawcus-contracts.md`](../spec/crawcus-contracts.md) §"`pre.disclosure-has-opportunity-to-be-read`".

**Anchors:** EU AI Act Art 50 (transparency to AI-interacting users), Art 13 (info on high-risk systems); FERPA §99.7 (annual parental/student notification); GDPR Art 13 / Art 14 (information at collection / from third party).

The primitives-audit memo §#11 is not published in this repository.

### 12. Consent

A data-subject-issued authorization for specific data processing purposes. **Legally distinct from Warrant** (Consent is issued by the data subject or guardian; Warrant is issued by an authority). Conflating loses GDPR Art 7 right-of-withdrawal distinctness and FERPA §99.30 guardian-on-behalf-of-minor distinctness.

**Lifecycle:** requested → granted → exercised → withdrawn. Withdrawal is subject-initiated per GDPR Art 7(3) ("as easy to withdraw as to give").

**Wire format:** Kantara Consent Receipt (CR v1.1) compatible.

**Anchors:** GDPR Art 7 + Art 8, FERPA §99.30, HIPAA 45 CFR 164.508.

The primitives-audit memo §#12 is not published in this repository.

### 13. Lineage

The provenance graph for an AI-produced output — input data → model → prompt template → output. W3C PROV-O JSON-LD serialization per Q-CR7 (decision log not published in this repository).

**Distinct from Event.causationId** (causationId = immediate cause-effect between events; Lineage = full input-data-graph back to source datasets, training data, model weights, prompt templates).

**Lifecycle:** recorded (immutable once written). No revocation; corrections supersede.

**Anchors:** EU AI Act Art 12 (record-keeping) + Annex IV §2(g) (datasets) + §2(h) (training data); W3C PROV-O.

The primitives-audit memo §#13 is not published in this repository.

### 14. HumanOversight

A record of supervisory review of AI system behavior by designated oversight personnel. **Distinct from Suggestion lifecycle** — Suggestion covers per-decision human-in-loop gating; HumanOversight covers EU AI Act Art 14's broader on-loop and retrospective oversight modes (supervisors who can detect, intervene in, and stop autonomous AI behavior).

**Modes:** `in-loop` (per-decision; covered by Suggestion) | `on-loop` (periodic supervisory review during operation) | `retrospective` (post-hoc audit of past period).

**Lifecycle:** review-scheduled → conducted → signed-off / escalated. Escalation can trigger Warrant suspension (per federation rules) or revocation (per issuer policy).

**Anchors:** EU AI Act Art 14 paragraphs 4 (oversight measures) + 5 (high-risk additional); ISO 42001 §9.1 (monitoring).

The primitives-audit memo §#14 is not published in this repository.

## Supporting primitives (also load-bearing)

- **Readiness gate** — three-layer (UI / AI prompt / reducer atomic guard); EU AI Act Art. 14 in-loop enforcement
- **Graph evaluator** — per turn computes what to ask next based on dependencies + required-ness + user's current focus
- **Projector** (Layer 3 extraction) — subject-specific extractor, versioned and re-runnable
- **Task** — durable async work (file parse, projection run). Workers emit events when done. Chat never blocks except at CTA when a blocking task affects required fields.

## The fractal evidence

| Use case | Primitives in use |
|---|---|
| Wizard (NW for HF) | Intent + CrawcusSpec + Event + Suggestion + Reducer + Projection + Contract + Compliance Manifest + Consent + Disclosure |
| Form transmogrification | Same, generated from existing form via CLI |
| Voice intake | Same, with Twilio/Vapi adapter as the input surface |
| Multi-agent | Each agent-action = a Suggestion; readiness gate = inter-agent confirmation; HumanOversight records on-loop reviews |
| Embedded / IoT | Same, with reduced UI; event log is the audit trail |
| **Federated multi-org** | Same primitives + signed Warrants exchanged between issuers + Attestation bundles cross-tenant + Lineage graphs span data sources |
| **Insurance MGA federation** | Underwriter issues Warrant; runtime evaluates pre/inv/post; premium tied to runtime-measured risk |
| **Notified Body conformity** | NB issues Warrant after audit; HumanOversight records inform NB's surveillance audits; Attestation bundle is the audit artifact |
| **Big-4 warrant marketplace** (hypothetical) | Big-4 firm issues Warrant; quarterly Warrant renewal; Cloud distributes signed Warrants |
| Regulator-side ingestion | Regulator receives signed Attestation bundles; same Event format; can issue regulatory-sandbox Warrants |

The fractal quality is why no single primitive is patentable but the *pattern* is the moat. One architecture, 26 expansion vectors, multiple marketplace business models anchored by Warrant.

## Reading order for newcomers

1. `identity.md`, `scope.md`, and `compliance-by-design.md` are not published in this repository.
2. Read this file — the how (14 primitives)
4. The primitives-audit memo (lighthouse justification and conscious exclusions) is not published in this repository.
