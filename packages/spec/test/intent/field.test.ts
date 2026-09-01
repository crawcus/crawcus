/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { field } from '../../src/intent/field.js';

describe('field builder — base types', () => {
  it('string() produces a string field, required by default', () => {
    const f = field.string();
    expect(f.base).toBe('string');
    expect(f.metadata.required).toBe(true);
    expect(f.__field).toBe(true);
  });

  it('number() produces a number field', () => {
    expect(field.number().base).toBe('number');
  });

  it('integer() produces an integer field', () => {
    expect(field.integer().base).toBe('integer');
  });

  it('boolean() produces a boolean field', () => {
    expect(field.boolean().base).toBe('boolean');
  });

  it('date() + datetime() produce date fields', () => {
    expect(field.date().base).toBe('date');
    expect(field.datetime().base).toBe('datetime');
  });

  it('enum() captures choices in metadata.options', () => {
    const f = field.enum(['a', 'b', 'c']);
    expect(f.base).toBe('enum');
    expect(f.metadata.options).toEqual(['a', 'b', 'c']);
  });

  it('array() carries inner FieldSpec via .of', () => {
    const inner = field.string();
    const arr = field.array(inner);
    expect(arr.base).toBe('array');
    expect(arr.of?.base).toBe('string');
  });

  it('object() carries shape map', () => {
    const obj = field.object({
      a: field.string(),
      b: field.number(),
    });
    expect(obj.base).toBe('object');
    expect(obj.shape?.a?.base).toBe('string');
    expect(obj.shape?.b?.base).toBe('number');
  });

  it('reference() carries the referenced projection name', () => {
    const ref = field.reference('Course');
    expect(ref.base).toBe('reference');
    expect(ref.references).toBe('Course');
  });

  it('attachment() carries accepted MIME types', () => {
    const att = field.attachment({ mime: ['application/pdf'] });
    expect(att.base).toBe('attachment');
    expect(att.mime).toEqual(['application/pdf']);
  });
});

describe('field builder — chainable metadata', () => {
  it('required() / optional() flip the required flag (immutable)', () => {
    const base = field.string();
    const opt = base.optional();
    expect(base.metadata.required).toBe(true); // unchanged
    expect(opt.metadata.required).toBe(false);
    const req = opt.required();
    expect(req.metadata.required).toBe(true);
  });

  it('askHint / refineHint / label / help / placeholder attach text', () => {
    const f = field
      .string()
      .askHint({ en: 'What?' })
      .refineHint({ en: 'Try again?' })
      .label({ en: 'Title' })
      .help({ en: 'Long help' })
      .placeholder({ en: 'Type here…' });
    expect(f.metadata.askHint).toEqual({ en: 'What?' });
    expect(f.metadata.refineHint).toEqual({ en: 'Try again?' });
    expect(f.metadata.label).toEqual({ en: 'Title' });
    expect(f.metadata.help).toEqual({ en: 'Long help' });
    expect(f.metadata.placeholder).toEqual({ en: 'Type here…' });
  });

  it('dependsOn attaches askability predicate', () => {
    const f = field.string().dependsOn({ when: () => true });
    expect(typeof f.metadata.dependsOn?.when).toBe('function');
  });

  it('askWhen sets priority hint', () => {
    const f = field.string().askWhen({ priority: 'late' });
    expect(f.metadata.askWhen?.priority).toBe('late');
  });

  it('validates attaches predicate', () => {
    const f = field.string().validates((v) => typeof v === 'string');
    expect(typeof f.metadata.validates).toBe('function');
  });

  it('options() lists known-good values', () => {
    const f = field.string().options(['a', 'b']);
    expect(f.metadata.options).toEqual(['a', 'b']);
  });

  it('confidential() flag set', () => {
    const f = field.string().confidential();
    expect(f.metadata.confidential).toBe(true);
  });

  it('chain order doesnt matter; final spec accumulates', () => {
    const a = field.string().required().askHint({ en: 'A' }).confidential();
    const b = field.string().confidential().askHint({ en: 'A' }).required();
    expect(a.metadata.required).toBe(b.metadata.required);
    expect(a.metadata.askHint).toEqual(b.metadata.askHint);
    expect(a.metadata.confidential).toBe(b.metadata.confidential);
  });

  it('builder is immutable — each call returns a new instance', () => {
    const a = field.string();
    const b = a.required();
    expect(a).not.toBe(b);
  });
});

describe('field builder — Contracts (v0.2)', () => {
  it('contract() attaches field-level Contract via __contracts', () => {
    const f = field.string().contract({
      id: 'title-non-empty',
      description: { en: 'must be non-empty' },
      predicate: ({ fieldValue }) => typeof fieldValue === 'string' && fieldValue.trim().length > 0,
    });
    expect(f.__contracts).toHaveLength(1);
    expect(f.__contracts[0]?.id).toBe('title-non-empty');
  });

  it('multiple .contract() calls accumulate', () => {
    const f = field
      .string()
      .contract({
        id: 'c1',
        description: { en: 'c1' },
        predicate: () => true,
      })
      .contract({
        id: 'c2',
        description: { en: 'c2' },
        predicate: () => true,
      });
    expect(f.__contracts).toHaveLength(2);
    expect(f.__contracts.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});
