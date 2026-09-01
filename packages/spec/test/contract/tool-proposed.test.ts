/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

// TKT-V6-ITEM-15 — 'tool_proposed' Contract checkpoint
//
// Tests the spec-level surface only: evaluator dispatch + context
// materialisation + aggregation. Host-side runtime wiring (writeEvent
// integration that actually CALLS evaluateContracts with checkpoint
// 'tool_proposed' before a tool executes) lives in /core +
// ships in a separate ticket.
//
// Source spec: 08-design-partner/hf-feedback-v6-wizard-tool-use.md §Q-V6-2
// Sibling ticket (already shipped): TKT-V6-ITEM-14 (gate: 'contract').

import { describe, it, expect } from 'vitest';
import { evaluateContracts, hasBlockingFailure } from '../../src/contract/evaluate.js';
import { CONTRACT_CHECKPOINTS } from '../../src/contract/types.js';
import type { Contract, ContractCheckpoint, ToolProposedCtx } from '../../src/contract/types.js';
import { defineCrawcusSpec } from '../../src/intent/define-crawcus-spec.js';
import { field } from '../../src/intent/field.js';
import type { Intent } from '../../src/types/intent.js';
import type { Tenant } from '../../src/types/tenant.js';
import type {
  IntentId,
  IntentKey,
  ProjectionName,
  Region,
  TenantId,
  ToolName,
} from '../../src/types/ids.js';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant: Tenant = {
  id: b<string, 'TenantId'>('tnt_t') as TenantId,
  region: b<string, 'Region'>('local') as Region,
};

const makeIntent = (snapshot: Record<string, unknown>): Intent => ({
  id: b<string, 'IntentId'>('int_t') as IntentId,
  tenantId: tenant.id,
  key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
  specVersion: 1,
  state: 'open',
  createdAt: new Date('2026-06-03T00:00:00Z'),
  updatedAt: new Date('2026-06-03T00:00:00Z'),
  snapshot,
});

const toolName = (s: string): ToolName => s as ToolName;

describe('CONTRACT_CHECKPOINTS — exhaustive runtime array', () => {
  it('includes the new tool_proposed kind', () => {
    expect(CONTRACT_CHECKPOINTS).toContain('tool_proposed');
  });

  it('lists exactly the four known checkpoint kinds', () => {
    // Sorted comparison so ordering changes don't break the test —
    // the union semantics don't depend on array order.
    expect([...CONTRACT_CHECKPOINTS].sort()).toEqual(
      (['invariants', 'post', 'pre', 'tool_proposed'] as const).slice().sort(),
    );
  });

  it('every entry assigns to ContractCheckpoint (compile-time)', () => {
    // `as const satisfies` in the source guarantees this — this
    // assertion is a runtime echo to make the discipline visible to
    // readers and to fail loud if someone weakens the declaration.
    const sample: ContractCheckpoint = CONTRACT_CHECKPOINTS[0];
    expect(typeof sample).toBe('string');
  });
});

describe('evaluateContracts — tool_proposed slot empty / missing', () => {
  it('returns empty when spec.contracts is undefined', () => {
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('course.enrol'),
      toolArgs: {},
    });
    expect(results).toEqual([]);
  });

  it('returns empty when spec.contracts.toolProposed is empty', () => {
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: { toolProposed: [] },
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('course.enrol'),
      toolArgs: {},
    });
    expect(results).toEqual([]);
  });
});

describe('evaluateContracts — tool_proposed allow path', () => {
  it('passes when predicate accepts the proposed args', () => {
    const allowEnrolWithReason: Contract<ToolProposedCtx> = {
      id: 'allow-enrol-with-reason',
      description: { en: 'enrol calls must carry a non-empty reason' },
      predicate: ({ toolName: name, toolArgs }) => {
        if (name !== 'course.enrol') return true;
        const reason = toolArgs['reason'];
        return typeof reason === 'string' && reason.length > 0;
      },
    };
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: { toolProposed: [allowEnrolWithReason] },
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('course.enrol'),
      toolArgs: { reason: 'cohort-2026-fall' },
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.result).toBe('pass');
  });
});

describe('evaluateContracts — tool_proposed block path', () => {
  it('fails with block severity when predicate rejects', () => {
    const requireReason: Contract<ToolProposedCtx> = {
      id: 'require-reason',
      description: { en: 'reason required' },
      predicate: ({ toolArgs }) => typeof toolArgs['reason'] === 'string',
      severity: 'block',
    };
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: { toolProposed: [requireReason] },
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('course.enrol'),
      toolArgs: {},
    });
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r?.result).toBe('fail');
    if (r?.result === 'fail') {
      expect(r.severity).toBe('block');
      expect(r.contract.id).toBe('require-reason');
    }
    expect(hasBlockingFailure(results)).toBe(true);
  });

  it('defaults severity to block when omitted on the contract', () => {
    const noSeverity: Contract<ToolProposedCtx> = {
      id: 'no-sev',
      description: { en: 'x' },
      predicate: () => false,
    };
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: { toolProposed: [noSeverity] },
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('any.tool'),
      toolArgs: {},
    });
    const r = results[0];
    expect(r?.result).toBe('fail');
    if (r?.result === 'fail') expect(r.severity).toBe('block');
  });
});

describe('evaluateContracts — tool_proposed aggregation (declaration order, no short-circuit)', () => {
  it('evaluates all contracts in declaration order even after a block fail', () => {
    const order: string[] = [];
    const c1: Contract<ToolProposedCtx> = {
      id: 'c1-pass',
      description: { en: '' },
      predicate: () => {
        order.push('c1');
        return true;
      },
    };
    const c2: Contract<ToolProposedCtx> = {
      id: 'c2-block-fail',
      description: { en: '' },
      predicate: () => {
        order.push('c2');
        return false;
      },
      severity: 'block',
    };
    const c3: Contract<ToolProposedCtx> = {
      id: 'c3-warn-fail',
      description: { en: '' },
      predicate: () => {
        order.push('c3');
        return false;
      },
      severity: 'warn',
    };
    const c4: Contract<ToolProposedCtx> = {
      id: 'c4-pass',
      description: { en: '' },
      predicate: () => {
        order.push('c4');
        return true;
      },
    };
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: { toolProposed: [c1, c2, c3, c4] },
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('any'),
      toolArgs: {},
    });
    expect(order).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(results).toHaveLength(4);
    expect(results[0]?.result).toBe('pass');
    expect(results[1]?.result).toBe('fail');
    expect(results[2]?.result).toBe('fail');
    expect(results[3]?.result).toBe('pass');
    // hasBlockingFailure stays true thanks to c2 alone — c4 passing
    // does not heal a prior block fail.
    expect(hasBlockingFailure(results)).toBe(true);
  });

  it('throwing predicate counts as fail (parity with pre/invariants/post)', () => {
    const throws: Contract<ToolProposedCtx> = {
      id: 'throws',
      description: { en: '' },
      predicate: () => {
        throw new Error('boom');
      },
    };
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: { toolProposed: [throws] },
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('any'),
      toolArgs: {},
    });
    expect(results[0]?.result).toBe('fail');
  });
});

describe('evaluateContracts — tool_proposed context surface', () => {
  it('predicate receives toolName + toolArgs alongside base ContractCtx', () => {
    let observed: { name?: string; args?: Record<string, unknown>; hasBase?: boolean } = {};
    const inspector: Contract<ToolProposedCtx> = {
      id: 'inspect',
      description: { en: '' },
      predicate: (ctx) => {
        observed = {
          name: ctx.toolName,
          args: { ...ctx.toolArgs },
          // Verify base ContractCtx fields are still present —
          // ToolProposedCtx is an extension, not a replacement.
          hasBase:
            ctx.intent !== undefined &&
            ctx.spec !== undefined &&
            ctx.tenant !== undefined &&
            typeof ctx.has === 'function' &&
            typeof ctx.value === 'function' &&
            typeof ctx.consentFor === 'function' &&
            typeof ctx.eventsOfKind === 'function',
        };
        return true;
      },
    };
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { title: field.string().required() },
      readiness: () => true,
      contracts: { toolProposed: [inspector] },
    });
    evaluateContracts({
      spec,
      intent: makeIntent({ title: 'Course 1' }),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('course.enrol'),
      toolArgs: { learnerId: 'lrn_001', capacityOverride: true },
    });
    expect(observed.name).toBe('course.enrol');
    expect(observed.args).toEqual({ learnerId: 'lrn_001', capacityOverride: true });
    expect(observed.hasBase).toBe(true);
  });

  it('predicate can read snapshot via base ContractCtx.has()', () => {
    const requireTitleBeforeEnrol: Contract<ToolProposedCtx> = {
      id: 'require-title-before-enrol',
      description: { en: 'enrol disallowed until course title is set' },
      predicate: ({ has, toolName: name }) => {
        if (name !== 'course.enrol') return true;
        return has('title');
      },
    };
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { title: field.string().required() },
      readiness: () => true,
      contracts: { toolProposed: [requireTitleBeforeEnrol] },
    });

    const withoutTitle = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('course.enrol'),
      toolArgs: {},
    });
    expect(withoutTitle[0]?.result).toBe('fail');

    const withTitle = evaluateContracts({
      spec,
      intent: makeIntent({ title: 'Intro to AI Compliance' }),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('course.enrol'),
      toolArgs: {},
    });
    expect(withTitle[0]?.result).toBe('pass');
  });
});

describe('evaluateContracts — backward compatibility (no toolProposed contracts)', () => {
  it('existing pre/invariants/post specs evaluate unchanged', () => {
    const inv: Contract = {
      id: 'inv-1',
      description: { en: '' },
      predicate: () => true,
    };
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: { invariants: [inv] },
    });
    const invResults = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(invResults).toHaveLength(1);
    expect(invResults[0]?.result).toBe('pass');

    // Calling with checkpoint: 'tool_proposed' against the same spec
    // resolves to empty (no toolProposed slot declared).
    const tpResults = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'tool_proposed',
      toolName: toolName('any'),
      toolArgs: {},
    });
    expect(tpResults).toEqual([]);
  });
});
