import { ed25519 } from '@noble/curves/ed25519';
import type { Warrant, Signature } from './types.js';
import { canonicalWarrantSigningBytes, bytesToBase64, base64ToBytes } from './codec.js';

/**
 * # Warrant signature — Ed25519 (Q-CR4 LOCKED 2026-05-21)
 *
 * Ed25519 (RFC 8032) chosen for v0.1.0 per Q-CR4: simpler, smaller
 * signatures (64 bytes), no PKI dependency. Sufficient for
 * self-signed + small-issuer-set deployments. X.509 chain support
 * arrives v0.2.0 when Big-4 / Notified Bodies start issuing.
 *
 * Library: `@noble/curves/ed25519` — sibling of `@noble/hashes`
 * (same maintainer, audited, zero-dependency, ~25KB ESM, ships
 * audited code-paths only).
 *
 * Both functions are pure + total per ratchet #19 — `verify` never
 * throws; returns `false` on any malformed input. `sign` accepts a
 * Warrant-without-signature and a 32-byte Ed25519 private key, returns
 * the base64-encoded signature.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8032 Ed25519 spec
 * @see https://github.com/paulmillr/noble-curves @noble/curves
 */

/**
 * Sign a Warrant. The caller supplies the Warrant WITHOUT
 * `issuerSignature` and a 32-byte Ed25519 private key; the function
 * returns the base64-encoded signature, ready to be assigned to
 * `Warrant.issuerSignature` to form the complete Warrant.
 *
 * Issuance is a runtime concern in production (Big-4 / Notified
 * Body / etc. sign Warrants externally) but the spec exposes `sign`
 * for symmetry with `verify`, for TCK fixtures, and for `self`-kind
 * issuers (dev mode + low-risk tenant operations).
 */
export function signWarrant(
  warrant: Omit<Warrant, 'issuerSignature'>,
  privateKey: Uint8Array,
): Signature {
  // Cast through unknown — the canonical-bytes function treats the
  // input as a generic Warrant shape, and we know the caller will
  // assign the result to `issuerSignature` to complete the Warrant.
  // The cast is safe because canonicalWarrantSigningBytes strips
  // the signature field anyway.
  const stub = { ...warrant, issuerSignature: '' as Signature } as Warrant;
  const message = canonicalWarrantSigningBytes(stub);
  const sigBytes = ed25519.sign(message, privateKey);
  return bytesToBase64(sigBytes) as Signature;
}

/**
 * Verify a Warrant's signature against an expected public key.
 *
 * Returns `true` iff:
 *   1. `warrant.issuerSignature` is a valid base64 string of the
 *      expected 64-byte length.
 *   2. `expectedPublicKey` is a valid base64 string of the expected
 *      32-byte length.
 *   3. The Ed25519 verification (over the canonical-bytes of the
 *      Warrant minus its signature) succeeds against the public key.
 *
 * Returns `false` (never throws) on any malformed input — this lets
 * callers (the evaluator) treat malformed signatures and
 * cryptographic-mismatch identically as `'signature-mismatch'`.
 */
export function verifyWarrantSignature(warrant: Warrant, expectedPublicKey: string): boolean {
  const sigBytes = base64ToBytes(warrant.issuerSignature);
  if (sigBytes === null || sigBytes.length !== 64) return false;

  const pubBytes = base64ToBytes(expectedPublicKey);
  if (pubBytes === null || pubBytes.length !== 32) return false;

  try {
    const message = canonicalWarrantSigningBytes(warrant);
    return ed25519.verify(sigBytes, message, pubBytes);
  } catch {
    return false;
  }
}
