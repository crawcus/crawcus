import { computeJsonHash } from '../event/hash-chain.js';
import type { DisclosureContent } from './types.js';
import type { Brand } from '../types/brand.js';
import type { DisclosureRequirementId } from '../types/ids.js';

/**
 * Branded identifier for a deterministic hash over the set of
 * `(requirementId, contentHash)` pairs delivered to a data subject as
 * a single "consent bundle" — the snapshot of disclosure copies the
 * subject was shown when the runtime sealed their consent.
 *
 * Distinct from `AuditBundleVersion` (`audit-bundle/types.ts`), which
 * tags the **wire-format version** of the audit-bundle envelope
 * (e.g. `"v0.4"`). `ConsentBundleVersion` tags the **content snapshot**
 * of delivered disclosures (a SHA-256 hex string). The two never collide
 * at the consumer site because they live on different fields
 * (`AuditBundle.bundleVersion` vs `Caller.consentBundleVersion`), but
 * the brand-prefix disambiguates them everywhere they appear together.
 */
export type ConsentBundleVersion = Brand<string, 'ConsentBundleVersion'>;

/**
 * Compute a deterministic content-hash over the set of disclosures
 * delivered to a data subject. Stamped on consent receipts / `Caller`
 * provenance so auditors can later prove *which exact copy bundle*
 * was in force at consent time.
 *
 * **Determinism contract:**
 *
 *  1. Disclosures are sorted by `requirementId` (lexicographic
 *     UTF-16 code-unit order — matching RFC 8785 JCS key-ordering;
 *     input order does not affect the output).
 *  2. Each disclosure is reduced to a `[requirementId, contentHash]`
 *     tuple, where `contentHash` is the canonical-JSON SHA-256 of the
 *     `DisclosureContent` (`text` + `format` + `locale`) via
 *     `computeJsonHash`.
 *  3. The hash is `computeJsonHash` over the sorted tuple array.
 *
 * Pure; depends only on `computeJsonHash` (which depends on
 * `@noble/hashes` + `canonicalize`). Same hash equivalence guarantee
 * as the rest of the spec — TS / Go / Rust / Python implementations
 * MUST produce identical hex strings on the same input.
 *
 * **Empty input:** an empty disclosure list produces the canonical
 * hash of `[]` — a legitimate value meaning "no disclosures were
 * delivered with this bundle". Callers that treat that as an error
 * MUST check `disclosures.length` before calling.
 *
 * **Duplicate requirementIds:** the caller is responsible for
 * deduplication. If the same `requirementId` appears twice with
 * different content, both tuples are hashed (the result is still
 * deterministic; it just reflects the duplicate as a feature of the
 * delivered set). Most consumers should dedupe upstream.
 *
 * @example
 * ```ts
 * import { computeBundleVersion } from '@crawcus/core';
 * import type { DisclosureContent } from '@crawcus/core';
 *
 * const bundle: DisclosureContent[] = [
 *   { text: 'GDPR Art 13 notice…', format: 'markdown', locale: 'en' },
 *   { text: 'FERPA §99.7 notice…', format: 'markdown', locale: 'en' },
 * ];
 * // Pair each with its requirement at the call site; see
 * // packages/crawcus-spec/README.md for a worked example.
 * const version = computeBundleVersion([
 *   { requirementId: gdprArt13ReqId, ...bundle[0] },
 *   { requirementId: ferpaReqId,     ...bundle[1] },
 * ]);
 * // Stamp on Caller.consentBundleVersion.
 * ```
 *
 * Spec: `09-operating/tkt-hf-bundle-version-spec.md` (HF Ask #3,
 * 2026-06-18). HF originally suggested `@crawcus/tck`;
 * we shipped here in `crawcus-spec` because the helper is a runtime
 * composition primitive, not a conformance fixture.
 */
export function computeBundleVersion(
  disclosures: readonly DisclosureContentWithRequirement[],
): ConsentBundleVersion {
  const pairs: readonly (readonly [DisclosureRequirementId, string])[] = disclosures
    .map(
      (d) =>
        [d.requirementId, computeJsonHash(toContent(d))] as readonly [
          DisclosureRequirementId,
          string,
        ],
    )
    .sort(([a], [b]) => {
      const sa = a as string;
      const sb = b as string;
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
  // `computeJsonHash` returns `ContentHash` (a Brand on `string`);
  // re-brand through `string` because TypeScript correctly refuses to
  // narrow between sibling brands of the same primitive.
  return computeJsonHash(pairs) as string as ConsentBundleVersion;
}

/**
 * Input shape for `computeBundleVersion`. Mirrors
 * `DisclosureDeliveredPayload` minus the runtime-only fields
 * (`disclosureId`, `subject`, `deliveryMethod`) — only the
 * `requirementId` + content-shaped fields contribute to the hash, so
 * the helper accepts the minimal subset the caller actually has at
 * bundle-stamp time.
 *
 * `DisclosureContent` (`text` + `format` + `locale`) is intersected
 * with `{ requirementId }`. The hash uses `text` + `format` + `locale`
 * for the per-disclosure `contentHash` step; `requirementId` for the
 * sort + tuple key.
 */
export type DisclosureContentWithRequirement = DisclosureContent & {
  readonly requirementId: DisclosureRequirementId;
};

/**
 * Project the `DisclosureContent` subset out of the call-site input.
 * Required because we pass that subset (and nothing else) into the
 * per-disclosure `computeJsonHash` — extra fields like `requirementId`
 * MUST NOT contribute to the per-disclosure hash, only to the outer
 * tuple key.
 */
function toContent(d: DisclosureContentWithRequirement): DisclosureContent {
  return { text: d.text, format: d.format, locale: d.locale };
}
