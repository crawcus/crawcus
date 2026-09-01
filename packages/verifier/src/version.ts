/**
 * Verifier-identity constants for the Wave-1 release.
 *
 * Wave-1a ships an unsigned identity (no embedded ed25519 keypair).
 * Wave-1b (TKT-VERIFIER-1b 2026-06-03) adds the auditor-countersign
 * flow externally — the auditor's own keypair signs the verify
 * result; the verifier-binary identity remains unsigned because a
 * verifier-binary keypair is a key-transparency-log concern
 * (Wave-2 per the parent memo §"Wave-2 deferrals").
 *
 * `BUILD_SHA` is the placeholder `unknown` token; a future build
 * pipeline can stamp it via tsup's `define` hook. Hardcoding
 * `unknown` here keeps the verifier purely offline + reproducible.
 */

export const VERIFIER_VERSION = '0.2.0' as const;
export const VERIFIER_PUBLIC_KEY_FINGERPRINT =
  'wave1-unsigned-no-verifier-output-signature' as const;
export const VERIFIER_BUILD_SHA = 'unknown' as const;
