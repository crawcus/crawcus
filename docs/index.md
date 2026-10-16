<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# CRAWCUS

**Contract · Receipt · Attestation · Warrant** — an open specification for cryptographic audit receipts covering both application transactions and AI-inference decisions under one canonical shape.

The specification is authored openly, dual-licensed ([CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) for spec text, [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) for code), and on a [Linux Foundation AI & Data](https://lfaidata.foundation/) submission path via the [Joint Development Foundation](https://www.jointdevelopment.org/). Any party — systems integrator, adjacent vendor, individual developer, regulator — can implement a conformant runtime or verifier.


CRAWCUS defines the payload semantics and regulation mapping for cryptographic audit receipts. Envelope-level transparency is the domain of IETF SCITT ([RFC 9943](https://www.rfc-editor.org/rfc/rfc9943.html), [RFC 9942](https://www.rfc-editor.org/rfc/rfc9942.html)). That covers registration of Signed Statements with a Transparency Service and COSE Receipts. SCITT treats the payload as opaque, and CRAWCUS is designed to be carried as a SCITT payload. The profile is a draft and has not been tested against any Transparency Service: see [CRAWCUS and SCITT](scitt.md).

---

## Why this exists

When a regulator, auditor, or plaintiff asks *"prove this record has not been altered since it was written,"* the honest answer available today is usually one of:

- *"Trust our vendor's audit log."* Useless when the vendor is a defendant.
- *"Run our proprietary tool."* A black box the regulator cannot independently verify.
- *"Here are our SIEM logs."* Unsigned and mutable by anyone with SIEM admin.
- *"We put hashes on a blockchain."* GDPR-incompatible at enterprise write throughput.

CRAWCUS makes a fourth answer possible: **replay the receipt chain against any conformant verifier and check its integrity cryptographically.** Hash-chain integrity is verifiable today; verifying *who signed* a chain (signer trust) is still in progress — see [crawcus#1](https://github.com/crawcus/crawcus/issues/1).

## What CRAWCUS is

Every CRAWCUS receipt is a small structured JSON document, canonicalised per [RFC 8785 (JCS)](https://www.rfc-editor.org/rfc/rfc8785), hashed with SHA-256, and appended to a hash-chained log where each entry references the hash of the previous one. Tampering with any historical record breaks the chain in a way any auditor can verify with an open-source tool in seconds.

CRAWCUS composes existing open standards. The primitives underneath — canonical JSON, SHA-256, timestamp formats, signature envelopes — are unchanged. The value CRAWCUS adds is the *shape*: a specific set of fields, their meanings, and two-scope coverage of both application transactions and AI-inference decisions under one canonical form.

## Conformance tiers

Ratified 2026-09-01: CRAWCUS ships as a two-tier spec so implementers can pick the level that matches their integration surface.

| Tier | Primitives | Sufficient for | Reference implementations |
|---|---|---|---|
| **CRAWCUS-Core-1.0** | Contract · Receipt · Attestation · Warrant (4) | Hash-chained audit interop, CloudEvents / JWT / SD-JWT payload embedding, federated-learning per-node receipts, most application-level audit trails | `crawcus-flower` (Python client for the Flower federated-learning framework) |
| **CRAWCUS-Extended-1.0** | Core + Disclosure · Consent · Lineage · HumanOversight · Tool-use (9) | AACI-shape regulator compliance: GDPR Art. 22 automated-decision-making, EU AI Act Art. 14 / Art. 50 human-oversight + deepfake-disclosure, FERPA §99.31 disclosure-consent | `@crawcus/regulations-gdpr`, `@crawcus/regulations-ferpa`, `@crawcus/regulations-eu-ai-act` |

Implementers declare their conformance tier in package metadata. Full details: [Architecture primitives](canon/architecture-primitives.md).

## Read the specification

| Document | What it covers |
|---|---|
| [Format](spec/crawcus-format.md) | Wire format canonical serialization (RFC 8785 JCS + SHA-256), hash-chain construction, envelope structure, projection binding, wire-format stability guarantees. GDPR crypto-shred / tombstone erasure is not specified yet — see the [TODO stub](spec/crawcus-format.md#gdpr-erasure). |
| [Contracts](spec/crawcus-contracts.md) | Contract primitive design — checkpoints (`define` / `propose` / `apply` / `commit`), predicate evaluation semantics, rollback rules, composition rules |
| [Architecture primitives](canon/architecture-primitives.md) |
| **SCITT implementer or WG participant** | [CRAWCUS and SCITT](scitt.md) → [SCITT payload profile (draft)](spec/crawcus-scitt-profile.md) → [ADR-0055 build plan](adr/ADR-0055-scitt-fit.md) | Canonical documentation of all primitives — Core (4) and Extended (5 additional) tiers, with the shape, semantics, and conformance test surface of each |

## Reference implementations

The specification ships alongside reference implementations that adopters can point at, extend, or replace with their own conformant runtimes. Reference implementations are one demonstration of correctness — never "the" reference. Anything passing the [`@crawcus/tck`](https://github.com/crawcus/crawcus/tree/main/packages/tck) fixture set at the appropriate conformance tier is by definition CRAWCUS-conformant.

### TypeScript packages (npm)

| Package | Purpose | Depends on |
|---|---|---|
| `@crawcus/spec` | Types + evaluators + canonical JSON serialization. Framework-agnostic. | `@noble/curves`, `@noble/hashes`, `canonicalize` |
| `@crawcus/core` | Reference runtime. Ports for warrant / consent / disclosure / lineage / oversight stores; PII tokenisation; reducers; audit-bundle composer. | `@crawcus/spec` |
| `@crawcus/tck` | Test Compatibility Kit. Portable Gherkin-shaped fixtures for spec conformance. | `@crawcus/spec` |
| `@crawcus/verifier` | UI-agnostic chain verifier. Small-chain sync core; suitable for offline CLI + browser lighthouse. | `@crawcus/spec` |
| `@crawcus/regulations-gdpr` | Art. 6 / 8 / 9 / 22 typed Contract factories + Art. 13 / 22 disclosure templates. Quarterly-versioned (`gdpr@YYYY-QN`). | `@crawcus/core`, `@crawcus/tck` |
| `@crawcus/regulations-ferpa` | §99.31 factories + §99.7 annual-notice template. | `@crawcus/core`, `@crawcus/tck` |
| `@crawcus/regulations-eu-ai-act` | Art. 14 (human oversight) + Art. 50 (deepfake / synthetic-media disclosure) factories and templates. | `@crawcus/core`, `@crawcus/tck` |

### Python packages (PyPI)

| Package | Purpose |
|---|---|
| `crawcus-flower` | Reference client for the [Flower federated-learning framework](https://flower.ai). Per-node receipts, offline-verifiable via the TS verifier. |

## Who this is for

| If you are a… | Start here |
|---|---|
| **Regulator or auditor** | [Wire format](spec/crawcus-format.md) → verify a real chain end-to-end using the reference verifier |
| **Compliance lead** (CISO, GRC, DPO, model-risk officer) | the `@crawcus/regulations-*` package for your applicable regime |
| **Enterprise CTO or architect** | [Wire format](spec/crawcus-format.md) → [Architecture primitives](canon/architecture-primitives.md) → walk-away / forensic-replay evaluation against the reference implementations |
| **Engineer building a conformant runtime** | [Wire format](spec/crawcus-format.md) → [Contract primitive](spec/crawcus-contracts.md) → clone the [TCK](https://github.com/crawcus/crawcus/tree/main/packages/tck) fixtures, run against your implementation |
| **Author of an adjacent open-source project** (federated learning, model serving, LLM observability, MLOps) | Look at [`clients/flower/`](https://github.com/crawcus/crawcus/tree/main/clients/flower) as the pattern — a small client that emits per-node receipts. The same pattern generalises to any framework that surfaces a per-decision or per-call boundary. |
| **Standards-body reviewer** (LF AI & Data / JDF) | [Governance](https://github.com/crawcus/crawcus/blob/main/GOVERNANCE.md) → [Wire format](spec/crawcus-format.md) → [Architecture primitives](canon/architecture-primitives.md) |

## Standards CRAWCUS builds on

CRAWCUS does not reinvent cryptographic primitives. It composes:

| Primitive | Standard |
|---|---|
| JSON canonical serialization | [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785) |
| Chain-link hash | [FIPS 180-4 SHA-256](https://csrc.nist.gov/pubs/fips/180-4/upd1/final) |
| Timestamps | [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) (subset of ISO 8601) |
| Optional signature envelope | [DSSE](https://github.com/secure-systems-lab/dsse) |
| Optional supply-chain signing | [Sigstore](https://www.sigstore.dev) |
| Optional transparency envelope | [SCITT](https://datatracker.ietf.org/wg/scitt/about/): [RFC 9943](https://www.rfc-editor.org/rfc/rfc9943.html), [RFC 9942](https://www.rfc-editor.org/rfc/rfc9942.html). Payload profile [in draft](spec/crawcus-scitt-profile.md) |
| Erasable-immutable log pattern | GDPR crypto-shred + tombstone — [not yet specified](spec/crawcus-format.md#gdpr-erasure) |
| Actor-attribution conventions | [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749), mTLS, SAML — no CRAWCUS-specific extension |

## Governance + licensing

- **Governance:** authored under the model described in [GOVERNANCE.md](https://github.com/crawcus/crawcus/blob/main/GOVERNANCE.md). Pre-donation phase (2026-09-01–): single maintainer with public Discussion-based decision-making. Post-donation: LF AI & Data / JDF governance.
- **Standards-body track:** Linux Foundation submission planned. Rationale: 6–12 month realistic timeline, industry-neutral governance from day one, alignment with peer projects (C2PA, in-toto, Sigstore) in the receipt / supply-chain-signing space.
- **Code licence:** [Apache-2.0](https://github.com/crawcus/crawcus/blob/main/LICENSE) (with per-package `LICENSE` files that may declare MIT).
- **Specification licence:** [CC-BY-4.0](https://github.com/crawcus/crawcus/blob/main/LICENSE-SPEC).
- **Contribution mechanism:** DCO sign-off ([`git commit -s`](https://developercertificate.org)); no CLA required.
- **Security disclosures:** [SECURITY.md](https://github.com/crawcus/crawcus/blob/main/SECURITY.md) — private disclosure to `paul@tallyseal.org` (subject prefix `[CRAWCUS SECURITY]`) or GitHub Security Advisories.

## Openness — what we claim, what we do not

We are careful with claims. A receipt standard is only as trustworthy as the honesty of its openness claims.

**What is true today:**

- The spec is published and free to implement (CC-BY-4.0).
- Reference implementations are shipped as open source (Apache-2.0).
- Every runtime — including the reference implementations — is measured against the same TCK fixture set.
- Anyone can verify a chain's hash-chain integrity independently of any vendor (signer-trust verification in progress — [crawcus#1](https://github.com/crawcus/crawcus/issues/1)).

**What is not yet true:**

- Multi-vendor implementation ecosystem — the reference implementations here are the initial implementations. Third-party conformant implementations are actively encouraged.
- LF / JDF adoption — submission planned, not yet submitted.
- Widespread production deployment — early adopters welcome.
- Interop with SCITT Transparency Services. The payload profile is a draft; registration against Transparency Service implementations is planned and not yet tested.

## Verifying releases (planned)

Publishing is **planned** to use [Trusted Publishers](https://docs.pypi.org/trusted-publishers/) (OIDC — no long-lived API tokens) with [Sigstore attestations](https://docs.sigstore.dev) bound to the specific source commit + GitHub Actions workflow run for every `@crawcus/*` npm package and `crawcus-*` PyPI package. This pipeline is not in place yet, so there are no attested releases to verify today. Publishing an audit-integrity library without cryptographic supply-chain proof would be self-parodying — which is why this lands before we call any release stable.

Once it lands, each release will include the exact `sigstore verify` command in its release notes. See [SECURITY.md](https://github.com/crawcus/crawcus/blob/main/SECURITY.md) §"Supply-chain integrity — what the project commits to" for the planned commitment.

## Get involved

- **Read the spec** — start with [Format](spec/crawcus-format.md), then [Contracts](spec/crawcus-contracts.md)
- **Verify a real chain** — clone [crawcus/crawcus](https://github.com/crawcus/crawcus), `pnpm install`, run `packages/verifier` against a sample chain
- **Try the Python reference client** — `pip install crawcus-flower` and emit receipts from a Flower federated-learning run
- **Report an issue** — [GitHub Issues](https://github.com/crawcus/crawcus/issues) (bugs / spec clarifications / feature requests) — see the templates for what belongs in each
- **Discuss** — [GitHub Discussions](https://github.com/crawcus/crawcus/discussions) (spec-change proposals, general questions)
- **Contribute** — see [CONTRIBUTING.md](https://github.com/crawcus/crawcus/blob/main/CONTRIBUTING.md) for the three contribution tracks (spec change / implementation change / documentation) and DCO sign-off requirement
- **Contact** — `paul@tallyseal.org` for spec-level enquiries; SECURITY.md for security disclosures

---

*Specification and reference implementations originally authored by Paul Wander as part of the Tallyseal project. The specification is on a path to Linux Foundation stewardship — see [GOVERNANCE.md](https://github.com/crawcus/crawcus/blob/main/GOVERNANCE.md).*
