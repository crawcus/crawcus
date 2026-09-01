# @crawcus/tck

## 0.3.0

### Minor Changes

- 2dace01: `@crawcus/tck@0.2.0` — ships `runHashChainContract` + golden 5-event fixture for any host EventStore implementation.

  Closes TKT-TCK-HASH-CHAIN-FIXTURE (HF Ask 2 commitment per `docs/notebook/08-design-partner/hf-reply-prereqs-prisma-event-store-hash-chain-20260608.md`; HF Slice 2 / #1343 deadline 2026-06-15).

  **New public surface (additive only, no breaking changes):**
  1. `runHashChainContract({ storeFactory, intentId })` — async drop-in conformance test. Drives the host's store with a deterministic 5-event sequence (`SourceCaptured` → 3× `CapturedTurn` → `ProjectionCommit`), reads back, and asserts (a) every `contentHash` matches the deterministic expected value, (b) `verifyChain(events).valid === true`, (c) read-back order matches append order, (d) payload is byte-equivalent (recompute hash round-trip). Returns `TckResult` — pass or structured failure with `code` + `message` citing `packages/spec/src/event/hash-chain.ts`.
  2. `buildGoldenSequence(intentId)` — exported builder for harnesses that want to inspect / log the input before driving their store. Uses fixed timestamps, payloads, actor, tenant, and `legitimate-interest` lawful basis so the canonical-JSON SHA-256 is byte-identical across runs.
  3. `EXPECTED_CONTENT_HASHES` — pre-computed expected hashes for the golden sequence built with `intentId === 'tck-golden-intent'`. Diagnostic aid; the contract test computes per-`intentId` expected hashes internally.
  4. `HashChainContractStore` + `HashChainContractEnv` types — minimal store surface the contract test drives. Deliberately smaller than the full `@crawcus/core` `EventStore` port; adapters that implement the wider port can pass `this` straight through.

  **Failure codes** carried by `TckResultFailure.code`: `READ_LENGTH_MISMATCH`, `READ_ORDER_MISMATCH`, `CONTENT_HASH_MISMATCH`, `PREV_HASH_MISMATCH`, `PAYLOAD_MISMATCH`, `CHAIN_VERIFY_FAILED`. Every failure message cites `packages/spec/src/event/hash-chain.ts` per citation discipline.

  **Why a programmatic builder, not a static JSON fixture.** Computing expected hashes at fixture-build time via `computeContentHash` ties the fixture to the spec contract (RFC 8785 canonical JSON → SHA-256), not to the current `@noble/hashes` + `canonicalize` versions. Any legitimate future upgrade of the hash pipeline produces a new (still-deterministic) golden set without a test-data churn.

  **No changes to `@crawcus/spec` or `@crawcus/core`.** This ticket only consumes the existing primitives (`computeContentHash`, `verifyChain`, `GENESIS_PREV_HASH`, `SYSTEM_EVENT_KINDS`) — the reply memo confirmed these were already shipped in core / spec.

  **HF integration path.** HF's `apps/admin` PrismaEventStore migration imports the helper, runs `runHashChainContract({ storeFactory: () => new PrismaEventStore(prisma), intentId: 'hf-conformance' as IntentId })` in their Slice 2 test suite, and gates merge on `result.ok === true`. 5-minute drop-in; no reverse-engineering of the in-memory reference store. Generic — any CRAWCUS-conformant runtime can use the same harness.

## 0.1.3

### Patch Changes

- Updated dependencies [7a60f29]
  - @crawcus/spec@0.11.0

## 0.1.2

### Patch Changes

- Updated dependencies
- Updated dependencies [b47a90c]
  - @crawcus/spec@0.10.0

## 0.1.1

### Patch Changes

- Updated dependencies [393c91f]
  - @crawcus/spec@0.8.0
