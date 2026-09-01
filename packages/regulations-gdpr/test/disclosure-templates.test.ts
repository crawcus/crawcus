/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  gdprArt13,
  gdprArt22,
  isIsoDuration,
  RequiredSectionMissingError,
  type GdprArt13Input,
  type GdprArt22Input,
} from '../src/disclosure-templates/index.js';

describe('@crawcus/regulations-gdpr/disclosure-templates', () => {
  describe('gdprArt13.standardDataSubjectRights', () => {
    it('returns the canonical 7-right list', () => {
      const rights = gdprArt13.standardDataSubjectRights();
      expect(rights).toHaveLength(7);
      const ids = rights.map((r) => r.id);
      expect(ids).toEqual([
        'access',
        'rectification',
        'erasure',
        'restriction',
        'portability',
        'object',
        'automated-decision',
      ]);
    });

    it('cites the source article for each right', () => {
      const rights = gdprArt13.standardDataSubjectRights();
      for (const r of rights) {
        expect(r.article).toMatch(/^Art\. \d+$/);
      }
    });
  });

  describe('gdprArt13.fill — happy path', () => {
    const baseInput: GdprArt13Input = {
      controllerName: 'HumanFirst Foundation',
      controllerContact: 'dpo@humanfirstfoundation.com',
      purposes: ['adult-learner-enrolment', 'ai-mediated-tutoring'],
      legalBasis: {
        'adult-learner-enrolment': 'contract',
        'ai-mediated-tutoring': 'contract',
      },
      retentions: { default: 'P7Y', specialCategory: 'P3Y' },
      recipients: [{ label: 'Anthropic', classification: 'sub-processor', country: 'EU' }],
      rights: gdprArt13.standardDataSubjectRights(),
      supervisoryAuthority: "Information Commissioner's Office (UK)",
    };

    it('renders all required sections in order', () => {
      const out = gdprArt13.fill(baseInput);
      expect(out.regulation).toBe('gdpr@2025-Q1');
      expect(out.article).toBe('Art. 13');
      const headings = out.sections.map((s) => s.heading);
      expect(headings).toEqual([
        '1. Who we are',
        '2. Why we process your data and on what legal basis',
        '3. Who receives your data',
        '4. How long we keep your data',
        '5. Your rights',
        '6. Right to lodge a complaint',
      ]);
    });

    it('renders DPO contact when provided', () => {
      const out = gdprArt13.fill({ ...baseInput, dpoContact: 'dpo@hf.org' });
      const intro = out.sections[0]?.paragraphs.join('\n');
      expect(intro).toContain('Data Protection Officer');
      expect(intro).toContain('dpo@hf.org');
    });

    it('renders "no recipients" language when recipients list is empty', () => {
      const out = gdprArt13.fill({ ...baseInput, recipients: [] });
      const recipientsSection = out.sections.find((s) => s.heading.startsWith('3.'));
      expect(recipientsSection?.paragraphs.join('\n')).toContain('we do not currently share');
    });

    it('renders optional automated-decision-making section when provided', () => {
      const out = gdprArt13.fill({
        ...baseInput,
        automatedDecisionMaking: 'We use a recommender to rank course tracks.',
      });
      expect(out.sections.some((s) => s.heading.includes('Automated decision'))).toBe(true);
    });

    it('renders optional data-provision-requirement section when provided', () => {
      const out = gdprArt13.fill({
        ...baseInput,
        dataProvisionRequirement: 'Provision is contractual; without it we cannot enrol you.',
      });
      expect(out.sections.some((s) => s.heading.includes('required to provide'))).toBe(true);
    });

    it('cites Article 13 throughout', () => {
      const out = gdprArt13.fill(baseInput);
      const allText = out.sections.flatMap((s) => s.paragraphs).join('\n');
      expect(allText).toContain('Article 13(1)(a)');
      expect(allText).toContain('Article 13(1)(c)');
      expect(allText).toContain('Article 13(1)(e)');
      expect(allText).toContain('Article 13(2)(a)');
      expect(allText).toContain('Article 13(2)(b)');
      expect(allText).toContain('Article 13(2)(d)');
    });
  });

  describe('gdprArt13.fill — missing-required-section rejection', () => {
    const baseInput: GdprArt13Input = {
      controllerName: 'HumanFirst Foundation',
      controllerContact: 'dpo@humanfirstfoundation.com',
      purposes: ['enrolment'],
      legalBasis: { enrolment: 'contract' },
      retentions: { default: 'P7Y' },
      recipients: [],
      rights: gdprArt13.standardDataSubjectRights(),
      supervisoryAuthority: 'ICO',
    };

    it('rejects empty controllerName', () => {
      expect(() => gdprArt13.fill({ ...baseInput, controllerName: '' })).toThrow(
        RequiredSectionMissingError,
      );
    });

    it('rejects empty controllerContact', () => {
      expect(() => gdprArt13.fill({ ...baseInput, controllerContact: '' })).toThrow(
        RequiredSectionMissingError,
      );
    });

    it('rejects empty purposes array', () => {
      expect(() => gdprArt13.fill({ ...baseInput, purposes: [] })).toThrow(
        RequiredSectionMissingError,
      );
    });

    it('rejects purpose without a declared lawful basis', () => {
      expect(() =>
        gdprArt13.fill({
          ...baseInput,
          purposes: ['enrolment', 'marketing'],
          legalBasis: { enrolment: 'contract' },
        }),
      ).toThrow(RequiredSectionMissingError);
    });

    it('rejects malformed ISO 8601 retention', () => {
      expect(() =>
        gdprArt13.fill({
          ...baseInput,
          retentions: { default: 'P7Y', specialCategory: '7 years' as 'P7Y' },
        }),
      ).toThrow(RequiredSectionMissingError);
    });

    it('rejects empty rights array', () => {
      expect(() => gdprArt13.fill({ ...baseInput, rights: [] })).toThrow(
        RequiredSectionMissingError,
      );
    });

    it('rejects empty supervisoryAuthority', () => {
      expect(() => gdprArt13.fill({ ...baseInput, supervisoryAuthority: '' })).toThrow(
        RequiredSectionMissingError,
      );
    });

    it('carries article + fieldPath on the error', () => {
      try {
        gdprArt13.fill({ ...baseInput, controllerName: '' });
      } catch (e) {
        expect(e).toBeInstanceOf(RequiredSectionMissingError);
        const err = e as RequiredSectionMissingError;
        expect(err.article).toBe('Art. 13');
        expect(err.fieldPath).toBe('controllerName');
        expect(err.code).toBe('gdpr.disclosure-templates.required-section-missing');
      }
    });
  });

  describe('gdprArt22.fill — happy path', () => {
    const baseInput: GdprArt22Input = {
      decisionDescription: 'Adult-learner course-track recommendation',
      logicSummary: 'Recommender matches goals against anonymised outcomes.',
      significance: 'Recommendation is a suggestion only.',
      envisagedConsequences: 'Pre-fills your enrolment form; you can change any field.',
      art22Basis: 'explicit-consent',
      humanInterventionContact: 'learner-support@humanfirstfoundation.com',
    };

    it('renders all required sections in order', () => {
      const out = gdprArt22.fill(baseInput);
      expect(out.regulation).toBe('gdpr@2025-Q1');
      expect(out.article).toBe('Art. 22');
      const headings = out.sections.map((s) => s.heading);
      expect(headings).toEqual([
        '1. The automated decision-making process',
        '2. The logic involved',
        '3. Significance and envisaged consequences',
        '4. Lawful basis for the automated decision',
        '5. Your right to human intervention, to express your view, and to contest the decision',
      ]);
    });

    it('renders Art. 22(2) basis label correctly for each option', () => {
      for (const basis of [
        'contract-necessity',
        'explicit-consent',
        'union-or-member-state-law',
      ] as const) {
        const out = gdprArt22.fill({ ...baseInput, art22Basis: basis });
        const basisSection = out.sections.find((s) => s.heading.includes('Lawful basis'));
        expect(basisSection?.paragraphs.join('\n')).toContain('Article 22(2)');
      }
    });

    it('renders Art. 9 special-category section when art9Exemption provided', () => {
      const out = gdprArt22.fill({ ...baseInput, art9Exemption: 'art9-2-a' });
      const specialSection = out.sections.find((s) =>
        s.heading.includes('Processing of special-category'),
      );
      expect(specialSection).toBeDefined();
      expect(specialSection?.paragraphs.join('\n')).toContain('Article 22(4)');
      expect(specialSection?.paragraphs.join('\n')).toContain('Article 9(2)(a)');
    });

    it('omits Art. 9 section when art9Exemption not provided', () => {
      const out = gdprArt22.fill(baseInput);
      expect(out.sections.some((s) => s.heading.includes('Processing of special-category'))).toBe(
        false,
      );
    });

    it('cites Article 22 throughout', () => {
      const out = gdprArt22.fill(baseInput);
      const allText = out.sections.flatMap((s) => s.paragraphs).join('\n');
      expect(allText).toContain('Article 22(1)');
      expect(allText).toContain('Article 22(2)');
      expect(allText).toContain('Article 22(3)');
    });
  });

  describe('gdprArt22.fill — missing-required-section rejection', () => {
    const baseInput: GdprArt22Input = {
      decisionDescription: 'Adult-learner course-track recommendation',
      logicSummary: 'Recommender matches goals against anonymised outcomes.',
      significance: 'Recommendation is a suggestion only.',
      envisagedConsequences: 'Pre-fills your enrolment form.',
      art22Basis: 'explicit-consent',
      humanInterventionContact: 'learner-support@hf.org',
    };

    it.each([
      ['decisionDescription', { decisionDescription: '' }],
      ['logicSummary', { logicSummary: '' }],
      ['significance', { significance: '' }],
      ['envisagedConsequences', { envisagedConsequences: '' }],
      ['humanInterventionContact', { humanInterventionContact: '' }],
    ])('rejects empty %s', (_fieldName, override) => {
      expect(() => gdprArt22.fill({ ...baseInput, ...override } as GdprArt22Input)).toThrow(
        RequiredSectionMissingError,
      );
    });
  });

  describe('isIsoDuration', () => {
    it.each(['P7Y', 'P3M', 'P30D', 'P1Y6M', 'PT1H', 'P1Y2M3DT4H5M6S'])('accepts %s', (value) => {
      expect(isIsoDuration(value)).toBe(true);
    });

    it.each(['7 years', '7Y', 'P', '', 'foo'])('rejects %s', (value) => {
      expect(isIsoDuration(value)).toBe(false);
    });
  });
});
