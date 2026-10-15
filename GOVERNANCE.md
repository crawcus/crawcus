# CRAWCUS Governance

**Status:** Adopted 2026-09-01. Supersedes no prior document (initial publication).
**Applies to:** the CRAWCUS specification, its reference implementations, its
Technology Compatibility Kit (TCK), and all packages published under the
`@crawcus/*` and `crawcus-*` names from this repository.
**Maintainer of record:** Paul Wander &lt;paul@tallyseal.org&gt;.

---

## 1. Purpose of this document

This document defines how substantive decisions about the CRAWCUS project are
made, recorded, and appealed. In scope are: changes to the specification text
(primitive shape, hash-chain semantics, envelope format, algorithm choices,
conformance-tier boundaries), releases of the packages listed in section 12,
additions and removals of maintainers, security-vulnerability response, and
amendments to this document itself. Out of scope, and delegated to day-to-day
maintainer authority as described in `CONTRIBUTING.md`, are: routine PR merges,
issue triage, documentation typos, dependency bumps that do not alter behaviour,
and internal refactors that do not change public surface. Where a change is
ambiguous between "day-to-day" and "substantive," the maintainer opens a
Discussion and defers to the process in section 5.

## 2. Project mission

CRAWCUS exists to be an open, vendor-neutral, cryptographically-verifiable
receipt standard for application and AI-inference audit trails, publishable and
enforceable without dependence on any single vendor, cloud, or runtime. The
specification, the TCK, and at least one reference implementation of each
primitive must remain freely available under the licences declared in
`LICENSE-SPEC` and `LICENSE` respectively. The mission constrains governance:
any proposed change — technical, procedural, licensing, trademark, or
organisational — that would undermine open verifiability (independent parties
being able to re-derive and check receipts) or vendor neutrality (no single
implementer holding unique rights over the spec or the name) is out of scope,
regardless of the process by which it is proposed. This constraint binds the
maintainer, the future Technical Steering Committee, and any successor body.

## 3. Current governance phase — pre-LF-donation

CRAWCUS was made public on 2026-09-01. Substantive design and internal
implementation predate that date; the version cut for public release is
**CRAWCUS-Core-1.0** together with **CRAWCUS-Extended-1.0** (see section 9 for
the tier definitions).

The project is operating in a **pre-donation single-maintainer phase**. In
practical terms:

- **Sole maintainer:** Paul Wander (paul@tallyseal.org). No co-maintainers have
  yet been appointed. The maintainer is the sole individual with merge rights
  to `main` and release-signing authority on the published packages.
- **Decision-making forum:** every substantive decision (as scoped in section 1
  and enumerated in section 5) is opened as a GitHub Discussion in this
  repository before the corresponding PR is merged. Contributors, prospective
  adopters, and observers are explicitly invited to comment. The maintainer
  decides after the comment window closes and records the decision — and the
  reasoning — either in the Discussion thread, in an ADR added under
  `docs/adr/`, or in the merged PR description linking back to the Discussion.
- **Transparency of decisions already made:** the design decisions that shaped
  CRAWCUS-Core-1.0 and CRAWCUS-Extended-1.0 prior to public release are
  documented in the Architecture Decision Records under `docs/adr/`. Any
  post-release change to those decisions follows section 5.
- **No private "steering":** there is no private forum, mailing list, Slack
  channel, or off-repo call where CRAWCUS technical decisions are taken. If
  such a channel is later created (for example, an LF-hosted TSC list
  post-donation), it will be announced in this document by amendment.

This phase is **time-bound and explicitly transitional**. It ends when either
of the following occurs, whichever is first:

1. Donation to the Linux Foundation (specifically to LF AI &amp; Data via the
   Joint Development Foundation, per ADR-0052) completes and LF-standard
   governance takes effect, or
2. Two additional maintainers have been added under section 7, and this
   document has been amended (per section 5, "Governance change") to reflect
   a multi-maintainer governance model.

The maintainer commits to reviewing this section at least every six months and
posting an update — either progress toward donation, progress toward
multi-maintainer, or an explicit "no change this quarter" — as a pinned
Discussion.

## 4. Planned governance — post-LF-donation

The project's declared destination, per ADR-0052 in the originating monorepo,
is donation to the Linux Foundation. Specifics of the intended end-state:

- **Target foundation:** Linux Foundation AI &amp; Data (LF AI &amp; Data).
- **Legal / administrative vehicle:** the LF Joint Development Foundation
  (JDF), which provides a lightweight, standards-oriented project charter
  suitable for specifications with reference implementations. This route was
  chosen over full sub-project incorporation under LF AI &amp; Data primarily
  because CRAWCUS is a specification-first project and JDF's charter template
  is optimised for specification governance.
- **Governance model to adopt on donation:**
  - A **Technical Steering Committee (TSC)** with responsibility for
    specification-level decisions (the class enumerated in section 5 under
    "Spec changes"), conformance-tier boundaries, and TCK versioning.
  - **Per-package maintainers** with responsibility for day-to-day merges on
    the packages they own. A single individual may hold both TSC seat and
    package maintainer role during transition.
  - An **LF-provided neutral home**: the git repository, issue tracker,
    Discussions, mailing list, and release infrastructure move under LF
    administration, retaining the `github.com/tallyseal/crawcus` URL only if
    LF permits; otherwise migrating to an LF-owned path with a permanent
    redirect.
- **Contribution mechanism:** the Developer Certificate of Origin (DCO)
  sign-off. This matches the norm for CNCF and LF AI &amp; Data projects. No
  Contributor Licence Agreement (CLA) will be required. Contributors already
  contributing under DCO sign-off in the pre-donation phase (as required by
  `CONTRIBUTING.md`) do not need to re-sign anything at donation time.
- **Trademark handling:** if a trademark is registered on the term "CRAWCUS"
  before or after donation, ownership will be assigned or exclusively licensed
  to the Linux Foundation at donation time, subject to a trademark policy that
  preserves the right of any conformant implementation to describe itself as
  "CRAWCUS-conformant" (see section 10). **Pre-donation, no trademark claim
  is asserted** on the term "CRAWCUS."
- **Rationale for LF over W3C, IEEE, or ISO:** recorded in ADR-0052 in the
  originating monorepo. Summary: LF's project-hosting overhead is lower, its
  DCO-based contribution model matches the project's existing practice, its
  neutral-home guarantees are well-tested by CNCF and LF AI &amp; Data
  precedent, and its release cadence is compatible with the project's
  intended cadence. IEEE was explicitly deprioritised on cost and cadence
  grounds. W3C was considered and rejected as a poor category fit (CRAWCUS
  is not a web standard). ISO was considered as a later downstream target
  (via PAS submission from LF) but is not the initial destination.

Nothing in this section is legally binding on the Linux Foundation, and the
donation is subject to LF's own intake process, due diligence, and vote. Should
LF decline the donation or propose a materially different governance shape,
the maintainer will re-open the destination decision as a Discussion under
section 5.

## 5. Decision-making

The following process table binds the maintainer (pre-donation) and, once the
transition in section 3 completes, the TSC or successor body (post-donation),
modified as necessary by the LF-provided charter.

### 5.1 Day-to-day pull requests

**Scope:** bug fixes, small feature additions that do not change public wire
formats, documentation typos, dependency bumps, internal refactors, test
additions.

**Process:** the PR is opened. CI must pass, including the TCK conformance
suite on any package under `packages/`. One maintainer approval is required.
The maintainer merges. No Discussion is required unless a reviewer requests
one, in which case the PR waits for the Discussion to resolve.

**Time expectations:** maintainers aim to give an initial response — approve,
request changes, or explain the delay — within 14 days of PR open (see section
6).

### 5.2 Package releases

**Scope:** any semver bump on a package listed in section 12; any addition of
a new adapter or verifier plugin; any new package published under the
`@crawcus/*` or `crawcus-*` namespaces.

**Process:** maintainer approval, updated `CHANGELOG.md` entry in the package,
release notes drafted in the release PR, TCK conformance run green on the
release commit. Releases are tagged and signed (see section 6 on maintainer
responsibilities).

**Semver policy:** additive changes are minor bumps; behaviour-preserving
fixes are patch bumps; any wire-format or public-API change is a major bump
and additionally requires the spec-change process in 5.3 if it affects a
CRAWCUS primitive.

### 5.3 Specification changes

**Scope:** any change to the Contract shape or its canonicalisation algorithm;
any change to the Receipt envelope; any change to hash-chain semantics or
algorithms; addition, removal, or renaming of a CRAWCUS primitive; any change
to the boundary between Core and Extended conformance tiers; any change to the
TCK fixture set that alters the conformance criteria (as opposed to fixing a
bug in the TCK).

**Process:**

1. A GitHub Discussion is opened in the "Spec changes" category, using the
   ADR template. The Discussion states the problem, the proposed change, the
   backward-compatibility impact, the migration path for existing adopters,
   and the effect on the TCK.
2. A **minimum 14-day comment window** runs from the Discussion opening. The
   window may be extended (announced in the Discussion) but not shortened,
   even if apparent consensus is reached earlier.
3. At the end of the comment window, the maintainer decides: accept, reject,
   defer, or request re-scope. The decision and its rationale are posted in
   the Discussion.
4. If accepted, an implementation PR is opened. The PR description links to
   the Discussion. The PR includes: the spec text change under `docs/spec/`,
   the corresponding TCK fixture change, and a new ADR under `docs/adr/`
   recording the decision as a permanent record.
5. Post-donation, "the maintainer decides" is replaced by the TSC-vote
   procedure defined in the LF-adopted charter.

**No spec change ships without a matching TCK update.** A spec change PR that
does not update the TCK fixtures — or, where appropriate, does not update the
TCK's own version — is rejected on procedural grounds, without prejudice to
the technical proposal.

### 5.4 New maintainer (pre-LF phase)

Process defined in section 7.

### 5.5 Security disclosures

Handled per `SECURITY.md`. Private disclosure to paul@tallyseal.org. Coordinated
release on a 90-day standard timeline, adjustable upward for complex fixes and
downward only with the reporter's consent. Post-donation, the security
disclosure address migrates to the LF-provided security list; the 90-day
standard is retained.

### 5.6 Governance change (this document)

Any change to `GOVERNANCE.md` beyond correcting typos or dead links is itself
a substantive decision. The process is: open a Discussion in the "Governance"
category; run a minimum 14-day comment window; maintainer decides (pre-donation)
or TSC votes (post-donation); merge the amendment PR with a link to the
Discussion. Editorial-only edits (typo, link-fix, formatting) may be merged as
day-to-day PRs under 5.1, provided the merge commit message explicitly asserts
that the edit is editorial-only.

## 6. Maintainer responsibilities

Every maintainer (pre-donation, this means the sole maintainer; post-donation,
this means every individual with merge rights on any repository package) is
responsible for the following, on a best-effort basis:

- **Triage** of newly-opened issues and Discussions within **7 days**. Triage
  means: reading, labelling, and either responding, closing with rationale,
  or explicitly deferring with a comment stating when the maintainer expects
  to return to it.
- **PR review** within **14 days** of open. "Review" means one of: approving,
  requesting changes with specifics, or posting a comment explaining the delay
  and a realistic re-review date. Silent PR queues are a governance failure.
- **Upholding spec and tests as the source of truth.** No merge that breaks
  TCK conformance is permitted without a corresponding TCK update *and* the
  spec-change process in 5.3. The pre-merge CI gate exists to enforce this
  mechanically; suppressing the gate requires an ADR.
- **Enforcement of the Code of Conduct** in issues, Discussions, PRs, and any
  other project-hosted forum. Enforcement escalates first to another
  maintainer (post-donation) or to the LF community team (post-donation) or,
  in the pre-donation phase, is handled directly by the sole maintainer with
  the option of appointing an outside enforcer per `CODE_OF_CONDUCT.md`.
- **Release cutting** on the cadence defined in `CONTRIBUTING.md`. At present,
  the cadence is: patch releases as needed for fixes; minor releases roughly
  quarterly; major releases only in conjunction with a spec-change process
  under 5.3.
- **Release signing.** Published packages are signed. The signing keys are
  the maintainer's personal keys in the pre-donation phase; on donation, keys
  transition to LF-managed keys per the LF release-engineering standard.

A maintainer is **not required to fix every reported bug**. Maintainers may
close issues as "won't fix" or "out of scope" with a written rationale.
Closing without rationale is a governance failure; closing with a linked ADR
or Discussion pointer is not.

## 7. How to become a maintainer

In the pre-donation phase:

1. **Sustained substantive contribution over three or more months**, evidenced
   by multiple merged PRs across two or more of: the specification text
   (`docs/spec/`), one or more of the reference-implementation packages
   (`packages/`), the TCK (`@crawcus/tck`), the regulation adapters
   (`@crawcus/regulations-*`), or the Python reference client. Participation
   in Discussions counts toward "substantive" but does not by itself satisfy
   the requirement.
2. **Nomination**, either by the sole maintainer or by any existing project
   contributor with the endorsement of the sole maintainer. The nomination is
   opened as a Discussion in the "Governance" category, naming the candidate,
   linking their contributions, and stating the areas of maintainer authority
   proposed.
3. **A 14-day comment window** for the community to raise objections or
   endorsements. Comments are read but the decision is not a vote.
4. **Decision by the sole maintainer** at the end of the window. If accepted,
   the candidate signs a maintainer agreement (a short document confirming
   they will uphold this governance, the Code of Conduct, and DCO
   requirements), and a PR updates `MAINTAINERS.md` to add them.

Post-donation, this procedure is replaced by whatever the LF-adopted charter
prescribes. The typical LF pattern is: nomination by an existing maintainer;
public comment window; majority vote of existing maintainers. This document
will be amended (under 5.6) to reflect the actual charter text once donated.

**Removal or step-down of a maintainer** in the pre-donation phase follows a
symmetric process: a Discussion is opened stating the reason (voluntary
step-down, sustained inactivity of &gt;180 days, breach of Code of Conduct, or
breach of this governance); 14-day comment window; sole maintainer decides.
Post-donation, LF-charter rules apply.

## 8. Conflict resolution

The project prefers open, written conflict resolution over private mediation
wherever the subject is a technical or governance disagreement rather than a
Code of Conduct matter.

1. **First step: open a Discussion.** State the disagreement in writing,
   present the alternatives, and invite comment. Give the Discussion at least
   14 days to draw out positions before escalating.
2. **If unresolved after the Discussion window:** the sole maintainer decides
   (pre-donation). The decision is posted in the Discussion with rationale,
   and the Discussion is closed as "decided."
3. **Post-donation:** unresolved technical or governance conflicts escalate
   to the TSC per the LF-adopted charter. The TSC decision is final within
   the project; further recourse is to the LF Board on process grounds only,
   not on the merits of a technical decision.
4. **No individual override.** No maintainer, contributor, or third party may
   override a decision made under this section except by re-opening the
   question via the appropriate process in section 5.

**Code of Conduct matters** do not follow this section. They follow
`CODE_OF_CONDUCT.md`, which reserves decisions on conduct enforcement to a
separate enforcement path.

## 9. Specification-versus-implementation authority

Reviewers evaluating CRAWCUS as a candidate standard should note the following
explicit hierarchy:

- **The specification text under `docs/spec/` is authoritative.** It defines
  what CRAWCUS is. Where the specification is silent on a matter, the
  matter is undefined behaviour, and implementations are permitted (but not
  required) to differ.
- **Reference implementations under `packages/` are provided as a correctness
  demonstration and to lower the barrier to conformant implementations.** They
  are not "the standard." Where a reference implementation differs from the
  specification, the specification wins and the implementation is a bug to be
  fixed under 5.1 (bug fix) or 5.3 (if the deviation reveals a spec problem).
- **Conformance is measured by the TCK** (`@crawcus/tck`). A runtime is
  **"CRAWCUS-Core-1.0-conformant"** if and only if it passes the full
  CRAWCUS-Core-1.0 fixture set of the TCK at the declared TCK version. A
  runtime is **"CRAWCUS-Extended-1.0-conformant"** if and only if it passes
  the Extended fixture set (which includes and extends the Core set) at the
  declared TCK version. There is no "partial conformance" tier; a runtime
  either passes the declared tier or does not claim it.
- **No implementation is "the reference."** The reference implementations
  shipped from this repository are *one* set of conformant runtimes, produced
  primarily to demonstrate that the specification is implementable and to
  provide a starting point for adopters. Third-party implementations that pass
  the TCK are equally conformant and equally entitled to describe themselves
  as such.

**Conformance-tier definitions in force at initial publication:**

- **CRAWCUS-Core-1.0** — four primitives: Contract, Receipt, Attestation,
  Warrant. Sufficient for application audit trails and basic AI-inference
  logging.
- **CRAWCUS-Extended-1.0** — Core plus five further primitives: Disclosure,
  Consent, Lineage, HumanOversight, Tool-use. Sufficient for regulated AI
  scenarios (EU AI Act high-risk, sector-specific consent regimes, tool-use
  auditability).

Tier boundaries may only be changed under 5.3 (spec change), with a new tier
version (e.g., CRAWCUS-Core-1.1) rather than in-place mutation of an existing
tier. Existing tier versions are frozen once published.

## 10. Trademark, brand, and third-party implementations

- **Nothing in this project's licensing or governance grants trademark rights
  over the term "CRAWCUS."** The spec text is licensed under `LICENSE-SPEC`;
  the code is licensed under `LICENSE`; the TCK fixtures are licensed as
  declared in the `@crawcus/tck` package. None of these licences convey
  trademark rights. Pre-donation, no trademark is registered or asserted on
  the term "CRAWCUS."
- **Any implementation that passes the TCK at a declared tier may describe
  itself as "CRAWCUS-Core-1.0-conformant" or "CRAWCUS-Extended-1.0-conformant"**
  and may cite the TCK version passed. This right is affirmed here as project
  policy and, upon LF donation, will be preserved by an explicit clause of
  the LF-administered trademark policy (see section 4).
- **The name "CRAWCUS" is descriptive in the context of this specification.**
  Third parties are free to use it to describe their own implementations of
  this specification, to reference the specification in documentation, in
  marketing, and in comparisons. Third parties may not use the name in a way
  that suggests endorsement by, or affiliation with, the CRAWCUS project or
  its maintainers where none exists.
- **The CRAWCUS project does not certify implementations.** Passing the TCK
  is a self-attested claim. The project reserves the right, post-donation, to
  establish a formal certification or self-certification programme under the
  TSC; no such programme exists at the time of this document.

## 11. Amendments to this document

Amendments follow section 5.6 (Governance change). In brief: open a Discussion
in the "Governance" category, run a minimum 14-day comment window, maintainer
decides (pre-donation) or TSC votes (post-donation), merge the amendment PR
with a link to the Discussion. Every amendment updates the "Status" line at
the top of this document with the new adoption date and a brief note of what
changed. Prior versions of this document remain accessible in git history.

## 12. Packages currently governed by this document

The following packages are published from this repository and are governed by
this document. Additions to this list follow section 5.2 (package release);
removals follow the same process.

- `@crawcus/spec` — specification text and canonical JSON schemas, packaged
  for programmatic consumption.
- `@crawcus/core` — core primitives (Contract, Receipt, Attestation, Warrant)
  as TypeScript library.
- `@crawcus/verifier` — reference verifier implementation.
- `@crawcus/tck` — Technology Compatibility Kit fixtures and harness.
- `@crawcus/regulations-gdpr` — GDPR mapping bundle, quarterly-versioned.
- `@crawcus/regulations-ferpa` — FERPA mapping bundle, quarterly-versioned.
- `@crawcus/regulations-eu-ai-act` — EU AI Act mapping bundle,
  quarterly-versioned.
- `crawcus-flower` — Python reference client integrating CRAWCUS with the
  Flower federated-learning framework.

Regulation-bundle packages carry an independent quarterly-versioning cadence
distinct from the spec version, to allow regulatory updates to ship without
requiring a spec release.

## 13. Contact

- **Governance-level enquiries** (this document, TSC formation, LF donation
  status, maintainer additions, trademark): paul@tallyseal.org.
- **Contribution-level enquiries** (how to open a PR, DCO, style, review
  cadence): see `CONTRIBUTING.md`.
- **Security-level enquiries** (vulnerability disclosure, coordinated release):
  see `SECURITY.md`.
- **Code of Conduct matters**: see `CODE_OF_CONDUCT.md` for the reporting and
  enforcement path, which is deliberately separate from the governance-level
  contact above.

Post-donation, contact addresses migrate to the LF-provided project lists and
this section will be amended accordingly.
