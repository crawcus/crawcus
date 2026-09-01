/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool-use primitive — vendor-neutral types for AI-emitted tool calls.
 *
 * This is the spec-level contract every `AIPort` adapter speaks. The
 * adapter is responsible for translating between these types and its
 * provider's specific tool-use surface; no consumer ever sees the
 * provider-specific shape, and no provider name appears in this file.
 *
 * Lifecycle (1-turn tool use):
 *
 *   ```
 *   1. Consumer composes AIRequest with `tools: [ToolDefinition...]`
 *   2. Adapter sends to provider; provider returns content blocks
 *      including zero or more tool-use blocks
 *   3. Adapter normalises into AIResponse with
 *      `toolCalls: [ToolCall...]` + `stopReason: 'tool_use'`
 *   4. Consumer validates `ToolCall.args` against the matching
 *      `ToolDefinition.inputSchema`, executes the tool
 *   5. Consumer composes follow-up AIRequest with
 *      `priorToolResults: [ToolResult...]` keyed by `ToolCall.id`
 *   6. Adapter sends to provider; loop continues until
 *      `stopReason: 'end_turn'`
 *   ```
 *
 * Hash chain: every `ToolCall` carries `argsHash` (SHA-256 of
 * canonical-JSON-serialised args via `event/canonical-json.ts`), so
 * the audit bundle can prove exactly which args were proposed without
 * re-serialising. The reverse — `ToolResult.valueHash` — is computed
 * by the consumer at execution time and lives on the event payload,
 * not on the `ToolResult` itself (the result may not be JSON if the
 * tool emits binary data; the consumer chooses the representation).
 *
 * Open-source contract: this file becomes part of `@crawcus/spec` at
 * Y1 H2. Additions are non-breaking; field removal is breaking.
 */

import type { ContentHash } from '../types/ids.js';
import type { ToolCallId, ToolName } from '../types/ids.js';
import type { JsonSchema, JsonValue } from '../types/json.js';
import type { LawfulBasis } from '../types/compliance.js';

// ============ Tool name validation ============

/**
 * Kebab-case identifier regex. First char `[a-z]`, remainder
 * `[a-z0-9-]`. No leading/trailing hyphens, no doubled hyphens, no
 * uppercase, no underscores. Length 1..64.
 */
const TOOL_NAME_PATTERN = /^[a-z](?:[a-z0-9]|-[a-z0-9])*$/;

/**
 * Prefixes reserved for runtime-emitted built-in tools. User-declared
 * tools that match these prefixes are rejected at `defineCrawcusSpec`
 * and at every adapter boundary.
 *
 * The spec reserves only the `crawcus.*` prefix (the open standard's
 * own namespace). Runtime implementations are free to enforce
 * additional reserved prefixes downstream of `defineCrawcusSpec` —
 * spec content stays brand-neutral per Y10 marker.
 */
export const RESERVED_TOOL_NAME_PREFIXES: readonly string[] = ['crawcus.'];

/**
 * Maximum permitted ToolName length. Provider tool-use surfaces vary
 * (Anthropic 64, OpenAI 64); we pick the smallest documented limit so
 * spec-level names always fit.
 */
export const MAX_TOOL_NAME_LENGTH = 64;

export interface ToolNameValidationError {
  readonly code: 'empty' | 'too-long' | 'invalid-format' | 'reserved-prefix';
  readonly message: string;
}

/**
 * Validates a candidate string against the `ToolName` rules. Returns
 * `null` on success; an error object on failure. Validators return
 * objects (not booleans) so the call site can surface the precise
 * reason to spec authors at design time.
 */
export function validateToolName(candidate: string): ToolNameValidationError | null {
  if (candidate.length === 0) {
    return { code: 'empty', message: 'ToolName must not be empty' };
  }
  if (candidate.length > MAX_TOOL_NAME_LENGTH) {
    return {
      code: 'too-long',
      message: `ToolName must be at most ${MAX_TOOL_NAME_LENGTH} characters`,
    };
  }
  for (const prefix of RESERVED_TOOL_NAME_PREFIXES) {
    if (candidate.startsWith(prefix)) {
      return {
        code: 'reserved-prefix',
        message: `ToolName prefix "${prefix}" is reserved for runtime-emitted built-in tools`,
      };
    }
  }
  if (!TOOL_NAME_PATTERN.test(candidate)) {
    return {
      code: 'invalid-format',
      message:
        'ToolName must be kebab-case: [a-z] followed by [a-z0-9-]*, no doubled hyphens, no trailing hyphen',
    };
  }
  return null;
}

/**
 * Type-narrowing variant of `validateToolName`. Convenient for the
 * cases where you want to brand the string after validation in a
 * single expression.
 */
export function isValidToolName(candidate: string): candidate is ToolName {
  return validateToolName(candidate) === null;
}

// ============ Tool definition ============

/**
 * Declarative tool definition sent to the AI on `AIRequest.tools`.
 * The AI sees `name` + `description` + `inputSchema` and decides
 * whether to call. Spec-level metadata (risk tier, gating, lawful
 * basis) lives separately on the `CrawcusSpec.tools` declaration —
 * the wire shape sent to the AI carries only what the AI needs to
 * decide.
 */
export interface ToolDefinition {
  /** Tool identifier — see `ToolName`. */
  readonly name: ToolName;

  /**
   * Human-readable description sent to the AI. Should explain WHEN to
   * call the tool, not just WHAT it does. Token-counted (becomes part
   * of input tokens) — keep concise.
   */
  readonly description: string;

  /**
   * Args shape — constrained JSON Schema subset (root MUST be
   * `type: 'object'`). Used both to inform the AI's call shape and
   * (on the host side) to validate `ToolCall.args` before execution.
   */
  readonly inputSchema: JsonSchema;
}

// ============ Tool call (AI → host) ============

/**
 * A tool call the AI emitted. Provider-agnostic: every adapter
 * normalises its provider's representation into this shape.
 *
 * Multiple tool calls in a single `AIResponse.toolCalls` array are
 * possible (parallel tool use); each carries an independent `id` that
 * the host echoes back via `ToolResult.callId` when threading results.
 */
export interface ToolCall {
  /**
   * Provider-minted call id. Stable across the call's lifetime; used
   * to correlate `ToolCall.id ↔ ToolResult.callId` when continuing
   * the conversation.
   */
  readonly id: ToolCallId;

  /** Name of the tool to invoke — matches a `ToolDefinition.name`. */
  readonly name: ToolName;

  /**
   * Arguments the AI proposed. Structural — adapters do NOT validate
   * against the `ToolDefinition.inputSchema` (that is the consumer's
   * responsibility, typically via a downstream JSON-Schema validator
   * like Ajv). Adapters guarantee only that this is valid JSON.
   */
  readonly args: JsonValue;

  /**
   * SHA-256 hash of canonical-JSON-serialised `args`. Computed by the
   * adapter at the boundary, so the audit bundle can prove the AI's
   * proposed args without re-serialising. Reuses the canonical-JSON
   * + hash-chain machinery from `event/canonical-json.ts`.
   */
  readonly argsHash: ContentHash;
}

// ============ Tool result (host → AI) ============

/**
 * Result of executing a tool. Threaded back to the AI on the next
 * `AIRequest.priorToolResults` so the model can continue the
 * conversation.
 *
 * Discriminated by `isError`. The success branch carries an arbitrary
 * `JsonValue`. The error branch carries a stable `code` (for
 * programmatic policy decisions) plus a human-readable `message` (for
 * the model to read and potentially surface to the user).
 *
 * Adapters whose provider supports an `is_error` flag on tool results
 * map directly. Adapters whose provider has no error flag SHOULD
 * prepend a stable marker (e.g., `[ERROR ${code}] ${message}`) to the
 * stringified value so the model still sees the error condition.
 */
export type ToolResult = ToolResultOk | ToolResultErr;

export interface ToolResultOk {
  readonly callId: ToolCallId;
  readonly isError: false;
  readonly value: JsonValue;
}

export interface ToolResultErr {
  readonly callId: ToolCallId;
  readonly isError: true;
  /**
   * Stable, machine-readable error code. Free-form — consumers
   * choose their own taxonomy (e.g., `'validation-failed'`,
   * `'unauthorised'`, `'rate-limited'`).
   */
  readonly code: string;
  /** Human-readable error message — sent to the model as context. */
  readonly message: string;
}

// ============ Stop reason ============

/**
 * Why the AI stopped emitting. Adapters MUST normalise their
 * provider's stop signal into one of these four values; unknown
 * upstream values map to `'end_turn'` and SHOULD emit an
 * adapter-level warning (so the provider's new stop_reason can be
 * surfaced and the union extended in a future minor release).
 *
 * - `'end_turn'`: model finished its response normally.
 * - `'tool_use'`: model emitted one or more tool calls; the host must
 *   execute them and continue via `priorToolResults`.
 * - `'max_tokens'`: model hit the response token cap.
 * - `'stop_sequence'`: model emitted a configured stop sequence.
 */
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

/**
 * Exhaustive array form, exported so adapter authors can validate
 * normalisation in tests without re-typing the union members.
 */
export const STOP_REASONS: readonly StopReason[] = [
  'end_turn',
  'tool_use',
  'max_tokens',
  'stop_sequence',
];

// ============ Tool risk + gate (spec-side declaration) ============

/**
 * Per-tool risk classification authored on `CrawcusSpec.tools`.
 *
 * Risk is the policy author's pre-declared judgment about a tool's
 * impact surface. It does NOT, by itself, decide whether a call
 * auto-executes — that's what `ToolGate` is for. Risk + gate are
 * orthogonal so policy authors can independently express
 * *"this tool is low-impact"* and *"but I still want a Contract
 * checkpoint to fire on every call"*.
 *
 * - `'low'`    — routine field writes; safe to auto-execute when
 *                gated `'none'`. Examples: setting a non-PII field,
 *                reading a derived projection value.
 * - `'medium'` — actions whose consequences are reversible but
 *                non-trivial. Examples: scheduling, drafting
 *                outbound messages.
 * - `'high'`   — actions with externally-visible side effects or
 *                touching special-category data. Examples: enrolling
 *                a learner, releasing a record.
 *
 * Auditors render risk alongside `lawfulBasis` in the audit bundle
 * — the combination shows *what policy the author declared* and
 * *what GDPR Art 6 basis the runtime claimed at execution time*.
 */
export type ToolRisk = 'low' | 'medium' | 'high';

/**
 * Per-tool gate policy authored on `CrawcusSpec.tools`. Determines
 * how the runtime treats a `ToolCall` between AI emit and execution.
 *
 * - `'none'`     — auto-execute. The runtime emits `SuggestionAccepted`
 *                  with the spec-declared `lawfulBasis`. No human
 *                  approval UI renders. Use for low-risk routine writes
 *                  where the policy author has pre-authorised the call.
 * - `'contract'` — render approval UI with `lawfulBasis` pre-filled
 *                  from the spec; user MAY override. A `tool_proposed`
 *                  Contract checkpoint (TKT-V6-ITEM-15) evaluates pre/
 *                  invariants over the proposed args + rejected calls
 *                  emit `ContractViolation`. Use when the policy author
 *                  wants programmatic gating but reserves the operator's
 *                  right to override the basis.
 * - `'human'`    — render approval UI; operator MUST pick the
 *                  `LawfulBasis` (existing behavior pre-V6-14). Use for
 *                  high-risk calls where a typed human decision is the
 *                  load-bearing audit artefact.
 *
 * Specs that omit a tool's `ToolSpec` entirely fall through to
 * `'human'` semantics for back-compat (the pre-V6-14 behavior).
 */
export type ToolGate = 'none' | 'contract' | 'human';

/**
 * Exhaustive runtime array of `ToolRisk` values. Lets the evaluator
 * + adapter authors validate without re-typing the union. The
 * `as const satisfies` form ensures the literal stays in lock-step
 * with the union type (any drift fails the type-check).
 */
export const TOOL_RISKS = ['low', 'medium', 'high'] as const satisfies readonly ToolRisk[];

/**
 * Exhaustive runtime array of `ToolGate` values. Same discipline as
 * `TOOL_RISKS` — drift between union and array is a type error.
 */
export const TOOL_GATES = ['none', 'contract', 'human'] as const satisfies readonly ToolGate[];

/**
 * Runtime list of GDPR Art 6 lawful-basis values. Defined locally
 * in `tool/` (not in `types/compliance.ts`) because at the time
 * `LawfulBasis` was authored the project had no other use for a
 * runtime array; the evaluator + drift-detection test below give us
 * one without back-touching the compliance module.
 *
 * **Drift detection:** the companion test asserts every entry is
 * assignable to `LawfulBasis` AND `LawfulBasis` is assignable to
 * `(typeof LAWFUL_BASIS_VALUES)[number]`. If the `LawfulBasis` union
 * changes, the test fails loud — and this array must be updated in
 * the same PR.
 */
export const LAWFUL_BASIS_VALUES = [
  'consent',
  'contract',
  'legal-obligation',
  'vital-interests',
  'public-task',
  'legitimate-interest',
] as const satisfies readonly LawfulBasis[];

// ============ ToolSpec — spec-side per-tool declaration ============

/**
 * Per-tool spec-side declaration authored on `CrawcusSpec.tools`.
 *
 * Distinct from `ToolDefinition` (the wire shape sent to the AI):
 * `ToolDefinition` carries only what the AI needs to decide whether
 * + how to call. `ToolSpec` carries the **policy** the runtime uses
 * to gate, audit, and audit-bundle the resulting call.
 *
 * Auditors get three things from a `ToolSpec`:
 *
 *   1. The author's declared `risk` tier (was this expected to be
 *      routine, sensitive, or external-side-effecting?)
 *   2. The author's declared `gate` policy (was a human in the loop
 *      required by design, or was auto-execute pre-authorised?)
 *   3. The Art 6 `lawfulBasis` the runtime claimed when the call
 *      auto-executed (or that the operator overrode when the gate
 *      was `'contract'` / `'human'`).
 *
 * Together with the `ToolCall.argsHash` from the wire side, the audit
 * bundle becomes round-trippable: *what was proposed*, *what was
 * authorised by policy*, *what basis the runtime claimed*.
 */
export interface ToolSpec {
  /**
   * Optional human-readable description. If the wire-side
   * `ToolDefinition.description` is omitted, runtime adapters MAY
   * substitute this. Tokens-counted when surfaced to the AI; prefer
   * concise.
   */
  readonly description?: string;

  /**
   * Args shape — constrained JSON Schema subset (root MUST be
   * `type: 'object'` per `JsonSchema`). The runtime uses this both
   * to inform the AI's call shape (via the wire-side
   * `ToolDefinition`) and to validate `ToolCall.args` before
   * execution.
   */
  readonly inputSchema: JsonSchema;

  /**
   * Risk tier — see `ToolRisk`. Orthogonal to `gate`.
   */
  readonly risk: ToolRisk;

  /**
   * Gate policy — see `ToolGate`. Decides the runtime path between
   * AI emit and execution.
   */
  readonly gate: ToolGate;

  /**
   * GDPR Art 6 lawful basis the runtime claims on the resulting
   * `SuggestionAccepted` event when this tool's call auto-executes
   * (`gate: 'none'`) or is approved unchanged (`gate: 'contract'`).
   * When `gate: 'human'`, the operator picks at approval time and
   * this value is used only as a default for the picker.
   */
  readonly lawfulBasis: LawfulBasis;
}

/**
 * Map of `ToolName` → `ToolSpec`, authored on `CrawcusSpec.tools`.
 * Readonly at every layer so the runtime cannot mutate a tenant's
 * policy declaration after spec load.
 */
export type ToolSpecMap = Readonly<Record<ToolName, ToolSpec>>;

// ============ ToolSpec evaluation ============

/**
 * Discriminated violation found while evaluating a `ToolSpec`
 * literal. Per ratchet #19, codes are an exhaustive union — every
 * dispatcher MUST handle each case (or `assertNever` the default).
 *
 * - `'invalid-risk'`            — `spec.risk` is not in `TOOL_RISKS`
 * - `'invalid-gate'`            — `spec.gate` is not in `TOOL_GATES`
 * - `'invalid-lawful-basis'`    — `spec.lawfulBasis` is not in
 *                                 `LAWFUL_BASIS_VALUES`
 * - `'missing-input-schema'`    — `spec.inputSchema` is `undefined` /
 *                                 `null`
 * - `'malformed-input-schema'`  — `spec.inputSchema` is present but
 *                                 fails `validateJsonSchemaShape`;
 *                                 `reason` carries the first
 *                                 structural error message
 */
export type ToolSpecViolation =
  | { readonly code: 'invalid-risk'; readonly received: string }
  | { readonly code: 'invalid-gate'; readonly received: string }
  | { readonly code: 'invalid-lawful-basis'; readonly received: string }
  | { readonly code: 'missing-input-schema' }
  | { readonly code: 'malformed-input-schema'; readonly reason: string };

/**
 * Result of `evaluateToolSpec`. Discriminated by `ok` so the call
 * site can pattern-match without nullability.
 */
export type ToolSpecEvaluationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly toolName: ToolName;
      readonly violations: readonly ToolSpecViolation[];
    };
