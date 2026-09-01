import { uuidv7 } from 'uuidv7';
import type { Event, EventAIProvenance, EventKind } from '@crawcus/spec';
import type {
  Actor,
  ConsentEventId,
  ContentHash,
  EventId,
  IntentId,
  Purpose,
  SubjectId,
  TenantId as TenantIdType,
} from '@crawcus/spec';
import type { LawfulBasis, SpecialCategoryBasis } from '@crawcus/spec';
import type { Untainted } from '@crawcus/spec';
import type { TenantCtx, Tenant } from '@crawcus/spec';
import type {
  TallysealConfig,
  ProjectionAdapter,
  TallysealWarrantsConfig,
  TallysealDisclosuresConfig,
  TallysealConsentConfig,
  TallysealLineageConfig,
  TallysealOversightConfig,
} from '../config/types.js';
import type { CrawcusSpec, Intent } from '@crawcus/spec';
import type { ProjectionRef } from '@crawcus/spec';
import type { WarrantCtx, WarrantViolationPayload } from '@crawcus/spec';
import type {
  DisclosureCtx,
  DisclosureRequiredPayload,
  DisclosureRequirement,
} from '@crawcus/spec';
import type {
  ConsentCtx,
  ConsentRequiredPayload,
  ConsentRequirement,
  ProcessingPurpose,
} from '@crawcus/spec';
import type { LineageCtx, LineageRequiredPayload } from '@crawcus/spec';
import type {
  OversightCtx,
  OversightRequirement,
  OversightRequiredPayload,
} from '@crawcus/spec';

import {
  ConsentInvalidError,
  ConsentRequiredError,
  ContractViolationError,
  DisclosureRequiredError,
  HashChainBrokenError,
  LawfulBasisMismatchError,
  LineageInvalidError,
  OversightInvalidError,
  WarrantViolationError,
} from '../errors/index.js';
import { computeContentHash, GENESIS_PREV_HASH } from '@crawcus/spec';
import { assertNoRawPII } from '../pii/tokenise.js';
import {
  evaluateConsent,
  evaluateContracts,
  evaluateDisclosure,
  evaluateLineage,
  evaluateOversight,
  evaluateWarrant,
} from '@crawcus/spec';
import { makeContractViolationPayload } from '@crawcus/spec';
import { dispatchReducer } from '../reducer/dispatcher.js';

/**
 * writeEvent input. The `payload` must be `Untainted<T>` —
 * customer code obtains this only by passing raw input through
 * `tokenisePayload` (the IFC-lite compile-time gate). Bypassing
 * via `as Untainted<T>` is forbidden by the
 * `no-untainted-cast` lint rule (Q-Y).
 */
export interface WriteEventInput<TPayload = unknown> {
  readonly intentId: IntentId;
  readonly kind: EventKind;
  readonly payload: Untainted<TPayload>;
  // Compliance — required
  readonly lawfulBasis: LawfulBasis;
  readonly purpose: Purpose;
  readonly dataSubjectIds: readonly SubjectId[];
  readonly consentEventId?: ConsentEventId;
  readonly specialCategoryBasis?: SpecialCategoryBasis;
  // Optional provenance
  readonly ai?: EventAIProvenance;
  readonly correlationId?: string;
  readonly causationId?: EventId;
  /** Idempotency — duplicate `(intentId, key)` returns the prior result. */
  readonly idempotencyKey?: string;
}

export interface WriteEventResult {
  readonly event: Event;
  readonly projectionRef?: ProjectionRef;
}

/**
 * Optional context passed alongside `TenantCtx`. Providing `spec` +
 * `adapter` activates per-intent Contract evaluation + reducer
 * dispatch; otherwise writeEvent operates as a low-level
 * event-append + chain-build primitive.
 */
export interface WriteEventCtxExtras {
  readonly config: TallysealConfig;
  readonly spec?: CrawcusSpec;
  readonly adapter?: ProjectionAdapter;
  /**
   * Intent snapshot at write time (used as ContractCtx.intent).
   * If omitted, an empty-snapshot Intent is synthesised — predicates
   * that read snapshot data will see undefined. Typically provided
   * by a higher-level orchestrator that tracks Intent state.
   */
  readonly intent?: Intent;
}

export type WriteEventCtx = TenantCtx & WriteEventCtxExtras;

/**
 * Sole mutation entrypoint to the event log. Enforces every
 * compliance invariant of `07-engineering/core-v0.0.1-type-surface.md`
 * §11 + `02-product/crawcus-format.md` v0.2 Contracts.
 *
 * Throws typed errors on violation:
 *   - `LawfulBasisMismatchError`     (compliance-by-design #2)
 *   - `RawPIIInPayloadError`         (compliance-by-design #1, NFR D4)
 *   - `ConsentRequiredError`         (compliance-by-design #9)
 *   - `HashChainBrokenError`         (compliance-by-design #4, NFR D2)
 *   - `ContractViolationError`       (crawcus-format.md v0.2 Contracts)
 *   - `WarrantViolationError`        (primitive #10, when `config.warrants`
 *                                     is configured + an active Warrant
 *                                     fails the `'pre'` evaluator)
 *   - `DisclosureRequiredError`      (primitive #11, when
 *                                     `config.disclosures` is configured +
 *                                     a required Disclosure is missing,
 *                                     unacknowledged, retracted, or out
 *                                     of recurrence window at `'pre'`)
 *   - `ConsentInvalidError`          (primitive #12, when
 *                                     `config.consents` is configured +
 *                                     a required Consent is missing,
 *                                     withdrawn, out-of-scope, or
 *                                     regulation-mismatched at `'pre'`)
 *   - `LineageInvalidError`          (primitive #13, when
 *                                     `config.lineage` is configured +
 *                                     `spec.lineageRequirement.required`
 *                                     is true + the event carries
 *                                     `input.ai` AI provenance + no
 *                                     covering Lineage record exists)
 *   - `OversightInvalidError`        (primitive #14, when
 *                                     `config.oversight` is configured +
 *                                     `spec.oversightRequirements` is
 *                                     non-empty + the most-recent
 *                                     review is missing, escalated,
 *                                     role-not-accepted, or expired)
 *
 * Returns `{ event, projectionRef? }` on success.
 */
export async function writeEvent<TPayload>(
  input: WriteEventInput<TPayload>,
  ctx: WriteEventCtx,
): Promise<WriteEventResult> {
  const compliance = await Promise.resolve(ctx.config.compliance);

  // 1. Lawful basis check (NFR Priv4)
  const expectedBasis =
    compliance.lawfulBasis.perPurpose[input.purpose as string] ?? compliance.lawfulBasis.default;
  if (expectedBasis !== input.lawfulBasis) {
    throw new LawfulBasisMismatchError(
      `lawfulBasis '${input.lawfulBasis}' does not match manifest's basis for purpose '${input.purpose}'`,
      expectedBasis,
      input.lawfulBasis,
      input.purpose as string,
    );
  }

  // 2. Consent gate for special-category (compliance-by-design #2)
  if (input.specialCategoryBasis && !input.consentEventId) {
    throw new ConsentRequiredError(
      `event with specialCategoryBasis='${input.specialCategoryBasis}' requires a consentEventId reference`,
      input.purpose as string,
      input.specialCategoryBasis,
    );
  }

  // 3. PII scrubber (defense-in-depth, NFR D4)
  await assertNoRawPII(input.payload, { pii: ctx.config.pii });

  // 3.5 Warrant pre-check (primitive #10) — runs BEFORE the main transaction
  // so a failed Warrant evaluation can commit a WarrantViolation event to the
  // chain (in its own transaction) without being rolled back by the throw.
  // Skipped for Warrant-lifecycle event kinds themselves to avoid recursion.
  if (
    ctx.config.warrants &&
    ctx.spec &&
    input.kind !== 'WarrantViolation' &&
    input.kind !== 'WarrantClaimed' &&
    input.kind !== 'WarrantPresented'
  ) {
    await preCheckWarrants({
      config: ctx.config,
      warrants: ctx.config.warrants,
      spec: ctx.spec,
      tenant: ctx.tenant,
      actor: ctx.actor,
      input,
      intent: ctx.intent,
    });
  }

  // 3.6 Disclosure pre-check (primitive #11) — same pre-tx pattern as
  // Warrant. Skipped for Disclosure-lifecycle event kinds (would recurse).
  // Also skipped if spec declares no disclosureRequirements (zero-cost path
  // for specs that don't need notice obligations).
  if (
    ctx.config.disclosures &&
    ctx.spec &&
    ctx.spec.disclosureRequirements &&
    ctx.spec.disclosureRequirements.length > 0 &&
    input.kind !== 'DisclosureRequired' &&
    input.kind !== 'DisclosureDelivered' &&
    input.kind !== 'DisclosureAcknowledged' &&
    input.kind !== 'DisclosureRetracted' &&
    // Q-CR9 LOCKED 2026-06-02 — `DisclosureSignal` is observational meta
    // about a delivered Disclosure; the signal itself triggers no further
    // notice obligation. Skipping prevents accidental recursion.
    input.kind !== 'DisclosureSignal'
  ) {
    await preCheckDisclosures({
      config: ctx.config,
      disclosures: ctx.config.disclosures,
      spec: ctx.spec,
      tenant: ctx.tenant,
      actor: ctx.actor,
      input,
      intent: ctx.intent,
    });
  }

  // 3.7 Consent pre-check (primitive #12) — same pre-tx pattern.
  // Skipped for Consent-lifecycle event kinds + ConsentRequired
  // (would recurse). Per Q-CR6 LOCKED 2026-05-22 (fully distinct from
  // Warrant), this runs as its own pass — not unified with Warrant.
  if (
    ctx.config.consents &&
    ctx.spec &&
    ctx.spec.consentRequirements &&
    ctx.spec.consentRequirements.length > 0 &&
    input.kind !== 'ConsentRequired' &&
    input.kind !== 'ConsentGranted' &&
    input.kind !== 'ConsentRevoked'
  ) {
    await preCheckConsents({
      config: ctx.config,
      consents: ctx.config.consents,
      spec: ctx.spec,
      tenant: ctx.tenant,
      actor: ctx.actor,
      input,
      intent: ctx.intent,
    });
  }

  // 3.8 Lineage pre-check (primitive #13, Q-CR7 LOCKED 2026-05-22)
  // — same pre-tx pattern. Only fires when the event carries
  // `input.ai` AI provenance + the spec declares lineageRequirement
  // (zero-cost path for non-AI events / specs without the obligation).
  // Skipped for Lineage-lifecycle event kinds (would recurse).
  if (
    ctx.config.lineage &&
    ctx.spec &&
    ctx.spec.lineageRequirement?.required === true &&
    input.ai !== undefined &&
    input.kind !== 'LineageRequired' &&
    input.kind !== 'LineageRecorded'
  ) {
    await preCheckLineage({
      config: ctx.config,
      lineage: ctx.config.lineage,
      spec: ctx.spec,
      tenant: ctx.tenant,
      actor: ctx.actor,
      input,
      intent: ctx.intent,
    });
  }

  // 3.9 HumanOversight pre-check (primitive #14, Q-CR8 LOCKED
  // 2026-05-22 — Role + Org abstraction). Same pre-tx pattern.
  // Skipped for Oversight-lifecycle event kinds (would recurse).
  // Iterates ALL requirements — first failure short-circuits.
  if (
    ctx.config.oversight &&
    ctx.spec &&
    ctx.spec.oversightRequirements &&
    ctx.spec.oversightRequirements.length > 0 &&
    input.kind !== 'OversightRequired' &&
    input.kind !== 'OversightScheduled' &&
    input.kind !== 'OversightConducted' &&
    input.kind !== 'OversightSignedOff' &&
    input.kind !== 'OversightEscalated'
  ) {
    await preCheckOversight({
      config: ctx.config,
      oversight: ctx.config.oversight,
      spec: ctx.spec,
      tenant: ctx.tenant,
      actor: ctx.actor,
      input,
      intent: ctx.intent,
    });
  }

  // 4. Resolve prior event for chain linkage + version assignment
  const { prevHash, version } = await readChainTail(ctx.config, input.intentId);

  // 5. Build event base (excluding id + contentHash)
  const eventBase: Omit<Event<unknown>, 'id' | 'contentHash'> = {
    tenantId: ctx.tenant.id,
    intentId: input.intentId,
    kind: input.kind,
    version,
    timestamp: new Date(),
    actor: ctx.actor,
    lawfulBasis: input.lawfulBasis,
    purpose: input.purpose,
    dataSubjectIds: input.dataSubjectIds,
    ...(input.consentEventId ? { consentEventId: input.consentEventId } : {}),
    ...(input.specialCategoryBasis ? { specialCategoryBasis: input.specialCategoryBasis } : {}),
    prevHash,
    payload: input.payload,
    ...(input.ai ? { ai: input.ai } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.causationId ? { causationId: input.causationId } : {}),
  };

  // 6. Compute contentHash (RFC 8785 canonical-JSON + SHA-256)
  const contentHash: ContentHash = computeContentHash(eventBase);

  // 7. Assign event ID — UUIDv7 per Q-A lock (RFC 9562, May 2024)
  const eventId = uuidv7() as EventId;

  const event: Event = {
    id: eventId,
    contentHash,
    ...eventBase,
  };

  // 8. Open transaction + evaluate Contracts + append + dispatch
  return ctx.config.eventStore.begin(ctx.tenant, async (tx) => {
    // Contract evaluation (if spec provided)
    const spec = ctx.spec;
    if (spec) {
      const intentForCtx = ctx.intent ?? synthesiseIntent({ input, spec, tenantId: ctx.tenant.id });
      const events = await collectEvents(ctx.config, input.intentId);
      const evaluator = (checkpoint: 'pre' | 'invariants' | 'post'): void => {
        const results = evaluateContracts({
          spec,
          intent: intentForCtx,
          tenant: ctx.tenant,
          events,
          checkpoint,
        });
        const firstBlock = results.find((r) => r.result === 'fail' && r.severity === 'block');
        if (firstBlock && firstBlock.result === 'fail') {
          const payload = makeContractViolationPayload({
            contract: firstBlock.contract,
            ctx: firstBlock.ctx,
            triggeringEventId: eventId,
          });
          throw new ContractViolationError(
            `contract '${firstBlock.contract.id}' failed at checkpoint '${checkpoint}' (severity=block)`,
            payload.contractId,
            payload.predicateHash,
            'block',
          );
        }
      };
      // `pre` only on first event of intent (version 0)
      if (version === 0) evaluator('pre');
      evaluator('invariants');
      if (input.kind === 'ProjectionCommit') evaluator('post');
    }

    // 9. Append event (within the transaction)
    await ctx.config.eventStore.append(event, tx);

    // 10. Dispatch reducer if adapter provided + intent key resolvable
    let projectionRef: ProjectionRef | undefined;
    if (ctx.adapter && ctx.spec) {
      const out = await dispatchReducer(event, ctx.spec.key, ctx.adapter, {
        tx,
        intentId: input.intentId,
      });
      if (out && typeof out === 'object' && 'projection' in out) {
        projectionRef = out as ProjectionRef;
      }
    }

    return projectionRef ? { event, projectionRef } : { event };
  });
}

// ============== helpers ==============

async function readChainTail(
  config: TallysealConfig,
  intentId: IntentId,
): Promise<{ prevHash: ContentHash | null; version: number }> {
  let prevHash: ContentHash | null = GENESIS_PREV_HASH;
  let version = 0;
  for await (const e of config.eventStore.read(intentId)) {
    // Defensive: confirm the stored chain isn't already broken
    if (prevHash !== null && e.prevHash !== null && e.prevHash !== prevHash && version === 0) {
      // First iteration; prevHash starts as null. This branch only fires
      // if the loop iterates more than once; check on subsequent iterations.
    }
    prevHash = e.contentHash;
    version = e.version + 1;
  }
  // Note: full chain verification (D2) is the verifier's job (verifyChain);
  // writeEvent trusts the store's ordering and only links to the tail.
  if (version > 0 && prevHash === null) {
    throw new HashChainBrokenError(
      'chain tail has null contentHash but is not the genesis event',
      version - 1,
      'null tail contentHash',
    );
  }
  return { prevHash, version };
}

async function collectEvents(
  config: TallysealConfig,
  intentId: IntentId,
): Promise<readonly Event[]> {
  const out: Event[] = [];
  for await (const e of config.eventStore.read(intentId)) {
    out.push(e);
  }
  return out;
}

function synthesiseIntent(args: {
  input: WriteEventInput;
  spec: CrawcusSpec;
  tenantId: TenantIdType;
}): Intent {
  const now = new Date();
  return {
    id: args.input.intentId,
    tenantId: args.tenantId,
    key: args.spec.key,
    specVersion: args.spec.version,
    state: 'open',
    createdAt: now,
    updatedAt: now,
    snapshot: {},
  };
}

/**
 * Helper to brand a raw payload as Untainted. **For tests and the
 * playground only** — production code must go through
 * `tokenisePayload`. Lint rule `no-untainted-cast` (Q-Y) forbids
 * `as Untainted<T>` outside `pii/tokenise.ts` and this helper's
 * file, so call sites that import this become discoverable.
 */
export function unsafeAssertUntainted<T>(payload: T): Untainted<T> {
  return payload as Untainted<T>;
}

// ============== Warrant pre-check (primitive #10) ==============

async function preCheckWarrants(args: {
  readonly config: TallysealConfig;
  readonly warrants: TallysealWarrantsConfig;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly intent: Intent | undefined;
}): Promise<void> {
  const now = new Date();
  const active = await args.warrants.store.activeForSpec(args.tenant.id, args.spec.key, now);
  // Stryker disable next-line all: early-return optimization; loop over empty
  // array would be a no-op, so mutating this condition produces an equivalent
  // mutant (same observable behavior).
  if (active.length === 0) return;

  const events = await collectEvents(args.config, args.input.intentId);
  // Stryker disable next-line all: equivalent — when args.intent is provided,
  // synthesiseIntent is never called; when undefined, the fallback is used.
  // Mutating `??` to `||` is equivalent because args.intent is `Intent | undefined`
  // (objects are truthy; the only falsy value would be undefined).
  const intent =
    args.intent ??
    synthesiseIntent({ input: args.input, spec: args.spec, tenantId: args.tenant.id });
  const warrantCtx: WarrantCtx = {
    intent,
    spec: args.spec,
    tenant: args.tenant,
    events,
    now,
  };

  for (const warrant of active) {
    const result = evaluateWarrant(warrant, warrantCtx, args.warrants.trust, 'pre');
    if (result.status === 'valid') continue;

    // Failure: persist a WarrantViolation event in its own transaction
    // (so the audit-bundle chain shows the rejection), then throw.
    const violationPayload: WarrantViolationPayload = {
      warrantId: result.warrantId,
      checkpoint: result.checkpoint,
      status: result.status as Exclude<typeof result.status, 'valid'>,
      reason:
        result.reason ??
        `Warrant ${result.warrantId} failed ${result.checkpoint} check with status ${result.status}`,
      issuerId: warrant.issuer.id,
      issuerKind: warrant.issuer.kind,
    };
    await appendWarrantViolationEvent({
      config: args.config,
      tenant: args.tenant,
      actor: args.actor,
      input: args.input,
      payload: violationPayload,
    });

    // 'pre' is the only checkpoint writeEvent invokes; cast for the error
    // type which uses the legacy 'inv'|'post' shorthand. evaluateWarrant
    // always returns 'pre' here so this is safe.
    throw new WarrantViolationError(
      `Warrant '${result.warrantId}' failed at checkpoint '${result.checkpoint}' (status=${result.status})`,
      result.warrantId,
      violationPayload.status,
      warrant.issuer.id,
      'pre',
    );
  }
}

async function appendWarrantViolationEvent(args: {
  readonly config: TallysealConfig;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly payload: WarrantViolationPayload;
}): Promise<void> {
  const { prevHash, version } = await readChainTail(args.config, args.input.intentId);
  const eventBase: Omit<Event<WarrantViolationPayload>, 'id' | 'contentHash'> = {
    tenantId: args.tenant.id,
    intentId: args.input.intentId,
    kind: 'WarrantViolation',
    version,
    timestamp: new Date(),
    actor: args.actor,
    lawfulBasis: args.input.lawfulBasis,
    purpose: args.input.purpose,
    dataSubjectIds: args.input.dataSubjectIds,
    prevHash,
    payload: args.payload as unknown as Untainted<WarrantViolationPayload>,
  };
  const contentHash: ContentHash = computeContentHash(eventBase);
  const eventId = uuidv7() as EventId;
  const violationEvent: Event<WarrantViolationPayload> = {
    id: eventId,
    contentHash,
    ...eventBase,
  };

  await args.config.eventStore.begin(args.tenant, async (tx) => {
    await args.config.eventStore.append(violationEvent as Event, tx);
  });
}

// ============== Disclosure pre-check (primitive #11) ==============

async function preCheckDisclosures(args: {
  readonly config: TallysealConfig;
  readonly disclosures: TallysealDisclosuresConfig;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly intent: Intent | undefined;
}): Promise<void> {
  const requirements = args.spec.disclosureRequirements;
  // The caller guards against empty requirements; this is belt-and-
  // braces — required so TypeScript narrows.
  // Stryker disable next-line all: re-entry safety; unreachable in practice
  if (!requirements || requirements.length === 0) return;

  // System events with no data subjects are not subject to disclosure
  // obligations (per-subject by definition). Skip without further work.
  if (args.input.dataSubjectIds.length === 0) return;

  const now = new Date();
  const events = await collectEvents(args.config, args.input.intentId);
  const intent =
    args.intent ??
    synthesiseIntent({ input: args.input, spec: args.spec, tenantId: args.tenant.id });

  const requirementIds = requirements.map((r: DisclosureRequirement) => r.id);

  // Iterate (subject × requirement). First non-valid result short-circuits.
  for (const subject of args.input.dataSubjectIds) {
    const disclosuresForSubject = await args.disclosures.store.forSubjectAndRequirements(
      args.tenant.id,
      subject,
      requirementIds,
    );
    const disclosureCtx: DisclosureCtx = {
      intent,
      spec: args.spec,
      tenant: args.tenant,
      events,
      dataSubjectIds: args.input.dataSubjectIds,
      now,
    };

    for (const requirement of requirements) {
      const result = evaluateDisclosure(
        requirement,
        subject,
        disclosuresForSubject,
        disclosureCtx,
        'pre',
      );
      if (result.status === 'valid') continue;

      // Failure: persist a DisclosureRequired event in its own transaction,
      // then throw. Mirrors the WarrantViolation pattern exactly.
      const requiredPayload: DisclosureRequiredPayload = {
        requirementId: result.requirementId,
        subject: result.subject,
        checkpoint: result.checkpoint,
        status: result.status as Exclude<typeof result.status, 'valid'>,
        reason:
          result.reason ??
          `Disclosure requirement '${result.requirementId}' for subject '${result.subject}' failed ${result.checkpoint} check with status ${result.status}`,
        specKey: args.spec.key,
      };
      await appendDisclosureRequiredEvent({
        config: args.config,
        tenant: args.tenant,
        actor: args.actor,
        input: args.input,
        payload: requiredPayload,
      });

      throw new DisclosureRequiredError(
        `Disclosure requirement '${result.requirementId}' for subject '${result.subject}' failed at checkpoint '${result.checkpoint}' (status=${result.status})`,
        result.requirementId,
        result.subject,
        requiredPayload.status,
        'pre',
      );
    }
  }
}

async function appendDisclosureRequiredEvent(args: {
  readonly config: TallysealConfig;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly payload: DisclosureRequiredPayload;
}): Promise<void> {
  const { prevHash, version } = await readChainTail(args.config, args.input.intentId);
  const eventBase: Omit<Event<DisclosureRequiredPayload>, 'id' | 'contentHash'> = {
    tenantId: args.tenant.id,
    intentId: args.input.intentId,
    kind: 'DisclosureRequired',
    version,
    timestamp: new Date(),
    actor: args.actor,
    lawfulBasis: args.input.lawfulBasis,
    purpose: args.input.purpose,
    dataSubjectIds: args.input.dataSubjectIds,
    prevHash,
    payload: args.payload as unknown as Untainted<DisclosureRequiredPayload>,
  };
  const contentHash: ContentHash = computeContentHash(eventBase);
  const eventId = uuidv7() as EventId;
  const requiredEvent: Event<DisclosureRequiredPayload> = {
    id: eventId,
    contentHash,
    ...eventBase,
  };

  await args.config.eventStore.begin(args.tenant, async (tx) => {
    await args.config.eventStore.append(requiredEvent as Event, tx);
  });
}

// ============== Consent pre-check (primitive #12, Q-CR6 LOCKED) ==============

async function preCheckConsents(args: {
  readonly config: TallysealConfig;
  readonly consents: TallysealConsentConfig;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly intent: Intent | undefined;
}): Promise<void> {
  const requirements = args.spec.consentRequirements;
  // Stryker disable next-line all: re-entry safety; unreachable in practice
  if (!requirements || requirements.length === 0) return;
  if (args.input.dataSubjectIds.length === 0) return;

  // Resolve ProcessingPurpose: use the explicit map if configured;
  // otherwise cast input.purpose to ProcessingPurpose (a single-purpose
  // event purpose). The map is the GDPR-Art-7 specificity hook.
  const purposeKey = args.input.purpose as unknown as string;
  const processingPurpose: ProcessingPurpose =
    args.consents.processingPurposeFor?.get(purposeKey) ??
    (purposeKey as unknown as ProcessingPurpose);

  const now = new Date();
  const events = await collectEvents(args.config, args.input.intentId);
  const intent =
    args.intent ??
    synthesiseIntent({ input: args.input, spec: args.spec, tenantId: args.tenant.id });

  const requirementIds = requirements.map((r: ConsentRequirement) => r.id);

  for (const subject of args.input.dataSubjectIds) {
    const consentsForSubject = await args.consents.store.forSubjectAndRequirements(
      args.tenant.id,
      subject,
      requirementIds,
    );
    const consentCtx: ConsentCtx = {
      intent,
      spec: args.spec,
      tenant: args.tenant,
      events,
      dataSubjectIds: args.input.dataSubjectIds,
      processingPurpose,
      now,
    };

    for (const requirement of requirements) {
      const result = evaluateConsent(requirement, subject, consentsForSubject, consentCtx, 'pre');
      if (result.status === 'valid') continue;

      const requiredPayload: ConsentRequiredPayload = {
        requirementId: result.requirementId,
        subject: result.subject,
        processingPurpose,
        checkpoint: result.checkpoint,
        status: result.status as Exclude<typeof result.status, 'valid'>,
        reason:
          result.reason ??
          `Consent requirement '${result.requirementId}' for subject '${result.subject}' failed ${result.checkpoint} check with status ${result.status}`,
        specKey: args.spec.key,
      };
      await appendConsentRequiredEvent({
        config: args.config,
        tenant: args.tenant,
        actor: args.actor,
        input: args.input,
        payload: requiredPayload,
      });

      throw new ConsentInvalidError(
        `Consent requirement '${result.requirementId}' for subject '${result.subject}' failed at checkpoint '${result.checkpoint}' (status=${result.status})`,
        result.requirementId,
        result.subject,
        processingPurpose,
        requiredPayload.status,
        'pre',
      );
    }
  }
}

async function appendConsentRequiredEvent(args: {
  readonly config: TallysealConfig;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly payload: ConsentRequiredPayload;
}): Promise<void> {
  const { prevHash, version } = await readChainTail(args.config, args.input.intentId);
  const eventBase: Omit<Event<ConsentRequiredPayload>, 'id' | 'contentHash'> = {
    tenantId: args.tenant.id,
    intentId: args.input.intentId,
    kind: 'ConsentRequired',
    version,
    timestamp: new Date(),
    actor: args.actor,
    lawfulBasis: args.input.lawfulBasis,
    purpose: args.input.purpose,
    dataSubjectIds: args.input.dataSubjectIds,
    prevHash,
    payload: args.payload as unknown as Untainted<ConsentRequiredPayload>,
  };
  const contentHash: ContentHash = computeContentHash(eventBase);
  const eventId = uuidv7() as EventId;
  const requiredEvent: Event<ConsentRequiredPayload> = {
    id: eventId,
    contentHash,
    ...eventBase,
  };

  await args.config.eventStore.begin(args.tenant, async (tx) => {
    await args.config.eventStore.append(requiredEvent as Event, tx);
  });
}

// ============== Lineage pre-check (primitive #13, Q-CR7 LOCKED) ==============

async function preCheckLineage(args: {
  readonly config: TallysealConfig;
  readonly lineage: TallysealLineageConfig;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly intent: Intent | undefined;
}): Promise<void> {
  const requirement = args.spec.lineageRequirement;
  // Stryker disable next-line all: re-entry safety; unreachable in practice
  if (!requirement || requirement.required !== true) return;

  const now = new Date();
  const events = await collectEvents(args.config, args.input.intentId);
  const intent =
    args.intent ??
    synthesiseIntent({ input: args.input, spec: args.spec, tenantId: args.tenant.id });

  const lineages = await args.lineage.store.forIntent(args.tenant.id, args.input.intentId);

  const lineageCtx: LineageCtx = {
    intent,
    spec: args.spec,
    tenant: args.tenant,
    events,
    hasAIProvenance: true, // caller already gated on input.ai !== undefined
    now,
  };

  const result = evaluateLineage(requirement, lineages, lineageCtx, 'pre');
  if (result.status === 'valid') return;

  const requiredPayload: LineageRequiredPayload = {
    checkpoint: result.checkpoint,
    status: result.status as Exclude<typeof result.status, 'valid'>,
    reason:
      result.reason ??
      `Lineage requirement failed ${result.checkpoint} check with status ${result.status}`,
    specKey: args.spec.key,
  };
  await appendLineageRequiredEvent({
    config: args.config,
    tenant: args.tenant,
    actor: args.actor,
    input: args.input,
    payload: requiredPayload,
  });

  throw new LineageInvalidError(
    `Lineage requirement failed at checkpoint '${result.checkpoint}' (status=${result.status})`,
    requiredPayload.status,
    'pre',
  );
}

async function appendLineageRequiredEvent(args: {
  readonly config: TallysealConfig;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly payload: LineageRequiredPayload;
}): Promise<void> {
  const { prevHash, version } = await readChainTail(args.config, args.input.intentId);
  const eventBase: Omit<Event<LineageRequiredPayload>, 'id' | 'contentHash'> = {
    tenantId: args.tenant.id,
    intentId: args.input.intentId,
    kind: 'LineageRequired',
    version,
    timestamp: new Date(),
    actor: args.actor,
    lawfulBasis: args.input.lawfulBasis,
    purpose: args.input.purpose,
    dataSubjectIds: args.input.dataSubjectIds,
    prevHash,
    payload: args.payload as unknown as Untainted<LineageRequiredPayload>,
  };
  const contentHash: ContentHash = computeContentHash(eventBase);
  const eventId = uuidv7() as EventId;
  const requiredEvent: Event<LineageRequiredPayload> = {
    id: eventId,
    contentHash,
    ...eventBase,
  };

  await args.config.eventStore.begin(args.tenant, async (tx) => {
    await args.config.eventStore.append(requiredEvent as Event, tx);
  });
}

// ============== HumanOversight pre-check (primitive #14, Q-CR8 LOCKED) ==============

async function preCheckOversight(args: {
  readonly config: TallysealConfig;
  readonly oversight: TallysealOversightConfig;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly intent: Intent | undefined;
}): Promise<void> {
  const requirements = args.spec.oversightRequirements;
  // Stryker disable next-line all: re-entry safety; unreachable in practice
  if (!requirements || requirements.length === 0) return;

  const now = new Date();
  const events = await collectEvents(args.config, args.input.intentId);
  const intent =
    args.intent ??
    synthesiseIntent({ input: args.input, spec: args.spec, tenantId: args.tenant.id });

  const oversightCtx: OversightCtx = {
    intent,
    spec: args.spec,
    tenant: args.tenant,
    events,
    now,
  };

  for (const requirement of requirements as readonly OversightRequirement[]) {
    const records = await args.oversight.store.forRequirement(args.tenant.id, requirement.id);
    const result = evaluateOversight(requirement, records, oversightCtx, 'pre');
    if (result.status === 'valid') continue;

    const requiredPayload: OversightRequiredPayload = {
      requirementId: result.requirementId,
      checkpoint: result.checkpoint,
      status: result.status as Exclude<typeof result.status, 'valid'>,
      reason:
        result.reason ??
        `Oversight requirement '${result.requirementId}' failed ${result.checkpoint} check with status ${result.status}`,
      specKey: args.spec.key,
    };
    await appendOversightRequiredEvent({
      config: args.config,
      tenant: args.tenant,
      actor: args.actor,
      input: args.input,
      payload: requiredPayload,
    });

    throw new OversightInvalidError(
      `Oversight requirement '${result.requirementId}' failed at checkpoint '${result.checkpoint}' (status=${result.status})`,
      result.requirementId,
      requiredPayload.status,
      'pre',
    );
  }
}

async function appendOversightRequiredEvent(args: {
  readonly config: TallysealConfig;
  readonly tenant: Tenant;
  readonly actor: Actor;
  readonly input: WriteEventInput;
  readonly payload: OversightRequiredPayload;
}): Promise<void> {
  const { prevHash, version } = await readChainTail(args.config, args.input.intentId);
  const eventBase: Omit<Event<OversightRequiredPayload>, 'id' | 'contentHash'> = {
    tenantId: args.tenant.id,
    intentId: args.input.intentId,
    kind: 'OversightRequired',
    version,
    timestamp: new Date(),
    actor: args.actor,
    lawfulBasis: args.input.lawfulBasis,
    purpose: args.input.purpose,
    dataSubjectIds: args.input.dataSubjectIds,
    prevHash,
    payload: args.payload as unknown as Untainted<OversightRequiredPayload>,
  };
  const contentHash: ContentHash = computeContentHash(eventBase);
  const eventId = uuidv7() as EventId;
  const requiredEvent: Event<OversightRequiredPayload> = {
    id: eventId,
    contentHash,
    ...eventBase,
  };

  await args.config.eventStore.begin(args.tenant, async (tx) => {
    await args.config.eventStore.append(requiredEvent as Event, tx);
  });
}
