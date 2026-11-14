# CRAWCUS vectors

This directory holds conformance vectors as plain files, so that a runtime in any language can check itself against them. Each case directory holds a `case.json` and a `MANIFEST.json`, which records the SHA-256 of every file in that case. A runner checks the manifest before it runs anything.

| Set | Cases | Run with |
|---|---|---|
| `hash-chain/` | 7 | `pnpm vectors:crawcus` |
| `disclosure-signal/` | 10 (one holds 8 names) | `pnpm vectors:crawcus` |
| `decision-receipt/` | 22 | `pnpm vectors:decision-receipt` |

`decision-receipt/` has its own README.

## Hash chain

The cases are built from `src/fixtures/hash-chain.fixture.ts`. `golden/events.json` holds the five events of `buildGoldenSequence("tck-golden-intent")`, with each `contentHash` equal to `EXPECTED_CONTENT_HASHES`.

An event's `contentHash` is the SHA-256, in lowercase hex, of the canonical JSON of every field except `id` and `contentHash`. `golden/canonical-<i>.txt` holds exactly those bytes for event `i`, so a runtime can check its canonical form before it checks its hash. Timestamps are ISO 8601 strings with milliseconds and `Z`.

`expected` is `{valid, brokenAt, check}`. `check` names the first rule that breaks:

| check | Rule |
|---|---|
| `genesis` | Event 0's `prevHash` is null |
| `prevHash` | Each `prevHash` is the prior `contentHash` |
| `contentHash` | A recomputed hash equals the stored one |

| Case | Expected |
|---|---|
| golden | valid |
| payload-edited | event 2, contentHash |
| payload-edited-and-rehashed | event 3, prevHash |
| events-swapped | event 1, prevHash |
| event-removed | event 2, prevHash |
| genesis-removed | event 0, genesis |
| genesis-prevhash-set | event 0, genesis |

## Disclosure signal

The cases are built from `src/fixtures/disclosure-signal.fixture.ts`. They are checked against `disclosureHasOpportunityToBeRead(events, subject, options)`, the §6.A predicate. It returns true only when all three of these hold:

- the most recent `DisclosureDelivered` for the subject and requirement exists;
- a `DisclosureSignal` for that requirement has an accepted `signalType`;
- if `requireHashMatch` is set, that signal carries the delivered `contentHash`.

`expected` is the boolean result. Timestamps in `events.json` are ISO strings; a runtime that reads them as dates must convert them.

| Case | Expected |
|---|---|
| positive | true |
| hash-mismatch | false |
| hash-mismatch-not-required | true |
| signal-type-not-accepted | false |
| no-delivery | false |
| other-subject | false |
| other-requirement | false |
| redelivered-signal-for-old | false |
| redelivered-signal-for-new | true |

`name-lint/case.json` lists the predicate names to give `lintDisclosureSignalPredicateName`, each with the result it must return. A predicate that consumes `DisclosureSignal` records an opportunity to perceive, never an acknowledgement. So a name must not contain a forbidden token (`acknowledged`, `consented`, `agreed`, `confirmed`, matched case-insensitively), and it must contain `opportunity` or `signal`. A refusal cites `crawcus-contracts.md §6.A`.

## Where the files come from

`scripts/build-crawcus-vectors.mjs` writes these files. Every case states its expected result from the contract's prose. The script runs `@crawcus/spec` on each case and refuses to write anything if a result differs. `--check` compares the files on disk against a fresh rebuild.

`test/crawcus-vectors.test.ts` runs that comparison, then every case, then flip controls. Each flip control skips one rule and disagrees on exactly the cases that rule decides:

- a chain check that does not recompute hashes;
- a chain check with no genesis rule;
- a predicate that ignores the hash;
- a lint that forgets a token.
