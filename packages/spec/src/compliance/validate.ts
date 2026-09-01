/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComplianceManifest, FieldCompliance } from '../types/compliance.js';
import type { FieldSpec } from '../types/field.js';
import type { CrawcusSpec } from '../types/intent.js';
import { fieldPath, type FieldPath } from './field-paths.js';
import { checkPredicateSizeFromSource } from '../contract/size-limit.js';
import { validateComposition } from '../contract/composition.js';

/**
 * Build-time validation of `(manifest, specs)`. Returns ALL errors
 * (does not short-circuit) so the customer's spec compiler can
 * surface a complete report in one CI run.
 *
 * Per `02-product/compliance-manifest-schema.md` §"Build-time
 * validation" + contracts memo. v0.0.1 scope:
 *
 *   ✅ field-missing-in-manifest
 *   ✅ special-category-without-consent-gate
 *   ✅ pii-field-with-disallowed-purpose
 *   ✅ duplicate-intent-key
 *   ✅ contract-monotonicity (via composition.ts)
 *   ✅ derogation-without-basis / without-justification (via composition.ts)
 *   ✅ predicate-size-limit (Q-S — 4 KB per predicate)
 *
 * Deferred to later commits (need infrastructure not yet built):
 *   ❌ retention-shorter-than-regulation-minimum (needs @crawcus/regulations-*)
 *   ❌ regulation-version-retired (needs @crawcus/regulations-*)
 *   ❌ sub-processor-dpa-unreachable (needs file-system port)
 */

export type ManifestValidationCode =
  | 'field-missing-in-manifest'
  | 'special-category-without-consent-gate'
  | 'pii-field-with-disallowed-purpose'
  | 'duplicate-intent-key'
  | 'contract-monotonicity'
  | 'derogation-incomplete'
  | 'predicate-size-limit-exceeded';

export interface ManifestValidationError {
  readonly code: ManifestValidationCode;
  readonly message: string;
  readonly location: {
    readonly intentKey?: string;
    readonly fieldKey?: string;
    readonly contractId?: string;
  };
}

export interface ValidateOptions {
  /**
   * Optional purpose per intent — drives `pii-field-with-disallowed-purpose`
   * check. If absent for an intent, that check is skipped.
   */
  readonly intentPurposes?: Readonly<Record<string, string>>;
  /**
   * Optional parent-lookup for sector-pack composition. Given a
   * child spec's `extends` key/path, returns the resolved parent
   * spec (or `null` if not found / not validatable here).
   */
  readonly resolveParent?: (extendsRef: string) => CrawcusSpec | null;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ManifestValidationError[];
}

export function validateManifest(
  manifest: ComplianceManifest,
  specs: readonly CrawcusSpec[],
  opts: ValidateOptions = {},
): ValidationResult {
  const errors: ManifestValidationError[] = [];

  // 1. duplicate-intent-key
  const seenKeys = new Set<string>();
  for (const spec of specs) {
    const k = spec.key as string;
    if (seenKeys.has(k)) {
      errors.push({
        code: 'duplicate-intent-key',
        message: `intent key '${k}' is declared more than once`,
        location: { intentKey: k },
      });
    }
    seenKeys.add(k);
  }

  // 2. per-spec checks
  for (const spec of specs) {
    validateSpecFields(spec, manifest, opts, errors);
    validateSpecContracts(spec, errors);

    // 3. composition (if extends + resolver provided)
    if (spec.extends && opts.resolveParent) {
      const parent = opts.resolveParent(spec.extends as string);
      if (parent) {
        const compositionViolations = validateComposition(parent, spec);
        for (const v of compositionViolations) {
          errors.push({
            code: v.code.startsWith('derogation-')
              ? 'derogation-incomplete'
              : 'contract-monotonicity',
            message: v.message,
            location: {
              intentKey: spec.key as string,
              ...(v.contractId ? { contractId: v.contractId } : {}),
            },
          });
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateSpecFields(
  spec: CrawcusSpec,
  manifest: ComplianceManifest,
  opts: ValidateOptions,
  errors: ManifestValidationError[],
): void {
  const intentKey = spec.key as string;
  const purpose = opts.intentPurposes?.[intentKey];

  for (const [fieldKey, fieldSpec] of Object.entries(spec.fields)) {
    const path: FieldPath = fieldPath(spec.projection, fieldKey);
    const fc: FieldCompliance | undefined = manifest.fields[path];

    // field-missing-in-manifest
    if (!fc) {
      errors.push({
        code: 'field-missing-in-manifest',
        message: `field '${path}' is referenced by intent '${intentKey}' but missing from compliance manifest`,
        location: { intentKey, fieldKey },
      });
      continue;
    }

    // special-category-without-consent-gate
    if (fc.pii === 'special-art-9') {
      if (!hasConsentGate(fieldSpec)) {
        errors.push({
          code: 'special-category-without-consent-gate',
          message: `field '${path}' is special-category (pii: 'special-art-9') but intent '${intentKey}' does not gate it on a consent event via dependsOn`,
          location: { intentKey, fieldKey },
        });
      }
    }

    // pii-field-with-disallowed-purpose
    if (purpose && fc.forbiddenFor?.some((p) => (p as string) === purpose)) {
      errors.push({
        code: 'pii-field-with-disallowed-purpose',
        message: `field '${path}' is forbidden for purpose '${purpose}' but referenced by intent '${intentKey}' with that purpose`,
        location: { intentKey, fieldKey },
      });
    }
  }
}

function hasConsentGate(field: FieldSpec): boolean {
  // Heuristic: a dependsOn predicate exists. Full check would require
  // parsing the predicate to confirm it references a consent event;
  // that's an AST-level concern deferred to v1.0 (spec-tools).
  return field.metadata.dependsOn !== undefined;
}

function validateSpecContracts(spec: CrawcusSpec, errors: ManifestValidationError[]): void {
  const intentKey = spec.key as string;
  // 'toolProposed' (TKT-V6-ITEM-15) joins 'pre' | 'invariants' | 'post'
  // here: every slot that holds Contracts gets the same predicate-size
  // discipline (4KB normalised source).
  const slots = ['pre', 'invariants', 'post', 'toolProposed'] as const;
  for (const slot of slots) {
    const slotContracts = spec.contracts?.[slot] ?? [];
    for (const c of slotContracts) {
      const sourceCheck = checkPredicateSizeFromSource(c.predicate.toString());
      if (!sourceCheck.ok) {
        errors.push({
          code: 'predicate-size-limit-exceeded',
          message: `contract '${c.id}' predicate source is ${sourceCheck.sizeBytes} bytes — exceeds ${sourceCheck.limitBytes}-byte limit. Refactor into smaller named contracts.`,
          location: { intentKey, contractId: c.id },
        });
      }
    }
  }
}
