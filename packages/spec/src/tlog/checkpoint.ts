/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * C2SP tlog-checkpoint as a C2SP signed note.
 *
 * The note text is three lines: origin, tree size, base64 root hash.
 * The prototype signs that text with an Ed25519 note signature
 * (signed-note signature type 0x01). Timestamped cosignatures
 * (types 0x04 and 0x06) are not produced here.
 *
 * Verification ignores signatures from keys the caller did not pass.
 * A signature whose key name and key id match a supplied key, and
 * which does not verify, fails the note.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

const SIGNATURE_TYPE = 0x01;
const EM_DASH = '\u2014';

export interface NoteKey {
  readonly name: string;
  readonly publicKey: Uint8Array;
}

export interface CheckpointBody {
  readonly origin: string;
  readonly size: number;
  readonly rootHash: Uint8Array;
}

export function checkpointNoteText(body: CheckpointBody): string {
  assertOrigin(body.origin);
  if (!Number.isInteger(body.size) || body.size < 0) {
    throw new RangeError('checkpoint size must be a non-negative integer');
  }
  if (body.rootHash.length !== 32) throw new RangeError('checkpoint root must be 32 bytes');
  return `${body.origin}\n${String(body.size)}\n${encodeBase64(body.rootHash)}\n`;
}

export function noteKeyId(name: string, publicKey: Uint8Array): Uint8Array {
  assertOrigin(name);
  if (publicKey.length !== 32) throw new RangeError('ed25519 public key must be 32 bytes');
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(nameBytes.length + 1 + 1 + publicKey.length);
  input.set(nameBytes, 0);
  input[nameBytes.length] = 0x0a;
  input[nameBytes.length + 1] = SIGNATURE_TYPE;
  input.set(publicKey, nameBytes.length + 2);
  return sha256(input).slice(0, 4);
}

export function ed25519PublicKey(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey);
}

export function signCheckpoint(body: CheckpointBody, privateKey: Uint8Array): string {
  const text = checkpointNoteText(body);
  const publicKey = ed25519.getPublicKey(privateKey);
  const keyId = noteKeyId(body.origin, publicKey);
  const signature = ed25519.sign(new TextEncoder().encode(text), privateKey);
  const packed = new Uint8Array(4 + signature.length);
  packed.set(keyId, 0);
  packed.set(signature, 4);
  return `${text}\n${EM_DASH} ${body.origin} ${encodeBase64(packed)}\n`;
}

export type SignedNoteResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Verify a signed note against the supplied keys. At least one
 * supplied key must have a valid signature. Signatures for other
 * keys are ignored.
 */
export function verifySignedNote(signed: string, keys: readonly NoteKey[]): SignedNoteResult {
  const split = splitSignedNote(signed);
  if (split === null) return { ok: false, reason: 'signed note is malformed' };
  const known = new Map<string, NoteKey>();
  for (const key of keys) {
    if (key.publicKey.length !== 32) return { ok: false, reason: 'verifier key is not ed25519' };
    known.set(`${key.name}\n${bytesToHex(noteKeyId(key.name, key.publicKey))}`, key);
  }
  let matched = 0;
  for (const line of split.signatures) {
    const parsed = parseSignatureLine(line);
    if (parsed === null) return { ok: false, reason: 'signature line is malformed' };
    const key = known.get(`${parsed.name}\n${bytesToHex(parsed.keyId)}`);
    if (key === undefined) continue;
    matched += 1;
    const ok = ed25519.verify(parsed.signature, new TextEncoder().encode(split.text), key.publicKey);
    if (!ok) return { ok: false, reason: `signature from ${parsed.name} did not verify` };
  }
  if (matched === 0) return { ok: false, reason: 'no signature from a supplied key verified' };
  return { ok: true, text: split.text };
}

export function parseCheckpointNote(text: string): CheckpointBody | null {
  const lines = text.split('\n');
  if (lines.length < 4 || lines[lines.length - 1] !== '') return null;
  const origin = lines[0];
  const sizeText = lines[1];
  const rootText = lines[2];
  if (origin === undefined || sizeText === undefined || rootText === undefined) return null;
  if (lines.length !== 4) return null;
  if (!isOrigin(origin)) return null;
  if (!/^(0|[1-9][0-9]*)$/.test(sizeText)) return null;
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size)) return null;
  const rootHash = decodeBase64Strict(rootText);
  if (rootHash === null || rootHash.length !== 32) return null;
  return { origin, size, rootHash };
}

export function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function decodeBase64Strict(value: string): Uint8Array | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) return null;
  return new Uint8Array(decoded);
}

function splitSignedNote(signed: string): { text: string; signatures: string[] } | null {
  if (!signed.endsWith('\n') || signed.includes('\u0000')) return null;
  const lines = signed.slice(0, -1).split('\n');
  const signatures: string[] = [];
  let index = lines.length;
  while (index > 0 && isSignatureLine(lines[index - 1] ?? '')) {
    signatures.unshift(lines[index - 1] ?? '');
    index -= 1;
  }
  if (signatures.length === 0 || index === 0 || lines[index - 1] !== '') return null;
  index -= 1;
  return { text: `${lines.slice(0, index).join('\n')}\n`, signatures };
}

function isSignatureLine(line: string): boolean {
  return line.startsWith(`${EM_DASH} `);
}

function parseSignatureLine(line: string): { name: string; keyId: Uint8Array; signature: Uint8Array } | null {
  const match = new RegExp(`^${EM_DASH} ([^\\s+]+) ([A-Za-z0-9+/]+=*)$`).exec(line);
  if (match === null) return null;
  const name = match[1];
  const encoded = match[2];
  if (name === undefined || encoded === undefined || !isOrigin(name)) return null;
  const packed = decodeBase64Strict(encoded);
  if (packed === null || packed.length !== 4 + 64) return null;
  return { name, keyId: packed.slice(0, 4), signature: packed.slice(4) };
}

function assertOrigin(origin: string): void {
  if (!isOrigin(origin)) throw new RangeError('log origin is not a valid note key name');
}

function isOrigin(origin: string): boolean {
  return origin.length > 0 && origin.length <= 253 && /^[^\s+\u0000-\u001f]+$/.test(origin);
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
