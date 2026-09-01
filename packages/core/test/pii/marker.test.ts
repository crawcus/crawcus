/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  PII_MARKER_PATTERN,
  makeMarker,
  isMarker,
  extractTokens,
  containsMarker,
} from '../../src/pii/marker.js';
import type { Token } from '@crawcus/spec';

const tok = (s: string): Token => s as Token;

describe('makeMarker / isMarker', () => {
  it('roundtrip: makeMarker output passes isMarker', () => {
    expect(isMarker(makeMarker(tok('abc123')))).toBe(true);
  });

  it('rejects plain text', () => {
    expect(isMarker('hello')).toBe(false);
  });

  it('rejects marker with extra surrounding text', () => {
    expect(isMarker('hi [[pii:abc]] there')).toBe(false);
  });

  it('rejects malformed markers', () => {
    expect(isMarker('[[pii:]]')).toBe(false);
    expect(isMarker('[[pii:abc def]]')).toBe(false);
    expect(isMarker('[pii:abc]')).toBe(false);
  });
});

describe('extractTokens', () => {
  it('extracts a single token', () => {
    expect(extractTokens('My name is [[pii:abc123]] today')).toEqual(['abc123']);
  });

  it('extracts multiple tokens in order', () => {
    expect(extractTokens('[[pii:a]] and [[pii:b]] and [[pii:c]]')).toEqual(['a', 'b', 'c']);
  });

  it('returns empty for text without markers', () => {
    expect(extractTokens('plain text no PII')).toEqual([]);
  });

  it('handles back-to-back markers', () => {
    expect(extractTokens('[[pii:x]][[pii:y]]')).toEqual(['x', 'y']);
  });
});

describe('containsMarker', () => {
  it('detects marker in mixed text', () => {
    expect(containsMarker('hello [[pii:abc]]')).toBe(true);
  });

  it('returns false for marker-free text', () => {
    expect(containsMarker('hello world')).toBe(false);
  });
});

describe('PII_MARKER_PATTERN — regex hygiene', () => {
  it('is global', () => {
    expect(PII_MARKER_PATTERN.flags).toContain('g');
  });
});
