/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Caller-supplied signer trust policy.
 *
 * The DSSE `keyid` is untrusted input. A signature verifies only against
 * a public key named by this policy. Schema version 1 is the pinned-key
 * subset. TUF-style roles and Sigstore identity anchors are reserved so
 * a later version can add them without overloading unknown fields.
 * Unknown fields are rejected. See `docs/spec/crawcus-trust-policy.md`.
 */

export interface Ed25519PinnedAnchor {
  readonly type: 'ed25519-pinned';
  /** Unique within the policy. */
  readonly id: string;
  /** Raw ed25519 public key, lowercase hex (32 bytes). */
  readonly publicKey: string;
  /** Inclusive RFC 3339 instant. Optional. */
  readonly notBefore?: string;
  /** Exclusive RFC 3339 instant: valid while signingTime < notAfter. Optional. */
  readonly notAfter?: string;
  /**
   * Exact `payloadType` allowlist. When omitted, the anchor authorises
   * the `application/vnd.crawcus.*+jsonl` family.
   */
  readonly payloadTypes?: readonly string[];
  /** Display only. */
  readonly label?: string;
}

/**
 * Reserved. Parsed so a policy file can name the anchor, and never a
 * reason to return `pass` in this version.
 */
export interface SigstoreIdentityAnchor {
  readonly type: 'sigstore-identity';
  readonly id: string;
  readonly issuer: string;
  readonly subject?: string;
  readonly subjectRegExp?: string;
  /** Omitted on input is stored as `true`. */
  readonly requireTlog: boolean;
}

export type TrustAnchor = Ed25519PinnedAnchor | SigstoreIdentityAnchor;

export interface RevokedKey {
  /** Raw ed25519 public key, lowercase hex (32 bytes). */
  readonly publicKey: string;
  readonly revokedAt: string;
  readonly reason: 'key-compromise' | 'superseded' | 'retired';
}

export interface TrustPolicy {
  readonly crawcusTrustPolicy: 1;
  readonly policyId: string;
  readonly description?: string;
  /**
   * Recorded for forward compatibility. This version still fails closed
   * unless the caller passes `allowUntrustedSignerForTestsOnly`.
   */
  readonly requireTrustedSigner?: boolean;
  readonly anchors: readonly TrustAnchor[];
  readonly revoked?: readonly RevokedKey[];
}

export type TrustDecision = 'trusted' | 'untrusted' | 'not-evaluated';

export type TrustReasonCode =
  | 'signer.trusted.pinned-key'
  | 'signer.trusted.sigstore-identity'
  | 'signer.untrusted.no-policy'
  | 'signer.untrusted.unknown-key'
  | 'signer.untrusted.revoked'
  | 'signer.untrusted.not-yet-valid'
  | 'signer.untrusted.expired'
  | 'signer.untrusted.payload-type-not-allowed'
  | 'signer.untrusted.sigstore-identity-mismatch'
  | 'signer.untrusted.sigstore-issuer-mismatch'
  | 'signer.untrusted.sigstore-cert-invalid'
  | 'signer.untrusted.sigstore-tlog-missing'
  | 'signer.untrusted.sigstore-tlog-invalid'
  | 'signer.untrusted.signing-time-unknown'
  | 'policy.malformed'
  | 'signature.invalid'
  | 'trust.not-evaluated';

export type SigningTimeSource = 'rekor-integrated-time' | 'bundle-latest-event-ts' | 'none';

export interface SignerIdentity {
  /**
   * `sha256:` + hex(sha256(raw public key)) — the CRAWCUS keyid (see
   * `trust/keyid.ts`). Not the embedded DSSE keyid string.
   */
  readonly keyFingerprint: string;
  /** Lowercase hex of the public key the signature verified against. */
  readonly publicKey: string;
  readonly anchorId?: string;
  readonly label?: string;
  readonly signingTime?: string;
  readonly signingTimeSource: SigningTimeSource;
  /**
   * True when `signingTimeSource` is not an independent transparency
   * log (e.g. Rekor). Bundle event timestamps are signed by the key
   * under evaluation, so a malicious signer can back-date. Validity
   * windows and `superseded`/`retired` revocation are therefore not
   * security boundaries against that signer; only `key-compromise`
   * is. Callers must not treat a self-asserted time as proof of when
   * the bundle was produced.
   */
  readonly signingTimeSelfAsserted?: boolean;
}

export interface TrustResult {
  readonly decision: TrustDecision;
  readonly reason: TrustReasonCode;
  readonly policyId?: string;
  /** sha256 of the JCS canonical form of the normalised policy. */
  readonly policyFingerprint?: string;
  readonly signer?: SignerIdentity;
}
