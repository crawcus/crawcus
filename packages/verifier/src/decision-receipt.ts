/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decision and outcome receipts of draft-gruszka-audit-decision-receipts-05:
 * §3.2 (decision receipt, steps 1–10), §3.3 (checks per case), §3.4
 * (outcome receipt, steps 1–7) and the relying-party consumption check of
 * §4 items 2, 4 and 5.
 *
 * Every refusal names the first check it failed (`at`), in the draft's
 * own terms, so a result can be compared with Appendix A vector by vector.
 * Nothing here reads a clock: the evaluation time T is an input.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import canonicalize from 'canonicalize';
import { preAuthenticationEncoding } from './dsse.js';
import { DECISION_PREDICATE, OUTCOME_PREDICATE, checkFields, isDigest, isUtcTimestamp, timeKey } from './decision-receipt-fields.js';
import { parseStrictJsonBytes } from './strict-json.js';

export const IN_TOTO_PAYLOAD_TYPE = 'application/vnd.in-toto+json';
export const IN_TOTO_STATEMENT_V1 = 'https://in-toto.io/Statement/v1';
export const DECISION_RECEIPT_PREDICATE_TYPE = 'https://b7n0de.com/proofbundle/predicates/decision-receipt/v0.1';
export const OUTCOME_RECEIPT_PREDICATE_TYPE = 'https://b7n0de.com/proofbundle/predicates/action-outcome/v0.1';

/** The first check a receipt failed, in the draft's terms, e.g. "3.2 step 7" or "3.3 case 1". */
export type ReceiptCheck = string;

export type ReceiptFailure = { readonly ok: false; readonly at: ReceiptCheck; readonly detail: string };

export interface VerifiedDecision {
  readonly ok: true;
  /** Content root R = SHA-256(P), lowercase hex. */
  readonly root: string;
  readonly predicate: Readonly<Record<string, unknown>>;
  readonly publicKey: Uint8Array;
}

export interface VerifiedOutcome {
  readonly ok: true;
  readonly root: string;
  readonly predicate: Readonly<Record<string, unknown>>;
}

export type DecisionResult = VerifiedDecision | ReceiptFailure;
export type OutcomeResult = VerifiedOutcome | ReceiptFailure;
export type CheckResult = { readonly ok: true } | ReceiptFailure;

export interface DecisionInputs {
  /** The expected Ed25519 public key (32 bytes). */
  readonly publicKey: Uint8Array;
  /** The decisionMaker.id the trust policy binds to that key (step 8). */
  readonly decisionMakerId: string;
  /** Evaluation time T, an RFC 3339 UTC timestamp. */
  readonly time: string;
  readonly expectedAudience?: string;
  readonly expectedNonce?: string;
  /** Action bytes (step 10), when the relying party holds them. */
  readonly actionBytes?: Uint8Array;
}

export interface OutcomeInputs {
  /** The expected outcome-signing key. */
  readonly publicKey: Uint8Array;
  /** The executor.id the caller expects (§3.1). */
  readonly expectedExecutorId: string;
  /** The executor ids the trust policy lets this key attest (step 5). */
  readonly permittedExecutorIds: readonly string[];
  readonly effectBytes?: Uint8Array;
}

const fail = (at: ReceiptCheck, detail: string): ReceiptFailure => ({ ok: false, at, detail });
const hex = (b: Uint8Array): string => bytesToHex(sha256(b));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const jcs = (v: unknown): string => {
  const out = canonicalize(v);
  if (out === undefined) throw new TypeError('value has no RFC 8785 serialization');
  return out;
};
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Standard-alphabet base64 with canonical padding (RFC 4648 §4), or null. */
function strictBase64(s: string): Uint8Array | null {
  if (!B64.test(s)) return null;
  const b = new Uint8Array(Buffer.from(s, 'base64'));
  return Buffer.from(b).toString('base64') === s ? b : null;
}

type Opened = { readonly ok: true; readonly root: string; readonly statement: Record<string, unknown> } | ReceiptFailure;

/** §3.2 steps 1–5 (and §3.4 step 1): envelope, payload, signature, canonical form, content root. */
function openEnvelope(bytes: Uint8Array, publicKey: Uint8Array, sec: '3.2' | '3.4'): Opened {
  const at = (n: number): string => (sec === '3.2' ? `3.2 step ${n}` : `3.4 step 1 (3.2 step ${n})`);
  const env = parseStrictJsonBytes(bytes);
  if (!env.ok) return fail(at(1), `envelope: ${env.reason}`);
  const e = env.value;
  if (!isObj(e)) return fail(at(1), 'envelope is not a JSON object');
  for (const k of ['payload', 'payloadType', 'signatures']) if (!has(e, k)) return fail(at(1), `envelope has no ${k}`);
  if (e.payloadType !== IN_TOTO_PAYLOAD_TYPE) return fail(at(1), `payloadType is not ${IN_TOTO_PAYLOAD_TYPE}`);
  if (typeof e.payload !== 'string') return fail(at(1), 'payload is not a string');
  if (!Array.isArray(e.signatures)) return fail(at(1), 'signatures is not an array');

  const P = strictBase64(e.payload);
  if (P === null) return fail(at(2), 'payload is not canonical base64');

  const pae = preAuthenticationEncoding(IN_TOTO_PAYLOAD_TYPE, P);
  const verified = e.signatures.some((s) => {
    if (!isObj(s) || typeof s.sig !== 'string') return false;
    const sig = strictBase64(s.sig);
    if (sig === null || sig.length !== 64) return false;
    try {
      return ed25519.verify(sig, pae, publicKey, { zip215: false });
    } catch {
      return false;
    }
  });
  if (!verified) return fail(at(3), 'no signature verifies over PAE under the expected key');

  const p = parseStrictJsonBytes(P);
  if (!p.ok) return fail(at(4), `payload: ${p.reason}`);
  if (!sameBytes(utf8(jcs(p.value)), P)) return fail(at(4), 'payload bytes are not their own RFC 8785 serialization');

  const root = hex(P);
  if (!isObj(p.value)) return fail(sec === '3.2' ? '3.2 step 6' : '3.4 step 2', 'payload is not a Statement object');
  return { ok: true, root, statement: p.value };
}

/** §3.2 step 6 / §3.4 step 2. */
function checkStatement(
  st: Record<string, unknown>,
  predicateType: string,
  at: string,
): ReceiptFailure | { readonly ok: true; readonly predicate: Record<string, unknown> } {
  if (st._type !== IN_TOTO_STATEMENT_V1) return fail(at, `_type is not ${IN_TOTO_STATEMENT_V1}`);
  if (st.predicateType !== predicateType) return fail(at, `predicateType is not ${predicateType}`);
  if (!has(st, 'predicate')) return fail(at, 'Statement has no predicate');
  const subj = st.subject;
  if (!Array.isArray(subj) || subj.length !== 1) return fail(at, 'subject does not contain exactly one entry');
  const d = isObj(subj[0]) && isObj(subj[0].digest) ? subj[0].digest.sha256 : undefined;
  if (d !== hex(utf8(jcs(st.predicate)))) return fail(at, 'subject digest.sha256 is not SHA-256 over JCS(predicate)');
  if (!isObj(st.predicate)) return fail(at, 'predicate is not an object');
  return { ok: true, predicate: st.predicate };
}

/** §3.2, steps 1 to 10. */
export function verifyDecisionReceipt(envelope: Uint8Array, inp: DecisionInputs): DecisionResult {
  if (!isUtcTimestamp(inp.time)) throw new TypeError(`time is not an RFC 3339 UTC timestamp: ${inp.time}`);
  const o = openEnvelope(envelope, inp.publicKey, '3.2');
  if (!o.ok) return o;
  const pred = checkStatement(o.statement, DECISION_RECEIPT_PREDICATE_TYPE, '3.2 step 6');
  if (!pred.ok) return pred;
  const D = pred.predicate;

  const fieldErr = checkFields(D, DECISION_PREDICATE, 'predicate');
  if (fieldErr !== null) return fail('3.2 step 7', fieldErr);
  const pa = D.proposedAction as Record<string, unknown>;
  if (!has(pa, 'parametersDigest') && !has(pa, 'parametersRef')) {
    return fail('3.2 step 7', 'proposedAction carries neither parametersDigest nor parametersRef');
  }

  if ((D.decisionMaker as Record<string, unknown>).id !== inp.decisionMakerId) {
    return fail('3.2 step 8', `decisionMaker.id is not ${inp.decisionMakerId}, the id the trust policy binds to the key`);
  }

  const v = D.validity as { audience: string[]; nonce: string; expiresAt: string };
  const T = timeKey(inp.time);
  if (timeKey(D.decidedAt as string) > T) return fail('3.2 step 9', 'decidedAt is later than T');
  if (!(T < timeKey(v.expiresAt))) return fail('3.2 step 9', 'T is not strictly earlier than validity.expiresAt');
  if (inp.expectedAudience !== undefined && !v.audience.includes(inp.expectedAudience)) {
    return fail('3.2 step 9', `validity.audience does not contain ${inp.expectedAudience}`);
  }
  if (inp.expectedNonce !== undefined && v.nonce !== inp.expectedNonce) return fail('3.2 step 9', 'validity.nonce is not the expected nonce');

  if (inp.actionBytes !== undefined) {
    const pd = pa.parametersDigest as { sha256: string } | undefined;
    if (pd === undefined || hex(inp.actionBytes) !== pd.sha256) {
      return fail('3.2 step 10', 'SHA-256 of the action bytes is not proposedAction.parametersDigest.sha256');
    }
  }
  return { ok: true, root: o.root, predicate: D, publicKey: inp.publicKey };
}

/** §3.3 Case 1: approval. `time` is T. */
export function checkApprovalCase(dec: VerifiedDecision, approvalBytes: Uint8Array, time: string): CheckResult {
  const at = '3.3 case 1';
  const D = dec.predicate;
  const d = D.decision as { verdict: string; reasonCodes: string[] };
  if (d.verdict !== 'ALLOW') return fail(at, 'decision.verdict is not ALLOW');
  if (!d.reasonCodes.includes('user_approval')) return fail(at, 'decision.reasonCodes does not contain user_approval');
  const entries = (D.inputSnapshot as Array<Record<string, unknown>>).filter((x) => x.name === 'approval record');
  if (entries.length !== 1) return fail(at, `inputSnapshot has ${entries.length} entries named "approval record", not exactly one`);
  if (hex(approvalBytes) !== (entries[0]!.digest as { sha256: string }).sha256) return fail(at, 'approval record bytes do not hash to its inputSnapshot digest');
  const p = parseStrictJsonBytes(approvalBytes);
  if (!p.ok) return fail(at, `approval record: ${p.reason}`);
  if (!sameBytes(utf8(jcs(p.value)), approvalBytes)) return fail(at, 'approval record bytes are not their own RFC 8785 serialization');
  const A = p.value;
  if (!isObj(A)) return fail(at, 'approval record is not a JSON object');
  for (const k of ['approvalId', 'approver', 'session']) {
    if (typeof A[k] !== 'string' || (A[k] as string).length === 0) return fail(at, `approval ${k} is not a non-empty string`);
  }
  if (!isDigest(A.actionDigest)) return fail(at, 'approval actionDigest is not a digest');
  const pd = (D.proposedAction as Record<string, unknown>).parametersDigest as { sha256: string } | undefined;
  if (pd === undefined || A.actionDigest.sha256 !== pd.sha256) return fail(at, 'approval actionDigest is not proposedAction.parametersDigest');
  if (A.approver !== (D.principal as { id: string }).id) return fail(at, 'approval approver is not principal.id');
  if (!isUtcTimestamp(A.approvedAt) || !isUtcTimestamp(A.validUntil)) return fail(at, 'approvedAt or validUntil is not an RFC 3339 UTC timestamp');
  const chain = [A.approvedAt, D.decidedAt as string, time];
  for (let i = 1; i < chain.length; i++) {
    if (timeKey(chain[i - 1]!) > timeKey(chain[i]!)) return fail(at, 'approvedAt <= decidedAt <= T does not hold');
  }
  const exp = (D.validity as { expiresAt: string }).expiresAt;
  if (!(timeKey(time) < timeKey(exp))) return fail(at, 'T < validity.expiresAt does not hold');
  if (timeKey(exp) > timeKey(A.validUntil)) return fail(at, 'validity.expiresAt <= approval validUntil does not hold');
  return { ok: true };
}

/** §3.3 Case 2: declined. */
export function checkDeclinedCase(dec: VerifiedDecision): CheckResult {
  const at = '3.3 case 2';
  const verdict = (dec.predicate.decision as { verdict: string }).verdict;
  if (verdict !== 'DENY' && verdict !== 'REFUSE') return fail(at, 'decision.verdict is not DENY or REFUSE');
  const ao = dec.predicate.actionOutcome;
  if (isObj(ao)) {
    if (!['notAttempted', 'blocked', 'refused'].includes(ao.status as string)) return fail(at, 'actionOutcome.status is not notAttempted, blocked or refused');
    if ((ao.performedAt ?? null) !== null || (ao.outcomeRef ?? null) !== null) return fail(at, 'actionOutcome.performedAt or outcomeRef is present');
  }
  return { ok: true };
}

/** §3.4, steps 1 to 7, against a decision that passed §3.2. */
export function verifyOutcomeReceipt(envelope: Uint8Array, dec: VerifiedDecision, inp: OutcomeInputs): OutcomeResult {
  const o = openEnvelope(envelope, inp.publicKey, '3.4');
  if (!o.ok) return o;
  const pred = checkStatement(o.statement, OUTCOME_RECEIPT_PREDICATE_TYPE, '3.4 step 2');
  if (!pred.ok) return pred;
  const Q = pred.predicate;

  const fieldErr = checkFields(Q, OUTCOME_PREDICATE, 'predicate');
  if (fieldErr !== null) return fail('3.4 step 3', fieldErr);

  const D = dec.predicate;
  const pd = (D.proposedAction as Record<string, unknown>).parametersDigest as { sha256: string } | undefined;
  if ((Q.decisionRef as { sha256: string }).sha256 !== dec.root) return fail('3.4 step 4', 'decisionRef.sha256 is not the content root of the decision');
  if (pd === undefined || (Q.requestedActionDigest as { sha256: string }).sha256 !== pd.sha256) {
    return fail('3.4 step 4', 'requestedActionDigest is not the decision parametersDigest');
  }

  const exId = (Q.executor as { id: string }).id;
  if (exId !== inp.expectedExecutorId) return fail('3.4 step 5', `executor.id is not the expected ${inp.expectedExecutorId}`);
  if (!inp.permittedExecutorIds.includes(exId)) return fail('3.4 step 5', 'the trust policy does not let the outcome key attest executor.id');
  if (sameBytes(inp.publicKey, dec.publicKey)) return fail('3.4 step 5', 'the outcome key is the decision key');
  if (exId === (D.decisionMaker as { id: string }).id) return fail('3.4 step 5', 'executor.id is decisionMaker.id');

  if (Q.status === 'executed' && !has(Q, 'effectDigest')) return fail('3.4 step 6', 'status executed without effectDigest');
  if (inp.effectBytes !== undefined) {
    if (!has(Q, 'effectDigest')) return fail('3.4 step 6', 'effect bytes supplied and effectDigest is absent');
    if ((Q.effectDigest as { sha256: string }).sha256 !== hex(inp.effectBytes)) return fail('3.4 step 6', 'SHA-256 of the effect bytes is not effectDigest.sha256');
  }

  const p = timeKey(Q.performedAt as string);
  if (p < timeKey(D.decidedAt as string)) return fail('3.4 step 7', 'performedAt is earlier than decidedAt');
  if (!(p < timeKey((D.validity as { expiresAt: string }).expiresAt))) return fail('3.4 step 7', 'performedAt is not strictly earlier than validity.expiresAt');
  return { ok: true, root: o.root, predicate: Q };
}

/** §3.3 Case 3: executed. The outcome must have status executed and pass §3.4. */
export function checkExecutedCase(dec: VerifiedDecision, outcomeEnvelope: Uint8Array, inp: OutcomeInputs): CheckResult {
  if ((dec.predicate.decision as { verdict: string }).verdict !== 'ALLOW') return fail('3.3 case 3', 'decision.verdict is not ALLOW');
  const r = verifyOutcomeReceipt(outcomeEnvelope, dec, inp);
  if (!r.ok) return r;
  if (r.predicate.status !== 'executed') return fail('3.3 case 3', 'outcome status is not executed');
  return { ok: true };
}

/**
 * §4, for a relying party about to honour an approval. The state is the
 * RFC 8785 bytes of either an array of approval identities, or an object
 * whose members are generations; "current" is the live generation and
 * every other member (rotated, archived, compacted) counts as consumed.
 * An identity is (approvalId, actionDigest, session), never the bytes of
 * one copy of the record (item 2).
 */
export function checkApprovalUnconsumed(approvalBytes: Uint8Array, stateBytes: Uint8Array): CheckResult {
  const a = parseStrictJsonBytes(approvalBytes);
  if (!a.ok || !isObj(a.value) || !isDigest(a.value.actionDigest)) return fail('4 item 2', 'approval record has no identity');
  const id = jcs({ approvalId: a.value.approvalId, actionDigest: a.value.actionDigest, session: a.value.session });
  const s = parseStrictJsonBytes(stateBytes);
  if (!s.ok) return fail('4 item 5', `consumption state is unreadable: ${s.reason}`);
  const ids = (gen: unknown): string[] | null =>
    Array.isArray(gen) && gen.every(isObj)
      ? gen.map((e) => jcs({ approvalId: e.approvalId, actionDigest: e.actionDigest, session: e.session }))
      : null;
  if (Array.isArray(s.value)) {
    const g = ids(s.value);
    if (g === null) return fail('4 item 5', 'consumption state entries are not approval identities');
    return g.includes(id) ? fail('4 item 2', 'this approval identity is already consumed') : { ok: true };
  }
  if (!isObj(s.value)) return fail('4 item 5', 'consumption state is neither an array nor an object of generations');
  for (const [name, gen] of Object.entries(s.value)) {
    const g = ids(gen);
    if (g === null) return fail('4 item 5', `consumption generation ${name} is not an array of approval identities`);
    if (g.includes(id)) {
      return name === 'current'
        ? fail('4 item 2', 'this approval identity is already consumed')
        : fail('4 item 4', `this approval identity is consumed in generation ${name}`);
    }
  }
  return { ok: true };
}
