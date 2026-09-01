import type { ComplianceManifest } from '@crawcus/spec';
import type { Event } from '@crawcus/spec';
import type { IntentId, IntentKey } from '@crawcus/spec';
import type { CrawcusSpec } from '@crawcus/spec';
import type { IssuerTrust } from '@crawcus/spec';
import type { ProjectionPort } from '../ports/projection.js';
import type { EventStorePort } from '../ports/event-store.js';
import type { AIPort } from '../ports/ai.js';
import type { IdentityPort } from '../ports/identity.js';
import type { PIIPort } from '../ports/pii.js';
import type { TaskPort } from '../ports/task.js';
import type { StoragePort } from '../ports/storage.js';
import type { TxContext } from '../ports/tx-context.js';
import type { WarrantStorePort } from '../warrant/store-port.js';
import type { WarrantIssuerPort } from '../warrant/issuer-port.js';
import type { DisclosureStorePort } from '../disclosure/store-port.js';
import type { DeliveryRegistry } from '../disclosure/delivery-port.js';
import type { ConsentStorePort } from '../consent/store-port.js';
import type { ProcessingPurpose } from '@crawcus/spec';
import type { LineageStorePort } from '../lineage/store-port.js';
import type { OversightStorePort } from '../oversight/store-port.js';

/**
 * The customer's deployment configuration. Wired in
 * `tallyseal.config.ts` at the customer codebase root — the ONE place
 * where adapter imports happen (everywhere else uses ports).
 *
 * Per `02-product/integration-tiers.md` §"Customer composes via
 * config": switching adapters is a one-line edit (NFR Port5).
 *
 * `compliance` accepts a Promise to support dynamic-import patterns
 * (`compliance: import('./tallyseal.compliance.js')`) per Q-J lock.
 */
export interface TallysealConfig {
  readonly projection: ProjectionPort;
  readonly eventStore: EventStorePort;
  readonly ai: AIPort;
  readonly identity: IdentityPort;
  readonly pii: PIIPort;
  readonly tasks: TaskPort;
  readonly storage: StoragePort;
  readonly compliance: ComplianceManifest | Promise<ComplianceManifest>;
  /**
   * Optional Warrant configuration (primitive #10, v0.1.0). When
   * present, runtime helpers may consult active Warrants for the
   * tenant before emitting events. When absent, Warrants are not
   * enforced — Tallyseal runs in "warrant-free" mode (suitable for
   * dev quickstart + tenants that don't need authority assertions).
   *
   * Production deployments SHOULD call
   * `assertProductionTrust(config.warrants.trust)` at bootstrap to
   * fail-fast if TOFU is accidentally enabled (per Q-CR5 LOCKED).
   */
  readonly warrants?: TallysealWarrantsConfig;
  /**
   * Optional Disclosure configuration (primitive #11, v0.2.0). When
   * present, `writeEvent` consults the store at pre-check to verify
   * every required disclosure on the spec has been delivered (and, if
   * required, acknowledged) for every data subject of the event.
   * Failure emits a `DisclosureRequired` event + throws
   * `DisclosureRequiredError`.
   *
   * When absent, disclosure checks are skipped (warrant-free / dev
   * quickstart parity).
   */
  readonly disclosures?: TallysealDisclosuresConfig;
  /**
   * Optional Consent configuration (primitive #12, v0.3.0). When
   * present, `writeEvent` consults the store at pre-check to verify
   * the data subject has a currently-valid Consent for the event's
   * `processingPurpose`. Failure emits a `ConsentRequired` event +
   * throws `ConsentInvalidError`.
   *
   * Per Q-CR6 LOCKED 2026-05-22: Consent is fully distinct from
   * Warrant. They may share infrastructure but the type system
   * enforces distinction.
   */
  readonly consents?: TallysealConsentConfig;
  /**
   * Optional Lineage configuration (primitive #13, v0.4.0). When
   * present + spec.lineageRequirement is set, `writeEvent` consults
   * the store at pre-check to verify a Lineage record exists for
   * AI-mediated events. Per Q-CR7 LOCKED 2026-05-22: strict W3C
   * PROV-O JSON-LD wire format.
   */
  readonly lineage?: TallysealLineageConfig;
  /**
   * Optional HumanOversight configuration (primitive #14, v0.5.0).
   * When present + spec declares oversightRequirements, `writeEvent`
   * consults the store at pre-check to verify a current, valid,
   * role-accepted, non-escalated oversight record exists. Per Q-CR8
   * LOCKED 2026-05-22: Role + Org abstraction.
   */
  readonly oversight?: TallysealOversightConfig;
}

export interface TallysealWarrantsConfig {
  readonly store: WarrantStorePort;
  readonly trust: IssuerTrust;
  /** Optional — only for tenants that self-issue Warrants. */
  readonly issuer?: WarrantIssuerPort;
}

export interface TallysealDisclosuresConfig {
  readonly store: DisclosureStorePort;
  /**
   * Optional — only for tenants that deliver disclosures inline
   * (rather than out-of-band). Most production deployments wire
   * delivery via app-layer code that calls `writeEvent` to emit
   * `DisclosureDelivered` events directly; this registry exists for
   * runtimes that want delivery + record in one runtime call.
   */
  readonly delivery?: DeliveryRegistry;
}

export interface TallysealLineageConfig {
  readonly store: LineageStorePort;
}

export interface TallysealOversightConfig {
  readonly store: OversightStorePort;
}

export interface TallysealConsentConfig {
  readonly store: ConsentStorePort;
  /**
   * Maps each event purpose (already in writeEvent input) to the
   * granular `ProcessingPurpose` the Consent evaluator checks against.
   * If a writeEvent input's `input.purpose` is in this map, the
   * runtime uses the mapped ProcessingPurpose. If absent, the writeEvent's
   * `input.purpose` value is used directly (cast to ProcessingPurpose).
   *
   * This mapping exists because `Purpose` (spec-level event purpose)
   * and `ProcessingPurpose` (granular GDPR-Art-7 specificity unit)
   * are intentionally distinct types — a single event purpose may
   * cover multiple processing purposes.
   */
  readonly processingPurposeFor?: ReadonlyMap<string, ProcessingPurpose>;
}

/**
 * Per-intent reducer function. Routed by the dispatcher based on
 * `event.intentId` → `Intent.key` lookup.
 *
 * Invariants (ratchet #3 + #13):
 *   1. Pure (same input → same output; CI hash-tests).
 *   2. Same-transaction — `ctx.tx` is the active TX from
 *      `EventStorePort.begin`.
 *   3. Sole mutation path — no code outside this function may
 *      write the projection table (ESLint `no-direct-prisma-create`).
 */
export type ReducerFn<TProjection = unknown> = (
  event: Event,
  ctx: ReducerCtx,
) => Promise<TProjection | undefined>;

export interface ReducerCtx {
  readonly tx: TxContext;
  readonly intentId: IntentId;
}

/**
 * Per-intent adapter — maps each IntentKey to its reducer + lookup +
 * rebuild functions. Constructed via `defineProjection`.
 */
export interface ProjectionAdapterSlot {
  readonly apply: ReducerFn;
  readonly current: (intentId: IntentId) => Promise<unknown | null>;
  readonly rebuild: (intentId: IntentId, events: readonly Event[]) => Promise<unknown>;
}

export type ProjectionAdapter<
  TIntents extends Record<string, CrawcusSpec> = Record<string, CrawcusSpec>,
> = {
  readonly [K in keyof TIntents]: ProjectionAdapterSlot;
};

/**
 * Keys are IntentKey branded strings at runtime. The string-keyed
 * Record is structurally compatible with branded IntentKey usage.
 */
export type ProjectionAdapterFor<TKeys extends IntentKey> = Readonly<
  Record<TKeys, ProjectionAdapterSlot>
>;
