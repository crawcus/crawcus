import type { CrawcusSpec, IntentClassification } from '../types/intent.js';
import type { FieldSpec } from '../types/field.js';
import type { Contract } from '../contract/types.js';

/**
 * CrawcusSpec composition under `extends`. Per
 * `02-product/crawcus-format.md` v0.2:
 *
 *  - Fields: child fields merge with parent; same-named fields override.
 *  - Readiness: child AND parent (default); child fully replaces if
 *    `replaceParent: true` (TODO surface via separate option — for v0.2
 *    we only implement AND semantics).
 *  - customReducer: child overrides parent if both present.
 *  - classification: child must be >= parent (cannot downgrade).
 *  - contracts: monotonic ADD only (see `contract/composition.ts`);
 *    enforced at build time, not here.
 *  - derogations: passed through, validated by composition checker.
 */

const CLASSIFICATION_ORDER: Record<IntentClassification, number> = {
  standard: 0,
  'high-risk': 1,
  prohibited: 2,
};

export class IntentCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentCompositionError';
  }
}

export function composeIntent(parent: CrawcusSpec, child: CrawcusSpec): CrawcusSpec {
  // Classification: child >= parent
  const parentClass: IntentClassification = parent.classification ?? 'standard';
  const childClass: IntentClassification = child.classification ?? 'standard';
  if (CLASSIFICATION_ORDER[childClass] < CLASSIFICATION_ORDER[parentClass]) {
    throw new IntentCompositionError(
      `child classification '${childClass}' cannot downgrade parent classification '${parentClass}'`,
    );
  }

  // Fields: merge, child wins on key collision
  const mergedFields: Record<string, FieldSpec> = {
    ...parent.fields,
    ...child.fields,
  };

  // Readiness: AND
  const composedReadiness = (ctx: unknown): boolean => {
    return parent.readiness(ctx) && child.readiness(ctx);
  };

  // Contracts: concatenate (monotonic; composition.ts validates ADD-only)
  const contracts = {
    pre: [...(parent.contracts?.pre ?? []), ...(child.contracts?.pre ?? [])] as readonly Contract[],
    invariants: [
      ...(parent.contracts?.invariants ?? []),
      ...(child.contracts?.invariants ?? []),
    ] as readonly Contract[],
    post: [
      ...(parent.contracts?.post ?? []),
      ...(child.contracts?.post ?? []),
    ] as readonly Contract[],
  };

  // Derogations: passthrough from child (parent has none for its own contracts)
  const derogations = child.derogations;

  return {
    key: child.key,
    projection: child.projection,
    version: child.version,
    classification: childClass,
    fields: mergedFields,
    readiness: composedReadiness,
    ...(child.customReducer
      ? { customReducer: child.customReducer }
      : parent.customReducer
        ? { customReducer: parent.customReducer }
        : {}),
    ...(child.i18nDefault
      ? { i18nDefault: child.i18nDefault }
      : parent.i18nDefault
        ? { i18nDefault: parent.i18nDefault }
        : {}),
    ...(child.tags || parent.tags ? { tags: [...(parent.tags ?? []), ...(child.tags ?? [])] } : {}),
    contracts,
    ...(derogations ? { derogations } : {}),
  };
}
