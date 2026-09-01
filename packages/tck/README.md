# @crawcus/tck

**Conformance Test Kit for the CrawcusSpec format.**

Any runtime claiming CrawcusSpec compliance — `@crawcus/core` (the
TypeScript reference implementation), or a future Go / Rust / Python
alternative — must pass the fixtures in this package.

## Status

First fixture shipped 2026-06-02 — `disclosure-signal.fixture.ts`
(Q-CR9 LOCKED). Remaining fixtures (top-level shape, field types,
readiness purity, `extends` composition, Contracts at checkpoint,
wire-format stability, manifest interaction, versioning rules) land
incrementally as their canon rows lock.

Import path: `@crawcus/tck/fixtures`. Each fixture exports
runnable `runX` functions returning `TckResult` (discriminated
pass/fail with §-cited diagnostics) — drive from any harness
(vitest, mocha, a Go test runner).

## What the TCK will verify

Per `docs/notebook/02-product/crawcus-format.md` v0.2:

1. **Top-level shape** — every required and optional field validates
   correctly; rejection cases produce the documented error codes.
2. **Field types + chainable metadata** — every base type compiles;
   every chainable method composes; locale-shorthand sugars resolve.
3. **Readiness predicate purity** — predicates run without I/O; same
   input → same output.
4. **`extends` composition** — field merge, readiness AND, classification
   ≥ parent, contract monotonicity (ADD-only, severity-INCREASE-only).
5. **Contracts** (v0.2) — `contracts.pre`/`invariants`/`post` evaluate
   at the documented checkpoints; `ContractViolation` events emit on
   failure; severity 'block' rolls back; severity 'warn' continues.
6. **Wire-format stability** (v0.2) — RFC 8785 canonicalisation
   produces byte-identical hashes across reference implementations.
7. **Compliance manifest interaction** — fields referenced in specs
   must have manifest entries; special-category fields must have
   consent gates; retention satisfies regulation minimums.
8. **Versioning rules** — additive changes don't require bump; breaking
   changes require bump + migration.

## Why this package exists

W3C/IEEE submission credibility requires a TCK. Federation requires
implementations to agree on edge cases. Sector-pack ecosystem health
requires that any pack work against any compliant runtime. The TCK is
the contract between spec authors and runtime implementers.

See `docs/notebook/07-engineering/core-v0.0.1-type-surface.md` §§ 17,
22 and `docs/notebook/02-product/crawcus-contracts.md` §6 (Q-Q) for
the lock context.

## License

MIT.
