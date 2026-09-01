import { canonicalJSON } from '../event/canonical-json.js';
import type { Warrant } from './types.js';

/**
 * # Warrant codec — canonical-form + base64
 *
 * The Warrant signing protocol (Q-CR4 LOCKED, Ed25519):
 *
 *   1. Strip `issuerSignature` from the Warrant.
 *   2. Canonical-JSON the remaining fields per RFC 8785 (sorted
 *      keys, deterministic number encoding).
 *   3. UTF-8 encode the canonical string → message bytes.
 *   4. Issuer signs message bytes with their Ed25519 private key.
 *   5. Verifier reconstructs steps 1-3, then verifies signature
 *      against issuer's trusted public key.
 *
 * The canonical form is deterministic: byte-identical given the same
 * Warrant fields. Auditors recompute it during bundle verification.
 *
 * Base64 codec used because Ed25519 sigs / pubkeys are binary; base64
 * is the cross-platform-safe encoding for JSON wire formats. Uses
 * `btoa` / `atob` (Web Standard, available Node 16+ + all modern
 * browsers).
 */

/**
 * Produce the canonical byte sequence that an issuer signs (or that
 * a verifier checks against) — the Warrant minus its `issuerSignature`,
 * canonical-JSON-encoded per RFC 8785, then UTF-8 encoded.
 *
 * Pure; deterministic; side-effect-free.
 */
export function canonicalWarrantSigningBytes(warrant: Warrant): Uint8Array {
  // Strip the signature field — it's not part of what's signed.
  // (The leading-underscore prefix on `_stripped` satisfies the
  // `argsIgnorePattern: '^_'` ESLint exception for unused destructured
  // properties.)
  const { issuerSignature: _stripped, ...withoutSignature } = warrant;
  const canonical = canonicalJSON(withoutSignature);
  return new TextEncoder().encode(canonical);
}

/**
 * Encode a byte sequence to a base64 string. Cross-platform: uses
 * Web Standard `btoa` (available in Node 16+ + all modern browsers).
 *
 * Throws on input >> 2^32-1 bytes (won't happen with Ed25519 sigs /
 * pubkeys which are 64 / 32 bytes respectively).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string to a byte sequence. Returns `null` on
 * malformed input (rather than throwing) — keeps verify functions
 * total per ratchet #19.
 */
export function base64ToBytes(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}
