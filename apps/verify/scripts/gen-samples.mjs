/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministically generates the "Try a sample" bundles shipped with
 * crawcus verify. Run: `pnpm --filter @crawcus/verify-app gen:samples`
 * (requires `pnpm build` so workspace dist/ exists).
 *
 * Keys are derived from fixed, PUBLIC seeds — they are demo keys only.
 */
import { writeFileSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalJSON, computeContentHash } from '@crawcus/spec';

const OUT = new URL('../src/samples/', import.meta.url);
const PAYLOAD_TYPE = 'application/vnd.crawcus.foundry-log+jsonl';

const seed = (label) => sha256(new TextEncoder().encode(`crawcus-verify demo key :: ${label}`));
const DEMO_KEY = seed('demo-signer');
const ROGUE_KEY = seed('unknown-signer');

const ROWS = [
  ['CapturedTurn', { note: 'intake form received', regulation: 'GDPR Art. 6(1)(b)' }],
  ['FieldProposed', { field: 'student.gradeLevel', regulation: 'FERPA 34 CFR 99.31' }],
  ['FieldProposed', { field: 'model.riskClass', regulation: 'EU AI Act Art. 12' }],
  ['ProjectionCommit', { projection: 'record.v3', rows: 14 }],
  ['CapturedTurn', { note: 'operator override reviewed', regulation: 'EU AI Act Art. 14' }],
  ['ProjectionCommit', { projection: 'record.v4', rows: 15 }],
  ['DisclosureSignal', { requirementId: 'req_notice_v2', signalType: 'read', contentHash: 'b3f1c0de' }],
  ['ProjectionCommit', { projection: 'record.v5', rows: 15 }],
];

function buildBundle() {
  const events = [];
  let prev = null;
  ROWS.forEach(([kind, payload], i) => {
    const hashable = {
      tenantId: 't_demo',
      intentId: 'i_engagement_0042',
      kind,
      version: i,
      timestamp: new Date(Date.UTC(2026, 9, 14, 9, 12 + i * 7, i * 3)).toISOString(),
      actor: { type: i % 3 === 0 ? 'user' : 'system', id: i % 3 === 0 ? 'u_reviewer' : 'sys_pipeline' },
      lawfulBasis: 'contract',
      purpose: 'service-delivery',
      dataSubjectIds: ['s_demo_001'],
      prevHash: prev,
      payload,
    };
    const contentHash = computeContentHash(hashable);
    events.push({ id: `evt_${String(i).padStart(4, '0')}`, contentHash, ...hashable });
    prev = contentHash;
  });
  const bundle = {
    bundleVersion: '0.1.0',
    generatedAt: '2026-10-14T10:30:00.000Z',
    tenant: { id: 't_demo', region: 'eu-central-1' },
    intent: { id: 'i_engagement_0042', key: 'AuditEngagement' },
    spec: { key: 'AuditEngagement', version: 1, classification: 'unspecified' },
    regulations: ['gdpr', 'ferpa', 'eu-ai-act'],
    events,
    chainProof: {
      intentId: 'i_engagement_0042',
      fromEventId: events[0].id,
      toEventId: events.at(-1).id,
      rootHash: events.at(-1).contentHash,
    },
  };
  bundle.chainProof.bundleSelfHash = bytesToHex(sha256(new TextEncoder().encode(canonicalJSON(bundle))));
  return bundle;
}

function pae(type, body) {
  const enc = new TextEncoder();
  const t = enc.encode(type);
  const head = enc.encode(`DSSEv1 ${t.length} ${type} ${body.length} `);
  const out = new Uint8Array(head.length + body.length);
  out.set(head);
  out.set(body, head.length);
  return out;
}

function sign(bundle, priv) {
  const body = new TextEncoder().encode(canonicalJSON(bundle));
  const pub = ed25519.getPublicKey(priv);
  return {
    payloadType: PAYLOAD_TYPE,
    payload: Buffer.from(body).toString('base64'),
    signatures: [{ keyid: bytesToHex(pub), sig: Buffer.from(ed25519.sign(pae(PAYLOAD_TYPE, body), priv)).toString('base64') }],
  };
}

const good = buildBundle();
const goodEnv = sign(good, DEMO_KEY);

// Tampered: flip one field in row 3 AFTER signing (signature + chain both break).
const tampered = structuredClone(good);
tampered.events[3].payload.rows = 41;
const tamperedEnv = { ...goodEnv, payload: Buffer.from(canonicalJSON(tampered)).toString('base64') };

// Untrusted: cryptographically valid, but signed by a key nobody pinned.
const untrustedEnv = sign(good, ROGUE_KEY);

const write = (name, v) => writeFileSync(new URL(name, OUT), JSON.stringify(v, null, 2) + '\n');
write(`good.dsse.json`, goodEnv);
write(`tampered.dsse.json`, tamperedEnv);
write(`untrusted.dsse.json`, untrustedEnv);
write('demo-anchor.json', { label: 'crawcus demo signer (samples only)', publicKeyHex: bytesToHex(ed25519.getPublicKey(DEMO_KEY)) });
console.log('samples written; self-hash', good.chainProof.bundleSelfHash);
