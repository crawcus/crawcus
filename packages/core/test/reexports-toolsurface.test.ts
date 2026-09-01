/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

// Runtime value re-exports under test — imported from core
import {
  computeJsonHash as CoreComputeJsonHash,
  validateToolName as CoreValidateToolName,
  isValidToolName as CoreIsValidToolName,
  validateJsonSchemaShape as CoreValidateJsonSchemaShape,
  STOP_REASONS as CoreStopReasons,
  MAX_TOOL_NAME_LENGTH as CoreMaxToolNameLength,
  RESERVED_TOOL_NAME_PREFIXES as CoreReservedToolNamePrefixes,
} from '../src/index.js';

// Same names — imported from spec (the source of truth)
import {
  computeJsonHash as SpecComputeJsonHash,
  validateToolName as SpecValidateToolName,
  isValidToolName as SpecIsValidToolName,
  validateJsonSchemaShape as SpecValidateJsonSchemaShape,
  STOP_REASONS as SpecStopReasons,
  MAX_TOOL_NAME_LENGTH as SpecMaxToolNameLength,
  RESERVED_TOOL_NAME_PREFIXES as SpecReservedToolNamePrefixes,
} from '@crawcus/spec';

// Type re-exports — compile-time identity assertions via assignability.
// If the core type drifts from the spec type, these `extends` checks would
// fail at typecheck time. The runtime assertion below just keeps vitest happy.
import type {
  ToolDefinition as CoreToolDefinition,
  ToolCall as CoreToolCall,
  ToolCallId as CoreToolCallId,
  ToolName as CoreToolName,
  ToolResult as CoreToolResult,
  ToolResultOk as CoreToolResultOk,
  ToolResultErr as CoreToolResultErr,
  ToolNameValidationError as CoreToolNameValidationError,
  StopReason as CoreStopReason,
  JsonValue as CoreJsonValue,
  JsonObject as CoreJsonObject,
  JsonArray as CoreJsonArray,
  JsonPrimitive as CoreJsonPrimitive,
  JsonSchema as CoreJsonSchema,
  JsonSchemaNode as CoreJsonSchemaNode,
  JsonSchemaObject as CoreJsonSchemaObject,
  JsonSchemaString as CoreJsonSchemaString,
  JsonSchemaNumber as CoreJsonSchemaNumber,
  JsonSchemaInteger as CoreJsonSchemaInteger,
  JsonSchemaBoolean as CoreJsonSchemaBoolean,
  JsonSchemaArray as CoreJsonSchemaArray,
  JsonSchemaEnum as CoreJsonSchemaEnum,
} from '../src/index.js';
import type {
  ToolDefinition as SpecToolDefinition,
  ToolCall as SpecToolCall,
  ToolCallId as SpecToolCallId,
  ToolName as SpecToolName,
  ToolResult as SpecToolResult,
  ToolResultOk as SpecToolResultOk,
  ToolResultErr as SpecToolResultErr,
  ToolNameValidationError as SpecToolNameValidationError,
  StopReason as SpecStopReason,
  JsonValue as SpecJsonValue,
  JsonObject as SpecJsonObject,
  JsonArray as SpecJsonArray,
  JsonPrimitive as SpecJsonPrimitive,
  JsonSchema as SpecJsonSchema,
  JsonSchemaNode as SpecJsonSchemaNode,
  JsonSchemaObject as SpecJsonSchemaObject,
  JsonSchemaString as SpecJsonSchemaString,
  JsonSchemaNumber as SpecJsonSchemaNumber,
  JsonSchemaInteger as SpecJsonSchemaInteger,
  JsonSchemaBoolean as SpecJsonSchemaBoolean,
  JsonSchemaArray as SpecJsonSchemaArray,
  JsonSchemaEnum as SpecJsonSchemaEnum,
} from '@crawcus/spec';

// Compile-time bidirectional assignability — if the symbols drift apart,
// `IsEqual` collapses to `never` and the const assignments below fail typecheck.
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : never;

describe('TKT-CORE-REEXPORTS-TOOLSURFACE — tool-use surface re-exports', () => {
  describe('runtime value identity (=== spec source)', () => {
    it('computeJsonHash is the spec function', () => {
      expect(CoreComputeJsonHash).toBe(SpecComputeJsonHash);
    });

    it('validateToolName is the spec function', () => {
      expect(CoreValidateToolName).toBe(SpecValidateToolName);
    });

    it('isValidToolName is the spec function', () => {
      expect(CoreIsValidToolName).toBe(SpecIsValidToolName);
    });

    it('validateJsonSchemaShape is the spec function', () => {
      expect(CoreValidateJsonSchemaShape).toBe(SpecValidateJsonSchemaShape);
    });

    it('STOP_REASONS is the spec constant', () => {
      expect(CoreStopReasons).toBe(SpecStopReasons);
    });

    it('MAX_TOOL_NAME_LENGTH is the spec constant', () => {
      expect(CoreMaxToolNameLength).toBe(SpecMaxToolNameLength);
    });

    it('RESERVED_TOOL_NAME_PREFIXES is the spec constant', () => {
      expect(CoreReservedToolNamePrefixes).toBe(SpecReservedToolNamePrefixes);
    });
  });

  describe('type re-export identity (compile-time assertions)', () => {
    it('all tool-use types match the spec source structurally', () => {
      const _toolDefinition: IsEqual<CoreToolDefinition, SpecToolDefinition> = true;
      const _toolCall: IsEqual<CoreToolCall, SpecToolCall> = true;
      const _toolCallId: IsEqual<CoreToolCallId, SpecToolCallId> = true;
      const _toolName: IsEqual<CoreToolName, SpecToolName> = true;
      const _toolResult: IsEqual<CoreToolResult, SpecToolResult> = true;
      const _toolResultOk: IsEqual<CoreToolResultOk, SpecToolResultOk> = true;
      const _toolResultErr: IsEqual<CoreToolResultErr, SpecToolResultErr> = true;
      const _toolNameValidationError: IsEqual<
        CoreToolNameValidationError,
        SpecToolNameValidationError
      > = true;
      const _stopReason: IsEqual<CoreStopReason, SpecStopReason> = true;
      const _jsonValue: IsEqual<CoreJsonValue, SpecJsonValue> = true;
      const _jsonObject: IsEqual<CoreJsonObject, SpecJsonObject> = true;
      const _jsonArray: IsEqual<CoreJsonArray, SpecJsonArray> = true;
      const _jsonPrimitive: IsEqual<CoreJsonPrimitive, SpecJsonPrimitive> = true;
      const _jsonSchema: IsEqual<CoreJsonSchema, SpecJsonSchema> = true;
      const _jsonSchemaNode: IsEqual<CoreJsonSchemaNode, SpecJsonSchemaNode> = true;
      const _jsonSchemaObject: IsEqual<CoreJsonSchemaObject, SpecJsonSchemaObject> = true;
      const _jsonSchemaString: IsEqual<CoreJsonSchemaString, SpecJsonSchemaString> = true;
      const _jsonSchemaNumber: IsEqual<CoreJsonSchemaNumber, SpecJsonSchemaNumber> = true;
      const _jsonSchemaInteger: IsEqual<CoreJsonSchemaInteger, SpecJsonSchemaInteger> = true;
      const _jsonSchemaBoolean: IsEqual<CoreJsonSchemaBoolean, SpecJsonSchemaBoolean> = true;
      const _jsonSchemaArray: IsEqual<CoreJsonSchemaArray, SpecJsonSchemaArray> = true;
      const _jsonSchemaEnum: IsEqual<CoreJsonSchemaEnum, SpecJsonSchemaEnum> = true;
      // The runtime side just confirms all assignments succeeded.
      expect(
        _toolDefinition &&
          _toolCall &&
          _toolCallId &&
          _toolName &&
          _toolResult &&
          _toolResultOk &&
          _toolResultErr &&
          _toolNameValidationError &&
          _stopReason &&
          _jsonValue &&
          _jsonObject &&
          _jsonArray &&
          _jsonPrimitive &&
          _jsonSchema &&
          _jsonSchemaNode &&
          _jsonSchemaObject &&
          _jsonSchemaString &&
          _jsonSchemaNumber &&
          _jsonSchemaInteger &&
          _jsonSchemaBoolean &&
          _jsonSchemaArray &&
          _jsonSchemaEnum,
      ).toBe(true);
    });
  });
});
