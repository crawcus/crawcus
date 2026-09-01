import { describe, expect, it } from 'vitest';
import {
  LAWFUL_BASIS_VALUES,
  TOOL_GATES,
  TOOL_RISKS,
  type ToolGate,
  type ToolRisk,
  type ToolSpec,
} from '../../src/tool/types.js';
import { evaluateToolSpec } from '../../src/tool/evaluate.js';
// Barrel re-export — confirms the public surface advertises the evaluator.
import { evaluateToolSpec as evaluateFromBarrel } from '../../src/tool/index.js';
import type { JsonSchema } from '../../src/types/json.js';
import type { LawfulBasis } from '../../src/types/compliance.js';
import type { ToolName } from '../../src/types/ids.js';
import { defineCrawcusSpec } from '../../src/intent/define-crawcus-spec.js';
import { field } from '../../src/intent/field.js';
import type { IntentKey, ProjectionName } from '../../src/types/ids.js';

// ---------- helpers ----------

const tname = (s: string): ToolName => s as ToolName;
const ikey = (s: string): IntentKey => s as unknown as IntentKey;
const pname = (s: string): ProjectionName => s as unknown as ProjectionName;

const baseSchema: JsonSchema = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
};

const baseSpec = (over: Partial<ToolSpec> = {}): ToolSpec => ({
  inputSchema: baseSchema,
  risk: 'low',
  gate: 'none',
  lawfulBasis: 'contract',
  ...over,
});

// ---------- evaluator: positive ----------

describe('evaluateToolSpec — positive cases', () => {
  // Sanity: the barrel re-export and the module export are the same
  // function — guarantees the public surface is stable.
  it('the evaluator is the same function whether imported via barrel or module', () => {
    expect(evaluateFromBarrel).toBe(evaluateToolSpec);
  });

  it('accepts every (risk × gate) combination — 3 × 3 = 9 specs', () => {
    for (const risk of TOOL_RISKS) {
      for (const gate of TOOL_GATES) {
        const spec = baseSpec({ risk, gate });
        const result = evaluateToolSpec(tname('update-setup'), spec);
        expect(result).toEqual({ ok: true });
      }
    }
  });

  it('accepts every LawfulBasis value', () => {
    for (const basis of LAWFUL_BASIS_VALUES) {
      const spec = baseSpec({ lawfulBasis: basis });
      const result = evaluateToolSpec(tname('update-setup'), spec);
      expect(result).toEqual({ ok: true });
    }
  });

  it('accepts an optional description', () => {
    const result = evaluateToolSpec(
      tname('update-setup'),
      baseSpec({ description: 'Sets the course setup fields' }),
    );
    expect(result).toEqual({ ok: true });
  });
});

// ---------- evaluator: violations ----------

describe('evaluateToolSpec — violation codes', () => {
  it('reports invalid-risk when risk is unknown', () => {
    const result = evaluateToolSpec(
      tname('bad-risk'),
      // Force-cast to bypass the union type; simulates JSON-decoded input.
      baseSpec({ risk: 'extreme' as unknown as ToolRisk }),
    );
    expect(result).toEqual({
      ok: false,
      toolName: tname('bad-risk'),
      violations: [{ code: 'invalid-risk', received: 'extreme' }],
    });
  });

  it('reports invalid-gate when gate is unknown', () => {
    const result = evaluateToolSpec(
      tname('bad-gate'),
      baseSpec({ gate: 'auto' as unknown as ToolGate }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toEqual([{ code: 'invalid-gate', received: 'auto' }]);
    }
  });

  it('reports invalid-lawful-basis when basis is not in LAWFUL_BASIS_VALUES', () => {
    const result = evaluateToolSpec(
      tname('bad-basis'),
      baseSpec({ lawfulBasis: 'vibes' as unknown as LawfulBasis }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toEqual([{ code: 'invalid-lawful-basis', received: 'vibes' }]);
    }
  });

  it('reports missing-input-schema when inputSchema is undefined', () => {
    const result = evaluateToolSpec(
      tname('no-schema'),
      baseSpec({ inputSchema: undefined as unknown as JsonSchema }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toEqual([{ code: 'missing-input-schema' }]);
    }
  });

  it('reports missing-input-schema when inputSchema is null', () => {
    const result = evaluateToolSpec(
      tname('null-schema'),
      baseSpec({ inputSchema: null as unknown as JsonSchema }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toEqual([{ code: 'missing-input-schema' }]);
    }
  });

  it('reports malformed-input-schema when inputSchema root is not an object', () => {
    const result = evaluateToolSpec(
      tname('non-object-root'),
      baseSpec({ inputSchema: { type: 'string' } as unknown as JsonSchema }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      const v = result.violations[0];
      expect(v?.code).toBe('malformed-input-schema');
      if (v && v.code === 'malformed-input-schema') {
        // Carries the structural-error path + message
        expect(v.reason).toMatch(/JsonSchema root must declare type: 'object'/);
      }
    }
  });

  it('reports malformed-input-schema for nested array missing items', () => {
    const result = evaluateToolSpec(
      tname('nested-bad'),
      baseSpec({
        inputSchema: {
          type: 'object',
          properties: {
            // array without items → structural error
            tags: { type: 'array' } as unknown as JsonSchema,
          },
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const v = result.violations[0];
      expect(v?.code).toBe('malformed-input-schema');
    }
  });

  it('does NOT short-circuit — reports multiple violations in one pass', () => {
    const result = evaluateToolSpec(
      tname('many-bad'),
      baseSpec({
        risk: 'extreme' as unknown as ToolRisk,
        gate: 'auto' as unknown as ToolGate,
        lawfulBasis: 'vibes' as unknown as LawfulBasis,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(3);
      const codes = result.violations.map((v) => v.code).sort();
      expect(codes).toEqual(['invalid-gate', 'invalid-lawful-basis', 'invalid-risk']);
    }
  });
});

// ---------- TOOL_RISKS / TOOL_GATES discipline ----------

describe('TOOL_RISKS + TOOL_GATES — exhaustive runtime arrays', () => {
  it('TOOL_RISKS lists every ToolRisk value', () => {
    expect([...TOOL_RISKS]).toEqual(['low', 'medium', 'high']);
  });

  it('TOOL_GATES lists every ToolGate value', () => {
    expect([...TOOL_GATES]).toEqual(['none', 'contract', 'human']);
  });

  it('type assignability holds for TOOL_RISKS', () => {
    const risks: readonly ToolRisk[] = TOOL_RISKS;
    expect(risks).toHaveLength(3);
  });

  it('type assignability holds for TOOL_GATES', () => {
    const gates: readonly ToolGate[] = TOOL_GATES;
    expect(gates).toHaveLength(3);
  });
});

// ---------- LAWFUL_BASIS_VALUES drift detection ----------

describe('LAWFUL_BASIS_VALUES — GDPR Art 6 drift detection', () => {
  it('has exactly the 6 GDPR Art 6 lawful-basis values', () => {
    expect(LAWFUL_BASIS_VALUES).toHaveLength(6);
    expect([...LAWFUL_BASIS_VALUES]).toEqual([
      'consent',
      'contract',
      'legal-obligation',
      'vital-interests',
      'public-task',
      'legitimate-interest',
    ]);
  });

  it('every entry typechecks as LawfulBasis', () => {
    // If the LawfulBasis union changes, this type-level check fails.
    const values: readonly LawfulBasis[] = LAWFUL_BASIS_VALUES;
    expect(values).toHaveLength(LAWFUL_BASIS_VALUES.length);
  });

  it('every member of LawfulBasis appears in LAWFUL_BASIS_VALUES (covers union → array drift)', () => {
    // Construct a witness of each LawfulBasis literal and assert
    // membership. If a new basis is added to the union without an
    // entry here, the test author must add the witness — but the
    // compiler will reject any actual literal that isn't a
    // `LawfulBasis`.
    const witnesses: readonly LawfulBasis[] = [
      'consent',
      'contract',
      'legal-obligation',
      'vital-interests',
      'public-task',
      'legitimate-interest',
    ];
    for (const w of witnesses) {
      expect((LAWFUL_BASIS_VALUES as readonly string[]).includes(w)).toBe(true);
    }
  });
});

// ---------- CrawcusSpec.tools — type-level integration ----------

describe('CrawcusSpec.tools — defineCrawcusSpec accepts the tools field', () => {
  it('accepts a spec with a tools map', () => {
    const spec = defineCrawcusSpec({
      key: ikey('CreateCourse'),
      projection: pname('Course'),
      version: 1,
      fields: {
        courseName: field.string().required(),
      },
      readiness: ({ has }: { has: (...names: string[]) => boolean }) => has('courseName'),
      tools: {
        [tname('update-setup')]: {
          inputSchema: baseSchema,
          risk: 'low',
          gate: 'none',
          lawfulBasis: 'contract',
        },
        [tname('enroll-student')]: {
          inputSchema: baseSchema,
          risk: 'high',
          gate: 'human',
          lawfulBasis: 'consent',
        },
      },
    });
    expect(spec.tools).toBeDefined();
    expect(Object.keys(spec.tools ?? {})).toHaveLength(2);
  });

  it('back-compat: spec WITHOUT tools field parses + has tools === undefined', () => {
    const spec = defineCrawcusSpec({
      key: ikey('LegacyIntent'),
      projection: pname('Legacy'),
      version: 1,
      fields: {
        x: field.string().required(),
      },
      readiness: ({ has }: { has: (...names: string[]) => boolean }) => has('x'),
    });
    expect(spec.tools).toBeUndefined();
  });

  it('back-compat: spec authored before V6-14 (no tools) is structurally identical to one with tools: undefined', () => {
    const without = defineCrawcusSpec({
      key: ikey('A'),
      projection: pname('A'),
      version: 1,
      fields: { x: field.string().required() },
      readiness: ({ has }: { has: (...names: string[]) => boolean }) => has('x'),
    });
    expect('tools' in without).toBe(false);
  });

  it('all 9 (risk × gate) combinations construct + evaluate ok via defineCrawcusSpec', () => {
    for (const risk of TOOL_RISKS) {
      for (const gate of TOOL_GATES) {
        const spec = defineCrawcusSpec({
          key: ikey(`K-${risk}-${gate}`),
          projection: pname('P'),
          version: 1,
          fields: { x: field.string().required() },
          readiness: ({ has }: { has: (...names: string[]) => boolean }) => has('x'),
          tools: {
            [tname('t')]: { inputSchema: baseSchema, risk, gate, lawfulBasis: 'contract' },
          },
        });
        const t = spec.tools?.[tname('t')];
        expect(t).toBeDefined();
        if (t !== undefined) {
          expect(evaluateToolSpec(tname('t'), t)).toEqual({ ok: true });
        }
      }
    }
  });
});
