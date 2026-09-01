/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ContractViolationKind — the canonical taxonomy of failure modes a
 * CRAWCUS verifier surfaces when re-checking a signed audit bundle.
 *
 * Lives in `@crawcus/spec` (not in the verifier) because the
 * vocabulary is part of the open standard — any CRAWCUS-conformant
 * verifier must use the same strings so auditors + downstream tooling
 * see consistent reasons across vendors.
 *
 * Mapped 1:1 to the 8 Wave-1 checks in
 * `02-product/q-verifier-cli-oss-lock-tkt-verifier-1a-spec.md` §5.
 * Adding a new variant is additive-MINOR (ratchet #16); removing one
 * is a two-release-deprecation breaking change (ratchet #4).
 */
export type ContractViolationKind =
  // Envelope (DSSE) checks
  | 'Envelope.shape.invalid'
  | 'Envelope.signature.invalid'
  // Payload / canonical-JSON checks
  | 'Bundle.hash.mismatch'
  // Hash-chain check
  | 'Chain.hash.broken'
  // Contract re-evaluation checks
  | 'Contract.predicate.unembedded'
  | 'Contract.predicate.retired'
  | 'Contract.pre.unmet'
  | 'Contract.inv.violated'
  | 'Contract.post.unmet'
  // DisclosureSignal SIGNAL-not-gate discipline (Q-CR9 LOCKED)
  | 'Contract.predicate.signal-as-gate';

/**
 * Frozen tuple of every `ContractViolationKind` value. Useful for
 * exhaustiveness checks + TCK conformance fixtures.
 */
export const CONTRACT_VIOLATION_KINDS = [
  'Envelope.shape.invalid',
  'Envelope.signature.invalid',
  'Bundle.hash.mismatch',
  'Chain.hash.broken',
  'Contract.predicate.unembedded',
  'Contract.predicate.retired',
  'Contract.pre.unmet',
  'Contract.inv.violated',
  'Contract.post.unmet',
  'Contract.predicate.signal-as-gate',
] as const satisfies readonly ContractViolationKind[];
