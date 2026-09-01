<!--
Thank you for contributing to CRAWCUS. Please fill out every section below
that applies. If a section is genuinely N/A, keep the heading and write
"N/A — <one-line reason>" so reviewers know you considered it rather than
skipped it.

Spec-change PRs MUST link an ADR-shaped Discussion that has reached rough
consensus — see CONTRIBUTING.md §"Spec-change proposal". PRs that change
normative spec text without that link will be asked to rewind.
-->

## Summary

<!-- One paragraph: what does this PR change, and why? Motivation before
mechanism. A reviewer should be able to read just this paragraph and know
whether to keep reading. -->

## Related

<!-- Link the issue(s), Discussion(s), or ADR this PR closes or advances.
Use "Closes #NNN" for issues that will auto-close on merge. For spec
changes, the ADR-shaped Discussion link is REQUIRED. -->

- Closes #
- Discussion:
- ADR:

## Type of change

<!-- Tick every box that applies. -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking implementation-scope addition)
- [ ] Spec change (normative text — Core-1.0 or Extended-1.0)
- [ ] Documentation (non-normative — README, guides, examples, comments)
- [ ] Build / CI / tooling
- [ ] Test-only (adds coverage, no runtime change)
- [ ] Refactor (no behaviour change; pure internal reshape)

## Conformance impact

<!-- Every PR must be explicit about conformance impact, even if the answer
is "none". Tick every box that applies. -->

- [ ] Core-1.0 conformance behaviour unchanged
- [ ] Extended-1.0 conformance behaviour unchanged
- [ ] TCK fixtures updated (existing fixtures modified — explain below)
- [ ] TCK fixtures added (new fixtures introduced — explain below)
- [ ] New TCK coverage is required and this PR does NOT yet include it (open a follow-up issue and link it)

<!-- If any fixture box is ticked, describe the fixture change in one or
two sentences here: what was added or modified, and what conformance
property it now witnesses. -->

## Checklist

<!-- Mirrors CONTRIBUTING.md §"PR checklist". Every box should be ticked
before requesting review. If a box genuinely doesn't apply, tick it and
add a short parenthetical note. -->

- [ ] Every commit is signed off (`Signed-off-by:` trailer per the DCO)
- [ ] `pnpm test` passes locally (or the equivalent Python test command for crawcus-flower)
- [ ] `pnpm typecheck` passes locally (TS packages)
- [ ] `pnpm lint` passes locally
- [ ] TCK runs green against the changed packages
- [ ] CHANGELOG entry added under the correct package (or explicitly N/A for internal-only changes)
- [ ] Docs updated for any user-visible spec change or public API change
- [ ] Spec-changing PRs link an ADR-shaped Discussion that has reached rough consensus

## Screenshots or output

<!-- Optional. Useful for docs changes, render/output changes, verifier
report format changes, or anything visual. Paste before/after or a short
transcript. -->

## Additional notes

<!-- Anything a reviewer should know that doesn't fit above — deployment
considerations, migration paths, follow-up work you're deferring, areas
where you'd like a particularly close look, alternatives you tried and
rejected mid-PR. -->
