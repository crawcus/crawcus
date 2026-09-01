# @crawcus/spec

## 0.11.0

### Minor Changes

- 7a60f29: feat(crawcus-spec): tool_proposed Contract checkpoint (TKT-V6-ITEM-15)

  Adds new CheckpointKind value 'tool_proposed' to the Contract surface.
  Contracts declared with this checkpoint evaluate against proposed tool
  calls (toolName + toolArgs) BEFORE the corresponding field write lands
  in state. Pairs with TKT-V6-ITEM-14's gate:'contract' semantic — the
  gate value declares intent ("run Contracts"); this CheckpointKind value
  is what those Contracts hook into.

  Spec-surface-only ship. Host-side runtime gate (writeEvent integration)
  lands separately. Backward-compat: existing Contracts unchanged;
  existing CrawcusSpec fixtures evaluate identically.

  See docs/notebook/08-design-partner/hf-feedback-v6-wizard-tool-use.md
  §Q-V6-2.

## 0.10.0

### Minor Changes

- feat(crawcus-spec): TKT-V6-ITEM-14 — spec-level tools declaration with risk + gate

  Adds `CrawcusSpec.tools?: Record<ToolName, ToolSpec>` with per-tool
  `risk: 'low' | 'medium' | 'high'` and `gate: 'none' | 'contract' | 'human'`.

  `TallysealToolCallApproval` switches behavior on `toolSpec.gate`:
  - **`gate: 'none'`** — auto-execute on mount. Calls `onApprove(suggestion, toolSpec.lawfulBasis)` once via a `useRef` guard keyed on `suggestion.id`. Renders nothing.
  - **`gate: 'contract'`** — render approval picker pre-filled with `toolSpec.lawfulBasis`; operator MAY override. Pairs with the `tool_proposed` Contract checkpoint shipping in TKT-V6-ITEM-15.
  - **`gate: 'human'`** — existing legacy approval gate (pre-V6-14 behavior).
  - **No `toolSpec`** — back-compat: existing `defaultBasis` flow, no auto-approve.

  Surface added to `@crawcus/spec`:
  - Types: `ToolRisk`, `ToolGate`, `ToolSpec`, `ToolSpecMap`, `ToolSpecViolation`, `ToolSpecEvaluationResult`.
  - Runtime arrays (exhaustive, `as const satisfies` discipline): `TOOL_RISKS`, `TOOL_GATES`, `LAWFUL_BASIS_VALUES`. Drift-detection test fails loud if the union and array fall out of sync.
  - Pure evaluator: `evaluateToolSpec(name, spec): { ok: true } | { ok: false, toolName, violations }`. Non-short-circuiting; reports every violation in one pass per ratchet #19 (typed errors-as-values).

  `@crawcus/core` re-exports the full surface per the Q-CORE-REEXPORT-POLICY single-import discipline.

  Pairs with TKT-V6-ITEM-15 (the `tool_proposed` Contract checkpoint) shipping separately. See `docs/notebook/08-design-partner/hf-feedback-v6-wizard-tool-use.md` §Q-V6-1 for the design rationale and `docs/notebook/09-operating/hf-tarball-pickup-20260603-items-12-13.md` lines 180-188 for the deferred-work framing.

  Back-compat: specs without `tools` continue to construct + evaluate identically to pre-V6-14. The `ToolSpec` `lawfulBasis` field, when present in `gate: 'human'` mode, supersedes the component-level `defaultBasis` prop (the spec is the policy author's declaration; `defaultBasis` is the per-mount fallback).

- b47a90c: TKT-VERIFIER-1a — Wave-1 `crawcus-verify` CLI

  Adds three new packages + one canon-vocabulary addition per
  `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1a-spec.md`:
  - **`@crawcus/verifier@0.1.0`** (new) — library API
    (`verifyBundle`, `parseSignedBundle`, `verifyDsseEnvelope`,
    `verifyHashChain`, `reevaluateContracts`). 8 Wave-1 checks per spec §5.
  - **`crawcus-verify@0.1.0`** (new) — `npx crawcus-verify ./bundle.dsse.json`
    CLI. Flags + exit codes per spec §4.
  - **`@crawcus/verifier@0.0.1`** (new) — defensive scope claim
    - thin re-export shim of `@crawcus/verifier` per ratchet #23
      brand-neutrality preparation.
  - **`@crawcus/spec`** — additive export of
    `ContractViolationKind` + `CONTRACT_VIOLATION_KINDS` (canon vocabulary
    for verifier failure taxonomy). Pure addition; no existing surface
    changed.

  DSSE v1 envelope (ed25519) wrapping JCS-canonical JSONL bundles per
  `crawcus-format.md` §"Wire-format stability — signed bundle (v0.2)".
  Forward-compat `application/vnd.crawcus.*+jsonl` family dispatch per
  Q-CR9 discriminator discipline.

  All three new packages stay `private: true` per B1.3 spending freeze
  (no `npm publish` until founder unfreeze).

## 0.8.0

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
