import { describe, it, expect } from 'vitest';
import {
  auditEvaluation,
  disclosureConsent,
  legitimateEducationalInterest,
  researchException,
  schoolOfficial,
} from '../src/99-31.js';
import { evaluateContracts, defineCrawcusSpec, field } from '@crawcus/core';
import type { Event, Intent, Tenant } from '@crawcus/core';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant: Tenant = {
  id: b<string, 'TenantId'>('tnt') as never,
  region: b<string, 'Region'>('us-east-1') as never,
};

const makeIntent = (snapshot: Record<string, unknown>): Intent => ({
  id: b<string, 'IntentId'>('int_t') as never,
  tenantId: tenant.id,
  key: b<string, 'IntentKey'>('ShareTranscript') as never,
  specVersion: 1,
  state: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot,
});

const makeConsentEvent = (purpose: string): Event => ({
  id: b<string, 'EventId'>('evt_c') as never,
  tenantId: tenant.id,
  intentId: b<string, 'IntentId'>('int_t') as never,
  kind: 'ConsentGranted',
  version: 0,
  timestamp: new Date(),
  actor: { id: b<string, 'ActorId'>('act') as never, kind: 'human' },
  lawfulBasis: 'consent',
  purpose: b<string, 'Purpose'>(purpose) as never,
  dataSubjectIds: [],
  prevHash: null,
  contentHash: b<string, 'ContentHash'>('0'.repeat(64)) as never,
  payload: { purpose },
});

const spec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('ShareTranscript') as never,
  projection: b<string, 'ProjectionName'>('Transcript') as never,
  version: 1,
  fields: {
    studentConsentEventId: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      disclosureConsent({
        consentField: 'studentConsentEventId',
        disclosurePurpose: 'transcript-release',
      }),
    ],
  },
});

describe('ferpa.99-31.disclosureConsent', () => {
  it('passes when consent event reference present in snapshot', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ studentConsentEventId: 'evt_consent' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when ConsentGranted event for purpose exists', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [makeConsentEvent('transcript-release')],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when neither consent field nor consent event present', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('carries ferpa citation', () => {
    const c = disclosureConsent({ consentField: 'c', disclosurePurpose: 'x' });
    expect(c.citation?.regulation).toBe('ferpa@2024');
    expect(c.citation?.article).toBe('§99.31');
  });
});

// ============ §99.31(a)(1)(i)(B) — schoolOfficial ============

const viewTranscriptSpecForRole = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('ViewTranscript') as never,
  projection: b<string, 'ProjectionName'>('Transcript') as never,
  version: 1,
  fields: {
    accessorRole: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      schoolOfficial({
        actorRoleField: 'accessorRole',
        schoolOfficialRoles: ['teacher', 'registrar', 'counselor', 'admin'],
      }),
    ],
  },
});

describe('ferpa.99-31.schoolOfficial', () => {
  it('passes when actor role is in the school-official set', () => {
    const results = evaluateContracts({
      spec: viewTranscriptSpecForRole,
      intent: makeIntent({ accessorRole: 'registrar' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when actor role is not in the school-official set', () => {
    const results = evaluateContracts({
      spec: viewTranscriptSpecForRole,
      intent: makeIntent({ accessorRole: 'student-volunteer' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('fails when actor role field is missing', () => {
    const results = evaluateContracts({
      spec: viewTranscriptSpecForRole,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('ferpa.99-31.schoolOfficial');
  });

  it('carries §99.31(a)(1)(i)(B) citation', () => {
    const c = schoolOfficial({ actorRoleField: 'r', schoolOfficialRoles: ['teacher'] });
    expect(c.citation?.regulation).toBe('ferpa@2024');
    expect(c.citation?.article).toBe('§99.31(a)(1)(i)(B)');
  });
});

// ============ §99.31(a)(1)(i)(A) — legitimateEducationalInterest ============

const viewTranscriptSpecForInterest = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('ViewTranscript') as never,
  projection: b<string, 'ProjectionName'>('Transcript') as never,
  version: 1,
  fields: {
    accessJustification: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      legitimateEducationalInterest({
        justificationField: 'accessJustification',
        legitimatePurposes: [
          'academic-advising',
          'grade-entry',
          'transcript-evaluation',
          'disciplinary-review',
        ],
      }),
    ],
  },
});

describe('ferpa.99-31.legitimateEducationalInterest', () => {
  it('passes when justification is in the legitimate-purposes set', () => {
    const results = evaluateContracts({
      spec: viewTranscriptSpecForInterest,
      intent: makeIntent({ accessJustification: 'academic-advising' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when justification is not in the legitimate-purposes set', () => {
    const results = evaluateContracts({
      spec: viewTranscriptSpecForInterest,
      intent: makeIntent({ accessJustification: 'personal-curiosity' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('fails when justification field is missing', () => {
    const results = evaluateContracts({
      spec: viewTranscriptSpecForInterest,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('ferpa.99-31.legitimateEducationalInterest');
  });

  it('carries §99.31(a)(1)(i)(A) citation', () => {
    const c = legitimateEducationalInterest({
      justificationField: 'j',
      legitimatePurposes: ['x'],
    });
    expect(c.citation?.regulation).toBe('ferpa@2024');
    expect(c.citation?.article).toBe('§99.31(a)(1)(i)(A)');
  });
});

// ============ §99.31(a)(1)(ii) — auditEvaluation ============

const discloseToAuditorSpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('DiscloseToAuditor') as never,
  projection: b<string, 'ProjectionName'>('Transcript') as never,
  version: 1,
  fields: {
    requestingAuthority: field.string().optional(),
    disclosurePurpose: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      auditEvaluation({
        authorityField: 'requestingAuthority',
        recognisedAuthorities: [
          'Comptroller General',
          'Secretary of Education',
          'State Education Agency',
          'Local Education Agency',
          'authorised representatives',
        ],
        purposeField: 'disclosurePurpose',
        recognisedPurposes: [
          'state-audit',
          'federal-evaluation',
          'compliance-review',
          'accreditation-review',
        ],
      }),
    ],
  },
});

describe('ferpa.99-31.auditEvaluation', () => {
  it('passes when authority and purpose are both recognised', () => {
    const results = evaluateContracts({
      spec: discloseToAuditorSpec,
      intent: makeIntent({
        requestingAuthority: 'State Education Agency',
        disclosurePurpose: 'state-audit',
      }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when authority is not in the recognised set', () => {
    const results = evaluateContracts({
      spec: discloseToAuditorSpec,
      intent: makeIntent({
        requestingAuthority: 'random-vendor',
        disclosurePurpose: 'state-audit',
      }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('fails when purpose is not in the recognised set', () => {
    const results = evaluateContracts({
      spec: discloseToAuditorSpec,
      intent: makeIntent({
        requestingAuthority: 'State Education Agency',
        disclosurePurpose: 'marketing-research',
      }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('fails when authority field is missing', () => {
    const results = evaluateContracts({
      spec: discloseToAuditorSpec,
      intent: makeIntent({ disclosurePurpose: 'state-audit' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('ferpa.99-31.auditEvaluation');
  });

  it('carries §99.31(a)(1)(ii) citation', () => {
    const c = auditEvaluation({
      authorityField: 'a',
      recognisedAuthorities: ['x'],
      purposeField: 'p',
      recognisedPurposes: ['y'],
    });
    expect(c.citation?.regulation).toBe('ferpa@2024');
    expect(c.citation?.article).toBe('§99.31(a)(1)(ii)');
  });
});

// ============ §99.31(a)(6) — researchException ============

const discloseToResearchPartnerSpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('DiscloseToResearchPartner') as never,
  projection: b<string, 'ProjectionName'>('Transcript') as never,
  version: 1,
  fields: {
    studyPurpose: field.string().optional(),
    researchAgreementId: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      researchException({
        studyPurposeField: 'studyPurpose',
        writtenAgreementField: 'researchAgreementId',
      }),
    ],
  },
});

const discloseToResearchPartnerSpecWithDestruction = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('DiscloseToResearchPartner') as never,
  projection: b<string, 'ProjectionName'>('Transcript') as never,
  version: 1,
  fields: {
    studyPurpose: field.string().optional(),
    researchAgreementId: field.string().optional(),
    destructionCommitment: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      researchException({
        studyPurposeField: 'studyPurpose',
        writtenAgreementField: 'researchAgreementId',
        dataDestructionTimelineField: 'destructionCommitment',
      }),
    ],
  },
});

describe('ferpa.99-31.researchException', () => {
  it('passes when study purpose and written agreement are both present', () => {
    const results = evaluateContracts({
      spec: discloseToResearchPartnerSpec,
      intent: makeIntent({
        studyPurpose: 'improve-instruction',
        researchAgreementId: 'agreement_2026_01',
      }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when study purpose is not in the recognised set', () => {
    const results = evaluateContracts({
      spec: discloseToResearchPartnerSpec,
      intent: makeIntent({
        studyPurpose: 'commercial-marketing',
        researchAgreementId: 'agreement_2026_01',
      }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('fails when written-agreement reference is missing', () => {
    const results = evaluateContracts({
      spec: discloseToResearchPartnerSpec,
      intent: makeIntent({ studyPurpose: 'improve-instruction' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('ferpa.99-31.researchException');
  });

  it('fails when data-destruction-timeline field is configured but missing', () => {
    const results = evaluateContracts({
      spec: discloseToResearchPartnerSpecWithDestruction,
      intent: makeIntent({
        studyPurpose: 'improve-instruction',
        researchAgreementId: 'agreement_2026_01',
      }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('carries §99.31(a)(6) citation', () => {
    const c = researchException({
      studyPurposeField: 'p',
      writtenAgreementField: 'a',
    });
    expect(c.citation?.regulation).toBe('ferpa@2024');
    expect(c.citation?.article).toBe('§99.31(a)(6)');
  });
});
