/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Token } from '@crawcus/spec';
import type { AccessCtx, TenantCtx } from '@crawcus/spec';

/**
 * One detected PII span. Boundary detector (Presidio, Anthropic
 * tool-use, custom regex baseline) returns these; the tokeniser
 * replaces each span with `[[pii:<token>]]` and stashes the original
 * in the PII vault.
 */
export interface PIIHit {
  readonly start: number;
  readonly end: number;
  /**
   * Canonical PII kind taxonomy. Q-AB lock (2026-05-21): expanded
   * from 9 → 13 to cover the healthcare + education overlap (MRN +
   * insurance-id) + cross-border identity (passport + gov-id-other).
   *
   * Additive only — `'other'` remains the catch-all; existing kinds
   * unchanged; wire-format-safe for v0.0.3 → v0.0.4 (pre-1.0
   * additive-union semantics).
   */
  readonly kind:
    | 'name'
    | 'email'
    | 'phone'
    | 'address'
    | 'dob'
    | 'ssn'
    | 'health'
    | 'biometric'
    | 'mrn' // medical record number (HIPAA, ePHI)
    | 'insurance-id' // policy / member ID
    | 'passport' // travel document number
    | 'gov-id' // any other gov-issued ID (driver licence, national ID, tax ID)
    | 'other';
  /** 0..1. */
  readonly confidence: number;
}

/**
 * Output of tokenisation: the rewritten text (Untainted; only Tokens
 * for PII spans) plus the per-token vault references.
 */
export interface TokenisedText {
  readonly text: string;
  readonly tokens: readonly { readonly token: Token; readonly kind: PIIHit['kind'] }[];
}

/**
 * PII port — boundary tokeniser adapter. Implementations:
 * `@tallyseal/pii-presidio` (Microsoft Presidio via HTTP),
 * `@tallyseal/pii-anthropic` (Claude tool-use),
 * `@tallyseal/pii-custom` (regex baseline).
 *
 * `detokenize` is gated by `AccessCtx` (cross-tenant boundary —
 * every access requires lawful basis + purpose + reason).
 */
export interface PIIPort {
  detect(text: string): Promise<readonly PIIHit[]>;
  tokenize(text: string, ctx: TenantCtx): Promise<TokenisedText>;
  detokenize(text: string, ctx: AccessCtx): Promise<string>;
}
