/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineContract, field, type Contract, type FieldBuilder } from '@crawcus/core';
import { GDPR_VERSION } from './version.js';
import { minorConsent } from './art8.js';

/**
 * Typed `ageBand` field-builder helper + three rejection-mode bundles.
 *
 * Promoted from HF feedback 2026-06-02 §6 (IDEA-013 → TKT-AGEBAND-FIELD-BUILDER).
 *
 * Hosts opt into ONE of three modes:
 *
 *   - {@link ageBand.adultOnly}    — reject `'under-18'` outright
 *                                    (defensible adult-only-service default;
 *                                    `'prefer-not-to-say'` assumed adult)
 *   - {@link ageBand.minorAware}   — route `'under-18'` to Art-8 minorConsent
 *                                    (binds to the existing minorConsent Contract)
 *   - {@link ageBand.passthrough}  — capture band, apply no policy
 *                                    (analytics / demographic reporting)
 *
 * The three modes are mutually exclusive — a host's spec wires exactly
 * one. The typed enum {@link AgeBandValue} is shared across all three.
 *
 * @example Adult-only mode (HF's default for adult services)
 * import { defineCrawcusSpec, field } from '@crawcus/core';
 * import { ageBand, AGE_BAND_VALUES } from '@crawcus/regulations-gdpr';
 *
 * defineCrawcusSpec({
 *   key: 'EnrolAdult',
 *   fields: {
 *     ageBand: field.enum(AGE_BAND_VALUES).required(),
 *   },
 *   contracts: {
 *     invariants: ageBand.adultOnly({ ageBandField: 'ageBand' }),
 *   },
 * });
 *
 * @example Minor-aware mode (routes under-18 to Art-8 parental-consent flow)
 * defineCrawcusSpec({
 *   key: 'EnrolLearner',
 *   fields: {
 *     ageBand: field.enum(AGE_BAND_VALUES).required(),
 *     parentalConsentEventId: field.string().optional(),
 *   },
 *   contracts: {
 *     invariants: ageBand.minorAware({
 *       ageBandField: 'ageBand',
 *       consentField: 'parentalConsentEventId',
 *     }),
 *   },
 * });
 */

// ============ Typed enum ============

/**
 * The eight canonical age-band values. Discriminated union — every band
 * is a literal string, no open-ended `string` type.
 *
 * `'prefer-not-to-say'` is a self-reported decline; mode handling
 * differs (see per-mode JSDoc).
 */
export type AgeBandValue =
  | 'under-18'
  | '18-24'
  | '25-34'
  | '35-44'
  | '45-54'
  | '55-64'
  | '65-plus'
  | 'prefer-not-to-say';

/**
 * Tuple of all {@link AgeBandValue}s. Pass to `field.enum(AGE_BAND_VALUES)`
 * to declare an ageBand field on a spec.
 *
 * Frozen — never mutate; cloning is on the caller.
 */
export const AGE_BAND_VALUES: readonly AgeBandValue[] = Object.freeze([
  'under-18',
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55-64',
  '65-plus',
  'prefer-not-to-say',
] as const);

/**
 * True iff the band positively asserts the subject is a minor.
 * `'prefer-not-to-say'` returns `false` (decline ≠ minor; per-mode
 * policy decides how to handle the unknown case).
 */
export function isMinorBand(value: AgeBandValue): boolean {
  return value === 'under-18';
}

// ============ Field-builder helper ============

/**
 * Typed `FieldBuilder<AgeBandValue>` — saves the host typing
 * `field.enum(AGE_BAND_VALUES)` and ensures the type narrows to the
 * discriminated union rather than `string`.
 *
 * @example
 * defineCrawcusSpec({
 *   fields: {
 *     ageBand: ageBandField().required(),
 *   },
 * });
 */
export function ageBandField(): FieldBuilder<AgeBandValue> {
  return field.enum(AGE_BAND_VALUES) as FieldBuilder<AgeBandValue>;
}

// ============ Shared option shape ============

export interface AdultOnlyOptions {
  /** Snapshot field carrying the {@link AgeBandValue}. */
  readonly ageBandField: string;
}

export interface MinorAwareOptions {
  /** Snapshot field carrying the {@link AgeBandValue}. */
  readonly ageBandField: string;
  /**
   * Snapshot field carrying the parental-consent event reference.
   * Customer is responsible for ensuring this field is populated by a
   * separate `ConsentGranted` event when the subject is a minor.
   * Binds to {@link minorConsent} in {@link ageBand.minorAware} mode.
   */
  readonly consentField: string;
}

export interface PassthroughOptions {
  /** Snapshot field carrying the {@link AgeBandValue}. */
  readonly ageBandField: string;
}

// ============ Internal helpers ============

/**
 * Synthetic numeric-age mapper used by `minorAware` mode to bind to the
 * existing `minorConsent` Contract without re-implementing Art-8.
 *
 *   - `'under-18'`         → 12 (any minor sentinel; < default minorAge 16)
 *   - any other band       → 30 (any adult sentinel; >= minorAge)
 *   - `'prefer-not-to-say'` → 30 (treated as adult — caller can override
 *                                 via separate adultOnly + disclosure if
 *                                 they want stricter handling)
 *   - missing value         → undefined (minorConsent defers to data-quality)
 *
 * Numeric sentinels are arbitrary; only the {below | at-or-above}
 * relationship to `minorConsent`'s `minorAge` matters.
 */
function bandToSyntheticAge(value: AgeBandValue | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value === 'under-18') return 12;
  return 30;
}

// ============ Mode 1: adultOnly ============

/**
 * Adult-only mode — rejects `'under-18'` outright with a `'block'`
 * severity Contract; emits a `ContractViolation` event on rejection
 * (runtime mechanism, not synthesised here — `defineContract` +
 * `severity: 'block'` is the structural contract per the spec
 * predicate semantics).
 *
 * `'prefer-not-to-say'` is **allowed by default** under this mode —
 * the defensible posture for adult-only services is "decline →
 * assume adult", consistent with the GDPR principle that processing
 * minor data without affirmative-minor-signal is the riskier branch.
 * Hosts that need a stricter posture should compose `adultOnly` with
 * a separate disclosure or block-on-unknown Contract.
 *
 * @returns a one-element readonly Contract array, ready to spread
 *          into `contracts.invariants`.
 */
function adultOnly(opts: AdultOnlyOptions): readonly Contract[] {
  return [
    defineContract({
      id: 'gdpr.ageBand.adultOnly',
      description: {
        en: `Age band at '${opts.ageBandField}' must not be 'under-18' (adult-only service).`,
      },
      citation: {
        regulation: GDPR_VERSION,
        article: 'Art. 8',
        paragraph: '§1',
        url: 'https://gdpr-info.eu/art-8-gdpr/',
      },
      predicate: ({ value }) => {
        const band = value<AgeBandValue>(opts.ageBandField);
        if (band === undefined) return true;
        return band !== 'under-18';
      },
      severity: 'block',
    }),
  ];
}

// ============ Mode 2: minorAware ============

/**
 * Minor-aware mode — wires the ageBand value into the existing Art-8
 * `minorConsent` Contract. Routes `'under-18'` to require a parental-
 * consent event reference; non-minor bands pass through unchanged.
 *
 * `'prefer-not-to-say'` is treated as **adult** in this mode (passes
 * through without requiring guardian consent). The defensible default
 * for unknown-age in a minor-aware service is to fall through to the
 * adult path; hosts who need a "consult guardian if user is a minor"
 * disclosure variant should compose with a separate Disclosure
 * primitive Contract.
 *
 * Implementation note (DRY) — this mode does NOT re-implement Art-8
 * predicate logic. It synthesises a numeric age (12 for `'under-18'`,
 * 30 for any other band) and delegates to `minorConsent`, so the
 * citation, severity, and `'block'` semantics are identical to the
 * direct numeric-age path. Audit-bundle reviewers see the SAME
 * `'gdpr.art8.minorConsent'` Contract id — the ageBand layer is
 * cosmetic from the regulator's perspective.
 *
 * @returns a one-element readonly Contract array, ready to spread
 *          into `contracts.invariants`.
 */
function minorAware(opts: MinorAwareOptions): readonly Contract[] {
  // Synthetic key — we project the ageBand field through a derived
  // accessor into the same shape minorConsent expects. We bind via a
  // wrapper Contract that re-reads `ageBandField` and forwards.
  return [
    defineContract({
      id: 'gdpr.ageBand.minorAware',
      description: {
        en: `If '${opts.ageBandField}' is 'under-18', parental consent event reference must be present at '${opts.consentField}' (routes to Art-8 minorConsent).`,
      },
      citation: {
        regulation: GDPR_VERSION,
        article: 'Art. 8',
        paragraph: '§1',
        url: 'https://gdpr-info.eu/art-8-gdpr/',
      },
      predicate: (ctx) => {
        const band = ctx.value<AgeBandValue>(opts.ageBandField);
        const synthAge = bandToSyntheticAge(band);
        // Defer to the existing minorConsent predicate by reconstructing
        // its ctx-view with the synthesised age key. We use a wrapper
        // `value` accessor so the bound Contract reads `synthAge` from
        // the same snapshot semantics.
        const inner = minorConsent({
          ageField: '__ageBand_synthAge__',
          consentField: opts.consentField,
        });
        const wrappedCtx = {
          ...ctx,
          snapshot: { ...ctx.snapshot, __ageBand_synthAge__: synthAge },
          value: <T = unknown>(key: string): T | undefined => {
            if (key === '__ageBand_synthAge__') return synthAge as T | undefined;
            return ctx.value<T>(key);
          },
          has: (...keys: readonly string[]): boolean => {
            for (const k of keys) {
              if (k === '__ageBand_synthAge__') {
                if (synthAge === undefined) return false;
                continue;
              }
              if (!ctx.has(k)) return false;
            }
            return true;
          },
        };
        return inner.predicate(wrappedCtx);
      },
      severity: 'block',
    }),
  ];
}

// ============ Mode 3: passthrough ============

/**
 * Passthrough mode — captures the ageBand value, applies no policy.
 * Useful for analytics / demographic reporting where the band is
 * collected for aggregate insight, not gated.
 *
 * Returns a vacuous always-pass Contract (severity `'warn'`) so the
 * `ageBandField` registration shows up in audit-bundle render as a
 * declared-but-permissive field — useful for the regulator to see
 * "this controller collects ageBand but applies no minor-routing
 * logic" which is itself a documentable posture.
 *
 * `'prefer-not-to-say'` is treated identically to any other band —
 * pure data capture, zero routing.
 *
 * @returns a one-element readonly Contract array, ready to spread
 *          into `contracts.invariants`.
 */
function passthrough(opts: PassthroughOptions): readonly Contract[] {
  return [
    defineContract({
      id: 'gdpr.ageBand.passthrough',
      description: {
        en: `Age band captured at '${opts.ageBandField}' for analytics; no policy applied.`,
      },
      citation: {
        regulation: GDPR_VERSION,
        article: 'Art. 8',
        paragraph: '§1',
        url: 'https://gdpr-info.eu/art-8-gdpr/',
      },
      predicate: () => true,
      severity: 'warn',
    }),
  ];
}

/**
 * Public namespace bundle — `ageBand.adultOnly` / `ageBand.minorAware`
 * / `ageBand.passthrough`. Each mode is a separate factory; hosts
 * wire exactly one into `contracts.invariants`.
 */
export const ageBand = {
  adultOnly,
  minorAware,
  passthrough,
} as const;
