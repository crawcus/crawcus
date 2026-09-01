# Contributing to CRAWCUS

Thank you for considering a contribution. CRAWCUS is an open specification for
cryptographic audit receipts, together with a TypeScript reference
implementation, a Python reference client, and a Test Compatibility Kit (TCK).
The project is stewarded openly, and every contributor — from a first-time typo
fix to a spec editor — is expected to work under the same rules.

This document tells you how to file a change, what quality bar the reviewers
apply, and what commitments the project makes to you in return.

---

## 1. Welcome and how to get help

Before you open an issue, please try one of the lower-friction channels:

- **GitHub Discussions** (Q&A, ideas, spec-shaped proposals) —
  `https://github.com/tallyseal/spec/discussions`. Start here if you are not
  sure whether your idea is a bug, a feature, or a spec change. Discussions do
  not require a reproduction and do not get triaged as issues.
- **Spec-level enquiries** — `paul@tallyseal.org`. Use email if the question
  touches confidential material (an unpublished vulnerability, a regulator
  engagement, or a licence question that names a specific company). Everything
  else belongs in Discussions so the answer is public and searchable.
- **Real-time chat** — a Slack or Matrix workspace will be linked from the
  README once it is stood up. Until then, Discussions is the only synchronous
  channel.

If you file an issue that would have been better as a Discussion, a maintainer
will convert it. That is not a rebuke; it just keeps the issue tracker focused
on work that has a definite outcome.

---

## 2. What "contribution" means here

Contributions fall into three tracks, each with its own bar.

### 2.1 Spec change

A spec change alters something that other people's code depends on: the
Contract evaluation algorithm, the hash-chain semantics, the envelope shape, a
Warrant field, a new primitive, or the definition of a conformance level.

Spec changes require:

1. An **ADR-shaped proposal** opened as a GitHub Discussion (template in
   §7) *before* a pull request. This lets maintainers and other implementers
   weigh in on shape while it is still cheap to change.
2. A rationale that names the problem the change solves, not just the shape of
   the fix. "The spec is missing X" is not enough; explain what breaks in the
   real world when X is missing.
3. An explicit statement of which **conformance tier** the change lands in
   (Core or Extended) and whether it is additive or breaking.
4. Corresponding **TCK fixtures**. A spec change without a Gherkin-shaped
   fixture is not implementable by anyone who did not attend the Discussion.
5. Sign-off from at least two maintainers before merge. See `GOVERNANCE.md`
   for the full rule.

### 2.2 Reference-implementation change

A reference-implementation change alters `@crawcus/core`, `@crawcus/verifier`,
`@crawcus/tck`, one of the `@crawcus/regulations-*` packages, or the Python
`crawcus-flower` client, without changing the spec. Bug fixes, performance
improvements, port implementations, new adapters, and improved error messages
all belong here.

Standard PR flow applies: fork, branch, PR, review, merge. See §5.

### 2.3 Documentation

Documentation covers the spec text under `docs/spec/`, per-package READMEs,
worked examples, tutorials, and translations.

- Typo fixes, dead-link repairs, and small clarifications may go straight to a
  PR without an issue.
- Substantive rewrites, structural reorganisations, or new documents open an
  issue first so the shape can be agreed before you invest time.
- Translations are welcomed and follow the same DCO and review rules as code.
  A translation PR should touch a single language.

---

## 3. Before you start

Please spend twenty minutes on these before writing code:

1. Read the spec: `docs/spec/crawcus-format.md` and
   `docs/spec/crawcus-contracts.md`. These are the normative documents. The
   package READMEs are advisory; if they conflict with the spec, the spec
   wins.
2. Skim `docs/canon/architecture-primitives.md`. It names the fourteen
   primitives and how they compose. If your change would add a fifteenth,
   that is a spec change (see §2.1).
3. Understand the **two-tier structure**. Core (Contract, Receipt,
   Attestation, Warrant — four primitives) is the minimum every conformant
   implementation must support. Extended adds Disclosure, Consent, Lineage,
   HumanOversight, and Tool-use primitives. Adopters declare which tier they
   conform to. Changes that push a primitive across the tier boundary are
   breaking.
4. Search the issue tracker **and** Discussions for prior art. It is common
   for a proposal to have been discussed and parked; the maintainers will
   point you at the previous thread rather than re-run the debate.

---

## 4. Developer setup

### 4.1 TypeScript monorepo

Requirements:

- **Node.js 22.x or newer.** Each package declares its floor in its
  `engines` field; the monorepo baseline is 22 LTS.
- **pnpm 9.x or newer.** The exact version is pinned in the root
  `package.json` under `packageManager`. Corepack will install it
  automatically if you have Corepack enabled (`corepack enable`).
- **Git 2.30+** (for the `-s` sign-off convention).

Setup:

```bash
git clone git@github.com:tallyseal/spec.git
cd spec
pnpm install            # installs all workspaces
pnpm build              # builds every package in dependency order
pnpm test               # runs the full test matrix
pnpm typecheck          # runs tsc --noEmit across all packages
```

Per-package work:

```bash
pnpm --filter @crawcus/spec build
pnpm --filter @crawcus/spec test
pnpm --filter @crawcus/spec typecheck
```

The `--filter` flag accepts a package name, a directory path, or a glob. Run
`pnpm --filter '@crawcus/regulations-*' test` to run every regulations
package's suite.

### 4.2 Documentation site (MkDocs)

The spec site is built with MkDocs and the Material theme.

Requirements:

- **Python 3.10 or newer**
- `pip install mkdocs mkdocs-material` (a `requirements-docs.txt` is provided
  at the repository root for reproducibility)

Serve locally:

```bash
mkdocs serve            # http://127.0.0.1:8000
```

Build the static site:

```bash
mkdocs build            # output under site/
```

The `docs/spec/` tree is the canonical spec text and is licensed CC-BY-4.0
(see `LICENSE-SPEC`). Everything else under `docs/` is Apache-2.0 like the
code.

### 4.3 Python reference client (`crawcus-flower`)

The reference client lives under `clients/flower/` and is installed
separately:

```bash
cd clients/flower
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest
```

The Python client tracks the same conformance tier as the TypeScript core; if
you change one, you almost certainly need to change the other. The TCK
fixtures are language-neutral and are the arbiter.

---

## 5. Pull-request workflow

1. **Fork** the repository into your own GitHub account or organisation.
2. **Create a topic branch** off `main`. Use a short, descriptive name:
   `fix/verifier-chain-off-by-one`, `feat/consent-primitive`,
   `docs/tck-worked-example`.
3. **Sign your commits.** Every commit must carry a
   `Signed-off-by: Your Name <you@example.com>` trailer. This is the
   Developer Certificate of Origin (DCO) pledge — read it at
   `https://developercertificate.org`. In practice this means
   `git commit -s`. There is no separate CLA; the project follows the CNCF
   convention (per ADR-0052 in the originating monorepo).
4. **Keep PRs small and focused.** One logical change per PR. If you find
   yourself writing "and also…" in the description, split it.
5. **Explain the *why*.** The diff shows what changed; the PR body must
   explain why. Link the issue or Discussion that motivates the change. If
   there is no such issue, explain in the PR body what problem you observed.
6. **Rebase, do not merge, when updating your branch.** `main` is
   fast-forward-only. Force-push to your topic branch is fine and expected.
7. **Address review comments in fresh commits**, not amends. Squash-merge is
   handled by the maintainer at merge time; you do not need to squash
   yourself.
8. **CI must be green** before a maintainer will review. If CI fails on
   something unrelated to your change, say so in a comment; a maintainer will
   investigate.

### 5.1 Missing DCO sign-off

If you forget `-s`, the DCO bot will flag your PR. To fix a single-commit PR:

```bash
git commit --amend -s --no-edit
git push --force-with-lease
```

For a multi-commit PR:

```bash
git rebase -i --signoff HEAD~<n>
git push --force-with-lease
```

Do not open a new PR; amend and force-push the existing one.

---

## 6. PR checklist

Copy this into your PR description and tick the boxes as you go. The PR
template will pre-populate it.

- [ ] Every commit has a `Signed-off-by:` trailer (DCO).
- [ ] Tests added or updated (unit tests, plus TCK conformance fixtures where
      the change affects wire behaviour).
- [ ] `pnpm typecheck` passes across all touched packages.
- [ ] `pnpm test` passes across all touched packages.
- [ ] TCK conformance still passes: `pnpm --filter @crawcus/tck test`.
- [ ] `CHANGELOG.md` entry added under the `## Unreleased` heading, in the
      correct section (Added / Changed / Deprecated / Removed / Fixed /
      Security).
- [ ] Docs updated if spec semantics or a public API changed (spec text,
      package README, `docs/canon/`, and the changelog all count).
- [ ] For spec changes: linked ADR-shaped Discussion; conformance-level
      implication (Core vs Extended, additive vs breaking) stated
      explicitly.
- [ ] For breaking changes: migration notes added under `docs/migrations/`.

---

## 7. Spec-change proposal template

Open a GitHub Discussion under the **Spec proposals** category using this
skeleton. Do not open a PR until the Discussion has reached rough consensus.

```markdown
## Motivation

What problem does this solve? Who feels the pain today, and how? Point to a
concrete case — a failed integration, an audit finding, a regulator query, a
performance ceiling, an ambiguity that two implementers resolved differently.

## Proposed change

State the change precisely enough that another implementer could build it
from your description alone. Include:
  - the primitive(s) affected
  - the wire-shape delta (JSON before / after)
  - the evaluator or verifier semantics delta
  - any new error conditions

## Backwards compatibility

Is this additive (existing receipts still verify)? Deprecating (old shape
still works but is discouraged)? Breaking (old receipts fail under the new
verifier)? If breaking, describe the migration path and estimate the cost to
downstream implementers.

## Conformance tier

Does this land in Core or Extended? Justify. Moving a primitive across the
tier boundary is always breaking and requires a major bump.

## TCK-fixture impact

Which fixtures under `packages/tck/fixtures/` need to change or be added?
Sketch at least one new Gherkin scenario. A spec change without a fixture is
not reviewable.

## Alternatives considered

What else did you try or think about? Why did you rule them out? This section
protects future readers from re-running the debate.
```

Once the Discussion is agreed, a maintainer will assign it an ADR number and
the accepted text is committed under `docs/adr/` as part of the implementing
PR.

---

## 8. Semantic versioning and stability commitment

### 8.1 Spec versions

Spec versions are labelled `CRAWCUS-Core-<major>.<minor>` and
`CRAWCUS-Extended-<major>.<minor>`. Once a tier is labelled 1.0:

- **Additive changes** (new optional fields, new primitives added to
  Extended, relaxed constraints) ship as minor bumps: 1.0 → 1.1.
- **Breaking changes** (removed fields, tightened constraints, changed
  algorithms, primitive moved across tier boundary) require a major bump and
  a migration document under `docs/migrations/`. Major bumps are rare by
  design.
- **Editorial changes** (clarifications that do not alter conformance) ship
  without a version bump but are noted in the changelog.

Every receipt on the wire declares the spec version it was written against;
verifiers must accept any version whose major matches and whose minor is less
than or equal to the verifier's own.

### 8.2 Package versions

Packages follow standard SemVer:

| Range     | Meaning                                                     |
|-----------|-------------------------------------------------------------|
| `0.x.y`   | Pre-1.0. Breaking changes may appear on any minor bump.     |
| `1.x.y`+  | Stable. Breaking changes require a major bump and a note in `CHANGELOG.md`. |

The 1.0 line for `@crawcus/spec`, `@crawcus/core`, `@crawcus/verifier`, and
`@crawcus/tck` locks together and tracks the first ratified `CRAWCUS-Core-1.0`
spec version.

### 8.3 Regulations packages (quarterly-versioned)

The `@crawcus/regulations-*` packages do **not** follow standard SemVer.
Regulations are living documents that regulators revise on their own
timetable, and an implementation that ships against last year's rules is not
"the same package, older" — it is a materially different compliance surface.

We therefore pin each regulations package to a **regulator snapshot date**
using a quarterly tag:

```
@crawcus/regulations-gdpr@2026.Q3        — GDPR as codified on 2026-09-30
@crawcus/regulations-ferpa@2026.Q3       — FERPA as codified on 2026-09-30
@crawcus/regulations-eu-ai-act@2026.Q3   — EU AI Act as codified on 2026-09-30
```

The rules for these packages:

- Every quarter, a new snapshot is cut whether or not the regulation changed.
  A cut with no changes is still shipped so that auditors have a positive
  attestation "we checked, and nothing moved."
- If a regulator issues an out-of-cycle change with immediate effect, an
  interim snapshot is cut: `2026.Q3.1`, `2026.Q3.2`, and so on.
- Downstream users pin to the snapshot they audited against and upgrade
  deliberately. `^` and `~` ranges are discouraged for these packages.
- Each snapshot carries a `sources/` directory citing the exact regulator
  publications (URL + retrieved-on date + content hash) that it encodes.
  This is the audit-friendly convention.

---

## 9. Coverage and quality ratchets

Every package holds a **coverage floor** that ratchets upward over time.
Details, floor values, and the mutation-testing plan live in
the project's engineering ratchets.

The short version:

- A PR that reduces line, branch, or function coverage below the current
  floor will be flagged by CI. Getting merged requires either (a) raising the
  covered lines back over the floor, or (b) a maintainer explicitly agreeing
  the drop is justified and adjusting the floor downward — which is rare and
  visible.
- Mutation-testing gates land in a later release. When they do, the same
  ratchet discipline applies: PRs cannot lower the mutation-kill score.
- Linting and formatting are enforced by CI. Run `pnpm lint` and
  `pnpm format` before pushing.

The ratchet exists so that entropy costs are paid at the point of change, not
by a future volunteer running a cleanup sprint.

---

## 10. Security disclosures

**Do not open a public issue for a security vulnerability.** Public
disclosure before a fix is available puts every deployed adopter at risk.

The full policy — supported versions, response SLA, embargo terms, and the
private disclosure address — is in `SECURITY.md`. Read it before you file.

If you are not sure whether a bug is a security bug, err on the side of
caution and treat it as one. A maintainer will re-classify it if it turns out
to be an ordinary issue.

---

## 11. Code of Conduct

This project adopts the **Contributor Covenant 2.1**. The full text is in
`CODE_OF_CONDUCT.md`.

Enforcement is handled by the maintainers. Report incidents to
`paul@tallyseal.org`; reports are handled confidentially and are never
discussed in public channels without the reporter's explicit consent.

Participation in the project — as a contributor, reviewer, maintainer,
speaker, or user in project spaces — implies acceptance of the Code of
Conduct.

---

## 12. Governance and maintainership

CRAWCUS is stewarded openly. The decision-making model, the roles and their
responsibilities, the process for calling a vote, and the process for
resolving disputes are documented in `GOVERNANCE.md`.

The current maintainers, their areas of responsibility, and their contact
addresses are listed in `MAINTAINERS.md`. That file is kept current; if it
says a person is a maintainer, they are.

New maintainers are proposed and confirmed by the process in
`GOVERNANCE.md`. In outline: sustained substantive contribution over several
release cycles, a nomination by an existing maintainer, and a lazy-consensus
vote of the maintainer group. There is no fixed cap on the number of
maintainers, but the project deliberately grows the group slowly.

The project is on a submission path to the **Linux Foundation** (LF AI &
Data). See ADR-0052 in the originating monorepo for the rationale and
sequencing. When the transfer completes, governance will move under the
LF AI & Data project charter; the model documented in `GOVERNANCE.md` is
designed to survive that transition without material change.

---

## 13. Licensing

CRAWCUS is dual-licensed:

| Content                                    | Licence     | File          |
|--------------------------------------------|-------------|---------------|
| All source code (packages, clients, tools) | Apache-2.0  | `LICENSE`     |
| Spec text under `docs/spec/`               | CC-BY-4.0   | `LICENSE-SPEC`|

By contributing, you agree that:

1. Your contribution is licensed under the same terms as the file you are
   modifying (Apache-2.0 for code, CC-BY-4.0 for spec text).
2. You have the right to make the contribution — the DCO sign-off (§5.3) is
   your assertion of this right. Read the DCO before you sign it; do not
   sign it on behalf of an employer without checking that you have
   permission.
3. Third-party attribution is preserved. If you incorporate code or text
   originating elsewhere, it must be compatibly licensed, cited in the
   commit message, and (for anything beyond a trivial snippet) recorded in
   `NOTICE`.

If you are contributing on behalf of an employer, please make sure your
employer's open-source contribution policy permits you to sign the DCO for
this project. Some employers require a separate internal sign-off; that is
between you and them.

---

## 14. Getting a change into a release

### 14.1 Release cadence

| Artefact                        | Cadence                              |
|---------------------------------|--------------------------------------|
| Stable packages (`spec`, `core`, `verifier`, `tck`) | **Monthly**, on the last Wednesday of the month. Off-cycle patch releases ship for security fixes and critical bugs. |
| Regulations packages            | **Quarterly**, aligned to regulator snapshot dates (see §8.3). Interim snapshots ship when a regulator issues an out-of-cycle change. |
| Spec versions                   | **On demand.** A new spec minor cuts when a batch of accepted ADRs is ready; a new spec major cuts only when unavoidable. |
| Python `crawcus-flower` client  | Aligned to the TypeScript stable release it targets. |

### 14.2 Getting merged in time

- A PR merged more than **seven days** before the release cut is guaranteed
  to be in that release, provided CI is green and the changelog is updated.
- A PR merged inside the seven-day window is at the release manager's
  discretion; low-risk fixes usually make it, larger changes usually wait.
- The release manager for each cycle is named in `MAINTAINERS.md` and posts
  a countdown in Discussions one week out.

### 14.3 What is coming next

The public roadmap lives in `ROADMAP.md`. It names the next two releases in
detail, the three after that in outline, and the longer-horizon themes
without commitments. If you want to work on something on the roadmap, say so
in a Discussion first so maintainers can coordinate — several items have
partial work in flight that is not yet on `main`.

---

## Appendix A. A minimal first contribution

If you have never contributed to CRAWCUS before, a good shape for a first PR
is:

1. Find a typo, a broken link, or a missing example in `docs/spec/` or a
   package README.
2. Fork, branch, fix, sign-off, push.
3. Open the PR against `main` with a two-line description: what you fixed and
   where you found it.
4. Wait for a maintainer to review. First-PR reviews are usually within
   two business days.

This gives you a working checkout, a green CI run under your name, and a
merged commit — all the machinery you will need for a larger contribution
later, at low stakes.

---

## Appendix B. Where things live

| You want to change…                          | Look under…                                    |
|----------------------------------------------|------------------------------------------------|
| Contract algorithm, wire shapes, primitives  | `packages/spec/` + `docs/spec/`                |
| Runtime evaluator, ports                     | `packages/core/`                               |
| Chain-verifier logic                         | `packages/verifier/`                           |
| Conformance fixtures                         | `packages/tck/fixtures/`                       |
| Typed regulation Contract factories          | `packages/regulations-{gdpr,ferpa,eu-ai-act}/` |
| Python reference client                      | `clients/flower/`                              |
| Spec text (normative)                        | `docs/spec/`                                   |
| Architecture prose (non-normative)           | `docs/canon/`                                  |
| Engineering discipline notes                 | `docs/engineering/`                            |
| Accepted ADRs                                | `docs/adr/`                                    |
| Migration notes for breaking changes         | `docs/migrations/`                             |

Thank you for making CRAWCUS better.
