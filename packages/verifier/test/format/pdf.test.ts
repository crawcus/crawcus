/**
 * Unit tests for `renderPdf` — TKT-VERIFIER-1b spec §5a row 1.
 *
 * Coverage:
 *   - Renders a valid PDF document (header + EOF + xref)
 *   - Embeds verdict line + per-check rows + bundle metadata + verifier identity
 *   - Embeds the wet-signature line wording
 *   - Renders deterministically — same `VerifyResult` → byte-identical output
 *   - Multi-page when checks would overflow one page
 *   - Sanitises non-ASCII detail content
 *
 * Test approach: the hand-written PDF generator produces UNCOMPRESSED
 * text streams (no /Filter /FlateDecode), so the rendered text is
 * readable as plain ASCII in the byte output. Tests assert by
 * searching for substrings in the decoded bytes — no `pdf-parse`
 * dependency required (which keeps the offline-test invariant green
 * and avoids burning bundle-size headroom on a test-only dep).
 */

import { describe, expect, it } from 'vitest';
import { renderPdf } from '../../src/format/pdf.js';
import type { VerifyResult } from '../../src/types.js';

function makeResult(overrides: Partial<VerifyResult> = {}): VerifyResult {
  return {
    verdict: 'pass',
    checks: [
      {
        id: 'dsse.envelope.shape',
        label: 'DSSE envelope shape',
        verdict: 'pass',
        detail: 'envelope parsed; payloadType in CRAWCUS family',
      },
      {
        id: 'dsse.signature',
        label: 'DSSE ed25519 signature',
        verdict: 'pass',
        detail: 'ed25519 signature verified against embedded keyid',
      },
      {
        id: 'chain.hash-chain',
        label: 'Hash chain integrity',
        verdict: 'pass',
        detail: '3 events; chain walks cleanly',
      },
    ],
    bundleMetadata: {
      bundleId: 'i_test',
      schemaVersion: '0.1.0',
      payloadType: 'application/vnd.crawcus.bundle+jsonl',
      signerKeyId: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
      eventCount: 3,
      contractCount: 0,
      earliestEventTs: '2026-01-01T00:00:00.000Z',
      latestEventTs: '2026-01-01T00:00:02.000Z',
    },
    verifiedAt: '2026-06-03T12:00:00.000Z',
    verifierIdentity: {
      version: '0.2.0',
      publicKeyFingerprint: 'wave1-unsigned-no-verifier-output-signature',
      buildSha: 'devbuild',
    },
    ...overrides,
  };
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('renderPdf', () => {
  it('produces a PDF 1.4 document with header + xref + EOF terminator', () => {
    const bytes = renderPdf(makeResult());
    const text = decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('xref');
    expect(text).toContain('startxref');
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('embeds the verdict headline (em-dash sanitised → ?)', () => {
    const bytes = renderPdf(makeResult());
    const text = decode(bytes);
    // The headline is "CRAWCUS VERIFY — PASS" — the em-dash is
    // non-ASCII, so the sanitiser folds it to "?" (preserves visual
    // length per the rule-of-thumb). Both pieces survive verbatim.
    expect(text).toMatch(/CRAWCUS VERIFY/);
    expect(text).toContain('PASS');
  });

  it('embeds bundle metadata block — bundle id + payloadType + signerKeyId', () => {
    const bytes = renderPdf(makeResult());
    const text = decode(bytes);
    expect(text).toContain('Bundle id:');
    expect(text).toContain('i_test');
    expect(text).toContain('application/vnd.crawcus.bundle+jsonl');
    expect(text).toContain('aabbccddeeff00112233445566778899');
  });

  it('embeds per-check rows with verdict markers', () => {
    const bytes = renderPdf(makeResult());
    const text = decode(bytes);
    expect(text).toContain('[PASS]');
    expect(text).toContain('dsse.envelope.shape');
    expect(text).toContain('dsse.signature');
    expect(text).toContain('chain.hash-chain');
  });

  it('embeds verifier identity block (version + buildSha)', () => {
    const bytes = renderPdf(makeResult());
    const text = decode(bytes);
    expect(text).toContain('crawcus-verify 0.2.0');
    expect(text).toContain('Build SHA:');
    expect(text).toContain('devbuild');
  });

  it('embeds the wet-signature line wording — "Reviewed by:" + "Date:"', () => {
    const bytes = renderPdf(makeResult());
    const text = decode(bytes);
    // Per spec §7(e) — wet-signature line semantics surfaced as
    // "Reviewed by" deliberately weaker than "Verified".
    expect(text).toContain('Reviewed by:');
    expect(text).toContain('Date:');
    // Auditor signature line uses underscores for wet-ink filling.
    expect(text).toContain('____');
  });

  it('embeds the footer with verifier version + generated timestamp', () => {
    const bytes = renderPdf(makeResult());
    const text = decode(bytes);
    expect(text).toContain('crawcus-verify 0.2.0');
    expect(text).toContain('2026-06-03T12:00:00.000Z');
  });

  it('renders deterministically — same VerifyResult → byte-identical PDF', () => {
    const result = makeResult();
    const a = renderPdf(result);
    const b = renderPdf(result);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        throw new Error(`byte mismatch at offset ${String(i)}: ${String(a[i])} vs ${String(b[i])}`);
      }
    }
  });

  it('embeds FAIL verdict when result fails', () => {
    const result = makeResult({
      verdict: 'fail',
      checks: [
        {
          id: 'dsse.signature',
          label: 'DSSE ed25519 signature',
          verdict: 'fail',
          violationKind: 'Envelope.signature.invalid',
          detail: 'ed25519 signature did not verify against the embedded keyid',
        },
      ],
    });
    const bytes = renderPdf(result);
    const text = decode(bytes);
    expect(text).toContain('FAIL');
    expect(text).toContain('[FAIL]');
    expect(text).toContain('Envelope.signature.invalid');
  });

  it('embeds HISTORICAL-UNVERIFIABLE verdict and [HIST] marker', () => {
    const result = makeResult({
      verdict: 'historical-unverifiable',
      checks: [
        {
          id: 'contract.pre.rotated.predicate',
          label: 'Contract re-evaluation (pre: rotated.predicate)',
          verdict: 'historical-unverifiable',
          detail: 'predicate source hash mismatch — predicate may have rotated',
        },
      ],
    });
    const bytes = renderPdf(result);
    const text = decode(bytes);
    expect(text).toContain('HISTORICAL-UNVERIFIABLE');
    expect(text).toContain('[HIST]');
  });

  it('paginates when checks overflow one page — emits 2 page objects', () => {
    // ~60 checks should comfortably overflow a single Letter page.
    const checks = Array.from({ length: 60 }, (_, i) => ({
      id: `chain.event.${String(i).padStart(4, '0')}`,
      label: `Event ${String(i)} hash`,
      verdict: 'pass' as const,
      detail: `event ${String(i)} hash linked to previous (long detail to push wrap)`,
    }));
    const bytes = renderPdf(makeResult({ checks }));
    const text = decode(bytes);
    const pageObjs = text.match(/\/Type \/Page\b(?!s)/g);
    expect(pageObjs).not.toBeNull();
    // Use at least 2 page objects.
    expect(pageObjs?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('sanitises non-ASCII content in detail strings (UTF-8 → ?)', () => {
    const result = makeResult({
      checks: [
        {
          id: 'test.unicode',
          label: 'Unicode',
          verdict: 'pass',
          detail: 'naïve façade — 中文',
        },
      ],
    });
    const bytes = renderPdf(result);
    const text = decode(bytes);
    // The ASCII parts survive; non-ASCII becomes ?.
    expect(text).toContain('na?ve fa?ade');
    expect(text).toContain('??'); // Chinese chars → two ?
  });

  it('escapes literal parens + backslashes in detail per PDF spec', () => {
    const result = makeResult({
      checks: [
        {
          id: 'test.parens',
          label: 'Parens',
          verdict: 'pass',
          detail: 'matched (group A) and (group B) — path C:\\foo',
        },
      ],
    });
    const bytes = renderPdf(result);
    const text = decode(bytes);
    // Escape sequences \( \) \\ appear in the content stream verbatim.
    expect(text).toContain('\\(group A\\)');
    expect(text).toContain('\\(group B\\)');
    expect(text).toContain('C:\\\\foo');
  });

  it('renders [SKIP] marker for skipped checks', () => {
    const result = makeResult({
      checks: [
        {
          id: 'contract.skipped.example',
          label: 'Skipped contract',
          verdict: 'skipped',
          detail: 'predicate re-evaluation skipped per --no-reeval option',
        },
      ],
    });
    const bytes = renderPdf(result);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('[SKIP]');
  });

  it('handles VerifyResult with empty checks array', () => {
    const bytes = renderPdf(makeResult({ checks: [] }));
    const text = new TextDecoder('latin1').decode(bytes);
    // Still emits headline + Bundle metadata + Auditor sign-off blocks.
    expect(text).toContain('PASS');
    expect(text).toContain('Bundle id:');
    expect(text).toContain('Reviewed by:');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
  });

  it('handles bundleMetadata with empty fields (<unknown> fallbacks)', () => {
    const bytes = renderPdf(
      makeResult({
        bundleMetadata: {
          bundleId: '',
          schemaVersion: '',
          payloadType: '',
          signerKeyId: '',
          eventCount: 0,
          contractCount: 0,
          earliestEventTs: '',
          latestEventTs: '',
        },
      }),
    );
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('<unknown>');
  });

  it('wraps multi-line detail strings (preserves embedded newlines)', () => {
    const result = makeResult({
      checks: [
        {
          id: 'test.multiline',
          label: 'Multi-line',
          verdict: 'pass',
          detail: 'first line\nsecond line\nthird line',
        },
      ],
    });
    const bytes = renderPdf(result);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('first line');
    expect(text).toContain('second line');
    expect(text).toContain('third line');
  });

  it('handles a malformed verifiedAt by using a fallback /CreationDate', () => {
    const bytes = renderPdf(makeResult({ verifiedAt: 'not-an-iso-date' }));
    const text = new TextDecoder('latin1').decode(bytes);
    // The pdfDate helper returns the all-zero fallback for unparseable input.
    expect(text).toContain('/CreationDate (D:00000101000000Z)');
  });

  it('encodes /CreationDate from verifiedAt deterministically', () => {
    const bytes = renderPdf(makeResult({ verifiedAt: '2026-06-03T12:34:56.789Z' }));
    const text = decode(bytes);
    expect(text).toContain('/CreationDate (D:20260603123456Z)');
  });

  it('emits a /Producer field identifying crawcus-verify', () => {
    const bytes = renderPdf(makeResult());
    const text = decode(bytes);
    expect(text).toContain('/Producer (crawcus-verify)');
  });
});
