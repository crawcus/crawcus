/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encode a CRAWCUS bundle as a SCITT Signed Statement: a tagged
 * COSE_Sign1 (RFC 9052 §4.2) whose protected header carries CWT Claims
 * (label 15, RFC 9597) with `iss` and `sub`, as RFC 9943 §6 requires.
 *
 * Slice 1 scope: EdDSA (ed25519) only, attached payload only. The
 * signature here is integrity only; trust in the issuer key is a
 * separate decision (see the CRAWCUS trust policy).
 */

import { ed25519 } from '@noble/curves/ed25519';
import { decodeCbor, deterministicMap, encodeCbor, Tag } from './cbor.js';
import { ALG, COSE_SIGN1_TAG, CRAWCUS_BUNDLE_CONTENT_TYPE, CWT, HEADER } from './headers.js';

export interface EncodeSignedStatementInput {
  /** Exact bundle bytes (the JCS-canonical JSON CRAWCUS already signs). */
  readonly payload: Uint8Array;
  /** 32-byte ed25519 secret seed. */
  readonly secretKey: Uint8Array;
  /** Key identifier placed in the protected header (label 4). */
  readonly kid: Uint8Array;
  /** CWT `iss`. RFC 9943 requires a tstr; use a URI. */
  readonly iss: string;
  /** CWT `sub`. Groups Statements about one subject. */
  readonly sub: string;
  /** Optional CWT `iat`, seconds since epoch. Self-asserted. */
  readonly iat?: number;
  /** Defaults to the CRAWCUS bundle content type. */
  readonly contentType?: string;
}

export interface DecodedSignedStatement {
  readonly protectedBytes: Uint8Array;
  readonly protectedHeader: Map<number, unknown>;
  readonly unprotectedHeader: Map<number, unknown>;
  readonly payload: Uint8Array | null;
  readonly signature: Uint8Array;
  readonly alg: number;
  readonly kid: Uint8Array;
  readonly contentType: string | undefined;
  readonly iss: string;
  readonly sub: string;
  readonly iat: number | undefined;
}

export type DecodeResult =
  | { readonly kind: 'ok'; readonly statement: DecodedSignedStatement }
  | { readonly kind: 'fail'; readonly detail: string };

export interface VerifyStatementResult {
  readonly verdict: 'pass' | 'fail';
  readonly detail: string;
}

function sigStructure(protectedBytes: Uint8Array, payload: Uint8Array): Uint8Array {
  // Sig_structure = ["Signature1", body_protected, external_aad, payload]
  return encodeCbor(['Signature1', protectedBytes, new Uint8Array(0), payload]);
}

export function encodeSignedStatement(input: EncodeSignedStatementInput): Uint8Array {
  if (input.secretKey.length !== 32) throw new TypeError('secretKey must be a 32-byte ed25519 seed');
  if (input.iss.length < 1 || input.iss.length > 8192) {
    throw new TypeError('iss must be 1..8192 characters (RFC 9943 §6)');
  }
  if (input.sub.length < 1) throw new TypeError('sub must be non-empty');
  if (input.kid.length < 1) throw new TypeError('kid must be non-empty');

  const claims: [number, unknown][] = [
    [CWT.iss, input.iss],
    [CWT.sub, input.sub],
  ];
  if (input.iat !== undefined) {
    if (!Number.isSafeInteger(input.iat) || input.iat < 0) throw new TypeError('iat must be a non-negative integer');
    claims.push([CWT.iat, input.iat]);
  }

  const protectedHeader = deterministicMap([
    [HEADER.alg, ALG.EdDSA],
    [HEADER.contentType, input.contentType ?? CRAWCUS_BUNDLE_CONTENT_TYPE],
    [HEADER.kid, input.kid],
    [HEADER.cwtClaims, deterministicMap(claims)],
  ]);
  const protectedBytes = encodeCbor(protectedHeader);
  const signature = ed25519.sign(sigStructure(protectedBytes, input.payload), input.secretKey);
  return encodeCbor(
    new Tag([protectedBytes, new Map(), input.payload, signature], COSE_SIGN1_TAG),
  );
}

function asBytes(v: unknown): Uint8Array | null {
  return v instanceof Uint8Array ? new Uint8Array(v) : null;
}

export function decodeSignedStatement(bytes: Uint8Array): DecodeResult {
  let top: unknown;
  try {
    top = decodeCbor(bytes);
  } catch (e) {
    return { kind: 'fail', detail: `not valid CBOR: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!(top instanceof Tag) || top.tag !== COSE_SIGN1_TAG) {
    return { kind: 'fail', detail: 'not a tagged COSE_Sign1 (tag 18)' };
  }
  const arr = top.value;
  if (!Array.isArray(arr) || arr.length !== 4) return { kind: 'fail', detail: 'COSE_Sign1 must be a 4-element array' };
  const protectedBytes = asBytes(arr[0]);
  const unprotected = arr[1];
  const payload = arr[2] === null || arr[2] === undefined ? null : asBytes(arr[2]);
  const signature = asBytes(arr[3]);
  if (protectedBytes === null) return { kind: 'fail', detail: 'protected header must be a bstr' };
  if (!(unprotected instanceof Map)) return { kind: 'fail', detail: 'unprotected header must be a map' };
  if (arr[2] !== null && arr[2] !== undefined && payload === null) {
    return { kind: 'fail', detail: 'payload must be a bstr or nil' };
  }
  if (signature === null) return { kind: 'fail', detail: 'signature must be a bstr' };

  let ph: unknown;
  try {
    ph = decodeCbor(protectedBytes);
  } catch {
    return { kind: 'fail', detail: 'protected header is not valid CBOR' };
  }
  if (!(ph instanceof Map)) return { kind: 'fail', detail: 'protected header must decode to a map' };

  const alg = ph.get(HEADER.alg);
  if (typeof alg !== 'number') return { kind: 'fail', detail: 'protected header alg (1) is required' };
  const kid = asBytes(ph.get(HEADER.kid));
  if (kid === null) return { kind: 'fail', detail: 'protected header kid (4) is required (RFC 9943 §6)' };
  const ct = ph.get(HEADER.contentType);
  if (ct !== undefined && typeof ct !== 'string') {
    return { kind: 'fail', detail: 'content type (3) must be a tstr in this profile' };
  }
  const claims = ph.get(HEADER.cwtClaims);
  if (!(claims instanceof Map)) return { kind: 'fail', detail: 'CWT Claims (15) are required in the protected header' };
  const iss = claims.get(CWT.iss);
  const sub = claims.get(CWT.sub);
  if (typeof iss !== 'string' || iss.length < 1 || iss.length > 8192) {
    return { kind: 'fail', detail: 'CWT iss (1) must be a 1..8192 character tstr' };
  }
  if (typeof sub !== 'string' || sub.length < 1) return { kind: 'fail', detail: 'CWT sub (2) must be a non-empty tstr' };
  const iat = claims.get(CWT.iat);
  if (iat !== undefined && typeof iat !== 'number') return { kind: 'fail', detail: 'CWT iat (6) must be a number' };

  return {
    kind: 'ok',
    statement: {
      protectedBytes,
      protectedHeader: ph as Map<number, unknown>,
      unprotectedHeader: unprotected as Map<number, unknown>,
      payload,
      signature,
      alg,
      kid,
      contentType: ct as string | undefined,
      iss,
      sub,
      iat: iat as number | undefined,
    },
  };
}

/**
 * INTEGRITY ONLY. Checks the COSE_Sign1 signature against a public key
 * the caller already chose. It does not decide whether that key is
 * authorised for `iss`; apply a trust policy for that.
 */
export function verifySignedStatementSignature(
  statement: DecodedSignedStatement,
  publicKey: Uint8Array,
  options: { readonly detachedPayload?: Uint8Array } = {},
): VerifyStatementResult {
  if (statement.alg !== ALG.EdDSA) {
    return { verdict: 'fail', detail: `unsupported alg ${String(statement.alg)}; this slice supports EdDSA (-8) only` };
  }
  const payload = statement.payload ?? options.detachedPayload ?? null;
  if (payload === null) return { verdict: 'fail', detail: 'payload is detached and no detachedPayload was supplied' };
  if (statement.payload !== null && options.detachedPayload !== undefined) {
    return { verdict: 'fail', detail: 'payload is attached; do not also supply detachedPayload' };
  }
  if (publicKey.length !== 32) return { verdict: 'fail', detail: 'public key must be 32 bytes' };
  if (statement.signature.length !== 64) return { verdict: 'fail', detail: 'ed25519 signature must be 64 bytes' };
  let ok = false;
  try {
    ok = ed25519.verify(statement.signature, sigStructure(statement.protectedBytes, payload), publicKey);
  } catch {
    ok = false;
  }
  return ok
    ? { verdict: 'pass', detail: 'COSE_Sign1 signature verified (integrity only; issuer trust is evaluated separately)' }
    : { verdict: 'fail', detail: 'COSE_Sign1 signature did not verify' };
}
