import type { Token } from '@crawcus/spec';

/**
 * The canonical PII marker format: `[[pii:<token>]]`. Tokens are
 * opaque identifiers issued by the PII vault — they're stable
 * pointers, not the original values.
 *
 * Per `00-canon/compliance-by-design.md` §1: "PII becomes a token
 * (`[[pii:abc123]]`). Originals live in a separate vault with
 * per-tenant encryption. Decryption only at display time, every
 * access logged."
 */

/** Regex matching one PII marker anywhere in a string (global). */
export const PII_MARKER_PATTERN = /\[\[pii:([A-Za-z0-9_-]+)\]\]/g;

/** Regex matching a string that IS a single PII marker, end-to-end. */
const PII_MARKER_STRICT = /^\[\[pii:[A-Za-z0-9_-]+\]\]$/;

export function makeMarker(token: Token): string {
  return `[[pii:${token}]]`;
}

export function isMarker(text: string): boolean {
  return PII_MARKER_STRICT.test(text);
}

/** Extract every token referenced in the input string. */
export function extractTokens(text: string): readonly Token[] {
  const out: Token[] = [];
  const re = new RegExp(PII_MARKER_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const captured = match[1];
    if (captured !== undefined) {
      out.push(captured as Token);
    }
  }
  return out;
}

/** True iff the string contains at least one marker. */
export function containsMarker(text: string): boolean {
  return new RegExp(PII_MARKER_PATTERN).test(text);
}
