/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `crawcus.verify-result/v1` — the stable, versioned JSON result
 * produced by crawcus verify. The browser app renders it; a future
 * server-side verify API MUST return this exact shape unchanged.
 *
 * Evolution rules: adding optional fields is allowed within v1;
 * removing / renaming / changing a field's meaning requires v2.
 * Documented in apps/verify/README.md.
 */

export const VERIFY_RESULT_SCHEMA = 'crawcus.verify-result/v1' as const;

export type Verdict = 'pass' | 'fail' | 'historical-unverifiable';
export type CheckVerdict = 'pass' | 'fail' | 'skipped' | 'historical-unverifiable';
export type TrustStatus = 'trusted' | 'untrusted' | 'no-anchors';
export type LinkStatus = 'ok' | 'broken' | 'after-break';

export interface VerifyResultV1 {
  readonly schema: typeof VERIFY_RESULT_SCHEMA;
  readonly verdict: Verdict;
  /** One-sentence plain-English explanation of the verdict. */
  readonly reason: string;
  readonly verifiedAt: string;
  readonly verifier: {
    readonly name: 'crawcus-verify';
    readonly libraryVersion: string;
    readonly buildSha: string;
  };
  readonly input: {
    readonly format: 'dsse' | 'bundle-json' | 'unknown';
    readonly byteLength: number;
    /** sha256 hex of the exact input bytes. */
    readonly sha256: string;
  };
  readonly envelope: {
    readonly payloadType: string;
    readonly payloadByteLength: number;
    readonly payloadSha256: string;
    readonly signatureCount: number;
  } | null;
  readonly signer: {
    readonly keyId: string;
    readonly algorithm: 'ed25519';
    /** `sha256:<hex>` of the raw 32-byte public key, or '' if undecodable. */
    readonly fingerprint: string;
    readonly trust: TrustStatus;
    /** Label of the matching pinned anchor when trusted. */
    readonly anchorLabel?: string;
  } | null;
  readonly bundle: {
    readonly bundleId: string;
    readonly schemaVersion: string;
    /** chainProof.bundleSelfHash when present, else '' */
    readonly selfHash: string;
    readonly rowCount: number;
    readonly contractCount: number;
    readonly timeRange: { readonly earliest: string; readonly latest: string };
    readonly regulations: readonly string[];
  } | null;
  readonly chain: {
    readonly valid: boolean;
    /** Index of the first broken row, or null. */
    readonly brokenAt: number | null;
    readonly links: readonly ChainLinkV1[];
  };
  readonly checks: readonly CheckV1[];
}

export interface ChainLinkV1 {
  readonly index: number;
  readonly id: string;
  readonly kind: string;
  readonly timestamp: string;
  readonly contentHash: string;
  readonly prevHash: string | null;
  /** Hash recomputed by the verifier over the row (RFC 8785 + SHA-256). */
  readonly recomputedHash: string;
  /** What prevHash should be (previous row's contentHash, null for genesis). */
  readonly expectedPrevHash: string | null;
  readonly contentHashOk: boolean;
  readonly prevLinkOk: boolean;
  readonly status: LinkStatus;
}

export interface CheckV1 {
  readonly id: string;
  readonly label: string;
  readonly verdict: CheckVerdict;
  readonly detail: string;
  readonly violationKind?: string;
  /** 'library' = from @crawcus/verifier; 'app' = added by crawcus verify (trust, row walk). */
  readonly source: 'library' | 'app';
  readonly cite?: readonly { readonly kind: string; readonly value: string | number }[];
}
