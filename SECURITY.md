# Security policy

CRAWCUS is a specification, reference implementation, and conformance test kit for
cryptographic audit receipts. The whole premise of the project is that a third
party — auditor, regulator, opposing counsel, another vendor — can independently
verify a receipt chain and reach the same conclusion the producer did. That
premise collapses if the spec is ambiguous in a security-affecting way, if the
reference implementation accepts a chain that should be rejected (or rejects one
that should be accepted), or if a published package is tampered with in transit.

This document tells you how to report those things privately, what the project
commits to in response, and what supply-chain guarantees consumers can rely on.

## Reporting a vulnerability

**Do not open a public GitHub issue for a suspected security bug.** Public
disclosure before a coordinated fix amplifies risk to every downstream consumer
of `@crawcus/*` and `crawcus-*`.

Report privately by **email**:

- Address: **paul@tallyseal.org**
  (A dedicated `security@tallyseal.org` alias is planned; when it goes live,
  both mailboxes will be monitored and either is acceptable. This document will
  be updated when that happens.)
- Subject-line convention: **`[CRAWCUS SECURITY] <short description>`**
- Include: the affected package(s) and version(s), or the spec section and
  version if the report is against the spec itself; a minimal reproduction
  (chain fragment, canonicalisation input, verifier command) where possible;
  your assessment of impact and any suggested mitigation.

**Encrypted communication.** No PGP key is published yet. If you require
encrypted communication, say so in the initial (unencrypted) email — do not send
sensitive detail in that first message — and a public key will be provided in
reply. Once the project has a published key it will be listed here with its
fingerprint.

**GitHub Security Advisories.** Private-reporting via GitHub Security Advisories
will be enabled once `github.com/tallyseal/spec` goes live. When it does,
reporters may use either channel — email or a GHSA draft — interchangeably.

## Scope: what we treat as a vulnerability

The following classes are in scope and warrant private coordinated disclosure.

**Specification-level flaws**

- Hash-chain forgery: a construction that produces a chain accepted by a
  spec-conformant verifier but that does not correspond to the sequence of
  events the receipts claim to describe.
- Signature-verification bypass: a receipt or envelope shape that a
  spec-conformant verifier accepts as signed but that was not signed by the
  claimed key.
- Canonical-JSON ambiguity: two distinct payloads that produce the same content
  hash under the spec's canonicalisation rules, or one payload whose
  canonicalisation is not deterministic across conformant implementations.
- Predicate-normalisation ambiguity: two predicate sources that should be
  semantically distinct but that normalise to the same canonical form (or the
  inverse — semantically equivalent predicates that normalise to distinct
  forms and therefore fail cross-vendor replay).
- Any spec ambiguity where two plausible interpretations lead to different
  security properties (see also *Reporting a spec ambiguity*, below).

**Reference-implementation flaws**

- A bug in `@crawcus/core`, `@crawcus/verifier`, `@crawcus/spec`,
  `@crawcus/regulations-*`, or `crawcus-flower` that lets an attacker craft a
  chain the implementation accepts but a correct implementation would reject
  (or vice versa).
- A TCK fixture in `@crawcus/tck` that causes a non-conformant runtime to pass
  conformance checks, or that fails a correct one.
- Any escape from the verifier's declared input handling — for example, a
  crafted receipt that causes the verifier to read files, open network
  connections, or execute code outside the documented evaluation model.

**Supply-chain flaws**

- Unauthorised publication of any `@crawcus/*` npm package or `crawcus-*` PyPI
  package: trusted-publisher bypass, account compromise leading to a rogue
  release, or a release published from a source other than the audited
  workflow in this repository.
- A published artefact carrying a valid Sigstore attestation whose contents do
  not match the tagged commit + workflow run the attestation binds to.
- A transitive dependency vulnerability that materially affects a CRAWCUS
  runtime (Node or Python) and is not already tracked upstream — please
  include the upstream advisory reference if one exists.

## Out of scope

The following are not treated as vulnerabilities in CRAWCUS itself. Some are
still worth raising; where a better channel exists it is named.

- **Denial-of-service via unbounded input to a verifier.** Verifiers are
  required by the spec to apply input size limits — see the *predicate size
  limit* rule in `docs/spec/crawcus-format.md` (Wire-format stability §
  Predicate canonicalisation, "Predicate size limit (Q-S lock)", currently at
  4 KB per predicate) and the receipt-size guidance in the same document. A
  verifier that OOMs because a caller handed it a 4 GB file without enforcing
  a size cap is a caller bug. If the spec's size-limit guidance is itself
  under-specified, that *is* in scope — report privately.
- Vulnerabilities in downstream applications' use of CRAWCUS packages that do
  not stem from a CRAWCUS bug (for example, an application that stores signing
  keys in world-readable files).
- Social-engineering attacks on the maintainer. Report these to the platform
  operator (GitHub, npm, PyPI, the email provider) rather than to CRAWCUS.
- Missing best-practice guidance, hardening ideas, or "you could also check X"
  suggestions. These are welcome as public GitHub Issues or Discussions on
  `github.com/tallyseal/spec` once the repository is live.
- Findings against third-party mirrors, forks, or repackaged distributions that
  the project does not control. Report to whoever published the mirror.

## Coordinated disclosure timeline

The project commits to the following response windows. All windows count
**working days** in the maintainer's timezone (UK / Europe-London).

| Stage | Target |
|---|---|
| Acknowledgement of report | Within **5 working days** |
| Initial triage — severity assessment, whether we can reproduce, planned response window | Within **10 working days** |
| Fix ready + coordinated release | Target **90 days** from acknowledged report |
| Public disclosure | At coordinated release, unless the reporter agrees to a shorter or longer window |

A longer window than 90 days requires **explicit reporter agreement**, in
writing (email reply is fine). The project will not unilaterally extend.

If a fix requires a spec change (not just an implementation change), the
timeline may include an interoperability window during which implementations
have to update in lockstep. That interoperability window is negotiated with the
reporter and disclosed in the resulting advisory.

## CVE handling

- **GitHub is the CVE Numbering Authority (CNA)** for CRAWCUS packages until an
  alternative arrangement is made post-Linux-Foundation donation. CVE IDs are
  requested via the GitHub Security Advisory workflow at the point a fix
  ships.
- Not every fix requires a CVE. Vulnerabilities that materially affect
  downstream security posture will receive one; low-impact hardening fixes may
  ship with a GitHub Security Advisory (GHSA) only.
- The advisory will always name the affected packages, the affected version
  range, the fixed version, and the CVSS 3.1 vector. Reporter credit is
  included on request (see below).

## Reporter credit

- **Default is anonymous credit.** The advisory will say "reported by an
  external researcher" unless the reporter asks to be named.
- If you consent to being named, tell us in your report — name and optional
  affiliation, plus a URL of your choice (personal site, employer, ORCID, etc.).
- We do not operate a bug bounty. There is no monetary reward. Please do not
  ask for compensation as a condition of disclosure — we are a pre-donation
  single-maintainer project and cannot honour it.

## Supply-chain integrity — what the project commits to

Every package the project publishes is bound cryptographically to the source
commit and CI workflow that produced it. A consumer never has to take the
maintainer's word for what is inside a release.

**Trusted publishing (no long-lived tokens)**

- Every `@crawcus/*` npm package is published via **npm Trusted Publishing**
  (OIDC federation from GitHub Actions to the npm registry). There are no
  long-lived npm API tokens with publish rights on any of these packages.
- Every `crawcus-*` PyPI package is published via **PyPI Trusted Publishing**
  (OIDC federation from GitHub Actions to PyPI). There are no long-lived PyPI
  API tokens with publish rights on any of these packages.
- No package is published from a maintainer's laptop. If a release ever appears
  that was not produced by the audited workflow in this repository, treat it
  as a supply-chain incident and report per this policy.

**Sigstore attestations**

- Every published artefact carries a **Sigstore attestation** written to the
  public transparency log (Rekor). The attestation binds the artefact to the
  tagged commit + workflow run that produced it.
- npm consumers can verify with `npm audit signatures` (Sigstore attestations
  are surfaced natively) or with `sigstore verify` against the signer identity
  string documented in each package's `README.md`.
- PyPI consumers can rely on PyPI's trusted-publisher metadata (visible on the
  release page) and, where a wheel-level attestation is generated, verify with
  `sigstore verify` against the same signer identity.
- Each package `README.md` includes a **"Verify this release"** section with
  the exact command and expected signer identity for that package. If a
  command in a README does not verify against a downloaded artefact, treat
  that as a supply-chain incident and report per this policy.

**Signed release commits**

- Release commits (the tagged commits that trigger publication) are signed
  with the maintainer's GPG key. The public key and its fingerprint will be
  published in this document at the first release; until then, no signed
  release commits exist to verify.

**Auditable publish workflow**

- Publishing GitHub Actions workflows live at `.github/workflows/publish.yml`
  (or per-package equivalents) in this repository. Every published release
  maps to a specific tagged commit and a specific workflow run, both of which
  are recorded in the corresponding Sigstore attestation and linkable from the
  release page.
- Changes to the publish workflow are proposed as pull requests, reviewed, and
  land as ordinary commits. There is no out-of-band path to modify the
  publish pipeline.

## Known-safe versions

No releases have been cut yet. All packages are pre-1.0. This table will be
populated at the first release.

| Package | Safe versions | Known-vulnerable versions | Notes |
|---|---|---|---|
| `@crawcus/spec` | *(no releases yet)* | — | — |
| `@crawcus/core` | *(no releases yet)* | — | — |
| `@crawcus/verifier` | *(no releases yet)* | — | — |
| `@crawcus/tck` | *(no releases yet)* | — | — |
| `@crawcus/regulations-gdpr` | *(no releases yet)* | — | — |
| `@crawcus/regulations-ferpa` | *(no releases yet)* | — | — |
| `@crawcus/regulations-eu-ai-act` | *(no releases yet)* | — | — |
| `crawcus-flower` (PyPI) | *(no releases yet)* | — | — |

## Historical advisories

No advisories have been issued. This table will be populated on the first
advisory.

| Advisory ID | Date | Packages | Severity | Summary |
|---|---|---|---|---|
| *(none yet)* | — | — | — | — |

## Reporting a spec ambiguity

A specification can be *ambiguous* without being *vulnerable*. The two are
handled differently.

- If the spec is ambiguous but both plausible interpretations preserve the same
  security properties (for example, two equally safe ways to encode an
  optional field), open a **public GitHub Discussion** on
  `github.com/tallyseal/spec` once the repository is live. This is the
  correct channel because sunlight is the whole point of an open spec.
- If the ambiguity **is** the vulnerability — that is, one plausible reading
  is safe and another is not, or two conformant implementations could disagree
  on whether a chain is valid — treat it as a security report and disclose
  privately per this document. Ambiguity that lets two implementations reach
  different conclusions about the same chain is exactly the kind of failure
  CRAWCUS exists to foreclose.

## Contact and escalation

- **Primary:** paul@tallyseal.org (subject line `[CRAWCUS SECURITY] <topic>`).
- **Escalation.** If no acknowledgement arrives within **5 working days**,
  retry via the same email. If there is still no response after **10 working
  days total**, the reporter is free to disclose publicly at their own
  judgement, and we will not treat that disclosure as a breach of good faith.
  This is an explicit shortcoming of the current pre-donation single-maintainer
  phase, and is called out here rather than hidden.
- **Post-donation.** Once CRAWCUS is donated to the Linux Foundation, this
  document will be updated to name the successor security contact (the project
  TSC or a dedicated PSIRT). Until then, escalation ends with the maintainer.

## Changes to this policy

Material changes to this document — new scope, new timelines, changed contact
addresses, added PGP key, added signer identities — are proposed as ordinary
pull requests and land as reviewable commits. The commit history of this file
*is* the change log.
