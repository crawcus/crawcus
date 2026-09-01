import { describe, expect, it } from 'vitest';
import {
  isValidToolName,
  MAX_TOOL_NAME_LENGTH,
  RESERVED_TOOL_NAME_PREFIXES,
  STOP_REASONS,
  validateToolName,
  type StopReason,
} from '../../src/tool/types.js';

describe('ToolName validation', () => {
  describe('valid names', () => {
    it.each([
      'update-setup',
      'create-course',
      'a',
      'a1',
      'a-b',
      'a-b-c',
      'analyze-call',
      'fetch-2-things',
    ])('accepts %s', (name) => {
      expect(validateToolName(name)).toBeNull();
      expect(isValidToolName(name)).toBe(true);
    });
  });

  describe('format violations', () => {
    it('rejects empty string', () => {
      expect(validateToolName('')).toEqual({ code: 'empty', message: expect.any(String) });
    });

    it('rejects leading uppercase', () => {
      expect(validateToolName('Update-setup')?.code).toBe('invalid-format');
    });

    it('rejects camelCase', () => {
      expect(validateToolName('updateSetup')?.code).toBe('invalid-format');
    });

    it('rejects snake_case', () => {
      expect(validateToolName('update_setup')?.code).toBe('invalid-format');
    });

    it('rejects leading digit', () => {
      expect(validateToolName('1update')?.code).toBe('invalid-format');
    });

    it('rejects leading hyphen', () => {
      expect(validateToolName('-update')?.code).toBe('invalid-format');
    });

    it('rejects trailing hyphen', () => {
      expect(validateToolName('update-')?.code).toBe('invalid-format');
    });

    it('rejects doubled hyphens', () => {
      expect(validateToolName('update--setup')?.code).toBe('invalid-format');
    });

    it('rejects spaces', () => {
      expect(validateToolName('update setup')?.code).toBe('invalid-format');
    });

    it('rejects dots (outside reserved-prefix check)', () => {
      // 'foo.bar' is not reserved-prefix (those are 'crawcus.' / 'tallyseal.')
      // so it falls through to the format check.
      expect(validateToolName('foo.bar')?.code).toBe('invalid-format');
    });
  });

  describe('reserved prefixes', () => {
    it.each(RESERVED_TOOL_NAME_PREFIXES)('rejects %s prefix', (prefix) => {
      expect(validateToolName(`${prefix}whatever`)?.code).toBe('reserved-prefix');
    });

    it('rejects reserved prefix even with valid suffix', () => {
      expect(validateToolName('crawcus.update-setup')?.code).toBe('reserved-prefix');
    });
  });

  describe('length', () => {
    it(`accepts ${MAX_TOOL_NAME_LENGTH}-char name`, () => {
      const name = 'a' + '-b'.repeat((MAX_TOOL_NAME_LENGTH - 1) / 2);
      expect(name.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH);
      expect(validateToolName(name)).toBeNull();
    });

    it(`rejects name longer than ${MAX_TOOL_NAME_LENGTH} chars`, () => {
      const name = 'a' + '-b'.repeat(MAX_TOOL_NAME_LENGTH);
      expect(validateToolName(name)?.code).toBe('too-long');
    });
  });
});

describe('StopReason', () => {
  it('exports an exhaustive value array matching the union', () => {
    expect(STOP_REASONS).toEqual(['end_turn', 'tool_use', 'max_tokens', 'stop_sequence']);
  });

  it('type assignability holds', () => {
    const reasons: readonly StopReason[] = ['end_turn', 'tool_use', 'max_tokens', 'stop_sequence'];
    expect(reasons).toHaveLength(4);
  });
});
