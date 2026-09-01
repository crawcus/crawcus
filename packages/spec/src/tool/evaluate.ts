/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolName } from '../types/ids.js';
import { validateJsonSchemaShape } from '../types/json.js';
import {
  LAWFUL_BASIS_VALUES,
  TOOL_GATES,
  TOOL_RISKS,
  type ToolSpec,
  type ToolSpecEvaluationResult,
  type ToolSpecViolation,
} from './types.js';

/**
 * # evaluateToolSpec — pure evaluator for `ToolSpec` literals
 *
 * Validates that a spec-side per-tool declaration is well-formed.
 * Returns `{ ok: true }` when every check passes, or `{ ok: false,
 * toolName, violations }` when one or more checks fail.
 *
 * Mirrors the warrant / contract evaluator patterns: pure, total,
 * side-effect-free, no thrown errors (per ratchet #19 — errors are
 * values).
 *
 * Failures do NOT short-circuit. A spec with multiple violations
 * (e.g., bad risk AND bad lawfulBasis) reports both — spec authors
 * get all problems in one pass rather than play whack-a-mole.
 *
 * Order of checks (consistent with audit-bundle render order):
 *
 *   1. Risk     — `spec.risk` ∈ `TOOL_RISKS`
 *   2. Gate     — `spec.gate` ∈ `TOOL_GATES`
 *   3. Basis    — `spec.lawfulBasis` ∈ `LAWFUL_BASIS_VALUES`
 *   4. Schema   — `spec.inputSchema` defined and well-formed
 *                 (via `validateJsonSchemaShape`)
 */
export function evaluateToolSpec(name: ToolName, spec: ToolSpec): ToolSpecEvaluationResult {
  const violations: ToolSpecViolation[] = [];

  // 1. Risk
  // The structural type guarantees `spec.risk` is a `ToolRisk`, but
  // at the boundary (e.g., decoding from JSON) callers may pass a
  // raw string. The `as unknown as string` cast lets the runtime
  // check still fire for ill-typed callers.
  if (!(TOOL_RISKS as readonly string[]).includes(spec.risk as unknown as string)) {
    violations.push({ code: 'invalid-risk', received: String(spec.risk) });
  }

  // 2. Gate
  if (!(TOOL_GATES as readonly string[]).includes(spec.gate as unknown as string)) {
    violations.push({ code: 'invalid-gate', received: String(spec.gate) });
  }

  // 3. Lawful basis
  if (!(LAWFUL_BASIS_VALUES as readonly string[]).includes(spec.lawfulBasis as unknown as string)) {
    violations.push({
      code: 'invalid-lawful-basis',
      received: String(spec.lawfulBasis),
    });
  }

  // 4. Input schema
  // `inputSchema` is typed non-optional, but JSON-deserialised callers
  // may pass undefined / null; guard explicitly.
  if (spec.inputSchema === undefined || spec.inputSchema === null) {
    violations.push({ code: 'missing-input-schema' });
  } else {
    const shapeErrors = validateJsonSchemaShape(spec.inputSchema);
    if (shapeErrors.length > 0) {
      // Surface the first structural error verbatim — gives spec
      // authors a precise pointer (the error already carries a
      // JSON-Pointer-style path).
      const first = shapeErrors[0];
      // shapeErrors.length > 0 ⇒ first is defined; assertion is for
      // noUncheckedIndexedAccess.
      if (first !== undefined) {
        violations.push({
          code: 'malformed-input-schema',
          reason: `${first.path === '' ? '(root)' : first.path}: ${first.message}`,
        });
      }
    }
  }

  if (violations.length === 0) {
    return { ok: true };
  }
  return { ok: false, toolName: name, violations };
}
