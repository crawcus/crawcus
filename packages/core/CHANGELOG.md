# @crawcus/core

## 0.14.0

### Minor Changes

- 322b426: Add missing ID type re-exports for primitives 12-14 to complete the
  single-import-surface posture established by Q-CORE-REEXPORT-POLICY
  Option B (LOCKED 2026-06-03): `ConsentId`, `ConsentRequirementId`,
  `ProcessingPurpose` (#12), `LineageId`, `Iri` (#13), `OversightId`,
  `OversightRequirementId`, `OrgId` (#14).

  Symmetric with primitives 10-11 (`WarrantId`, `IssuerId`,
  `DisclosureId`, `DisclosureRequirementId` already re-exported).
  Pure pass-through from `@crawcus/spec`; no runtime logic.

  Required by TKT-PRISMA-ADAPTER-PRIMITIVES-10-14 — store
  implementations need the full ID surface to type their row-mapping
  helpers. Without this, adapters must add a second import boundary on
  `@crawcus/spec`, breaking ratchet #23 (adapters only see
  spec via core).

## 0.13.1

### Patch Changes

- Updated dependencies [7a60f29]
  - @crawcus/spec@0.11.0

## 0.13.0

### Minor Changes

- 2c10196: TKT-CORE-REEXPORTS-TOOLSURFACE — wire `@crawcus/core` to re-export the
  spec-level tool-use surface (Q-CORE-REEXPORT-POLICY Option B, LOCKED
  2026-06-03).

  Adds ~25 additive re-exports to `@crawcus/core` so runtime consumers
  (HF + future adopters) get a single-import-surface for the tool-use API.
  Pure pass-throughs from `@crawcus/spec`; no logic copying, no
  removals, no breaking changes.

  New re-exports:
  - **Tool-use types**: `ToolDefinition`, `ToolCall`, `ToolCallId`,
    `ToolName`, `ToolResult`, `ToolResultOk`, `ToolResultErr`,
    `ToolNameValidationError`, `StopReason`
  - **JSON value types**: `JsonValue`, `JsonObject`, `JsonArray`,
    `JsonPrimitive`
  - **JSON schema types**: `JsonSchema`, `JsonSchemaNode`,
    `JsonSchemaObject`, `JsonSchemaString`, `JsonSchemaNumber`,
    `JsonSchemaInteger`, `JsonSchemaBoolean`, `JsonSchemaArray`,
    `JsonSchemaEnum`
  - **Tool-use helpers**: `computeJsonHash`, `validateToolName`,
    `isValidToolName`, `validateJsonSchemaShape`
  - **Tool-use constants**: `STOP_REASONS`, `MAX_TOOL_NAME_LENGTH`,
    `RESERVED_TOOL_NAME_PREFIXES`

  Per ratchet #16 (version-bump-per-PR) + ratchet #23 (`@crawcus/*`
  spec-spin-out reverses direction cleanly at Y1 H2). Y10 vendor-
  neutrality preserved: spec is still source of truth; runtime is a
  single-import pass-through.

  Companion docs:
  - `docs/notebook/09-operating/tkt-core-reexports-toolsurface-spec.md`
  - `docs/notebook/09-operating/decision-log.md` (Q-CORE-REEXPORT-POLICY)
  - `docs/notebook/08-design-partner/hf-feedback-items-12-13-adoption-20260603.md` §Item 18

### Patch Changes

- Updated dependencies
- Updated dependencies [b47a90c]
  - @crawcus/spec@0.10.0

## 0.11.0

### Minor Changes

- 393c91f: Tool-use primitive — vendor-neutral AI-tool-call types on `AIPort` (HF feedback item 12).

  ## What's new
  - **`@crawcus/spec`** — new `tool/` primitive folder following the established `disclosure/` / `consent/` / `oversight/` shape. Public surface:
    - `ToolDefinition`, `ToolCall`, `ToolResult` (`ToolResultOk` | `ToolResultErr`), `StopReason` — the wire-shape contract every `AIPort` adapter speaks.
    - `ToolName` brand + `validateToolName()` + `isValidToolName()` — kebab-case `[a-z][a-z0-9-]*`, length ≤ 64, reserved prefixes `crawcus.*` / `tallyseal.*`. Spec-author-friendly error codes (`empty` / `too-long` / `invalid-format` / `reserved-prefix`).
    - `ToolCallId` brand — adapter-side correlation key between `ToolCall.id` and `ToolResult.callId`.
    - `STOP_REASONS`, `RESERVED_TOOL_NAME_PREFIXES`, `MAX_TOOL_NAME_LENGTH` — exhaustive constants for adapter conformance tests.
  - **`@crawcus/spec`** — new `types/json.ts`: vendor-neutral `JsonValue` + constrained `JsonSchema` (draft-2020-12 subset, root MUST be `type: 'object'`). `validateJsonSchemaShape()` returns RFC-6901-pathed structural errors for spec-author feedback. The subset is the intersection of what current LLM tool-schema surfaces accept uniformly — no provider names appear in the type contract.
  - **`@crawcus/spec`** — new `computeJsonHash(value)` helper alongside `computeContentHash(event)`. Same canonical-JSON → SHA-256 pipeline, accepts arbitrary `JsonValue`. Used by adapters to compute `ToolCall.argsHash` at the AI-port boundary so audit bundles can prove proposed args without re-serialising.
  - **`@crawcus/core`** — `AIRequest` extended with optional `tools?: readonly ToolDefinition[]` + `priorToolResults?: readonly ToolResult[]`. `AIResponse` extended with optional `toolCalls?: readonly ToolCall[]` + `stopReason?: StopReason`. All four fields are optional — existing single-turn text consumers and adapters remain spec-conformant without modification. Adapter implementations that surface tool-use SHOULD always populate `stopReason`; future major release may make it required.

  ## Why this lands first

  This is the type contract every adapter (`@tallyseal/ai-anthropic`, future `ai-openai` / `ai-vertex` / `ai-bedrock` / `ai-ollama` / `ai-mock`) implements. Landing the spec-level shape before any adapter changes keeps `AIPort` as the universal abstraction: consumers hold N adapters interchangeably; higher-order adapters (routing, caching, rate-limiting, shadow fan-out) compose because they all satisfy the same `call(req, ctx)` signature.

  The companion adapter implementation for Anthropic (`@tallyseal/ai-anthropic`) ships in a follow-up changeset (HF feedback item 13). Items 14 (spec-level `tools` + risk/gate metadata), 15 (`tool_proposed` Contract checkpoint), and 16 (streaming `callStream`) build on these types.

  ## Sources

  HF feedback `docs/notebook/08-design-partner/hf-feedback-v6-wizard-tool-use.md` (2026-06-03) — the V6 wizard pattern needs structured tool calls, and the current text-only `AIPort` forces fragile workarounds (text-protocol parsing, second non-AIPort Anthropic calls, local interface casts) that all violate the C5 boundary.

### Patch Changes

- Updated dependencies [393c91f]
  - @crawcus/spec@0.8.0
