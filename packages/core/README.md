# @crawcus/core

**Compliance, as a primitive.**

`@crawcus/core` is the reference runtime for **CRAWCUS** — an open spec we
publish (CC-BY-4.0) for in-app compliance evidence. Instrument your existing
mutations and get signed, third-party-verifiable artefacts — Contracts · Receipts · Attestations · Warrants —
from your code, without bolting on a SaaS or rewriting your stack.

Any Node 22+ backend. TypeScript-first. Self-host-complete — no cloud dependency.

```bash
npm install @crawcus/core
```

```ts
import { defineCrawcusSpec, writeEvent, field } from '@crawcus/core';

// 1. Describe what compliance requires
const CreateCourse = defineCrawcusSpec({
  key: 'CreateCourse' as never,
  projection: 'Course' as never,
  version: 1,
  fields: { title: field.string().required() },
  readiness: ({ has }) => has('title'),
});

// 2. Instrument your mutation
await writeEvent(intent, { tenant, actor, config, spec: CreateCourse });

// → Event in your hash-chained log, projection updated atomically,
//   audit-bundle entry generated, compliance manifest validated.
```

> Status: **pre-1.0**. Core surface is stable enough for design-partner
> integration (HF as Tallyseal Zero); public API stability commitment
> at v1.0 per ratchet #4.

## What this package re-exports

`@crawcus/core` is the single-import-surface boundary for Tallyseal runtime consumers. It re-exports:

- The CRAWCUS spec-level types, helpers, and constants from `@crawcus/spec` (so consumers don't need a second import boundary)
- Runtime-only types and functions (ports, `writeEvent`, `composeAuditBundle`, etc.)

If you're a CRAWCUS spec author (extending the standard primitives), import directly from `@crawcus/spec`. If you're a runtime consumer (building an app on top of the Tallyseal runtime), import everything from `@crawcus/core`.

## What ships

| Surface | What |
|---|---|
| **7 primitive types** | `Intent`, `CrawcusSpec`, `Event`, `Suggestion`, `Reducer` (`ReducerFn`), `ProjectionRef`, `ComplianceManifest` |
| **4 supporting primitives** | `ReadinessCtx` / `checkReadiness` (3-layer gate), `evaluateGraph`, `Projector` interface, `TaskSpec` |
| **7 port interfaces** | `ProjectionPort`, `EventStorePort`, `AIPort`, `IdentityPort`, `PIIPort`, `TaskPort`, `StoragePort` |
| **5 builders** | `defineCrawcusSpec`, `defineCompliance`, `defineConfig`, `defineProjection`, `field` (chainable) |
| **First-class Contracts** (v0.2) | `Contract`, `ContractCtx`, `defineContract`, `evaluateContracts`, monotonic-composition checker, predicate normaliser + hasher, size-limit guard, ContractViolation event |
| **IFC-lite** | `Tainted<T>` / `Untainted<T>` brand types — compile-time guarantee that raw PII cannot reach the event log |
| **Event log primitives** | `writeEvent` (sole mutation entrypoint), `computeContentHash`, `verifyChain`, RFC 8785 canonical-JSON via `canonicalJSON`, UUIDv7 EventIds |
| **PII boundary** | `tokenisePayload`, `assertNoRawPII`, `[[pii:<token>]]` marker helpers |
| **Reducer dispatcher** | `dispatchReducer`, `assertReducerDeterminism` (ratchet #3 gate) |
| **Compliance validator** | `validateManifest` — 7 build-time failure modes |
| **Typed errors** | `LawfulBasisMismatchError`, `RawPIIInPayloadError`, `HashChainBrokenError`, `ConsentRequiredError`, `ReadinessNotMetError`, `ContractViolationError`, `assertNever` |
| **`Result<T, E>`** | Re-exported from `neverthrow` for total-function discipline |

## Install

```bash
pnpm add @crawcus/core
```

## Architecture

The 7 primitives + ports form an **event-sourced, hash-chained,
contract-checked, PII-tokenised** runtime. Per the project's design principles:

- **Multi-tenant from day 1** — every primitive carries `tenantId`
- **Multi-region from day 1** — adapters resolve per-tenant residency
- **Multi-stack via ports** — `@tallyseal/projection-prisma`,
  `-drizzle`, `-mongo`, `-kysely` etc. plug into the same surface
- **Standards-grade** — CrawcusSpec format → W3C/IEEE Community Group
  submission window Y1 H2
- **OEM-embeddable** — zero singletons, zero process-globals
- **OSS-self-host-complete** — runtime needs no Cloud dependency

## Minimal example

```ts
import {
  defineConfig, defineCrawcusSpec, defineCompliance, field,
  writeEvent, tokenisePayload,
} from '@crawcus/core';

const compliance = defineCompliance({
  regulations: ['gdpr@2025-Q1'],
  fields: { 'Course.title': { pii: 'none' } },
  retention: { /* ... */ },
  residency: { /* ... */ },
  ai: { /* ... */ },
  lawfulBasis: { default: 'contract', perPurpose: { 'course-setup': 'contract' } },
});

const CreateCourse = defineCrawcusSpec({
  key: 'CreateCourse' as never,
  projection: 'Course' as never,
  version: 1,
  fields: { title: field.string().required() },
  readiness: ({ has }) => has('title'),
});

const config = defineConfig({
  eventStore: /* adapter */,
  projection: /* adapter */,
  ai: /* adapter */, identity: /* adapter */, pii: /* adapter */,
  tasks: /* adapter */, storage: /* adapter */,
  compliance,
});

const tokenised = await tokenisePayload(rawPayload, { tenant, actor, pii: config.pii });
const result = await writeEvent(
  {
    intentId: 'int_abc' as never,
    kind: 'CapturedTurn',
    payload: tokenised,
    lawfulBasis: 'contract',
    purpose: 'course-setup' as never,
    dataSubjectIds: [],
  },
  { tenant, actor, config, spec: CreateCourse },
);
```

## Adapters

| Port | Y1 adapter |
|---|---|
| `EventStorePort` + `ProjectionPort` | `internal-package` |
| `AIPort` | `@tallyseal/ai-anthropic` (forthcoming) |
| `IdentityPort` | `@tallyseal/identity-clerk` (forthcoming) |
| `PIIPort` | `@tallyseal/pii-presidio` (forthcoming) |
| `TaskPort` | `@tallyseal/task-inngest` (forthcoming) |
| `StoragePort` | `@tallyseal/storage-s3` (forthcoming) |

## Discipline

- 193+ tests; ≥80% mutation score on compliance-critical modules (CI-gated via Stryker)
- ≤20 KB gzipped (current: 11.45 KB — 43% headroom under NFR M7)
- RFC 8785 canonical JSON; SHA-256 hash chain; UUIDv7 IDs (RFC 9562)
- 22 engineering ratchets enforced via CI + lint + pre-commit hooks
- Pure-sync Contract predicates → audit-bundle replayability

## License

MIT.
