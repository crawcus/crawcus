import { describe, it, expect } from 'vitest';
import { tokenisePayload, assertNoRawPII } from '../../src/pii/tokenise.js';
import { unsafeAssertUntainted } from '../../src/event/write-event.js';
import { RawPIIInPayloadError } from '../../src/errors/index.js';
import type { PIIPort, PIIHit } from '../../src/ports/pii.js';
import type { Token } from '@crawcus/spec';
import type { Tainted } from '@crawcus/spec';
import type { TenantCtx } from '@crawcus/spec';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const ctx: TenantCtx = {
  tenant: {
    id: b<string, 'TenantId'>('tnt') as never,
    region: b<string, 'Region'>('local') as never,
  },
  actor: { id: b<string, 'ActorId'>('act') as never, kind: 'system' },
};

// ---------- stub PII detectors ----------

/** No-op detector: detects nothing; passes text through unchanged. */
const noopPort: PIIPort = {
  detect: async () => [] as readonly PIIHit[],
  tokenize: async (text) => ({
    text,
    tokens: [] as readonly { token: Token; kind: PIIHit['kind'] }[],
  }),
  detokenize: async (text) => text,
};

/** Regex detector: flags "John" as a name; replaces with token. */
function regexPort(): PIIPort {
  let counter = 0;
  return {
    detect: async (text) => {
      const hits: PIIHit[] = [];
      const re = /\bJohn\b/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        hits.push({ start: m.index, end: m.index + m[0].length, kind: 'name', confidence: 0.9 });
      }
      return hits;
    },
    tokenize: async (text) => {
      const rewritten = text.replace(/\bJohn\b/g, () => {
        counter += 1;
        return `[[pii:tok${counter}]]`;
      });
      return {
        text: rewritten,
        tokens: [] as readonly { token: Token; kind: PIIHit['kind'] }[],
      };
    },
    detokenize: async (text) => text.replace(/\[\[pii:tok\d+\]\]/g, 'John'),
  };
}

describe('tokenisePayload', () => {
  it('passes through payload with no PII', async () => {
    const input = unsafeAssertUntainted({ a: 'hello', n: 42 }) as unknown as Tainted<{
      a: string;
      n: number;
    }>;
    const out = await tokenisePayload(input, { ...ctx, pii: noopPort });
    expect(out).toEqual({ a: 'hello', n: 42 });
  });

  it('replaces detected PII spans with tokens', async () => {
    const input = unsafeAssertUntainted({ message: 'Hi, John here' }) as unknown as Tainted<{
      message: string;
    }>;
    const out = (await tokenisePayload(input, { ...ctx, pii: regexPort() })) as { message: string };
    expect(out.message).toContain('[[pii:tok');
    expect(out.message).not.toContain('John');
  });

  it('walks nested objects', async () => {
    const input = unsafeAssertUntainted({
      a: { b: 'John', c: [{ d: 'John' }] },
    }) as unknown as Tainted<unknown>;
    const out = (await tokenisePayload(input, { ...ctx, pii: regexPort() })) as {
      a: { b: string; c: { d: string }[] };
    };
    expect(out.a.b).toContain('[[pii:tok');
    expect(out.a.c[0]?.d).toContain('[[pii:tok');
  });

  it('does not re-tokenise strings that are already markers', async () => {
    const input = unsafeAssertUntainted({ s: '[[pii:abc]]' }) as unknown as Tainted<{
      s: string;
    }>;
    const out = (await tokenisePayload(input, { ...ctx, pii: regexPort() })) as { s: string };
    expect(out.s).toBe('[[pii:abc]]');
  });

  it('preserves primitives + nulls + Dates', async () => {
    const d = new Date('2026-05-20T00:00:00.000Z');
    const input = unsafeAssertUntainted({
      n: 42,
      b: true,
      x: null,
      d,
      s: 'plain',
    }) as unknown as Tainted<unknown>;
    const out = (await tokenisePayload(input, { ...ctx, pii: noopPort })) as {
      n: number;
      b: boolean;
      x: null;
      d: Date;
      s: string;
    };
    expect(out.n).toBe(42);
    expect(out.b).toBe(true);
    expect(out.x).toBe(null);
    expect(out.d).toBe(d);
    expect(out.s).toBe('plain');
  });

  it('does not mutate input', async () => {
    const input = unsafeAssertUntainted({ s: 'John' }) as unknown as Tainted<{ s: string }>;
    const original = (input as unknown as { s: string }).s;
    await tokenisePayload(input, { ...ctx, pii: regexPort() });
    expect((input as unknown as { s: string }).s).toBe(original);
  });
});

describe('assertNoRawPII — scrubber (defense-in-depth)', () => {
  it('passes when payload has no PII', async () => {
    await expect(assertNoRawPII({ s: 'hello' }, { pii: noopPort })).resolves.toBeUndefined();
  });

  it('throws RawPIIInPayloadError when raw PII detected', async () => {
    await expect(assertNoRawPII({ s: 'John' }, { pii: regexPort() })).rejects.toBeInstanceOf(
      RawPIIInPayloadError,
    );
  });

  it('passes when only tokenised markers remain', async () => {
    await expect(
      assertNoRawPII({ s: '[[pii:abc]]' }, { pii: regexPort() }),
    ).resolves.toBeUndefined();
  });

  it('detects PII in nested fields', async () => {
    await expect(assertNoRawPII({ a: { b: 'John' } }, { pii: regexPort() })).rejects.toBeInstanceOf(
      RawPIIInPayloadError,
    );
  });
});
