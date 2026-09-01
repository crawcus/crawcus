/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CustomEventKind, EventKind, SystemEventKind } from '../types/event.js';

/**
 * The complete set of system event kinds. Authoritative — keeping it
 * here (not just in the type) so the type guard + audit-bundle layer
 * can iterate. Sorted lexicographically for canonical-JSON friendliness.
 */
export const SYSTEM_EVENT_KINDS = [
  'AIProxyRefused',
  'BaselineExtracted',
  'CapturedTurn',
  'ConsentGranted',
  'ConsentRequired',
  'ConsentRevoked',
  'ContractViolation',
  'DisclosureAcknowledged',
  'DisclosureDelivered',
  'DisclosureRequired',
  'DisclosureRetracted',
  'DisclosureSignal',
  'FieldProposed',
  'FieldRejected',
  'LineageRecorded',
  'LineageRequired',
  'OversightConducted',
  'OversightEscalated',
  'OversightRequired',
  'OversightScheduled',
  'OversightSignedOff',
  'ProjectionCommit',
  'ProjectionRun',
  'RetentionExpired',
  'SourceCaptured',
  'SuggestionAccepted',
  'SuggestionEdited',
  'SuggestionRejected',
  'SuggestionSuperseded',
  'WarrantClaimed',
  'WarrantPresented',
  'WarrantViolation',
] as const satisfies readonly SystemEventKind[];

/**
 * Type guard. Narrows `EventKind` to `SystemEventKind` for
 * exhaustively-switchable dispatchers (ratchet #19).
 *
 * @example
 * if (isSystemEventKind(event.kind)) {
 *   switch (event.kind) {
 *     case 'CapturedTurn': return handleCaptured(event);
 *     // ... every other system kind ...
 *     default: assertNever(event.kind);
 *   }
 * } else {
 *   // event.kind is CustomEventKind — handle via per-projection registry
 * }
 */
export function isSystemEventKind(k: EventKind): k is SystemEventKind {
  return (SYSTEM_EVENT_KINDS as readonly string[]).includes(k);
}

/**
 * Construct a CustomEventKind. The brand prevents accidentally passing
 * a plain string where the system union is expected.
 *
 * Convention: PascalCase + projection-prefixed when possible
 * (`'CourseCreated'`, `'PatientAdmitted'`).
 */
export function customEventKind(name: string): CustomEventKind {
  return name as CustomEventKind;
}
