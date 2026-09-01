# CRAWCUS

**Contract · Receipt · Attestation · Warrant** — an open specification for cryptographic audit receipts covering both application transactions and AI-inference decisions under one canonical shape.

> **Read the spec:** [`docs/spec/crawcus-format.md`](docs/spec/crawcus-format.md) (wire format) · [`docs/spec/crawcus-contracts.md`](docs/spec/crawcus-contracts.md) (Contract primitive) · [`docs/canon/architecture-primitives.md`](docs/canon/architecture-primitives.md) (all primitives)
> **Rendered site:** [tallyseal.org/spec](https://tallyseal.org/spec) (once DNS + GitHub Pages land)

---

## Why this exists

When a regulator, auditor, or plaintiff asks *"prove this record has not been altered since it was written,"* the honest answer available today is usually one of:

- *"Trust our vendor's audit log."* Useless when the vendor is a defendant.
- *"Run our proprietary tool."* A black box the regulator cannot independently verify.
- *"Here are our SIEM logs."* Unsigned and mutable by anyone with SIEM admin.
- *"We put hashes on a blockchain."* GDPR-incompatible at enterprise write throughput.

CRAWCUS makes a fourth answer possible: **replay the receipt chain against any conformant verifier and prove integrity mathematically, not by trusting a vendor.**

## What CRAWCUS is

Every CRAWCUS receipt is a small structured JSON document, canonicalised per [RFC 8785 (JCS)](https://www.rfc-editor.org/rfc/rfc8785), hashed with SHA-256, and appended to a hash-chained log where each entry references the hash of the previous one. Tampering with any historical record breaks the chain in a way any auditor can verify with an open-source tool in seconds.

The specification is deliberately not proprietary. Any party — systems integrator, adjacent vendor, individual developer, regulator — can implement a conformant runtime or verifier. A receipt standard that only one vendor can verify is not useful for compliance.

CRAWCUS composes existing open standards ([RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785), [SHA-256 FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final), [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339), [DSSE](https://github.com/secure-systems-lab/dsse), [Sigstore](https://www.sigstore.dev), the erasable-immutable-log pattern for GDPR). The value it adds is the *shape* — a specific set of fields, their meanings, and two-scope coverage of both application transactions and AI-inference decisions under one canonical form. The cryptographic primitives underneath are unchanged.

## Conformance tiers

Ratified 2026-09-01: CRAWCUS ships as a two-tier spec so implementers can pick the level that matches their integration surface.

| Tier | Primitives | Sufficient for | Reference impl |
|---|---|---|---|
| **CRAWCUS-Core-1.0** | Contract · Receipt · Attestation · Warrant (4) | Hash-chained audit interop, CloudEvents / JWT / SD-JWT payload embedding, federated-learning per-node receipts, most application-level audit trails | [`clients/flower/`](clients/flower/) — Python client for the Flower federated-learning framework |
| **CRAWCUS-Extended-1.0** | Core + Disclosure · Consent · Lineage · HumanOversight · Tool-use (9) | AACI-shape regulator compliance: GDPR Art. 22 automated-decision-making, EU AI Act Art. 14 / Art. 50 human-oversight + deepfake-disclosure, FERPA §99.31 disclosure-consent | [`packages/regulations-gdpr`](packages/regulations-gdpr/), [`packages/regulations-ferpa`](packages/regulations-ferpa/), [`packages/regulations-eu-ai-act`](packages/regulations-eu-ai-act/) |

Implementers declare their conformance tier in package metadata (`package.json` `crawcus.conformance`; `pyproject.toml` `[tool.crawcus] conformance`).

Full details: [`docs/canon/architecture-primitives.md`](docs/canon/architecture-primitives.md).

## Who this is for

| If you are a… | You care about |
|---|---|
| **Regulator or auditor** | Verifying a customer's receipt chain independently, without their cooperation and without trusting the vendor that produced it. Start with [`packages/verifier`](packages/verifier/) and the TCK. |
| **Compliance lead** (CISO, GRC, DPO, model-risk officer) | Answering procurement questionnaires and regulator letters with *"here is the open spec our system emits; you can verify without us."* Anti-lock-in, anti-vendor-defendant. |
| **Enterprise CTO or architect** | Evaluating whether a CRAWCUS-emitting product satisfies walk-away, forensic-replay, and cross-runtime-audit requirements. Read the spec + verify a real chain end-to-end. |
| **Engineer building a conformant runtime** | Producing receipts that pass the TCK and consuming receipts from any other conformant runtime. Start with [`packages/spec`](packages/spec/) + [`packages/tck`](packages/tck/). |
| **Author of an adjacent open-source project** (federated learning, model serving, LLM observability, MLOps) | Adding a small reference client so users get per-decision signed receipts. See [`clients/flower/`](clients/flower/) as the pattern. |
| **Standards-body reviewer** (LF AI & Data / JDF) | Assessing scope, governance trajectory, licensing, prior-art composition. Start with [`GOVERNANCE.md`](GOVERNANCE.md) + [`docs/spec/`](docs/spec/). |

## Repository layout

```
crawcus/
├── docs/
│   ├── index.md                        landing page (mkdocs entry)
│   ├── spec/                           SPECIFICATION TEXT (CC-BY-4.0)
│   │   ├── crawcus-format.md           wire format canonical serialization
│   │   ├── crawcus-contracts.md        Contract primitive deep-dive
│   ├── canon/                          architectural decisions (CC-BY-4.0)
│   │   ├── architecture-primitives.md  all Core + Extended primitives
│   └── engineering/                    quality gates (CC-BY-4.0)
├── packages/                           REFERENCE IMPLEMENTATIONS (Apache-2.0 or MIT per LICENSE)
│   ├── spec/          @crawcus/spec         types + evaluators + canonical JSON
│   ├── core/          @crawcus/core         runtime + ports + PII tokenisation
│   ├── verifier/      @crawcus/verifier     UI-agnostic chain verifier (sync core)
│   ├── tck/           @crawcus/tck          Test Compatibility Kit fixtures
│   ├── regulations-gdpr/          @crawcus/regulations-gdpr
│   ├── regulations-ferpa/         @crawcus/regulations-ferpa
│   └── regulations-eu-ai-act/     @crawcus/regulations-eu-ai-act
├── clients/
│   └── flower/    crawcus-flower (Python)   reference client for the Flower FL framework
├── branding/                           logo + brand assets (MIT)
├── mkdocs.yml                          docs site config (Material theme)
├── LICENSE                             Apache-2.0 (code)
├── LICENSE-SPEC                        CC-BY-4.0 (spec text)
├── NOTICE                              copyright + third-party attributions
├── CODE_OF_CONDUCT.md                  Contributor Covenant 2.1
├── CONTRIBUTING.md                     how to contribute (DCO, TCK, PR flow)
├── GOVERNANCE.md                       decision-making model
├── SECURITY.md                         vulnerability disclosure policy
└── MAINTAINERS.md                      current maintainers
```

## Quick start

### Verify a receipt chain

```bash
pnpm install
pnpm --filter @crawcus/verifier build

# Verify a chain from a JSONL file
node packages/verifier/dist/cli.js verify chain.jsonl
```

### Emit receipts from a Python Flower client

```bash
pip install crawcus-flower

# See clients/flower/examples/quickstart.py for the full walkthrough.
```

### Build a conformant runtime in another language

1. Read [`docs/spec/crawcus-format.md`](docs/spec/crawcus-format.md) — wire format
2. Read [`docs/spec/crawcus-contracts.md`](docs/spec/crawcus-contracts.md) — Contract primitive
3. Implement the primitives your target tier requires (Core or Extended per [`docs/canon/architecture-primitives.md`](docs/canon/architecture-primitives.md))
4. Run the [`@crawcus/tck`](packages/tck/) fixture set against your implementation
5. Publish with a conformance-tier declaration in the README

Any language with JCS + SHA-256 + optional signing (`Ed25519` / DSSE / Sigstore) can produce conformant receipts.

## Standards CRAWCUS builds on

CRAWCUS does not reinvent cryptographic primitives. It composes:

| Primitive | Standard |
|---|---|
| JSON canonical serialization | [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785) |
| Chain-link hash | [FIPS 180-4 SHA-256](https://csrc.nist.gov/pubs/fips/180-4/upd1/final) |
| Timestamps | [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) (subset of ISO 8601) |
| Optional signature envelope | [DSSE](https://github.com/secure-systems-lab/dsse) |
| Optional supply-chain signing | [Sigstore](https://www.sigstore.dev) |
| Erasable-immutable log pattern | GDPR crypto-shred + tombstone (see [`docs/spec/crawcus-format.md`](docs/spec/crawcus-format.md) §GDPR erasure) |
| Actor-attribution conventions | [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749), mTLS, SAML — no CRAWCUS-specific extension |

## Governance + standards-body path

CRAWCUS is authored openly under the governance model in [`GOVERNANCE.md`](GOVERNANCE.md). During the current pre-donation phase the project has a single maintainer (Paul Wander); the model transitions to a multi-maintainer / TSC structure at Linux Foundation donation.

The intended donation target is the **Linux Foundation AI & Data** foundation, submitted via the **Joint Development Foundation (JDF)** — the same track [C2PA](https://c2pa.org), [in-toto](https://in-toto.io), and [Sigstore](https://www.sigstore.dev) took. Progress is public in the [GitHub Discussions](https://github.com/tallyseal/crawcus/discussions) (once the repository goes live).

Rationale for LF over W3C / IEEE / ISO: 6–12 month realistic timeline to a recognised standard, industry-neutral governance from day one, no PAR ceremony blocking spec publication, alignment with existing peer projects in the receipt / supply-chain-signing space.

## Openness — what we claim, what we do not

We are careful with claims. A receipt standard is only as trustworthy as the honesty of its openness claims.

**What is true today:**

- The spec is published and free to implement (CC-BY-4.0).
- Reference implementations are shipped as open source (Apache-2.0).
- Every runtime — including the reference implementations here — is measured against the same TCK fixture set.
- Anyone can verify a chain independently of any vendor.

**What is not yet true:**

- Multi-vendor implementation ecosystem — the reference implementations in this repository are the initial implementations. Third-party conformant implementations are actively encouraged.
- LF / JDF adoption — submission in flight, not accepted.
- Widespread production deployment — early adopters welcome.

Where we describe CRAWCUS externally we use plain language matching the current state, not aspirational marketing. See [`CONTRIBUTING.md`](CONTRIBUTING.md) §"Language + claims" for the discipline maintainers apply.

## Verify this release

Every `@crawcus/*` npm package and `crawcus-*` PyPI package published from this repository is signed via [Trusted Publishers](https://docs.pypi.org/trusted-publishers/) (OIDC — no long-lived API tokens) with [Sigstore attestations](https://docs.sigstore.dev) bound to the specific source commit + GitHub Actions workflow run. Publishing an audit-integrity library without cryptographic supply-chain proof would be self-parodying.

Each release includes the exact `sigstore verify` command in its release notes. See [`SECURITY.md`](SECURITY.md) §"Supply-chain integrity guarantees" for the full commitment.

## Contributing

Contributions welcome from anyone building or evaluating cryptographic audit systems. Start at [`CONTRIBUTING.md`](CONTRIBUTING.md).

Three contribution tracks, each with its own flow:

- **Spec changes** — ADR-shaped GitHub Discussion first (14-day comment window), then PR
- **Reference-implementation changes** — standard PR flow with tests + TCK conformance + DCO sign-off
- **Documentation** — direct PR for typos and clarifications; open a Discussion first for substantive rewrites

Every commit must be [DCO](https://developercertificate.org)-signed (`git commit -s`). No CLA required. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full flow, PR checklist, and quality gates.

Community norms: [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/), see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Security

Vulnerability disclosures via **paul@tallyseal.org** (subject prefix `[CRAWCUS SECURITY]`) or via GitHub Security Advisories (private). Do NOT open a public issue for a security bug. See [`SECURITY.md`](SECURITY.md) for scope, coordinated-disclosure timeline, and supply-chain guarantees.

## Licensing

| Component | Licence |
|---|---|
| Specification text — everything under `docs/spec/`, `docs/canon/`, `docs/engineering/`, plus `docs/index.md` | [CC-BY-4.0](LICENSE-SPEC) |
| Code — reference implementations, verifier, TCK, build tooling (everything under `packages/`, `clients/`, `mkdocs.yml`) | [Apache-2.0](LICENSE) or MIT per package `LICENSE` |
| Brand assets — `branding/` | MIT |
| Third-party attributions | [NOTICE](NOTICE) |

By contributing, you agree your contribution is licensed under the same terms as the file you're modifying. See [`CONTRIBUTING.md`](CONTRIBUTING.md) §"Licensing".

## Contact

- Specification questions, contributor onboarding, general enquiries: **paul@tallyseal.org**
- Security disclosures: [`SECURITY.md`](SECURITY.md)
- Community discussion: GitHub Discussions (once the public repository is live)

---

*CRAWCUS was originally authored by Paul Wander as part of the Tallyseal project. The specification and reference implementations are open-source; the specification itself is on a path to Linux Foundation stewardship per [`GOVERNANCE.md`](GOVERNANCE.md).*
