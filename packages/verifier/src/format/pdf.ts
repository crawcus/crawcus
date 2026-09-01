/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auditor-signable PDF renderer for `VerifyResult`.
 *
 * Spec source:
 *   `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1b-spec.md` §2(a)
 *
 * Why a hand-written PDF generator (no `pdfkit` / `@react-pdf/renderer`):
 *
 *   1. Zero dependencies — surfaces no network risk; nothing fetched
 *      from registries beyond what the verifier already needs.
 *   2. The `unshare -n` CI job (spec §9 + parent §"What we explicitly
 *      do NOT do") stays trivially green — no transitive network call
 *      from a heavyweight PDF lib can sneak in.
 *   3. Bundle-size discipline (NFR M7.2 + ratchet #11) — the verifier-
 *      CLI bundle cap is 500 KB; adding a 50+ KB PDF lib would burn
 *      meaningful headroom for a one-page text report.
 *   4. The output is a fixed-shape auditor report (title + metadata
 *      table + per-check rows + verifier identity + wet-signature
 *      line + footer) — no rich-text, no images, no fonts beyond
 *      PDF-built-in Helvetica. Hand-writing fits the surface.
 *
 * PDF 1.4 structure used (RFC equivalent — Adobe PDF Reference §3):
 *
 *   - One %PDF-1.4 header line
 *   - Catalog + Pages + per-Page + Content-stream + Font objects
 *   - One xref table + one trailer with /Size, /Root, /ID
 *   - %%EOF terminator
 *
 * Text rendering uses the Helvetica built-in PDF font (no embedded
 * font bytes; every PDF reader ships Helvetica metrics). We render
 * left-to-right ASCII; non-ASCII bytes in `VerifyResult.detail` are
 * stripped to `?` to avoid breaking the encoding (PDFDocEncoding has
 * surprises for high-byte UTF-8).
 *
 * Multi-page: simple page-break when the cursor would overflow the
 * usable area. Each new page is a fresh content stream with the
 * Font/F1 reference and identical margins.
 *
 * Pure function; no I/O; deterministic with respect to inputs except
 * the `/CreationDate` embedded in the trailer, which is sourced from
 * `result.verifiedAt` so two runs of the same VerifyResult produce
 * byte-identical PDFs (load-bearing for test snapshots).
 */

import type { VerifyCheck, VerifyResult } from '../types.js';

/** US-Letter page size in PDF user units (1/72 inch). */
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 56;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const LINE_HEIGHT = 14;
const HEADING_SIZE = 18;
const SUBHEAD_SIZE = 12;
const BODY_SIZE = 10;
const FOOTER_SIZE = 8;

/**
 * Wet-signature line wording. Per spec §7(e), this wording is
 * surfaced for founder + future-auditor-counsel review before locking;
 * the choice here ("Reviewed by") is deliberately weaker than
 * "Verified" — only the cryptographic checks (DSSE + chain + Contract
 * re-eval) attest to verification; the auditor's wet signature
 * attests to human review of the verifier output, not to the
 * underlying bundle's correctness.
 *
 * Surface: change this wording surfaces in the PR description per
 * §7(e); the test asserts the literal string.
 */
const SIGNATURE_LINE_LABEL = 'Reviewed by:';
const SIGNATURE_DATE_LABEL = 'Date:';

/** Render a `VerifyResult` to PDF bytes. */
export function renderPdf(result: VerifyResult): Uint8Array {
  const builder = new PdfBuilder();
  layoutReport(builder, result);
  return builder.finish(result.verifiedAt);
}

// ============ Layout ============

function layoutReport(builder: PdfBuilder, result: VerifyResult): void {
  // Title block — verdict-coloured headline.
  builder.text(verdictHeadline(result), HEADING_SIZE, true);
  builder.gap(LINE_HEIGHT);

  // Bundle metadata block.
  builder.text('Bundle metadata', SUBHEAD_SIZE, true);
  builder.gap(LINE_HEIGHT / 2);
  const m = result.bundleMetadata;
  builder.text(`Bundle id:       ${nonEmpty(m.bundleId)}`, BODY_SIZE);
  builder.text(`Schema version:  ${nonEmpty(m.schemaVersion)}`, BODY_SIZE);
  builder.text(`Payload type:    ${nonEmpty(m.payloadType)}`, BODY_SIZE);
  builder.text(`Signer key id:   ${nonEmpty(m.signerKeyId)}`, BODY_SIZE);
  builder.text(
    `Events: ${String(m.eventCount)}    Contracts: ${String(m.contractCount)}`,
    BODY_SIZE,
  );
  builder.text(
    `Earliest event: ${nonEmpty(m.earliestEventTs)}    Latest: ${nonEmpty(m.latestEventTs)}`,
    BODY_SIZE,
  );
  builder.gap(LINE_HEIGHT);

  // Per-check table.
  builder.text('Checks', SUBHEAD_SIZE, true);
  builder.gap(LINE_HEIGHT / 2);
  for (const c of result.checks) {
    layoutCheckRow(builder, c);
  }
  builder.gap(LINE_HEIGHT);

  // Verifier identity block.
  builder.text('Verifier identity', SUBHEAD_SIZE, true);
  builder.gap(LINE_HEIGHT / 2);
  builder.text(`crawcus-verify ${result.verifierIdentity.version}`, BODY_SIZE);
  builder.text(`Build SHA:           ${result.verifierIdentity.buildSha}`, BODY_SIZE);
  builder.text(`Public key fp:       ${result.verifierIdentity.publicKeyFingerprint}`, BODY_SIZE);
  builder.text(`Verified at:         ${result.verifiedAt}`, BODY_SIZE);
  builder.gap(LINE_HEIGHT * 2);

  // Wet-signature line block.
  builder.text('Auditor sign-off', SUBHEAD_SIZE, true);
  builder.gap(LINE_HEIGHT);
  // Two long underscore lines for wet-ink filling.
  builder.text(
    `${SIGNATURE_LINE_LABEL} ____________________________________________________`,
    BODY_SIZE,
  );
  builder.gap(LINE_HEIGHT * 2);
  builder.text(
    `${SIGNATURE_DATE_LABEL} ____________________________________________________`,
    BODY_SIZE,
  );

  // Footer (drawn at bottom-margin of last page only).
  builder.footer(
    `crawcus-verify ${result.verifierIdentity.version} — generated ${result.verifiedAt}`,
    FOOTER_SIZE,
  );
}

function layoutCheckRow(builder: PdfBuilder, c: VerifyCheck): void {
  const marker = checkMarker(c.verdict);
  const kind = c.violationKind !== undefined ? ` [${c.violationKind}]` : '';
  builder.text(`${marker} ${c.id}${kind}`, BODY_SIZE, false);
  // Detail wrapped onto a continuation line, indented.
  const wrapped = wrapText(c.detail, 86);
  for (const line of wrapped) {
    builder.text(`    ${line}`, BODY_SIZE, false);
  }
}

function verdictHeadline(result: VerifyResult): string {
  switch (result.verdict) {
    case 'pass':
      return 'CRAWCUS VERIFY — PASS';
    case 'fail':
      return 'CRAWCUS VERIFY — FAIL';
    case 'historical-unverifiable':
      return 'CRAWCUS VERIFY — HISTORICAL-UNVERIFIABLE';
    default: {
      const _exhaustive: never = result.verdict;
      void _exhaustive;
      return 'CRAWCUS VERIFY';
    }
  }
}

function checkMarker(v: VerifyCheck['verdict']): string {
  switch (v) {
    case 'pass':
      return '[PASS]';
    case 'fail':
      return '[FAIL]';
    case 'historical-unverifiable':
      return '[HIST]';
    case 'skipped':
      return '[SKIP]';
    default: {
      const _exhaustive: never = v;
      void _exhaustive;
      return '[?]';
    }
  }
}

function nonEmpty(s: string): string {
  return s === '' ? '<unknown>' : s;
}

/** Word-wrap a single line of text to fit within `width` characters. */
function wrapText(text: string, width: number): readonly string[] {
  const out: string[] = [];
  const paragraphs = text.split('\n');
  for (const p of paragraphs) {
    if (p.length <= width) {
      out.push(p);
      continue;
    }
    const words = p.split(' ');
    let line = '';
    for (const w of words) {
      if (line.length === 0) {
        line = w;
        continue;
      }
      if (line.length + 1 + w.length > width) {
        out.push(line);
        line = w;
      } else {
        line = `${line} ${w}`;
      }
    }
    if (line.length > 0) out.push(line);
  }
  return out;
}

// ============ Minimal PDF builder ============

/**
 * Accumulates layout calls into a per-page content stream, page-
 * breaks when the cursor would overflow the usable area, and emits
 * a complete PDF 1.4 document on `finish()`.
 *
 * Implementation note — we keep this class internal to this module;
 * the public surface is `renderPdf(result)`.
 */
class PdfBuilder {
  private readonly pages: string[] = [''];
  private cursor: number = PAGE_HEIGHT - MARGIN_TOP;
  private footerLine: string | null = null;
  private footerSize: number = FOOTER_SIZE;

  /** Add a text line at the current cursor + advance the cursor. */
  text(content: string, size: number, bold = false): void {
    const lineHeight = Math.max(LINE_HEIGHT, size + 4);
    if (this.cursor - lineHeight < MARGIN_BOTTOM + LINE_HEIGHT) {
      this.newPage();
    }
    const safe = sanitizeForPdf(content);
    const fontRef = bold ? 'F2' : 'F1';
    const op =
      `BT\n/${fontRef} ${String(size)} Tf\n` +
      `${String(MARGIN_LEFT)} ${String(this.cursor - size)} Td\n` +
      `(${safe}) Tj\nET\n`;
    this.pages[this.pages.length - 1] = `${this.pages[this.pages.length - 1] ?? ''}${op}`;
    this.cursor -= lineHeight;
  }

  /** Advance the cursor by `gap` user units without drawing. */
  gap(gap: number): void {
    this.cursor -= gap;
  }

  /** Set a footer line to render at the bottom of the last page. */
  footer(content: string, size: number): void {
    this.footerLine = content;
    this.footerSize = size;
  }

  /** Force a new page. */
  private newPage(): void {
    this.pages.push('');
    this.cursor = PAGE_HEIGHT - MARGIN_TOP;
  }

  /** Emit the full PDF bytes. */
  finish(verifiedAt: string): Uint8Array {
    // Append the footer line to the LAST page only.
    if (this.footerLine !== null) {
      const safe = sanitizeForPdf(this.footerLine);
      const op =
        `BT\n/F1 ${String(this.footerSize)} Tf\n` +
        `${String(MARGIN_LEFT)} ${String(MARGIN_BOTTOM - this.footerSize - 4)} Td\n` +
        `(${safe}) Tj\nET\n`;
      this.pages[this.pages.length - 1] = `${this.pages[this.pages.length - 1] ?? ''}${op}`;
    }

    // Build the object table. PDF object numbers:
    //   1 = Catalog
    //   2 = Pages
    //   3 = Font Helvetica (F1)
    //   4 = Font Helvetica-Bold (F2)
    //   5..  per Page object (alternating page + content-stream)
    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    const pageCount = this.pages.length;
    const pageRefs: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      // Page object number = 5 + i*2; Content stream = 5 + i*2 + 1.
      pageRefs.push(`${String(5 + i * 2)} 0 R`);
    }
    objects.push(
      `<< /Type /Pages /Count ${String(pageCount)} /Kids [ ${pageRefs.join(' ')} ] ` +
        `/MediaBox [0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)}] >>`,
    );
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    for (let i = 0; i < pageCount; i++) {
      const contentRef = 5 + i * 2 + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
          `/Contents ${String(contentRef)} 0 R >>`,
      );
      const stream = this.pages[i] ?? '';
      const length = stream.length;
      objects.push(`<< /Length ${String(length)} >>\nstream\n${stream}endstream`);
    }

    // Serialise — body + xref + trailer.
    let body = '%PDF-1.4\n%âãÏÓ\n';
    const offsets: number[] = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(byteLength(body));
      body += `${String(i + 1)} 0 obj\n${objects[i] ?? ''}\nendobj\n`;
    }

    const xrefOffset = byteLength(body);
    let xref = `xref\n0 ${String(objects.length + 1)}\n`;
    xref += '0000000000 65535 f \n';
    for (const o of offsets) {
      xref += `${o.toString(10).padStart(10, '0')} 00000 n \n`;
    }

    // Stable trailer ID — derived from verifiedAt so the same VerifyResult
    // produces byte-identical PDFs (load-bearing for snapshot tests).
    const idHex = stableIdHex(verifiedAt);
    const trailer =
      `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R ` +
      `/ID [ <${idHex}> <${idHex}> ] ` +
      `/Producer (crawcus-verify) ` +
      `/CreationDate (D:${pdfDate(verifiedAt)}) >>\n` +
      `startxref\n${String(xrefOffset)}\n%%EOF\n`;

    const tail = `${xref}${trailer}`;
    const out = new TextEncoder().encode(`${body}${tail}`);
    return out;
  }
}

/**
 * Sanitize a string for embedding in a PDF text-string literal.
 *
 *   - Escape `(`, `)`, `\` per PDF spec §7.3.4.2.
 *   - Strip non-ASCII so the (PDFDocEncoding default) doesn't garble.
 *
 * Non-ASCII becomes `?` rather than being dropped to preserve visual
 * length (auditors comparing rendered output line-by-line shouldn't
 * see misaligned columns).
 */
function sanitizeForPdf(content: string): string {
  let out = '';
  for (const ch of content) {
    const code = ch.charCodeAt(0);
    if (code === 0x28) {
      out += '\\(';
      continue;
    }
    if (code === 0x29) {
      out += '\\)';
      continue;
    }
    if (code === 0x5c) {
      out += '\\\\';
      continue;
    }
    if (code >= 0x20 && code <= 0x7e) {
      out += ch;
      continue;
    }
    out += '?';
  }
  return out;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Format `verifiedAt` (ISO 8601) as a PDF date `YYYYMMDDHHmmssZ`. */
function pdfDate(isoTs: string): string {
  // Accept either `2026-06-03T12:00:00.000Z` or a fallback now-ish string.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(isoTs);
  if (m === null) {
    return '00000101000000Z';
  }
  return `${m[1] ?? '0000'}${m[2] ?? '01'}${m[3] ?? '01'}${m[4] ?? '00'}${m[5] ?? '00'}${m[6] ?? '00'}Z`;
}

/**
 * Derive a 32-hex-char PDF /ID from `verifiedAt`. Not cryptographic;
 * exists only to keep the PDF byte-stable for snapshot tests.
 */
function stableIdHex(isoTs: string): string {
  let hash = 0x9e3779b9;
  for (let i = 0; i < isoTs.length; i++) {
    hash = (hash ^ isoTs.charCodeAt(i)) >>> 0;
    hash = Math.imul(hash, 0x85ebca6b) >>> 0;
    hash = (hash ^ (hash >>> 13)) >>> 0;
  }
  // Expand to 16 bytes (32 hex chars) deterministically.
  let out = '';
  let state = hash;
  for (let i = 0; i < 16; i++) {
    state = (Math.imul(state, 0x27d4eb2d) ^ (state >>> 15)) >>> 0;
    out += (state & 0xff).toString(16).padStart(2, '0');
  }
  return out;
}
