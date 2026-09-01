import { describe, it, expect } from 'vitest';
import {
  computeBundleVersion,
  type DisclosureContentWithRequirement,
} from '../../src/disclosure/bundle-version.js';
import { computeJsonHash } from '../../src/event/hash-chain.js';
import type { DisclosureRequirementId } from '../../src/types/ids.js';

// ============ Fixtures ============

const REQ_AI_INTERACTION = 'ai-act-art-50-ai-interaction' as DisclosureRequirementId;
const REQ_FERPA_ANNUAL = 'ferpa-§99.7-annual-notification' as DisclosureRequirementId;
const REQ_GDPR_ART_13 = 'gdpr-art-13-notice' as DisclosureRequirementId;

const D_AI: DisclosureContentWithRequirement = {
  requirementId: REQ_AI_INTERACTION,
  text: 'You are interacting with an AI system.',
  format: 'text',
  locale: 'en',
};

const D_FERPA: DisclosureContentWithRequirement = {
  requirementId: REQ_FERPA_ANNUAL,
  text: 'FERPA §99.7 annual notification — directory information…',
  format: 'markdown',
  locale: 'en',
};

const D_GDPR: DisclosureContentWithRequirement = {
  requirementId: REQ_GDPR_ART_13,
  text: 'GDPR Art 13 — categories of data, lawful basis, retention…',
  format: 'markdown',
  locale: 'en',
};

// ============ Tests ============

describe('computeBundleVersion', () => {
  it('produces a hex SHA-256 string (64 hex chars)', () => {
    const v = computeBundleVersion([D_AI, D_FERPA, D_GDPR]);
    expect(v).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input → same output', () => {
    const v1 = computeBundleVersion([D_AI, D_FERPA, D_GDPR]);
    const v2 = computeBundleVersion([D_AI, D_FERPA, D_GDPR]);
    expect(v1).toBe(v2);
  });

  it('is order-invariant — input shuffles produce the same hash', () => {
    const ordered = computeBundleVersion([D_AI, D_FERPA, D_GDPR]);
    const reversed = computeBundleVersion([D_GDPR, D_FERPA, D_AI]);
    const middle = computeBundleVersion([D_FERPA, D_AI, D_GDPR]);
    expect(reversed).toBe(ordered);
    expect(middle).toBe(ordered);
  });

  it('single-disclosure bundle hashes deterministically', () => {
    const v1 = computeBundleVersion([D_AI]);
    const v2 = computeBundleVersion([D_AI]);
    expect(v1).toMatch(/^[0-9a-f]{64}$/);
    expect(v1).toBe(v2);
  });

  it('empty bundle produces the canonical hash of `[]`', () => {
    const v = computeBundleVersion([]);
    const expected = computeJsonHash([]);
    expect(v).toBe(expected);
  });

  it('different content text under the same requirementId yields a different hash', () => {
    const swapped: DisclosureContentWithRequirement = { ...D_AI, text: 'different text' };
    const original = computeBundleVersion([D_AI]);
    const tweaked = computeBundleVersion([swapped]);
    expect(tweaked).not.toBe(original);
  });

  it('different format yields a different hash (format participates)', () => {
    const asHtml: DisclosureContentWithRequirement = { ...D_AI, format: 'html' };
    const original = computeBundleVersion([D_AI]);
    const reformatted = computeBundleVersion([asHtml]);
    expect(reformatted).not.toBe(original);
  });

  it('different locale yields a different hash (locale participates)', () => {
    const fr: DisclosureContentWithRequirement = { ...D_AI, locale: 'fr' };
    const original = computeBundleVersion([D_AI]);
    const localised = computeBundleVersion([fr]);
    expect(localised).not.toBe(original);
  });

  it('different requirementId yields a different hash (requirementId participates as tuple key)', () => {
    const reassigned: DisclosureContentWithRequirement = {
      ...D_AI,
      requirementId: REQ_FERPA_ANNUAL,
    };
    const original = computeBundleVersion([D_AI]);
    const remapped = computeBundleVersion([reassigned]);
    expect(remapped).not.toBe(original);
  });

  it('adding a disclosure to the bundle changes the hash', () => {
    const one = computeBundleVersion([D_AI]);
    const two = computeBundleVersion([D_AI, D_FERPA]);
    expect(one).not.toBe(two);
  });

  it('matches the spec recipe — sort by requirementId → tuples → hash', () => {
    // Manual recipe execution against the public primitives, asserting
    // the helper is exactly that recipe (no extra normalisation,
    // no hidden fields). Locks the contract for cross-implementation
    // (Go / Rust / Python) parity.
    const manual = (() => {
      const pairs = [D_AI, D_FERPA, D_GDPR]
        .map(
          (d) =>
            [
              d.requirementId,
              computeJsonHash({ text: d.text, format: d.format, locale: d.locale }),
            ] as const,
        )
        .sort(([a], [b]) => {
          const sa = a as string;
          const sb = b as string;
          return sa < sb ? -1 : sa > sb ? 1 : 0;
        });
      return computeJsonHash(pairs);
    })();
    const helper = computeBundleVersion([D_AI, D_FERPA, D_GDPR]);
    expect(helper).toBe(manual);
  });

  it('requirementId-only fields are NOT included in the per-disclosure hash', () => {
    // The per-disclosure hash hashes ONLY {text, format, locale}; the
    // requirementId is the tuple-key. Two disclosures that share content
    // but differ only by requirementId must produce identical
    // per-disclosure hashes (assertable indirectly: swapping
    // requirementIds between two same-content disclosures yields the
    // same bundle hash as the original ordering).
    const a: DisclosureContentWithRequirement = {
      requirementId: REQ_AI_INTERACTION,
      text: 'shared',
      format: 'text',
      locale: 'en',
    };
    const b: DisclosureContentWithRequirement = {
      requirementId: REQ_FERPA_ANNUAL,
      text: 'shared',
      format: 'text',
      locale: 'en',
    };
    const aHash = computeJsonHash({ text: 'shared', format: 'text', locale: 'en' });
    // Reconstruct what the bundle hash MUST equal: a sorted tuple list
    // where both entries have the same per-content hash.
    const expected = computeJsonHash(
      [
        [a.requirementId, aHash],
        [b.requirementId, aHash],
      ].sort(([x], [y]) => {
        const sx = x as string;
        const sy = y as string;
        return sx < sy ? -1 : sx > sy ? 1 : 0;
      }),
    );
    expect(computeBundleVersion([a, b])).toBe(expected);
  });
});
