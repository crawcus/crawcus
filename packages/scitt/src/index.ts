/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @crawcus/scitt — SCITT mode for CRAWCUS (experimental, slice 1).
 * Not yet tested against any Transparency Service.
 */

export {
  encodeSignedStatement,
  decodeSignedStatement,
  verifySignedStatementSignature,
} from './signed-statement.js';
export type {
  EncodeSignedStatementInput,
  DecodedSignedStatement,
  DecodeResult,
  VerifyStatementResult,
} from './signed-statement.js';
export { ALG, CWT, HEADER, COSE_SIGN1_TAG, CRAWCUS_BUNDLE_CONTENT_TYPE } from './headers.js';
