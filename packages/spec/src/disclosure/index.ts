/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

export type {
  DeliveryMethod,
  Disclosure,
  DisclosureAcknowledgedPayload,
  DisclosureCheckpoint,
  DisclosureContent,
  DisclosureCtx,
  DisclosureDeliveredPayload,
  DisclosureEvaluationResult,
  DisclosureEvaluationStatus,
  DisclosureRequirement,
  DisclosureRequiredPayload,
  DisclosureRetractedPayload,
  // v0.2.1 — DisclosureSignal extension (Q-CR9 LOCKED 2026-06-02)
  DisclosureSignalEvent,
  DisclosureSignalPayload,
  DisclosureSignalType,
} from './types.js';
export { evaluateDisclosure, isWithinRecurrenceWindow } from './evaluate.js';
export {
  disclosureHasOpportunityToBeRead,
  lintDisclosureSignalPredicateName,
  SIGNAL_NOT_GATE_FORBIDDEN_TOKENS,
  SIGNAL_NOT_GATE_REQUIRED_TOKENS,
  type DisclosureHasOpportunityToBeReadOptions,
  type DisclosureSignalLintResult,
} from './signal.js';
