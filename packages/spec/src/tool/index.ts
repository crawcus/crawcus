/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

// Tool-use primitive — vendor-neutral AI-tool-call types.
//
// See ./types.ts for the full contract; this barrel re-exports the
// public surface in the order users expect to encounter it.

export type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolResultOk,
  ToolResultErr,
  StopReason,
  ToolNameValidationError,
  // TKT-V6-ITEM-14 — spec-side per-tool declaration
  ToolRisk,
  ToolGate,
  ToolSpec,
  ToolSpecMap,
  ToolSpecViolation,
  ToolSpecEvaluationResult,
} from './types.js';

export {
  validateToolName,
  isValidToolName,
  STOP_REASONS,
  RESERVED_TOOL_NAME_PREFIXES,
  MAX_TOOL_NAME_LENGTH,
  // TKT-V6-ITEM-14 — runtime arrays of the discriminated unions
  TOOL_RISKS,
  TOOL_GATES,
  LAWFUL_BASIS_VALUES,
} from './types.js';

export { evaluateToolSpec } from './evaluate.js';
