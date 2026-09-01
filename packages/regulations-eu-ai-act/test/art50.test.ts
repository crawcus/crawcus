/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  aiInteractionDisclosure,
  syntheticContentMarker,
  emotionRecognitionDisclosure,
  deepFakeDisclosure,
} from '../src/art50.js';
import { evaluateContracts, defineCrawcusSpec, field } from '@crawcus/core';
import type { Event, Intent, Tenant } from '@crawcus/core';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant: Tenant = {
  id: b<string, 'TenantId'>('tnt') as never,
  region: b<string, 'Region'>('eu-west-2') as never,
};

const makeIntent = (snapshot: Record<string, unknown>): Intent => ({
  id: b<string, 'IntentId'>('int_t') as never,
  tenantId: tenant.id,
  key: b<string, 'IntentKey'>('Art50Intent') as never,
  specVersion: 1,
  state: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot,
});

const makeDisclosureEvent = (requirementId: string): Event => ({
  id: b<string, 'EventId'>('evt_d') as never,
  tenantId: tenant.id,
  intentId: b<string, 'IntentId'>('int_t') as never,
  kind: 'DisclosureDelivered',
  version: 0,
  timestamp: new Date(),
  actor: { id: b<string, 'ActorId'>('act') as never, kind: 'system' },
  lawfulBasis: 'legal-obligation',
  purpose: b<string, 'Purpose'>('transparency-notice') as never,
  dataSubjectIds: [],
  prevHash: null,
  contentHash: b<string, 'ContentHash'>('0'.repeat(64)) as never,
  payload: {
    disclosureId: b<string, 'DisclosureId'>('dsc_1') as never,
    subject: b<string, 'SubjectId'>('sub_1') as never,
    requirementId: b<string, 'DisclosureRequirementId'>(requirementId) as never,
    contentHash: b<string, 'ContentHash'>('0'.repeat(64)) as never,
    deliveryMethod: 'in-app',
    locale: 'en',
  },
});

// ============ Art. 50(1) — aiInteractionDisclosure ============

const ART50_1_REQ = 'eu-ai-act.art50-1.ai-interaction';

const chatbotSpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('ChatbotTurn') as never,
  projection: b<string, 'ProjectionName'>('ChatTurn') as never,
  version: 1,
  fields: { aiDisclosureEventId: field.string().optional() },
  readiness: () => true,
  contracts: {
    pre: [
      aiInteractionDisclosure({
        disclosureRequirementId: ART50_1_REQ,
        disclosureField: 'aiDisclosureEventId',
      }),
    ],
  },
});

describe('eu-ai-act.art50.aiInteractionDisclosure', () => {
  it('passes when snapshot carries a disclosure-event reference', () => {
    const results = evaluateContracts({
      spec: chatbotSpec,
      intent: makeIntent({ aiDisclosureEventId: 'evt_prior' }),
      tenant,
      events: [],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when a DisclosureDelivered event for the requirement exists', () => {
    const results = evaluateContracts({
      spec: chatbotSpec,
      intent: makeIntent({}),
      tenant,
      events: [makeDisclosureEvent(ART50_1_REQ)],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when neither snapshot reference nor matching disclosure event present', () => {
    const results = evaluateContracts({
      spec: chatbotSpec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('eu-ai-act.art50.aiInteractionDisclosure');
  });

  it('fails when only a non-matching DisclosureDelivered event is on the log', () => {
    const results = evaluateContracts({
      spec: chatbotSpec,
      intent: makeIntent({}),
      tenant,
      events: [makeDisclosureEvent('some-other-requirement')],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('carries Art. 50(1) citation', () => {
    const c = aiInteractionDisclosure({ disclosureRequirementId: ART50_1_REQ });
    expect(c.citation?.regulation).toBe('eu-ai-act@2026-Q2');
    expect(c.citation?.article).toBe('Art. 50(1)');
  });
});

// ============ Art. 50(2) — syntheticContentMarker ============

const imageGenSpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('GenerateImage') as never,
  projection: b<string, 'ProjectionName'>('Image') as never,
  version: 1,
  fields: { c2paManifestUrl: field.string().optional() },
  readiness: () => true,
  contracts: {
    invariants: [syntheticContentMarker({ markerField: 'c2paManifestUrl' })],
  },
});

describe('eu-ai-act.art50.syntheticContentMarker', () => {
  it('passes when the marker field carries a non-empty value', () => {
    const results = evaluateContracts({
      spec: imageGenSpec,
      intent: makeIntent({ c2paManifestUrl: 'https://example.test/c2pa/abc123.json' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when the marker field is missing entirely', () => {
    const results = evaluateContracts({
      spec: imageGenSpec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('eu-ai-act.art50.syntheticContentMarker');
  });

  it('fails when the marker field is present but empty', () => {
    const results = evaluateContracts({
      spec: imageGenSpec,
      intent: makeIntent({ c2paManifestUrl: '' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('carries Art. 50(2) citation', () => {
    const c = syntheticContentMarker({ markerField: 'x' });
    expect(c.citation?.regulation).toBe('eu-ai-act@2026-Q2');
    expect(c.citation?.article).toBe('Art. 50(2)');
  });
});

// ============ Art. 50(3) — emotionRecognitionDisclosure ============

const ART50_3_REQ = 'eu-ai-act.art50-3.emotion-notice';

const toneSpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('AnalyseTone') as never,
  projection: b<string, 'ProjectionName'>('Tone') as never,
  version: 1,
  fields: { emotionRecognition: field.boolean().optional() },
  readiness: () => true,
  contracts: {
    pre: [
      emotionRecognitionDisclosure({
        triggerField: 'emotionRecognition',
        disclosureRequirementId: ART50_3_REQ,
      }),
    ],
  },
});

describe('eu-ai-act.art50.emotionRecognitionDisclosure', () => {
  it('passes vacuously when the trigger field is absent (out of scope)', () => {
    const results = evaluateContracts({
      spec: toneSpec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when triggered and a matching DisclosureDelivered event exists', () => {
    const results = evaluateContracts({
      spec: toneSpec,
      intent: makeIntent({ emotionRecognition: true }),
      tenant,
      events: [makeDisclosureEvent(ART50_3_REQ)],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when triggered but no matching DisclosureDelivered event present', () => {
    const results = evaluateContracts({
      spec: toneSpec,
      intent: makeIntent({ emotionRecognition: true }),
      tenant,
      events: [],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe(
      'eu-ai-act.art50.emotionRecognitionDisclosure',
    );
  });

  it('carries Art. 50(3) citation', () => {
    const c = emotionRecognitionDisclosure({
      triggerField: 't',
      disclosureRequirementId: ART50_3_REQ,
    });
    expect(c.citation?.regulation).toBe('eu-ai-act@2026-Q2');
    expect(c.citation?.article).toBe('Art. 50(3)');
  });
});

// ============ Art. 50(4) — deepFakeDisclosure ============

const ART50_4_REQ = 'eu-ai-act.art50-4.deepfake-notice';

const deepfakeSpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('PublishGeneratedVideo') as never,
  projection: b<string, 'ProjectionName'>('Video') as never,
  version: 1,
  fields: { deepFakeDisclosureEventId: field.string().optional() },
  readiness: () => true,
  contracts: {
    pre: [
      deepFakeDisclosure({
        disclosureRequirementId: ART50_4_REQ,
        disclosureField: 'deepFakeDisclosureEventId',
      }),
    ],
  },
});

describe('eu-ai-act.art50.deepFakeDisclosure', () => {
  it('passes when snapshot carries a deepfake-disclosure-event reference', () => {
    const results = evaluateContracts({
      spec: deepfakeSpec,
      intent: makeIntent({ deepFakeDisclosureEventId: 'evt_df' }),
      tenant,
      events: [],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when a DisclosureDelivered event for the deepfake requirement exists', () => {
    const results = evaluateContracts({
      spec: deepfakeSpec,
      intent: makeIntent({}),
      tenant,
      events: [makeDisclosureEvent(ART50_4_REQ)],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when neither snapshot reference nor matching disclosure event present (deepfake)', () => {
    const results = evaluateContracts({
      spec: deepfakeSpec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('eu-ai-act.art50.deepFakeDisclosure');
  });

  it('carries Art. 50(4) citation', () => {
    const c = deepFakeDisclosure({ disclosureRequirementId: ART50_4_REQ });
    expect(c.citation?.regulation).toBe('eu-ai-act@2026-Q2');
    expect(c.citation?.article).toBe('Art. 50(4)');
  });
});
