/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Signed trust-anchor document (`trust-anchors.json`), spec_version 1.x.
 * Modelled on TUF root metadata. See `docs/spec/trust-anchors.md`.
 */

import type { RevokedKey } from '../types.js';

export const TRUST_ANCHORS_TYPE = 'crawcus-trust-anchors' as const;
/** DSSE PAE payloadType used as the signing domain (TA-4). */
export const TRUST_ANCHORS_PAYLOAD_TYPE = 'application/vnd.crawcus.trust-anchors+json' as const;
/** Accepted spec_version majors. */
export const TRUST_ANCHORS_SPEC_MAJOR = 1;

export const KNOWN_PURPOSES = ['root', 'release', 'test-vectors', 'foundry-audit-export'] as const;
export type KeyPurpose = (typeof KNOWN_PURPOSES)[number];
export const KNOWN_STATUSES = ['active', 'retired', 'revoked'] as const;
export type KeyStatus = (typeof KNOWN_STATUSES)[number];
export type RevocationReason = RevokedKey['reason'];

export interface AnchorKey {
  /** `sha256:` + hex(sha256(raw key)). Must match `public_key`. */
  readonly keyid: string;
  readonly alg: 'ed25519';
  /** base64 SubjectPublicKeyInfo DER. */
  readonly public_key: string;
  readonly purpose: KeyPurpose;
  /** Required for `foundry-audit-export`, null otherwise. */
  readonly deployment: string | null;
  readonly custody?: string | null;
  readonly kms_resource?: string | null;
  readonly not_before: string;
  readonly not_after: string;
  readonly status: KeyStatus;
  readonly revoked_at: string | null;
  readonly revocation_reason: RevocationReason | null;
  readonly superseded_by?: string | null;
}

export interface RootRole {
  readonly keyids: readonly string[];
  readonly threshold: number;
}

/** The signed body as parsed. Unknown fields are preserved in `raw` for signing. */
export interface TrustAnchorsSigned {
  readonly _type: typeof TRUST_ANCHORS_TYPE;
  readonly spec_version: string;
  readonly issuer: string;
  readonly version: number;
  readonly issued_at: string;
  readonly expires: string;
  readonly roles: { readonly root: RootRole };
  /** Keys with a known purpose and status. Unknown ones are dropped (TA-8). */
  readonly keys: readonly AnchorKey[];
  /** Number of entries dropped for unknown purpose/status. */
  readonly ignoredKeys: number;
}

export interface DetachedSignature {
  readonly keyid: string;
  readonly sig: string;
}

/** A parsed, not yet trusted, document. */
export interface ParsedTrustAnchors {
  readonly signed: TrustAnchorsSigned;
  /** The `signed` object exactly as received; signatures cover JCS of this. */
  readonly rawSigned: Readonly<Record<string, unknown>>;
  readonly signatures: readonly DetachedSignature[];
  /** sha256 hex of JCS(rawSigned). Equal versions must have equal digests. */
  readonly digest: string;
}

/** Out-of-band root pin used only to bootstrap (README fingerprints / embedded copy). */
export interface PinnedRoot {
  readonly keyids: readonly string[];
  readonly threshold: number;
}

export type TrustAnchorsErrorCode =
  | 'anchors-malformed'
  | 'anchors-unsupported-version'
  | 'anchors-root-mismatch'
  | 'anchors-threshold-unmet'
  | 'anchors-new-root-threshold-unmet'
  | 'anchors-expired'
  | 'anchors-rollback'
  | 'anchors-fork'
  | 'anchors-issuer-mismatch'
  | 'anchors-fetch-failed'
  | 'anchors-no-keys-for-purpose';

/** Persisted trusted state per issuer (VER-1). The raw document is stored so it can be re-verified. */
export interface TrustAnchorsStore {
  load(issuer: string): Promise<unknown | undefined> | unknown | undefined;
  save(issuer: string, document: unknown): Promise<void> | void;
}

/**
 * Pluggable signer for root keys. A local test signer ships here; KMS-
 * backed implementations live with the operator, not in this package.
 */
export interface AnchorSigner {
  readonly publicKey: Uint8Array;
  sign(message: Uint8Array): Promise<Uint8Array>;
}
