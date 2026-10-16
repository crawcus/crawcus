/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CRAWCUS_BUNDLE_CONTENT_TYPE,
  decodeSignedStatement,
  encodeSignedStatement,
  verifySignedStatementSignature,
} from '../src/index.js';
import { decodeCbor, encodeCbor, Tag } from '../src/cbor.js';
import { hex, TEST_PAYLOAD, testKey } from './helpers.js';

const ISS = 'https://issuer.example';
const SUB = 'urn:crawcus:intent:i_test';
const IAT = 1786406400;

function build(n = 1, extra: Partial<Parameters<typeof encodeSignedStatement>[0]> = {}): Uint8Array {
  const k = testKey(n);
  return encodeSignedStatement({
    payload: TEST_PAYLOAD,
    secretKey: k.secretKey,
    kid: k.kid,
    iss: ISS,
    sub: SUB,
    iat: IAT,
    ...extra,
  });
}

function decodeOk(bytes: Uint8Array) {
  const r = decodeSignedStatement(bytes);
  if (r.kind !== 'ok') throw new Error(r.detail);
  return r.statement;
}

describe('encodeSignedStatement', () => {
  it('is byte-for-byte deterministic and matches the golden fixture', () => {
    const golden = readFileSync(new URL('./fixtures/signed-statement-ed25519.cbor.hex', import.meta.url), 'utf8').trim();
    expect(hex(build())).toBe(golden);
    expect(hex(build())).toBe(hex(build()));
  });

  it('emits tag 18 and a deterministic protected header (alg, content type, kid, CWT claims)', () => {
    const bytes = build();
    expect(bytes[0]).toBe(0xd2); // tag 18
    const s = decodeOk(bytes);
    expect([...s.protectedHeader.keys()]).toEqual([1, 3, 4, 15]);
    expect(s.alg).toBe(-8);
    expect(s.contentType).toBe(CRAWCUS_BUNDLE_CONTENT_TYPE);
    expect(s.iss).toBe(ISS);
    expect(s.sub).toBe(SUB);
    expect(s.iat).toBe(IAT);
    expect(s.unprotectedHeader.size).toBe(0);
    expect(hex(s.payload ?? new Uint8Array())).toBe(hex(TEST_PAYLOAD));
    // protected header bstr starts with map(4), 1: -8
    expect(hex(s.protectedBytes).slice(0, 6)).toBe('a40127');
  });

  it('rejects bad inputs', () => {
    expect(() => build(1, { iss: '' })).toThrow(/iss/);
    expect(() => build(1, { sub: '' })).toThrow(/sub/);
    expect(() => build(1, { kid: new Uint8Array() })).toThrow(/kid/);
    expect(() => build(1, { secretKey: new Uint8Array(31) })).toThrow(/secretKey/);
    expect(() => build(1, { iat: -1 })).toThrow(/iat/);
  });
});

describe('verifySignedStatementSignature', () => {
  it('passes with the signer key', () => {
    const r = verifySignedStatementSignature(decodeOk(build()), testKey(1).publicKey);
    expect(r.verdict).toBe('pass');
    expect(r.detail).toMatch(/integrity only/);
  });

  it('fails with another key', () => {
    expect(verifySignedStatementSignature(decodeOk(build()), testKey(2).publicKey).verdict).toBe('fail');
  });

  it('fails when the payload is modified', () => {
    const s = decodeOk(build());
    const tampered = { ...s, payload: new TextEncoder().encode('{"tampered":true}') };
    expect(verifySignedStatementSignature(tampered, testKey(1).publicKey).verdict).toBe('fail');
  });

  it('fails when a protected header field is modified', () => {
    const arr = (decodeCbor(build()) as Tag).value as unknown[];
    const ph = decodeCbor(arr[0] as Uint8Array) as Map<number, unknown>;
    (ph.get(15) as Map<number, unknown>).set(2, 'urn:crawcus:intent:other');
    const forged = encodeCbor(new Tag([encodeCbor(ph), new Map(), arr[2], arr[3]], 18));
    expect(verifySignedStatementSignature(decodeOk(forged), testKey(1).publicKey).verdict).toBe('fail');
  });

  it('supports a detached payload', () => {
    const arr = (decodeCbor(build()) as Tag).value as unknown[];
    const detached = encodeCbor(new Tag([arr[0], new Map(), null, arr[3]], 18));
    const s = decodeOk(detached);
    expect(s.payload).toBeNull();
    expect(verifySignedStatementSignature(s, testKey(1).publicKey).verdict).toBe('fail');
    expect(
      verifySignedStatementSignature(s, testKey(1).publicKey, { detachedPayload: TEST_PAYLOAD }).verdict,
    ).toBe('pass');
  });

  it('ignores the unprotected header (Receipts go there, label 394)', () => {
    const arr = (decodeCbor(build()) as Tag).value as unknown[];
    const withReceipts = encodeCbor(new Tag([arr[0], new Map([[394, [new Uint8Array([1])]]]), arr[2], arr[3]], 18));
    expect(verifySignedStatementSignature(decodeOk(withReceipts), testKey(1).publicKey).verdict).toBe('pass');
  });
});

describe('decodeSignedStatement rejects malformed input', () => {
  const cases: [string, unknown][] = [
    ['untagged', [new Uint8Array(), new Map(), null, new Uint8Array()]],
    ['wrong tag', new Tag([new Uint8Array(), new Map(), null, new Uint8Array()], 98)],
    ['3-element array', new Tag([new Uint8Array(), new Map(), null], 18)],
  ];
  for (const [name, value] of cases) {
    it(name, () => expect(decodeSignedStatement(encodeCbor(value)).kind).toBe('fail'));
  }

  it('missing CWT claims', () => {
    const ph = encodeCbor(new Map<number, unknown>([[1, -8], [4, new Uint8Array([1])]]));
    const r = decodeSignedStatement(encodeCbor(new Tag([ph, new Map(), new Uint8Array(), new Uint8Array(64)], 18)));
    expect(r.kind === 'fail' && r.detail).toMatch(/CWT Claims/);
  });

  it('missing sub', () => {
    const ph = encodeCbor(
      new Map<number, unknown>([[1, -8], [4, new Uint8Array([1])], [15, new Map([[1, 'https://issuer.example']])]]),
    );
    const r = decodeSignedStatement(encodeCbor(new Tag([ph, new Map(), new Uint8Array(), new Uint8Array(64)], 18)));
    expect(r.kind === 'fail' && r.detail).toMatch(/sub/);
  });

  it('missing kid', () => {
    const ph = encodeCbor(new Map<number, unknown>([[1, -8], [15, new Map([[1, 'a'], [2, 'b']])]]));
    const r = decodeSignedStatement(encodeCbor(new Tag([ph, new Map(), new Uint8Array(), new Uint8Array(64)], 18)));
    expect(r.kind === 'fail' && r.detail).toMatch(/kid/);
  });

  it('not CBOR', () => {
    expect(decodeSignedStatement(new Uint8Array([0xff, 0xff])).kind).toBe('fail');
  });
});
