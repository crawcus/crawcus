/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IntentId, IntentKey, ProjectionName, TenantId } from './ids.js';
import type { Locale } from './locale.js';
import type { FieldSpec } from './field.js';
import type { Contract, RegulationCitation, ToolProposedCtx } from '../contract/types.js';
import type { DisclosureRequirement } from '../disclosure/types.js';
import type { ConsentRequirement } from '../consent/types.js';
import type { LineageRequirement } from '../lineage/types.js';
import type { OversightRequirement } from '../oversight/types.js';
import type { ToolSpecMap } from '../tool/types.js';

/**
 * EU AI Act risk classification. `'high-risk'` triggers default
 * Contracts from regulation modules (e.g., Art. 14 readiness-gate
 * enforcement, Art. 22 explanation requirement).
 */
export type IntentClassification = 'standard' | 'high-risk' | 'prohibited';

/**
 * Runtime instance of an Intent. Created when the first event
 * (typically `'CapturedTurn'`) is written; closed when
 * `'ProjectionCommit'` succeeds. Snapshot is derived from events
 * via the reducer dispatcher (lands 4c).
 */
export interface Intent {
  readonly id: IntentId;
  readonly tenantId: TenantId;
  readonly key: IntentKey;
  readonly specVersion: number;
  readonly state: 'open' | 'committed' | 'abandoned';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly snapshot: Readonly<Record<string, unknown>>;
}

/**
 * Declarative typed-completion contract for a conversational flow.
 * Authored as a TypeScript module; consumed by the runtime to drive
 * the graph evaluator, AI extractor, readiness gate, reducer, and
 * Contract evaluator.
 *
 * Format v0.2 (canonical contract: `02-product/crawcus-format.md`).
 * Pure declarative — no control flow, no side effects, no I/O at
 * construction time.
 */
export interface CrawcusSpec<
  TFields extends Record<string, FieldSpec> = Record<string, FieldSpec>,
> {
  readonly key: IntentKey;
  readonly projection: ProjectionName;
  /** Integer ≥ 1. Bump on breaking changes per versioning rules. */
  readonly version: number;
  readonly classification?: IntentClassification;
  readonly fields: TFields;
  /** Pure predicate over a ReadinessCtx materialised by the runtime. */
  readonly readiness: (ctx: unknown) => boolean;
  /** Tier-2 escape hatch — invokes host service-layer function. */
  readonly customReducer?: (snapshot: unknown, ctx: unknown) => Promise<unknown>;
  readonly i18nDefault?: Locale;
  readonly tags?: readonly string[];
  /**
   * Sector-pack overlay parent. String path resolves to a spec module
   * (`'@tallyseal/spec-ferpa-edu/intents/create-course'`); IntentKey
   * resolves via the spec registry. Composition is monotonic over
   * Contracts (see `contracts.derogations`).
   */
  readonly extends?: IntentKey | `@${string}/${string}` | null;

  /**
   * v0.2 — first-class Contracts. Evaluated by the runtime at the
   * documented checkpoints; ContractViolation events emit on failure.
   * Evaluator + composition checker land in 4b.
   */
  readonly contracts?: {
    readonly pre?: readonly Contract[];
    readonly invariants?: readonly Contract[];
    readonly post?: readonly Contract[];
    /**
     * v0.7.0 — `'tool_proposed'`-checkpoint Contracts (TKT-V6-ITEM-15).
     * Evaluated by the runtime when an AI proposes a tool call whose
     * `ToolSpec.gate` is `'contract'`. Predicates receive a
     * `ToolProposedCtx` (the base `ContractCtx` + `toolName` +
     * `toolArgs`). A failing predicate rejects the call: the host
     * emits `ContractViolation`, does NOT execute the tool, does NOT
     * write the field.
     *
     * Optional + back-compat: specs without `toolProposed` Contracts
     * evaluate identically to pre-V6-15 behavior; the slot simply
     * resolves empty at the dispatcher.
     */
    readonly toolProposed?: readonly Contract<ToolProposedCtx>[];
  };

  /**
   * v0.2 — sector-pack derogations (explicit legitimate weakening).
   * Each entry MUST cite the regulation that *grants* the exemption
   * (e.g., GDPR Art. 89, HIPAA 45 CFR 164.512(i), FDA IND/IDE).
   * Audit-bundle renders all derogations explicitly.
   */
  readonly derogations?: readonly {
    readonly contractId: string;
    readonly basis: RegulationCitation;
    readonly justification: string;
  }[];

  /**
   * v0.2.0 — Disclosure primitive (#11) requirements. Regulation-
   * mandated notices that must be delivered to every data subject of
   * this spec's events. Runtime enforces by querying
   * `DisclosureStorePort` at writeEvent pre-check; failure emits a
   * `DisclosureRequired` event + throws `DisclosureRequiredError`.
   *
   * Spec: `07-engineering/primitives-audit-2026-05-21.md` §#11.
   */
  readonly disclosureRequirements?: readonly DisclosureRequirement[];

  /**
   * v0.3.0 — Consent primitive (#12) requirements. Regulation-
   * mandated data-subject authorizations that must be currently
   * granted (not withdrawn, in scope) for every data subject of
   * this spec's events. Runtime enforces by querying
   * `ConsentStorePort` at writeEvent pre-check; failure emits a
   * `ConsentRequired` event + throws `ConsentInvalidError`.
   *
   * Spec: `07-engineering/primitives-audit-2026-05-21.md` §#12.
   * Q-CR6 LOCKED 2026-05-22 (fully distinct from Warrant).
   */
  readonly consentRequirements?: readonly ConsentRequirement[];

  /**
   * v0.4.0 — Lineage primitive (#13) requirement. When set with
   * `required: true`, every event carrying `input.ai` AI provenance
   * must have a covering Lineage record in the `LineageStorePort`.
   * Per Q-CR7 LOCKED 2026-05-22 (strict W3C PROV-O JSON-LD wire
   * format). Failure emits a `LineageRequired` event + throws
   * `LineageInvalidError`.
   *
   * Spec: `07-engineering/primitives-audit-2026-05-21.md` §#13.
   */
  readonly lineageRequirement?: LineageRequirement;

  /**
   * v0.5.0 — HumanOversight primitive (#14) requirements. Per
   * EU AI Act Art 14(4): mandates BOTH in-loop and on-loop oversight
   * modes. Per Q-CR8 LOCKED 2026-05-22: Role + Org abstraction.
   * Runtime enforces by querying `OversightStorePort` at writeEvent
   * pre-check; failure emits `OversightRequired` event + throws
   * `OversightInvalidError`.
   *
   * Spec: `07-engineering/primitives-audit-2026-05-21.md` §#14.
   */
  readonly oversightRequirements?: readonly OversightRequirement[];

  /**
   * v0.6.0 — Tool-use primitive (#15) spec-side declaration
   * (TKT-V6-ITEM-14). Per-tool `risk` + `gate` + `lawfulBasis` lets
   * the runtime decide auto-execute vs Contract-checkpoint vs
   * human-approval paths per call.
   *
   * Optional for back-compat: specs without `tools` fall through to
   * `gate: 'human'` semantics for every tool call (the pre-V6-14
   * behavior). See `packages/crawcus-spec/src/tool/types.ts` for
   * `ToolSpec` / `ToolRisk` / `ToolGate` shapes.
   *
   * Pairs with TKT-V6-ITEM-15 (`tool_proposed` Contract checkpoint).
   * Source spec: `08-design-partner/hf-feedback-v6-wizard-tool-use.md`
   * §Q-V6-1.
   */
  readonly tools?: ToolSpecMap;
}
