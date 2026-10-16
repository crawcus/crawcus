/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The single keyid derivation used everywhere in CRAWCUS:
 *
 *   keyid = "sha256:" + lowercase hex(SHA-256(raw 32-byte ed25519 public key))
 *
 * The human-facing fingerprint is the same string. Used by
 * `trust-anchors.json` and by `TrustResult.signer.keyFingerprint`.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export const KEYID_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function keyIdFor(rawPublicKey: Uint8Array): string {
  if (rawPublicKey.length !== 32) throw new Error('ed25519 public key must be 32 bytes');
  return `sha256:${bytesToHex(sha256(rawPublicKey))}`;
}

/** DER prefix of an ed25519 SubjectPublicKeyInfo (RFC 8410). */
const ED25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

/** base64 SPKI DER → raw 32-byte key, or null if it is not an ed25519 SPKI. */
export function rawFromSpkiBase64(spki: string): Uint8Array | null {
  if (typeof spki !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(spki) || spki.length > 128) return null;
  const der = new Uint8Array(Buffer.from(spki, 'base64'));
  if (der.length !== 44) return null;
  for (let i = 0; i < ED25519_SPKI_PREFIX.length; i++) if (der[i] !== ED25519_SPKI_PREFIX[i]) return null;
  return der.slice(12);
}

/** Raw 32-byte key → base64 SPKI DER (what Cloud KMS getPublicKey returns, minus PEM armour). */
export function spkiBase64FromRaw(raw: Uint8Array): string {
  if (raw.length !== 32) throw new Error('ed25519 public key must be 32 bytes');
  const der = new Uint8Array(44);
  der.set(ED25519_SPKI_PREFIX, 0);
  der.set(raw, 12);
  return Buffer.from(der).toString('base64');
}
