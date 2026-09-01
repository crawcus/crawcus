/**
 * Top-level `parseSignedBundle` — takes raw envelope bytes, returns
 * a `ParsedBundle` containing the DSSE envelope, the decoded
 * JCS-canonical payload bytes, and the parsed `AuditBundle` JSON.
 *
 * Pure; no I/O. The CLI layer handles file reads.
 */

import { decodeBase64Payload, parseDsseEnvelope } from './dsse.js';
import type { ContractViolationKind, ParsedAuditBundle, ParsedBundle } from './types.js';

export interface ParseFailure {
  readonly kind: 'fail';
  readonly violationKind: ContractViolationKind;
  readonly detail: string;
}

export type ParseResult = { readonly kind: 'ok'; readonly parsed: ParsedBundle } | ParseFailure;

/**
 * Parse the bundle bytes end-to-end.
 *
 * Order of operations:
 *   1. Parse DSSE envelope (spec §5 check 1 — `Envelope.shape.invalid`)
 *   2. Base64-decode the payload (Open-Q1 memo §"Base64-lossless guarantee")
 *   3. JSON.parse the decoded bytes (lazy structural validation; later
 *      checks narrow the fields they care about)
 *
 * Signature verification happens separately via `verifyDsseSignature`
 * so the staged check architecture (spec §5) stays composable.
 */
export function parseSignedBundle(bytes: Uint8Array): ParseResult {
  const envelopeResult = parseDsseEnvelope(bytes);
  if (envelopeResult.kind === 'parse-error') {
    return {
      kind: 'fail',
      violationKind: envelopeResult.violationKind,
      detail: envelopeResult.reason,
    };
  }

  const envelope = envelopeResult.envelope;

  let payloadBytes: Uint8Array;
  try {
    payloadBytes = decodeBase64Payload(envelope.payload);
  } catch (e) {
    return {
      kind: 'fail',
      violationKind: 'Envelope.shape.invalid',
      detail: `envelope.payload is not valid base64: ${describe(e)}`,
    };
  }

  let payloadText: string;
  try {
    payloadText = new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes);
  } catch (e) {
    return {
      kind: 'fail',
      violationKind: 'Envelope.shape.invalid',
      detail: `decoded payload is not valid UTF-8: ${describe(e)}`,
    };
  }

  let bundle: ParsedAuditBundle;
  try {
    const parsed: unknown = JSON.parse(payloadText);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        kind: 'fail',
        violationKind: 'Envelope.shape.invalid',
        detail: 'decoded payload is not a JSON object',
      };
    }
    bundle = parsed as ParsedAuditBundle;
  } catch (e) {
    return {
      kind: 'fail',
      violationKind: 'Envelope.shape.invalid',
      detail: `decoded payload is not valid JSON: ${describe(e)}`,
    };
  }

  return {
    kind: 'ok',
    parsed: { envelope, payloadBytes, bundle },
  };
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
