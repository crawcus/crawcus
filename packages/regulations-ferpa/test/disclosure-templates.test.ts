import { describe, it, expect } from 'vitest';
import {
  ferpaAnnualNotice,
  RequiredSectionMissingError,
  type FerpaAnnualNoticeInput,
} from '../src/disclosure-templates/index.js';

describe('@crawcus/regulations-ferpa/disclosure-templates', () => {
  describe('ferpaAnnualNotice.fill — happy path', () => {
    const baseInput: FerpaAnnualNoticeInput = {
      institutionName: 'HumanFirst Academy',
      institutionType: 'postsecondary',
      inspectReviewProcedure: 'Submit a written request to the Registrar.',
      amendmentProcedure: 'Write to the Registrar identifying the change.',
      schoolOfficialDefinition:
        'A school official is a person employed by HumanFirst Academy in an administrative, supervisory, academic, research, or support staff position.',
      legitimateEducationalInterestDefinition:
        'A school official has a legitimate educational interest if the official needs to review an education record in order to fulfil their professional responsibility.',
    };

    it('renders all required sections in order', () => {
      const out = ferpaAnnualNotice.fill(baseInput);
      expect(out.regulation).toBe('ferpa@2024');
      expect(out.article).toBe('§99.7');
      const headings = out.sections.map((s) => s.heading);
      expect(headings).toEqual([
        '1. Your rights under FERPA',
        '2. Right to inspect and review education records',
        '3. Right to request amendment of education records',
        '4. Right to consent to disclosures of personally identifiable information',
        '6. Right to file a complaint with the U.S. Department of Education',
      ]);
    });

    it('uses "eligible students" language for postsecondary institutions', () => {
      const out = ferpaAnnualNotice.fill(baseInput);
      expect(out.sections[0]?.paragraphs[0]).toContain('eligible students');
      expect(out.sections[0]?.paragraphs[0]).not.toContain('parents and eligible students');
    });

    it('uses "parents and eligible students" language for K-12 institutions', () => {
      const out = ferpaAnnualNotice.fill({
        ...baseInput,
        institutionType: 'elementary-secondary',
      });
      expect(out.sections[0]?.paragraphs[0]).toContain('parents and eligible students');
    });

    it('renders directory-information section when categories are provided', () => {
      const out = ferpaAnnualNotice.fill({
        ...baseInput,
        directoryInformationCategories: ['name', 'major field of study', 'dates of attendance'],
        directoryInformationOptOutProcedure:
          'Submit a written opt-out to the Registrar within 14 days of the start of the academic year.',
      });
      const dirSection = out.sections.find((s) => s.heading.includes('Directory information'));
      expect(dirSection).toBeDefined();
      expect(dirSection?.paragraphs.join('\n')).toContain('§99.37');
      expect(dirSection?.paragraphs.join('\n')).toContain('name');
    });

    it('renders effective-date section when provided', () => {
      const out = ferpaAnnualNotice.fill({ ...baseInput, effectiveDate: '2026-09-01' });
      expect(out.sections.some((s) => s.heading.includes('Effective date'))).toBe(true);
    });

    it('cites the FERPA sections throughout', () => {
      const out = ferpaAnnualNotice.fill(baseInput);
      const allText = out.sections.flatMap((s) => s.paragraphs).join('\n');
      expect(allText).toContain('34 CFR §99.7');
      expect(allText).toContain('34 CFR §99.10'); // inspect/review
      expect(allText).toContain('34 CFR §99.20'); // amendment
      expect(allText).toContain('34 CFR §99.30'); // consent
      expect(allText).toContain('34 CFR §99.31'); // exception
      expect(allText).toContain('34 CFR §99.63'); // complaint
    });

    it('inlines the institution-published school-official definition', () => {
      const out = ferpaAnnualNotice.fill(baseInput);
      const consentSection = out.sections.find((s) => s.heading.startsWith('4.'));
      expect(consentSection?.paragraphs.join('\n')).toContain(
        'A school official is a person employed',
      );
    });
  });

  describe('ferpaAnnualNotice.fill — missing-required-section rejection', () => {
    const baseInput: FerpaAnnualNoticeInput = {
      institutionName: 'HumanFirst Academy',
      institutionType: 'postsecondary',
      inspectReviewProcedure: 'Submit a written request to the Registrar.',
      amendmentProcedure: 'Write to the Registrar identifying the change.',
      schoolOfficialDefinition: 'A school official is...',
      legitimateEducationalInterestDefinition: 'A school official has a legitimate interest if...',
    };

    it.each([
      ['institutionName', { institutionName: '' }],
      ['inspectReviewProcedure', { inspectReviewProcedure: '' }],
      ['amendmentProcedure', { amendmentProcedure: '' }],
      ['schoolOfficialDefinition', { schoolOfficialDefinition: '' }],
      ['legitimateEducationalInterestDefinition', { legitimateEducationalInterestDefinition: '' }],
    ])('rejects empty %s', (_fieldName, override) => {
      expect(() =>
        ferpaAnnualNotice.fill({ ...baseInput, ...override } as FerpaAnnualNoticeInput),
      ).toThrow(RequiredSectionMissingError);
    });

    it('rejects directory-info-categories without opt-out procedure', () => {
      expect(() =>
        ferpaAnnualNotice.fill({
          ...baseInput,
          directoryInformationCategories: ['name'],
          // missing directoryInformationOptOutProcedure
        }),
      ).toThrow(RequiredSectionMissingError);
    });

    it('carries article + fieldPath on the error', () => {
      try {
        ferpaAnnualNotice.fill({ ...baseInput, institutionName: '' });
      } catch (e) {
        expect(e).toBeInstanceOf(RequiredSectionMissingError);
        const err = e as RequiredSectionMissingError;
        expect(err.article).toBe('§99.7');
        expect(err.fieldPath).toBe('institutionName');
        expect(err.code).toBe('ferpa.disclosure-templates.required-section-missing');
      }
    });
  });
});
