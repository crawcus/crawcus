/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Strict JSON reading for receipts: one RFC 8259 JSON text, valid UTF-8,
 * no byte order mark, and no duplicate member names in any object.
 *
 * `JSON.parse` keeps the last of two duplicate members without saying so,
 * which lets two readers of the same bytes see different values. This
 * reader refuses such input instead.
 */

export type StrictJsonResult =
  | { readonly ok: true; readonly value: unknown; readonly text: string }
  | { readonly ok: false; readonly reason: string };

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Decode bytes as UTF-8 without a BOM, then parse one strict JSON text. */
export function parseStrictJsonBytes(bytes: Uint8Array): StrictJsonResult {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { ok: false, reason: 'begins with a byte order mark' };
  }
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return { ok: false, reason: 'not valid UTF-8' };
  }
  try {
    const p = new Parser(text);
    p.ws();
    const value = p.value();
    p.ws();
    if (p.i !== text.length) throw new SyntaxError(`trailing data at offset ${p.i}`);
    return { ok: true, value, text };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

class Parser {
  i = 0;
  constructor(private readonly s: string) {}

  ws(): void {
    while (this.i < this.s.length) {
      const c = this.s.charCodeAt(this.i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.i++;
      else break;
    }
  }

  value(): unknown {
    const c = this.s[this.i];
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"') return this.string();
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return this.number();
    for (const [lit, v] of [['true', true], ['false', false], ['null', null]] as const) {
      if (this.s.startsWith(lit, this.i)) {
        this.i += lit.length;
        return v;
      }
    }
    throw new SyntaxError(`unexpected ${c === undefined ? 'end of input' : `character at offset ${this.i}`}`);
  }

  object(): Record<string, unknown> {
    this.i++;
    const out: Record<string, unknown> = {};
    const seen = new Set<string>();
    this.ws();
    if (this.s[this.i] === '}') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      if (this.s[this.i] !== '"') throw new SyntaxError(`expected member name at offset ${this.i}`);
      const key = this.string();
      if (seen.has(key)) throw new SyntaxError(`duplicate member name ${JSON.stringify(key)}`);
      seen.add(key);
      this.ws();
      if (this.s[this.i] !== ':') throw new SyntaxError(`expected ':' at offset ${this.i}`);
      this.i++;
      this.ws();
      // defineProperty, so a member named "__proto__" is an own member, not the prototype.
      Object.defineProperty(out, key, { value: this.value(), enumerable: true, writable: true, configurable: true });
      this.ws();
      const c = this.s[this.i++];
      if (c === '}') return out;
      if (c !== ',') throw new SyntaxError(`expected ',' or '}' at offset ${this.i - 1}`);
    }
  }

  array(): unknown[] {
    this.i++;
    const out: unknown[] = [];
    this.ws();
    if (this.s[this.i] === ']') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      out.push(this.value());
      this.ws();
      const c = this.s[this.i++];
      if (c === ']') return out;
      if (c !== ',') throw new SyntaxError(`expected ',' or ']' at offset ${this.i - 1}`);
    }
  }

  string(): string {
    const start = this.i;
    this.i++;
    while (this.i < this.s.length) {
      const c = this.s.charCodeAt(this.i);
      if (c === 0x22) {
        this.i++;
        return JSON.parse(this.s.slice(start, this.i)) as string;
      }
      if (c < 0x20) throw new SyntaxError(`control character in string at offset ${this.i}`);
      if (c === 0x5c) {
        const e = this.s[this.i + 1];
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(this.s.slice(this.i + 2, this.i + 6))) {
            throw new SyntaxError(`bad \\u escape at offset ${this.i}`);
          }
          this.i += 6;
          continue;
        }
        if (e === undefined || !'"\\/bfnrt'.includes(e)) throw new SyntaxError(`bad escape at offset ${this.i}`);
        this.i += 2;
        continue;
      }
      this.i++;
    }
    throw new SyntaxError('unterminated string');
  }

  number(): number {
    const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(this.s.slice(this.i));
    if (m === null) throw new SyntaxError(`bad number at offset ${this.i}`);
    this.i += m[0].length;
    return Number(m[0]);
  }
}
