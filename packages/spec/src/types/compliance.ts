import type { ProjectionName, Purpose, Region, RegulationVersion } from './ids.js';
import type { ISO8601Duration } from './duration.js';

/**
 * GDPR Article 6 lawful basis. Required on every Event.
 */
export type LawfulBasis =
  | 'consent'
  | 'contract'
  | 'legal-obligation'
  | 'vital-interests'
  | 'public-task'
  | 'legitimate-interest';

/**
 * Special-category (GDPR Art. 9) processing basis. Required when a
 * Special-Art-9 field is touched by an event.
 */
export type SpecialCategoryBasis =
  | 'explicit-consent'
  | 'employment-law'
  | 'vital-interests'
  | 'public-interest'
  | 'legal-claim'
  | 'substantial-public-interest'
  | 'health-or-social-care'
  | 'public-health'
  | 'archiving';

/**
 * PII classification level for a single field.
 *
 * - `'none'`        — no tokenisation; can appear raw in events
 * - `'personal'`    — tokenised at boundary; original lives in PII vault
 * - `'sensitive'`   — tokenised + access requires reason logged
 * - `'special-art-9'` — tokenised + CrawcusSpec must gate on consent +
 *                      AI proxy refuses without explicit-consent basis
 */
export type PIILevel = 'none' | 'personal' | 'sensitive' | 'special-art-9';

export interface FieldCompliance {
  readonly pii: PIILevel;
  readonly retention?: ISO8601Duration | 'inherit';
  readonly requireBAA?: boolean;
  readonly allowedFor?: readonly Purpose[];
  readonly forbiddenFor?: readonly Purpose[];
  readonly minimisation?: 'first-name-only' | 'aggregate-only' | 'tokenised-only';
  readonly redactInLogs?: boolean;
  readonly surfaceInDSAR?: boolean;
}

export interface RetentionPolicy {
  readonly default: ISO8601Duration;
  readonly events: ISO8601Duration;
  readonly pii: {
    readonly personal: ISO8601Duration;
    readonly sensitive: ISO8601Duration;
    readonly special: ISO8601Duration;
  };
  readonly perProjection?: Readonly<Record<string, ISO8601Duration>>;
}

export interface ConsentPolicy {
  readonly purposes: readonly Purpose[];
  readonly granularity: 'per-purpose' | 'global';
  readonly minorAge: number;
  readonly parentalConsentRequired?: boolean;
  readonly receiptArtefact?: 'pdf' | 'json-ld' | 'both';
}

export interface ResidencyPolicy {
  readonly region: Region | 'multi';
  readonly eventStore: Region;
  readonly piiVault: Region;
  readonly aiProvider: { readonly provider: string; readonly endpoint: string };
  readonly crossBorderTransfers: 'forbid' | 'sccs-only' | 'permit-with-log';
}

export interface AIPolicy {
  readonly allowedModels: readonly string[];
  readonly promptTemplateVersion: string;
  readonly costCeilingPerIntent: {
    readonly currency: 'usd' | 'eur' | 'gbp';
    readonly amount: number;
  };
  readonly blockSpecialCategoryInPrompts?: boolean;
  readonly tenantIsolation?: 'strict' | 'shared-cache-ok';
}

export interface LawfulBasisPolicy {
  readonly default: LawfulBasis;
  readonly perPurpose: Readonly<Record<string, LawfulBasis>>;
}

export interface SubProcessor {
  readonly name: string;
  readonly purpose:
    | 'ai-inference'
    | 'storage'
    | 'identity'
    | 'pii-detection'
    | 'tasks'
    | 'observability';
  readonly region: Region | string;
  /** Path or URL to the signed DPA. */
  readonly dpa: string;
}

/**
 * The complete compliance posture for one deployment. Authored as
 * `tallyseal.compliance.ts` at customer codebase root; build-time
 * validated by `/core/compliance/validate` (lands 4b).
 *
 * Field key shape: '<ProjectionName>.<fieldKey>' (e.g.,
 * 'Course.learnerAge'). The compliance/field-paths helper (4b)
 * constructs and validates these.
 */
export interface ComplianceManifest {
  readonly regulations: readonly RegulationVersion[];
  readonly sectoral?: readonly RegulationVersion[];
  readonly dpoContact?: string;
  readonly fields: Readonly<Record<`${string}.${string}`, FieldCompliance>>;
  readonly retention: RetentionPolicy;
  readonly consent?: ConsentPolicy;
  readonly residency: ResidencyPolicy;
  readonly ai: AIPolicy;
  readonly lawfulBasis: LawfulBasisPolicy;
  readonly subProcessors?: readonly SubProcessor[];
}

/**
 * Re-export ProjectionName so consumers don't need a second import path
 * when working with compliance + projections together.
 */
export type { ProjectionName };
