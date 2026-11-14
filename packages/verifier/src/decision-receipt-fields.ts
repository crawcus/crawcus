/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Field rules of draft-gruszka-audit-decision-receipts-05 §3.8, as data:
 * Table 4 (decision receipt predicate) and Table 5 (outcome receipt
 * predicate). `checkFields` walks a value against a rule and returns the
 * first violation by path, or null.
 *
 * A null is refused everywhere a rule does not say `nul: true`, including
 * inside an open object and inside an array of any values (§3.8).
 */

export type Rule =
  | { readonly t: 'str' | 'nestr' | 'ts' | 'digest' | 'typedDigest' | 'bool' | 'ver' | 'int0' | 'any'; readonly req?: boolean; readonly nul?: boolean }
  | { readonly t: 'const' | 'enum'; readonly vals: readonly string[]; readonly req?: boolean; readonly nul?: boolean }
  | { readonly t: 'obj'; readonly m: Readonly<Record<string, Rule>>; readonly req?: boolean; readonly nul?: boolean }
  | { readonly t: 'open'; readonly req?: boolean; readonly nul?: boolean }
  | { readonly t: 'arr'; readonly of: Rule; readonly nonEmpty?: boolean; readonly req?: boolean; readonly nul?: boolean }
  | { readonly t: 'objOrStr'; readonly m: Readonly<Record<string, Rule>>; readonly req?: boolean };

const R = { req: true } as const;
const s: Rule = { t: 'str' };
const sR: Rule = { t: 'str', ...R };
const ne: Rule = { t: 'nestr', ...R };
const ts: Rule = { t: 'ts' };
const dg: Rule = { t: 'digest' };
const dgR: Rule = { t: 'digest', ...R };
const anyArr: Rule = { t: 'arr', of: { t: 'any' } };
const ver: Rule = { t: 'ver', ...R };

/** Table 4. proposedAction note (1) and the per-case rules are checked by the caller. */
export const DECISION_PREDICATE: Rule = {
  t: 'obj',
  ...R,
  m: {
    schemaVersion: ver,
    decisionId: ne,
    decisionType: { t: 'const', vals: ['preActionAuthorization'], ...R },
    decidedAt: { t: 'ts', ...R },
    recordedAt: ts,
    decisionMaker: { t: 'obj', ...R, m: { id: ne, version: { t: 'any', nul: true } } },
    agent: { t: 'obj', ...R, m: { id: ne, version: s, configurationDigest: dg } },
    principal: { t: 'obj', ...R, m: { id: ne, authnContextRef: { t: 'obj', m: { uri: s, digest: dg } } } },
    delegationRefs: anyArr,
    proposedAction: {
      t: 'obj',
      ...R,
      m: {
        actionType: sR,
        target: { t: 'obj', m: { name: s, uri: s, digest: dg } },
        method: s,
        parametersDigest: dg,
        parametersRef: { t: 'open' },
        parametersSchemaRef: { t: 'obj', m: { uri: s, digest: dg } },
      },
    },
    inputSnapshot: { t: 'arr', ...R, of: { t: 'obj', m: { name: s, uri: s, digest: dgR, mediaType: s } } },
    policyBoundary: {
      t: 'obj',
      ...R,
      m: { policyEngine: ne, policyId: ne, decisionPath: ne, policyDigest: dgR, bundleRevision: s, validFrom: ts, validUntil: ts },
    },
    evidenceRefs: {
      t: 'arr',
      ...R,
      of: { t: 'obj', m: { relation: sR, digest: dgR, artifactDigest: dg, uri: s, predicateType: s, typedDigest: { t: 'typedDigest' } } },
    },
    decision: {
      t: 'obj',
      ...R,
      m: {
        verdict: { t: 'enum', vals: ['ALLOW', 'DENY', 'REFUSE', 'ESCALATE', 'DEFER', 'OBSERVE'], ...R },
        reasonCodes: { t: 'arr', of: { t: 'nestr' }, nonEmpty: true, ...R },
        humanReadableSummary: s,
        obligations: anyArr,
        allowedScope: anyArr,
      },
    },
    notChecked: { t: 'arr', ...R, of: { t: 'objOrStr', m: { field: s, reason: s, impact: s } } },
    decisionChangeConditions: {
      t: 'arr',
      ...R,
      of: { t: 'obj', m: { conditionType: s, description: s, requiredEvidenceType: s } },
    },
    actionOutcome: {
      t: 'obj',
      m: {
        status: { t: 'enum', vals: ['notAttempted', 'blocked', 'refused', 'attempted', 'executed', 'failed', 'unknown'] },
        performedAt: { t: 'ts', nul: true },
        outcomeRef: { t: 'obj', nul: true, m: { uri: s, digest: dg } },
      },
    },
    traceContext: { t: 'open' },
    privacy: {
      t: 'obj',
      ...R,
      m: { rawInputsIncluded: { t: 'bool', ...R }, redactionProfile: s, erased: anyArr, masked: anyArr },
    },
    validity: {
      t: 'obj',
      ...R,
      m: { audience: { t: 'arr', of: { t: 'nestr' }, nonEmpty: true, ...R }, nonce: ne, expiresAt: { t: 'ts', ...R } },
    },
  },
};

/** Table 5. */
export const OUTCOME_PREDICATE: Rule = {
  t: 'obj',
  ...R,
  m: {
    schemaVersion: ver,
    outcomeId: ne,
    decisionRef: dgR,
    executor: { t: 'obj', ...R, m: { id: ne, keyId: s } },
    requestedActionDigest: dgR,
    status: { t: 'enum', vals: ['executed', 'refused', 'failed', 'partial'], ...R },
    performedAt: { t: 'ts', ...R },
    effectDigest: dg,
    actualActionDigest: dg,
    responseDigest: dg,
    policyPurpose: { t: 'const', vals: ['outcome'] },
    receiverRefs: {
      t: 'arr',
      of: { t: 'obj', m: { relation: ne, digest: dgR, receiverId: s, receiverKeyId: s, artifactDigest: dg } },
    },
    sequence: { t: 'obj', m: { runId: ne, seq: { t: 'int0', ...R } } },
    recordedAt: ts,
    limitations: { t: 'arr', of: s },
    traceContext: { t: 'obj', m: { traceparent: s } },
    validity: { t: 'obj', m: { audience: anyArr, nonce: s } },
  },
};

const HEX64 = /^[0-9a-f]{64}$/;
const TS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?Z$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An RFC 3339 UTC timestamp with a trailing "Z" whose fields are in range. */
export function isUtcTimestamp(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = TS.exec(v);
  if (m === null) return false;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return mo >= 1 && mo <= 12 && d >= 1 && d <= dim && h <= 23 && mi <= 59 && se <= 60;
}

/** Order key for a valid UTC timestamp: whole seconds, then the fraction padded to nine digits. */
export function timeKey(v: string): bigint {
  const m = TS.exec(v)!;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const secs = BigInt(Date.UTC(y, mo - 1, d, h, mi, 0) / 1000) + BigInt(se);
  const frac = (m[7] ?? '.').slice(1).padEnd(9, '0').slice(0, 9);
  return secs * 1_000_000_000n + BigInt(frac);
}

export function isDigest(v: unknown): v is { sha256: string } {
  return isObj(v) && Object.keys(v).length === 1 && typeof v.sha256 === 'string' && HEX64.test(v.sha256);
}

function noNullInside(v: unknown): boolean {
  if (v === null) return false;
  if (Array.isArray(v)) return v.every(noNullInside);
  if (isObj(v)) return Object.values(v).every(noNullInside);
  return true;
}

/** First violation of `rule` at `path`, or null. The value is present (the caller handles absence). */
export function checkFields(v: unknown, rule: Rule, path: string): string | null {
  if (v === null) return 'nul' in rule && rule.nul === true ? null : `${path} is null`;
  switch (rule.t) {
    case 'str':
      return typeof v === 'string' ? null : `${path} is not a string`;
    case 'nestr':
      return typeof v === 'string' && v.length > 0 ? null : `${path} is not a non-empty string`;
    case 'ts':
      return isUtcTimestamp(v) ? null : `${path} is not an RFC 3339 UTC timestamp ending in Z`;
    case 'digest':
      return isDigest(v) ? null : `${path} is not a digest {sha256: 64 lowercase hex}`;
    case 'typedDigest': {
      if (!isObj(v)) return `${path} is not an object`;
      for (const k of Object.keys(v)) if (!['type', 'digestAlgorithm', 'digest', 'purpose'].includes(k)) return `${path}.${k} is not admitted`;
      if (typeof v.type !== 'string' || v.type.length === 0) return `${path}.type is not a non-empty string`;
      if (v.digestAlgorithm !== 'jcs-sha256-v1') return `${path}.digestAlgorithm is not jcs-sha256-v1`;
      if (typeof v.digest !== 'string' || !HEX64.test(v.digest)) return `${path}.digest is not 64 lowercase hex`;
      if ('purpose' in v && (typeof v.purpose !== 'string' || v.purpose.length === 0)) return `${path}.purpose is not a non-empty string`;
      return null;
    }
    case 'bool':
      return typeof v === 'boolean' ? null : `${path} is not a boolean`;
    case 'ver':
      return typeof v === 'string' && /^0\.1\.[0-9]+$/.test(v) ? null : `${path} is not "0.1." and digits`;
    case 'int0':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? null : `${path} is not an integer >= 0`;
    case 'any':
      return noNullInside(v) ? null : `${path} contains a null`;
    case 'const':
    case 'enum':
      return typeof v === 'string' && rule.vals.includes(v) ? null : `${path} is not one of ${rule.vals.join(', ')}`;
    case 'open':
      return isObj(v) && noNullInside(v) ? null : `${path} is not an object without nulls`;
    case 'arr': {
      if (!Array.isArray(v)) return `${path} is not an array`;
      if (rule.nonEmpty === true && v.length === 0) return `${path} is empty`;
      for (let i = 0; i < v.length; i++) {
        const e = checkFields(v[i], rule.of, `${path}[${i}]`);
        if (e !== null) return e;
      }
      return null;
    }
    case 'objOrStr':
      if (typeof v === 'string') return null;
      return checkMembers(v, rule.m, path);
    case 'obj':
      return checkMembers(v, rule.m, path);
  }
}

function checkMembers(v: unknown, m: Readonly<Record<string, Rule>>, path: string): string | null {
  if (!isObj(v)) return `${path} is not an object`;
  for (const k of Object.keys(v)) if (!Object.prototype.hasOwnProperty.call(m, k)) return `${path}.${k} is not admitted`;
  for (const [k, r] of Object.entries(m)) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) {
      if (r.req === true) return `${path}.${k} is missing`;
      continue;
    }
    const e = checkFields(v[k], r, `${path}.${k}`);
    if (e !== null) return e;
  }
  return null;
}
