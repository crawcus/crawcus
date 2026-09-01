import type { EventId, IntentId, SuggestionId, TenantId } from './ids.js';

/**
 * Suggestion lifecycle states. The accept / edit / reject / supersede
 * sequence IS the EU AI Act Article 14 human-oversight implementation
 * (canon: `00-canon/architecture-primitives.md` §4).
 */
export type SuggestionState = 'proposed' | 'accepted' | 'edited' | 'rejected' | 'superseded';

export interface Suggestion<TValue = unknown> {
  readonly id: SuggestionId;
  readonly intentId: IntentId;
  readonly tenantId: TenantId;
  readonly fieldKey: string;
  readonly proposedValue: TValue;
  readonly state: SuggestionState;
  /** 0..1; AI extractor confidence on the proposed value. */
  readonly confidence: number;
  readonly proposedByEvent: EventId;
  readonly supersededBy?: SuggestionId;
  /** Final accepted value when `state === 'edited'`. */
  readonly acceptedAs?: TValue;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
