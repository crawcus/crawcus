/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

export type {
  Consent,
  ConsentCheckpoint,
  ConsentCtx,
  ConsentEvaluationResult,
  ConsentEvaluationStatus,
  ConsentReceipt,
  ConsentRequirement,
  ConsentRequiredPayload,
  WithdrawalMethod,
} from './types.js';
export { evaluateConsent } from './evaluate.js';
