import { describe, expect, it } from 'vitest';
import { validateJsonSchemaShape } from '../../src/types/json.js';

describe('validateJsonSchemaShape — root', () => {
  it('accepts minimal object schema', () => {
    const errors = validateJsonSchemaShape({ type: 'object' });
    expect(errors).toEqual([]);
  });

  it('rejects non-object root value', () => {
    expect(validateJsonSchemaShape('not-an-object')[0]?.code).toBe('root-not-object');
    expect(validateJsonSchemaShape(null)[0]?.code).toBe('root-not-object');
    expect(validateJsonSchemaShape([])[0]?.code).toBe('root-not-object');
  });

  it('rejects root type other than object', () => {
    expect(validateJsonSchemaShape({ type: 'string' })[0]?.code).toBe('root-not-object');
    expect(validateJsonSchemaShape({ type: 'array', items: { type: 'string' } })[0]?.code).toBe(
      'root-not-object',
    );
  });
});

describe('validateJsonSchemaShape — node types', () => {
  it('accepts every supported leaf type', () => {
    const schema = {
      type: 'object',
      properties: {
        s: { type: 'string' },
        n: { type: 'number' },
        i: { type: 'integer' },
        b: { type: 'boolean' },
        x: { type: 'null' },
      },
    };
    expect(validateJsonSchemaShape(schema)).toEqual([]);
  });

  it('rejects unknown type keyword', () => {
    const errors = validateJsonSchemaShape({
      type: 'object',
      properties: { x: { type: 'bigint' } },
    });
    expect(errors[0]?.code).toBe('invalid-type-keyword');
    expect(errors[0]?.path).toBe('/properties/x/type');
  });

  it('requires items on array node', () => {
    const errors = validateJsonSchemaShape({
      type: 'object',
      properties: { tags: { type: 'array' } },
    });
    expect(errors[0]?.code).toBe('missing-items');
    expect(errors[0]?.path).toBe('/properties/tags/items');
  });

  it('recurses into nested properties', () => {
    const errors = validateJsonSchemaShape({
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: {
            broken: { type: 'not-a-type' },
          },
        },
      },
    });
    expect(errors[0]?.code).toBe('invalid-type-keyword');
    expect(errors[0]?.path).toBe('/properties/nested/properties/broken/type');
  });
});

describe('validateJsonSchemaShape — enum / const / combinators', () => {
  it('accepts enum without type keyword', () => {
    const errors = validateJsonSchemaShape({
      type: 'object',
      properties: { day: { enum: ['mon', 'tue', 'wed'] } },
    });
    expect(errors).toEqual([]);
  });

  it('rejects empty enum', () => {
    const errors = validateJsonSchemaShape({
      type: 'object',
      properties: { x: { enum: [] } },
    });
    expect(errors[0]?.code).toBe('enum-empty');
  });

  it('accepts const without type keyword', () => {
    const errors = validateJsonSchemaShape({
      type: 'object',
      properties: { kind: { const: 'beacon' } },
    });
    expect(errors).toEqual([]);
  });

  it('accepts oneOf with valid branches', () => {
    const errors = validateJsonSchemaShape({
      type: 'object',
      properties: {
        either: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
      },
    });
    expect(errors).toEqual([]);
  });

  it('rejects empty oneOf', () => {
    const errors = validateJsonSchemaShape({
      type: 'object',
      properties: { x: { oneOf: [] } },
    });
    expect(errors[0]?.code).toBe('combinator-empty');
  });
});

describe('validateJsonSchemaShape — realistic tool-args schema', () => {
  it('accepts a complete tool inputSchema', () => {
    const schema = {
      type: 'object',
      properties: {
        courseName: { type: 'string', minLength: 1, maxLength: 200 },
        progressionMode: { enum: ['ai-led', 'human-led', 'hybrid'] },
        targetLevel: { type: 'integer', minimum: 1, maximum: 10 },
        tags: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 20,
        },
        config: {
          type: 'object',
          properties: {
            voiceEnabled: { type: 'boolean' },
          },
        },
      },
      required: ['courseName', 'progressionMode'],
    };
    expect(validateJsonSchemaShape(schema)).toEqual([]);
  });
});
