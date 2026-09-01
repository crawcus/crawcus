/**
 * Vendor-neutral JSON primitive types.
 *
 * Two shapes:
 *
 * 1. `JsonValue` — the value side. A recursive readonly union covering
 *    every shape `JSON.parse` can produce. Used wherever the spec needs
 *    to carry an arbitrary user-supplied JSON value (tool-call args,
 *    tool results, custom event payloads, etc.) without leaking
 *    `unknown` or `any` into downstream code.
 *
 * 2. `JsonSchema` — the schema side. A **constrained subset** of
 *    JSON Schema draft-2020-12, tight enough that any `AIPort` adapter
 *    can translate it to its provider's tool-schema shape without
 *    custom escape hatches. The full draft permits constructs
 *    (`$dynamicRef`, `unevaluatedProperties`, recursive `$id` re-roots,
 *    multiple top-level types) that no current LLM tool-schema surface
 *    accepts uniformly. The constrained subset here is the intersection
 *    of what providers accept today; the spec deliberately does not
 *    name providers — that knowledge belongs to adapter packages.
 *
 * **Open-source contract:** these types become part of `@crawcus/spec`
 * at Y1 H2. Changes to `JsonValue` are breaking; changes to `JsonSchema`
 * (additions of accepted keywords) are non-breaking only if adapters
 * stay backward-compatible. Removing accepted keywords is breaking.
 */

// ============ JsonValue — runtime values ============

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

// JsonArray is declared as an interface (with empty body) rather than
// a type alias because TypeScript permits self-referential interfaces
// in recursive positions but not the equivalent type alias. The
// upstream eslint rule against empty interfaces does not understand
// this idiom — the disable comment is the documented escape hatch.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface JsonArray extends ReadonlyArray<JsonValue> {}

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

// ============ JsonSchema — constrained draft-2020-12 subset ============

/**
 * Accepted JSON Schema keyword set. The root MUST be a `JsonSchemaObject`
 * (i.e. `type: 'object'`) — every tool-use surface across providers
 * requires the args to be a JSON object, not a bare primitive or array.
 *
 * Nested schemas (inside `properties`, `items`, `oneOf`/`anyOf`/`allOf`)
 * MAY be any `JsonSchemaNode`.
 */
export type JsonSchema = JsonSchemaObject;

export type JsonSchemaNode =
  | JsonSchemaString
  | JsonSchemaNumber
  | JsonSchemaInteger
  | JsonSchemaBoolean
  | JsonSchemaNull
  | JsonSchemaArray
  | JsonSchemaObject
  | JsonSchemaCombinator
  | JsonSchemaEnum
  | JsonSchemaConst;

export interface JsonSchemaCommon {
  readonly title?: string;
  readonly description?: string;
  readonly default?: JsonValue;
  readonly examples?: readonly JsonValue[];
}

export interface JsonSchemaString extends JsonSchemaCommon {
  readonly type: 'string';
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: 'date-time' | 'date' | 'time' | 'email' | 'uri' | 'uuid';
}

export interface JsonSchemaNumber extends JsonSchemaCommon {
  readonly type: 'number';
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly multipleOf?: number;
}

export interface JsonSchemaInteger extends JsonSchemaCommon {
  readonly type: 'integer';
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly multipleOf?: number;
}

export interface JsonSchemaBoolean extends JsonSchemaCommon {
  readonly type: 'boolean';
}

export interface JsonSchemaNull extends JsonSchemaCommon {
  readonly type: 'null';
}

export interface JsonSchemaArray extends JsonSchemaCommon {
  readonly type: 'array';
  readonly items: JsonSchemaNode;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
}

export interface JsonSchemaObject extends JsonSchemaCommon {
  readonly type: 'object';
  readonly properties?: Readonly<Record<string, JsonSchemaNode>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | JsonSchemaNode;
  readonly minProperties?: number;
  readonly maxProperties?: number;
}

/**
 * `enum` and `const` are typed as standalone nodes so they can appear
 * without a `type` keyword (matches draft-2020-12 semantics where the
 * value's shape implies the type).
 */
export interface JsonSchemaEnum extends JsonSchemaCommon {
  readonly enum: readonly JsonValue[];
}

export interface JsonSchemaConst extends JsonSchemaCommon {
  readonly const: JsonValue;
}

export interface JsonSchemaCombinator extends JsonSchemaCommon {
  readonly oneOf?: readonly JsonSchemaNode[];
  readonly anyOf?: readonly JsonSchemaNode[];
  readonly allOf?: readonly JsonSchemaNode[];
}

// ============ Runtime validator for the schema shape itself ============

/**
 * Structural error encountered while validating a `JsonSchema` literal.
 * Path uses JSON Pointer syntax (RFC 6901) — e.g. `/properties/foo/items`.
 */
export interface JsonSchemaShapeError {
  readonly path: string;
  readonly code:
    | 'root-not-object'
    | 'invalid-type-keyword'
    | 'missing-items'
    | 'combinator-empty'
    | 'enum-empty'
    | 'unknown-keyword';
  readonly message: string;
}

const VALID_ROOT_TYPE = 'object';
const VALID_NODE_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'null',
  'array',
  'object',
]);

/**
 * Validates that a candidate value is a well-formed `JsonSchema` per the
 * constrained subset above. Returns the list of structural errors;
 * empty array means valid.
 *
 * This is a **shape** check, not a value check — it asserts that the
 * schema literal is constructed legally, not that any particular value
 * satisfies the schema. Adapters wanting to validate a value against a
 * schema should compose this with a downstream JSON-Schema validator
 * (e.g., Ajv) — keeping that dependency out of `crawcus-spec` itself.
 */
export function validateJsonSchemaShape(candidate: unknown): readonly JsonSchemaShapeError[] {
  const errors: JsonSchemaShapeError[] = [];
  visitRoot(candidate, errors);
  return errors;
}

function visitRoot(candidate: unknown, errors: JsonSchemaShapeError[]): void {
  if (!isJsonObject(candidate)) {
    errors.push({
      path: '',
      code: 'root-not-object',
      message: 'JsonSchema root must be a JSON object',
    });
    return;
  }
  if (candidate.type !== VALID_ROOT_TYPE) {
    errors.push({
      path: '/type',
      code: 'root-not-object',
      message: `JsonSchema root must declare type: 'object' — got ${JSON.stringify(candidate.type)}`,
    });
    return;
  }
  visitNode(candidate, '', errors);
}

function visitNode(node: unknown, path: string, errors: JsonSchemaShapeError[]): void {
  if (!isJsonObject(node)) {
    errors.push({
      path,
      code: 'invalid-type-keyword',
      message: 'Schema node must be a JSON object',
    });
    return;
  }

  const isEnum = 'enum' in node;
  const isConst = 'const' in node;
  const isCombinator =
    Array.isArray(node.oneOf) || Array.isArray(node.anyOf) || Array.isArray(node.allOf);
  const hasType = 'type' in node;

  if (isEnum) {
    if (!Array.isArray(node.enum) || node.enum.length === 0) {
      errors.push({
        path: `${path}/enum`,
        code: 'enum-empty',
        message: 'enum must be a non-empty array',
      });
    }
  }

  if (isCombinator) {
    for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
      const variants = node[key];
      if (variants === undefined) continue;
      if (!Array.isArray(variants) || variants.length === 0) {
        errors.push({
          path: `${path}/${key}`,
          code: 'combinator-empty',
          message: `${key} must be a non-empty array`,
        });
        continue;
      }
      variants.forEach((variant, i) => {
        visitNode(variant, `${path}/${key}/${i}`, errors);
      });
    }
  }

  if (hasType) {
    const t = node.type;
    if (typeof t !== 'string' || !VALID_NODE_TYPES.has(t)) {
      errors.push({
        path: `${path}/type`,
        code: 'invalid-type-keyword',
        message: `type must be one of ${[...VALID_NODE_TYPES].join(', ')} — got ${JSON.stringify(t)}`,
      });
      return;
    }
    if (t === 'array') {
      if (node.items === undefined) {
        errors.push({
          path: `${path}/items`,
          code: 'missing-items',
          message: 'array schema must declare items',
        });
      } else {
        visitNode(node.items, `${path}/items`, errors);
      }
    }
    if (t === 'object' && isJsonObject(node.properties)) {
      for (const [key, child] of Object.entries(node.properties)) {
        visitNode(child, `${path}/properties/${key}`, errors);
      }
    }
  } else if (!isEnum && !isConst && !isCombinator) {
    errors.push({
      path,
      code: 'invalid-type-keyword',
      message: 'Schema node must declare one of: type, enum, const, oneOf/anyOf/allOf',
    });
  }
}

function isJsonObject(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
