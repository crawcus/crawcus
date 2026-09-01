/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  euAiActArt50,
  RequiredSectionMissingError,
  type EuAiActArt50Input,
} from '../src/disclosure-templates/index.js';

describe('@crawcus/regulations-eu-ai-act/disclosure-templates', () => {
  describe('euAiActArt50.fill — happy path', () => {
    const baseInput: EuAiActArt50Input = {
      providerName: 'HumanFirst Foundation',
      deployerName: 'HumanFirst Foundation',
      systemDescription: 'AI tutor for adult learners',
      obligations: ['art50-1'],
      userFacingDisclosure:
        'You are interacting with an AI tutor. Responses are generated, not human-authored.',
    };

    it('renders all required sections in order', () => {
      const out = euAiActArt50.fill(baseInput);
      expect(out.regulation).toBe('eu-ai-act@2026-Q2');
      expect(out.article).toBe('Art. 50');
      const headings = out.sections.map((s) => s.heading);
      expect(headings).toEqual([
        '1. The AI system this disclosure covers',
        '2. Transparency obligations satisfied',
        '3. Disclosure to natural persons',
      ]);
    });

    it('cites the chosen Art. 50 obligation labels', () => {
      const out = euAiActArt50.fill({
        ...baseInput,
        obligations: ['art50-1', 'art50-4'],
      });
      const obligationsSection = out.sections.find((s) =>
        s.heading.includes('Transparency obligations'),
      );
      const text = obligationsSection?.paragraphs.join('\n') ?? '';
      expect(text).toContain('Article 50(1)');
      expect(text).toContain('Article 50(4)');
    });

    it('renders provenance-marker section when 50(2) is claimed', () => {
      const out = euAiActArt50.fill({
        ...baseInput,
        obligations: ['art50-2'],
        provenanceMarker: 'https://c2pa.example/manifest/abc123',
      });
      expect(out.sections.some((s) => s.heading.includes('provenance marker'))).toBe(true);
    });

    it('renders derogation section when provided', () => {
      const out = euAiActArt50.fill({
        ...baseInput,
        derogation: 'artistic-work',
      });
      expect(out.sections.some((s) => s.heading.includes('Derogation'))).toBe(true);
    });

    it('renders effective-date section when provided', () => {
      const out = euAiActArt50.fill({ ...baseInput, effectiveDate: '2026-08-01' });
      expect(out.sections.some((s) => s.heading.includes('Effective date'))).toBe(true);
    });

    it('cites Article 50 throughout', () => {
      const out = euAiActArt50.fill(baseInput);
      const allText = out.sections.flatMap((s) => s.paragraphs).join('\n');
      expect(allText).toContain('Article 50');
      expect(allText).toContain('Art. 3(3)'); // provider
      expect(allText).toContain('Art. 3(4)'); // deployer
    });
  });

  describe('euAiActArt50.fill — missing-required-section rejection', () => {
    const baseInput: EuAiActArt50Input = {
      providerName: 'HumanFirst Foundation',
      deployerName: 'HumanFirst Foundation',
      systemDescription: 'AI tutor for adult learners',
      obligations: ['art50-1'],
      userFacingDisclosure: 'You are interacting with an AI tutor.',
    };

    it('rejects empty systemDescription', () => {
      expect(() => euAiActArt50.fill({ ...baseInput, systemDescription: '' })).toThrow(
        RequiredSectionMissingError,
      );
    });

    it('rejects empty userFacingDisclosure', () => {
      expect(() => euAiActArt50.fill({ ...baseInput, userFacingDisclosure: '' })).toThrow(
        RequiredSectionMissingError,
      );
    });

    it('rejects empty obligations array', () => {
      expect(() => euAiActArt50.fill({ ...baseInput, obligations: [] })).toThrow(
        RequiredSectionMissingError,
      );
    });

    it('rejects providerName missing when 50(1) is claimed', () => {
      expect(() =>
        euAiActArt50.fill({ ...baseInput, providerName: '', obligations: ['art50-1'] }),
      ).toThrow(RequiredSectionMissingError);
    });

    it('rejects providerName missing when 50(2) is claimed', () => {
      expect(() =>
        euAiActArt50.fill({
          ...baseInput,
          providerName: '',
          obligations: ['art50-2'],
          provenanceMarker: 'https://c2pa.example/m',
        }),
      ).toThrow(RequiredSectionMissingError);
    });

    it('rejects deployerName missing when 50(3) is claimed', () => {
      expect(() =>
        euAiActArt50.fill({ ...baseInput, deployerName: '', obligations: ['art50-3'] }),
      ).toThrow(RequiredSectionMissingError);
    });

    it('rejects deployerName missing when 50(4) is claimed', () => {
      expect(() =>
        euAiActArt50.fill({ ...baseInput, deployerName: '', obligations: ['art50-4'] }),
      ).toThrow(RequiredSectionMissingError);
    });

    it('rejects 50(2) without provenanceMarker', () => {
      expect(() => euAiActArt50.fill({ ...baseInput, obligations: ['art50-2'] })).toThrow(
        RequiredSectionMissingError,
      );
    });

    it('carries article + fieldPath on the error', () => {
      try {
        euAiActArt50.fill({ ...baseInput, systemDescription: '' });
      } catch (e) {
        expect(e).toBeInstanceOf(RequiredSectionMissingError);
        const err = e as RequiredSectionMissingError;
        expect(err.article).toBe('Art. 50');
        expect(err.fieldPath).toBe('systemDescription');
        expect(err.code).toBe('eu-ai-act.disclosure-templates.required-section-missing');
      }
    });
  });
});
