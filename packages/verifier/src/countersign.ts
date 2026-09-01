/**
 * Auditor countersign — wrap a `VerifyResult` in a separate DSSE
 * envelope signed by an auditor's ed25519 keypair.
 *
 * Spec sources:
 *   - `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1b-spec.md` §2(b) + §3
 *   - `02-product/crawcus-format.md` §"Wire-format stability — signed bundle (v0.2)"
 *   - Decision-log Q-VERIFIER-CLI-OSS-LOCK + Q-CR9 (open-enum discriminator)
 *
 * Semantics:
 *
 *   - The countersign is a *parallel* DSSE wrap — NOT a modification
 *     of the original audit-bundle envelope. Two envelopes get chained
 *     downstream (audit-bundle envelope ← original signer; verify-
 *     result envelope ← auditor). Each is independently verifiable
 *     against its own pubkey; no mutual-trust required.
 *   - Nested-DSSE-in-DSSE is explicitly ruled out by canon
 *     (`crawcus-format.md:706`). The parallel-wrap pattern preserves
 *     that.
 *   - `payloadType` = `application/vnd.crawcus.verify-result+jsonl`.
 *     This fits the canon open-enum (`application/vnd.crawcus.*+jsonl`
 *     per `crawcus-format.md:669-677`); the spec ticket §3 proposed
 *     `+json` (singular), but the canon family suffix is `+jsonl`.
 *     Surfaced per §7(b) — we adopt `+jsonl` to stay within the
 *     existing open enum rather than require a canon edit; the
 *     VerifyResult is a single canonical-JSON object which is
 *     trivially valid JSONL (one record per line, zero or one lines).
 *   - The signature is over `PAE(payloadType, JCS(VerifyResult))` —
 *     same DSSE PAE convention as the original audit-bundle envelope,
 *     so a downstream verifier can use one PAE implementation for
 *     both envelopes.
 *
 * What this does NOT do (Wave-2):
 *
 *   - Verify a chain of countersigns (no `verifyCountersignChain`)
 *   - Aggregate multiple auditors' signatures
 *   - Revoke keys
 *   - Lookup public keys against a key-transparency log
 *
 * All of the above land with the Wave-2 key-transparency memo
 * (decision-log Q-VERIFIER-CLI-OSS-LOCK "Wave-2 deferrals").
 */

import { ed25519 } from '@noble/curves/ed25519';
import { canonicalJSON, normaliseForCanonical } from '@crawcus/spec';
import { preAuthenticationEncoding } from './dsse.js';
import type { VerifyResult } from './types.js';

/**
 * The countersign envelope's `payloadType` field.
 *
 * Sits inside the canon `application/vnd.crawcus.*+jsonl` family per
 * `crawcus-format.md:669-677` (open enum per Q-CR9 discriminator
 * discipline). New subtype `verify-result` reserved here for Wave-1b.
 */
export const PAYLOAD_TYPE_VERIFY_RESULT = 'application/vnd.crawcus.verify-result+jsonl';

/**
 * Input shape — caller supplies the structured `VerifyResult` and an
 * auditor private key (PKCS#8 PEM or 32 raw bytes).
 */
export interface CountersignInput {
  /** The structured verify result from `verifyBundle()`. */
  readonly result: VerifyResult;
  /**
   * Auditor's ed25519 private key.
   *
   *   - `Uint8Array` of length 32: raw seed bytes.
   *   - `string`: either a 64-char hex seed, OR a PKCS#8 PEM
   *     (`-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----`).
   */
  readonly signerKey: Uint8Array | string;
  /**
   * Optional identifier embedded in the envelope as `signatures[0].keyid`.
   *
   * Default — the hex-encoded ed25519 public key derived from
   * `signerKey`. This mirrors the audit-bundle convention
   * (`dsse.ts#decodeEd25519PublicKey` accepts hex or base64 keyid as
   * the embedded public key bytes).
   */
  readonly signerKeyId?: string;
  /**
   * Optional ISO-8601 timestamp for the `envelopeMetadata.signedAt`
   * field. Default `new Date().toISOString()`. Override for
   * deterministic test snapshots.
   */
  readonly signedAt?: string;
}

/** Output shape — DSSE envelope bytes + a small metadata block. */
export interface CountersignedResult {
  /** The DSSE envelope wrapping JCS-canonicalised `VerifyResult`. */
  readonly envelope: Uint8Array;
  /** Convenience: parsed envelope shape for downstream display. */
  readonly envelopeMetadata: {
    readonly payloadType: typeof PAYLOAD_TYPE_VERIFY_RESULT;
    readonly signerKeyId: string;
    readonly signedAt: string;
  };
}

/**
 * Countersign a verify result.
 *
 * Pure function over the input; no I/O; deterministic with respect to
 * `result + signerKey + signerKeyId + signedAt`.
 *
 * Throws `Error` on malformed `signerKey` — the CLI catches and maps
 * to the usage-error exit code (64). The library API surface
 * deliberately throws rather than returning a result object because
 * a malformed key is a caller bug, not a verification finding.
 */
export function countersignResult(input: CountersignInput): CountersignedResult {
  const privateKey = decodeAuditorPrivateKey(input.signerKey);
  const publicKey = ed25519.getPublicKey(privateKey);
  const keyid = input.signerKeyId ?? bytesToHex(publicKey);
  const signedAt = input.signedAt ?? new Date().toISOString();

  // Build the payload — JCS-canonicalise the VerifyResult so two
  // runs over the same result produce byte-identical signatures.
  const canonicalisedTarget = normaliseForCanonical({ ...input.result, signedAt });
  const canonicalPayload = canonicalJSON(canonicalisedTarget);
  const payloadBytes = new TextEncoder().encode(canonicalPayload);

  // PAE over (payloadType, payload bytes) — same DSSE convention as
  // the audit-bundle envelope so one PAE implementation verifies both.
  const pae = preAuthenticationEncoding(PAYLOAD_TYPE_VERIFY_RESULT, payloadBytes);
  const sigBytes = ed25519.sign(pae, privateKey);

  // Emit envelope JSON in canonical key order (`payloadType`,
  // `payload`, `signatures`) so the envelope itself is JCS-equivalent
  // and reproducible.
  const envelope = {
    payloadType: PAYLOAD_TYPE_VERIFY_RESULT,
    payload: bytesToBase64(payloadBytes),
    signatures: [
      {
        keyid,
        sig: bytesToBase64(sigBytes),
      },
    ],
  };
  const envelopeBytes = new TextEncoder().encode(JSON.stringify(envelope));

  return {
    envelope: envelopeBytes,
    envelopeMetadata: {
      payloadType: PAYLOAD_TYPE_VERIFY_RESULT,
      signerKeyId: keyid,
      signedAt,
    },
  };
}

// ============ Key decoding ============

/**
 * Decode an auditor-provided private-key blob into a raw 32-byte
 * ed25519 seed.
 *
 * Accepts:
 *   - `Uint8Array` of length 32: raw seed bytes (returned as-is).
 *   - `string` (PKCS#8 PEM): the standard `openssl genpkey -algorithm
 *      ed25519 -out auditor-key.pem` output.
 *   - `string` (64-char hex): raw seed bytes hex-encoded.
 *
 * Throws on any other shape — the CLI catches + reports.
 */
export function decodeAuditorPrivateKey(blob: Uint8Array | string): Uint8Array {
  if (blob instanceof Uint8Array) {
    if (blob.length !== 32) {
      throw new Error(`signer key Uint8Array must be 32 bytes (got ${String(blob.length)})`);
    }
    return blob;
  }

  // String — try hex first, then PEM.
  const trimmed = blob.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  if (trimmed.startsWith('-----BEGIN ')) {
    return decodePkcs8EdPrivateKey(trimmed);
  }

  throw new Error('signer key must be a 32-byte Uint8Array, a 64-char hex string, or a PKCS#8 PEM');
}

/**
 * Extract the 32-byte ed25519 seed from a PKCS#8 PEM blob.
 *
 * Format (RFC 8410 §7):
 *   PrivateKeyInfo ::= SEQUENCE {
 *     version                   INTEGER (0),
 *     privateKeyAlgorithm       AlgorithmIdentifier (id-Ed25519 = 1.3.101.112),
 *     privateKey                OCTET STRING (curveSpecific OCTET STRING (seed))
 *   }
 *
 * The canonical ed25519 PKCS#8 DER from `openssl genpkey -algorithm
 * ed25519` is exactly 48 bytes:
 *
 *   30 2e               SEQUENCE 46 bytes
 *      02 01 00         INTEGER 0
 *      30 05            SEQUENCE 5 bytes (algorithm)
 *         06 03 2b 65 70   OID 1.3.101.112 (id-Ed25519)
 *      04 22            OCTET STRING 34 bytes
 *         04 20 <32-byte seed>  (inner OCTET STRING wrapping the seed)
 *
 * This implementation does NOT attempt to parse arbitrary PKCS#8 —
 * it accepts the canonical 48-byte shape (covers `openssl genpkey`
 * + `crypto.generateKeyPairSync('ed25519')`). Other PKCS#8 shapes
 * throw with a clear message; auditors generating keys via
 * non-standard tooling can pre-convert via `openssl pkcs8`.
 */
function decodePkcs8EdPrivateKey(pem: string): Uint8Array {
  const begin = '-----BEGIN PRIVATE KEY-----';
  const end = '-----END PRIVATE KEY-----';
  const beginIdx = pem.indexOf(begin);
  const endIdx = pem.indexOf(end);
  if (beginIdx < 0 || endIdx < 0) {
    throw new Error('PEM blob missing PRIVATE KEY armour');
  }
  const b64 = pem.slice(beginIdx + begin.length, endIdx).replace(/[\r\n\s]/g, '');
  let der: Uint8Array;
  try {
    der = new Uint8Array(Buffer.from(b64, 'base64'));
  } catch (e) {
    throw new Error(`PEM base64 decode failed: ${describe(e)}`);
  }
  if (der.length !== 48) {
    throw new Error(`expected 48-byte canonical ed25519 PKCS#8 DER (got ${String(der.length)})`);
  }
  // Sanity-check the OID + outer/inner OCTET STRING wrappers — fail
  // loudly if the input is some other 48-byte blob.
  // Outer SEQUENCE
  if (der[0] !== 0x30 || der[1] !== 0x2e) {
    throw new Error('PKCS#8 outer SEQUENCE header mismatch');
  }
  // INTEGER 0
  if (der[2] !== 0x02 || der[3] !== 0x01 || der[4] !== 0x00) {
    throw new Error('PKCS#8 version mismatch');
  }
  // AlgorithmIdentifier (SEQUENCE 5 bytes, OID 1.3.101.112)
  if (
    der[5] !== 0x30 ||
    der[6] !== 0x05 ||
    der[7] !== 0x06 ||
    der[8] !== 0x03 ||
    der[9] !== 0x2b ||
    der[10] !== 0x65 ||
    der[11] !== 0x70
  ) {
    throw new Error('PKCS#8 algorithm OID is not id-Ed25519');
  }
  // OCTET STRING 34 bytes, wrapping OCTET STRING 32 bytes
  if (der[12] !== 0x04 || der[13] !== 0x22 || der[14] !== 0x04 || der[15] !== 0x20) {
    throw new Error('PKCS#8 inner OCTET STRING wrapper mismatch');
  }
  return der.slice(16, 48);
}

// ============ Helpers ============

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
