/**
 * DSSE (Dead Simple Signing Envelope) parsing + Pre-Authentication
 * Encoding (PAE) + ed25519 signature verification.
 *
 * Spec sources:
 *   - DSSE v1: https://github.com/secure-systems-lab/dsse/blob/master/protocol.md
 *   - CRAWCUS embedding: `02-product/crawcus-format.md` §"Wire-format stability — signed bundle (v0.2)"
 *   - Open-Q1 memo: `02-product/q-verifier-cli-oss-lock-open-q1-signed-bundle-wrapper-memo.md`
 *
 * The verifier is a pure function — no network, no key-fetching, no
 * filesystem. The `ed25519.verify` call below operates on bytes
 * supplied by the caller (envelope.signatures[i].sig + the embedded
 * keyid). For Wave-1 the keyid is treated as the public-key bytes
 * (hex- or base64-encoded); Wave-2 introduces the verifier-output
 * signing keypair + key-transparency log per the parent memo.
 */

import { ed25519 } from '@noble/curves/ed25519';
import type {
  ContractViolationKind,
  DsseEnvelope,
  DsseSignature,
  DsseVerifyResult,
} from './types.js';

/**
 * The DSSE-mandated `payloadType` family for CRAWCUS bundles.
 *
 * Per `02-product/crawcus-format.md:667-679` (forward-compat open
 * enum per Q-CR9 discriminator discipline), the verifier accepts the
 * `application/vnd.crawcus.*+jsonl` family. The known Wave-1
 * subtypes are listed below; unknown subtypes pass the envelope
 * check but later checks may report `unknown-subtype` warnings.
 */
export const CRAWCUS_PAYLOAD_TYPE_PREFIX = 'application/vnd.crawcus.';
export const CRAWCUS_PAYLOAD_TYPE_SUFFIX = '+jsonl';

/** Wave-1 canonical subtype — the audit bundle proper. */
export const PAYLOAD_TYPE_AUDIT_BUNDLE = 'application/vnd.crawcus.bundle+jsonl';

/**
 * Subtypes the verifier knows how to introspect in Wave-1. Other
 * `application/vnd.crawcus.*+jsonl` payloads pass the envelope
 * check + the JCS hash equivalence check, but Contract re-evaluation
 * is skipped with an explanatory note.
 */
export const KNOWN_CRAWCUS_SUBTYPES: ReadonlySet<string> = new Set([PAYLOAD_TYPE_AUDIT_BUNDLE]);

/** Returns true iff `payloadType` is in the CRAWCUS family. */
export function isCrawcusPayloadType(payloadType: string): boolean {
  return (
    payloadType.startsWith(CRAWCUS_PAYLOAD_TYPE_PREFIX) &&
    payloadType.endsWith(CRAWCUS_PAYLOAD_TYPE_SUFFIX)
  );
}

/**
 * Parsed-envelope failure result. Returned by `parseDsseEnvelope` on
 * malformed input; the verifier surfaces this as the `dsse.envelope.shape`
 * check with `violationKind: 'Envelope.shape.invalid'`.
 */
export interface DsseParseError {
  readonly kind: 'parse-error';
  readonly violationKind: ContractViolationKind;
  readonly reason: string;
}

export type DsseParseResult =
  | { readonly kind: 'ok'; readonly envelope: DsseEnvelope }
  | DsseParseError;

/**
 * Parse the bundle bytes into a DSSE envelope. Validates the shape
 * (every field present + correct type) but does NOT verify
 * signatures — that's a separate pure check.
 *
 * Spec §5 row 1 (`Envelope.shape.invalid`).
 */
export function parseDsseEnvelope(bytes: Uint8Array): DsseParseResult {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    return {
      kind: 'parse-error',
      violationKind: 'Envelope.shape.invalid',
      reason: `envelope bytes are not valid UTF-8: ${describe(e)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      kind: 'parse-error',
      violationKind: 'Envelope.shape.invalid',
      reason: `envelope is not valid JSON: ${describe(e)}`,
    };
  }

  if (!isObject(parsed)) {
    return {
      kind: 'parse-error',
      violationKind: 'Envelope.shape.invalid',
      reason: 'envelope is not a JSON object',
    };
  }

  const payloadType = parsed['payloadType'];
  if (typeof payloadType !== 'string' || payloadType.length === 0) {
    return {
      kind: 'parse-error',
      violationKind: 'Envelope.shape.invalid',
      reason: `envelope.payloadType missing or not a non-empty string`,
    };
  }

  const payload = parsed['payload'];
  if (typeof payload !== 'string') {
    return {
      kind: 'parse-error',
      violationKind: 'Envelope.shape.invalid',
      reason: `envelope.payload missing or not a string`,
    };
  }

  const signaturesRaw = parsed['signatures'];
  if (!Array.isArray(signaturesRaw) || signaturesRaw.length === 0) {
    return {
      kind: 'parse-error',
      violationKind: 'Envelope.shape.invalid',
      reason: `envelope.signatures must be a non-empty array`,
    };
  }

  const signatures: DsseSignature[] = [];
  for (let i = 0; i < signaturesRaw.length; i++) {
    const sig = signaturesRaw[i];
    if (!isObject(sig)) {
      return {
        kind: 'parse-error',
        violationKind: 'Envelope.shape.invalid',
        reason: `envelope.signatures[${String(i)}] is not an object`,
      };
    }
    const keyid = sig['keyid'];
    const sigBytes = sig['sig'];
    if (typeof keyid !== 'string' || keyid.length === 0) {
      return {
        kind: 'parse-error',
        violationKind: 'Envelope.shape.invalid',
        reason: `envelope.signatures[${String(i)}].keyid missing or empty`,
      };
    }
    if (typeof sigBytes !== 'string' || sigBytes.length === 0) {
      return {
        kind: 'parse-error',
        violationKind: 'Envelope.shape.invalid',
        reason: `envelope.signatures[${String(i)}].sig missing or empty`,
      };
    }
    signatures.push({ keyid, sig: sigBytes });
  }

  return {
    kind: 'ok',
    envelope: { payloadType, payload, signatures },
  };
}

/**
 * DSSE Pre-Authentication Encoding (PAE).
 *
 *   PAE(type, payload) = "DSSEv1" + SP + LEN(type) + SP + type + SP + LEN(payload) + SP + payload
 *
 * Where `LEN` is the ASCII-encoded decimal length-in-bytes of the
 * UTF-8 encoding of `type` (resp. the raw payload bytes), and `SP`
 * is a single ASCII space (0x20).
 *
 * Per Open-Q1 memo §"The DSSE PAE invariant": the signature is over
 * the bytes of PAE(payloadType, decoded(payload)) — `payload` is the
 * raw JCS-canonical bytes, NOT base64.
 *
 * This function is exported for cross-vendor interop tests (cosign,
 * SLSA verifier) — both produce the same PAE for the same inputs.
 */
export function preAuthenticationEncoding(payloadType: string, payload: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(payloadType);
  const header = `DSSEv1 ${String(typeBytes.length)} `;
  const sep = ` ${String(payload.length)} `;
  const headerBytes = new TextEncoder().encode(header);
  const sepBytes = new TextEncoder().encode(sep);
  const out = new Uint8Array(
    headerBytes.length + typeBytes.length + sepBytes.length + payload.length,
  );
  let offset = 0;
  out.set(headerBytes, offset);
  offset += headerBytes.length;
  out.set(typeBytes, offset);
  offset += typeBytes.length;
  out.set(sepBytes, offset);
  offset += sepBytes.length;
  out.set(payload, offset);
  return out;
}

/**
 * Base64-decode the DSSE `payload` field (per RFC 4648 §4 standard
 * alphabet). Returns the raw JCS-canonical bytes hash-identical to
 * the original (per Open-Q1 memo §"Base64-lossless guarantee").
 */
export function decodeBase64Payload(base64: string): Uint8Array {
  // Use Node's Buffer for performance + correctness. The verifier
  // already requires Node ≥22; no browser-runtime constraint.
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Decode a base64 signature into raw bytes.
 *
 * DSSE signatures are base64-encoded per the envelope shape.
 */
export function decodeBase64Signature(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Decode an ed25519 public key from a `keyid` field.
 *
 * Wave-1 accepts the keyid as either:
 *   - 64 hex characters (32-byte raw ed25519 public key, hex-encoded), OR
 *   - 44 base64 characters (32-byte raw ed25519 public key, base64-encoded).
 *
 * Returns `null` if the keyid cannot be decoded to 32 raw bytes; the
 * verifier surfaces this as `Envelope.signature.invalid`.
 *
 * Wave-2 introduces a key-transparency-log lookup; Wave-1 trusts the
 * embedded keyid directly because the verifier-output countersign
 * flow is a Wave-1b deliverable.
 */
export function decodeEd25519PublicKey(keyid: string): Uint8Array | null {
  // Hex form first (most common in supply-chain attestations).
  if (/^[0-9a-fA-F]{64}$/.test(keyid)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(keyid.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  // Base64 fallback (length 44 with one `=` padding).
  if (/^[A-Za-z0-9+/]{43}=?$/.test(keyid)) {
    const raw = new Uint8Array(Buffer.from(keyid, 'base64'));
    return raw.length === 32 ? raw : null;
  }

  return null;
}

/**
 * Verify the DSSE envelope's first signature against the embedded
 * keyid. Spec §5 row 2 (`Envelope.signature.invalid`).
 *
 * The verifier accepts the envelope iff:
 *   1. The first signature's keyid decodes to a 32-byte ed25519 public key, AND
 *   2. ed25519.verify(sig, PAE(payloadType, decoded(payload)), pubkey) returns true.
 *
 * Wave-1 only checks the first signature — multi-signer aggregation
 * is a Wave-2 surface per the parent memo §"Wave-1 vs Wave-2".
 */
export function verifyDsseSignature(
  envelope: DsseEnvelope,
  payloadBytes: Uint8Array,
): DsseVerifyResult {
  const firstSig = envelope.signatures[0];
  if (firstSig === undefined) {
    return {
      verdict: 'fail',
      violationKind: 'Envelope.signature.invalid',
      detail: 'envelope.signatures is empty',
    };
  }

  const pubkey = decodeEd25519PublicKey(firstSig.keyid);
  if (pubkey === null) {
    return {
      verdict: 'fail',
      violationKind: 'Envelope.signature.invalid',
      detail: `signature keyid is not a valid 32-byte ed25519 public key (hex or base64): ${firstSig.keyid.slice(0, 16)}…`,
    };
  }

  let sigBytes: Uint8Array;
  try {
    sigBytes = decodeBase64Signature(firstSig.sig);
  } catch (e) {
    return {
      verdict: 'fail',
      violationKind: 'Envelope.signature.invalid',
      detail: `signature is not valid base64: ${describe(e)}`,
    };
  }

  if (sigBytes.length !== 64) {
    return {
      verdict: 'fail',
      violationKind: 'Envelope.signature.invalid',
      detail: `signature has wrong length (expected 64 bytes, got ${String(sigBytes.length)})`,
    };
  }

  const pae = preAuthenticationEncoding(envelope.payloadType, payloadBytes);

  let ok: boolean;
  try {
    ok = ed25519.verify(sigBytes, pae, pubkey);
  } catch (e) {
    return {
      verdict: 'fail',
      violationKind: 'Envelope.signature.invalid',
      detail: `ed25519.verify threw: ${describe(e)}`,
    };
  }

  if (!ok) {
    return {
      verdict: 'fail',
      violationKind: 'Envelope.signature.invalid',
      detail: 'ed25519 signature did not verify against the embedded keyid',
    };
  }

  return { verdict: 'pass', detail: 'ed25519 signature verified against embedded keyid' };
}

// ============ Internal helpers ============

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
