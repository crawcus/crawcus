# CRAWCUS

**Contract · Receipt · Attestation · Warrant** — an open specification for cryptographic audit receipts that cover both application transactions and AI-inference decisions under one canonical shape.

## The problem CRAWCUS answers

When a regulator, auditor, or plaintiff asks *"prove this record has not been altered since it was written,"* the honest answer available today is usually one of:

- *"Trust our vendor's audit log"* — useless when the vendor is the defendant.
- *"Run our proprietary tool"* — a black box the regulator can't independently verify.
- *"Here are our SIEM logs"* — unsigned and mutable by anyone with SIEM admin.
- *"We put hashes on a blockchain"* — GDPR-incompatible at enterprise write throughput.

CRAWCUS makes a fourth answer possible: **replay the receipt chain against any conformant verifier and prove integrity mathematically, not by trusting a vendor.**

## Conformance levels

CRAWCUS ships as a two-tier spec so implementers can pick the level that matches their integration surface:

- **CRAWCUS-Core-1.0** — the 4 primitives (Contract · Receipt · Attestation · Warrant). Sufficient for hash-chained audit interop, CloudEvents/JWT/SD-JWT-style payload embedding, and federated-learning per-node receipts. Regulator 5-minute grok.
- **CRAWCUS-Extended-1.0** — Core + five additional primitives (Disclosure · Consent · Lineage · HumanOversight · Tool-use). Required for AACI-shape regulator compliance (GDPR Art. 22 automated-decision-making, EU AI Act Art. 14/50 human-oversight + deepfake-disclosure, FERPA §99.31 disclosure).

Both tiers ship in this specification. Implementers declare their conformance level in their package metadata.

## What's in this specification

| Section | What it is |
|---|---|
| [Format](spec/crawcus-format.md) | Wire-format canonical serialization (RFC 8785 JCS + SHA-256), hash-chain construction, envelope structure, projection binding |
| [Contracts](spec/crawcus-contracts.md) | Contract primitive design — checkpoints (define/propose/apply/commit), predicate evaluation, rollback, composition rules |
| [Architecture primitives](canon/architecture-primitives.md) | Canonical documentation of all primitives (Core + Extended tiers) |

## Reference implementations

The specification ships alongside reference implementations that adopters can point at, extend, or replace:

- **`@crawcus/spec`** — TypeScript types + evaluators + canonical JSON serialization. Framework-agnostic.
- **`@crawcus/core`** — Reference runtime. Ports for warrant/consent/disclosure/lineage/oversight stores, PII tokenisation, reducers.
- **`@crawcus/tck`** — Test Compatibility Kit. Portable Gherkin-shaped fixtures for spec conformance.
- **`@crawcus/verifier`** — UI-agnostic chain verifier. Small-chain sync core; suitable for offline CLI + browser lighthouse.
- **`@crawcus/regulations-gdpr`** — GDPR Art. 6/8/9/22 typed Contract factories + Art. 13/22 disclosure templates. Quarterly-versioned.
- **`@crawcus/regulations-ferpa`** — FERPA §99.31 factories + §99.7 annual-notice template.
- **`@crawcus/regulations-eu-ai-act`** — EU AI Act Art. 14 (human oversight) + Art. 50 (deepfake/emotion/synthetic disclosure) factories + templates.
- **`crawcus-flower`** (Python) — Reference client for the Flower federated-learning framework. Per-node receipts, offline-verifiable.

## Who this is for

- **Regulators / auditors** — verify a customer's receipt chain independently.
- **Compliance leads** (CISO, GRC, DPO, model-risk officer) — answer procurement questionnaires with *"here is the open spec our system emits; you can verify without us."*
- **Enterprise architects / CTOs** — evaluate whether a CRAWCUS-emitting product satisfies walk-away, forensic-replay, and cross-runtime-audit requirements.
- **Engineers building conformant runtimes** — produce receipts that pass the TCK and consume receipts from any other conformant runtime.
- **Authors of adjacent open-source projects** (federated learning, model serving, LLM observability, MLOps) — add a small reference client so users get per-decision signed receipts.
- **Standards-body reviewers** — assess scope, governance trajectory, and prior-art composition.

## Governance + licensing

- Specification text: [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)
- Code (reference implementations, verifier, TCK): [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) or MIT per package
- Standards-body track: Linux Foundation submission via Joint Development Foundation (LF AI & Data umbrella) — see [ADR-0052](https://github.com/tallyseal/crawcus/blob/main/docs/governance/adr-0052-standards-body-path.md)
- Contributions: DCO sign-off; open contribution model

## Get involved

- **Read the spec** — start with [Format](spec/crawcus-format.md) then [Contracts](spec/crawcus-contracts.md)
- **Try the reference client** — install `crawcus-flower` (Python) and emit receipts from a Flower federated-learning run
- **Report an issue** — [tallyseal/crawcus issues](https://github.com/tallyseal/crawcus/issues)
- **Discuss** — GitHub Discussions (community forum) or `paul@tallyseal.org`
