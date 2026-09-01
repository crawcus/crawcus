/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ContentHash,
  Purpose,
  StopReason,
  TenantCtx,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from '@crawcus/spec';

/**
 * AI inference request. Tokenised — the prompt MUST contain only
 * `[[pii:<id>]]` markers, never raw PII (enforced by the PII proxy
 * layer + verified by `assertNoRawPII`, 4c).
 *
 * `maxCostUsd` is enforced by the adapter; calls exceeding it are
 * refused and recorded as `AIProxyRefused` events.
 *
 * **Tool use** (optional). When the consumer wants the model to be
 * able to call structured tools:
 *
 *   - `tools`: vendor-neutral tool definitions sent to the model.
 *     The model decides whether and which to call; the adapter
 *     translates to its provider's tool-schema surface. Length is
 *     bounded by the adapter (typically by the provider's tool-list
 *     cap); request-level enforcement is a future addition.
 *
 *   - `priorToolResults`: results from a previous turn's tool calls,
 *     keyed by `ToolResult.callId ↔ ToolCall.id`. Threading these
 *     back lets the model continue the conversation after the host
 *     has executed the tools. On the first turn, omit.
 *
 * Both fields are non-required so existing single-turn text consumers
 * are untouched (backward-compatible minor bump).
 */
export interface AIRequest {
  readonly model: string;
  readonly prompt: string;
  readonly promptTemplateVersion: string;
  readonly purpose: Purpose;
  readonly maxCostUsd: number;

  /** Tool definitions the model may call. See module doc. */
  readonly tools?: readonly ToolDefinition[];

  /** Results from a previous turn's tool calls. See module doc. */
  readonly priorToolResults?: readonly ToolResult[];
}

/**
 * AI inference response. Adapter returns the raw model output; PII
 * tokenisation at the boundary is the consumer's responsibility
 * (typically wired via `@tallyseal/proxy`, lands later).
 *
 * `text` is always present (possibly empty string). When the model
 * stopped to call a tool with no preamble text, `text` is `''` and
 * `toolCalls` is populated. Consumers check `toolCalls?.length > 0`
 * (or `stopReason === 'tool_use'`) to dispatch.
 *
 * `toolCalls` and `stopReason` are non-required so existing consumers
 * continue to compile without modification.
 */
export interface AIResponse {
  readonly text: string;
  readonly model: string;
  readonly inputHash: ContentHash;
  readonly outputHash: ContentHash;
  readonly latencyMs: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;

  /**
   * Tool calls the model emitted on this turn. Present when the
   * model decided to call one or more tools; absent or empty when
   * the model returned text only.
   */
  readonly toolCalls?: readonly ToolCall[];

  /**
   * Why the model stopped this turn. Adapters normalise their
   * provider's stop signal into the `StopReason` union; unknown
   * upstream values fall back to `'end_turn'` per the StopReason
   * doc.
   *
   * Optional rather than required so existing adapters that don't
   * surface stop reasons remain spec-conformant during the rollout.
   * New adapters SHOULD always populate it.
   */
  readonly stopReason?: StopReason;
}

/**
 * AI port — model-provider adapter. Implementations:
 * `@tallyseal/ai-anthropic` (Y1 first-class per C5),
 * `@tallyseal/ai-openai`, `@tallyseal/ai-vertex`,
 * `@tallyseal/ai-bedrock`. All adapters honour `ctx.tenant.region`
 * for residency-aware routing.
 *
 * Higher-order ports (routing, caching, rate-limiting, fan-out for
 * shadow-testing) are themselves `AIPort` implementations that wrap
 * one or more concrete adapters — the interface composes.
 */
export interface AIPort {
  call(req: AIRequest, ctx: TenantCtx): Promise<AIResponse>;
}
