/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/** COSE header labels used by this profile (RFC 9052, RFC 9597, RFC 9942). */
export const HEADER = {
  alg: 1,
  contentType: 3,
  kid: 4,
  cwtClaims: 15,
  /** RFC 9942: unprotected header carrying Receipts. */
  receipts: 394,
} as const;

/** CWT claim keys (RFC 8392). */
export const CWT = {
  iss: 1,
  sub: 2,
  iat: 6,
} as const;

/** COSE algorithm identifiers supported by this slice. */
export const ALG = {
  EdDSA: -8,
} as const;

/** CBOR tag for COSE_Sign1 (RFC 9052). */
export const COSE_SIGN1_TAG = 18;

/**
 * Content type for the payload. It is the DSSE payloadType CRAWCUS
 * already uses, so one identifier names the bundle in both modes.
 * Not registered with IANA; provisional.
 */
export const CRAWCUS_BUNDLE_CONTENT_TYPE = 'application/vnd.crawcus.bundle+jsonl';
