/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Event } from '@crawcus/spec';
import type { ProjectionAdapter, ReducerCtx } from '../config/types.js';
import type { IntentKey } from '@crawcus/spec';
import { canonicalJSON, normaliseForCanonical } from '@crawcus/spec';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { dispatchReducer } from './dispatcher.js';

/**
 * Replay-equality assertion (ratchet #3 + NFR D3 — deterministic
 * reducer). Runs the reducer twice over the same input + asserts
 * identical projection output via canonical-JSON content hash.
 *
 * Used in CI by the customer's eval-corpus regression suite to
 * detect reducer drift between releases. A failure here is a P0
 * incident: it means the reducer has become non-deterministic
 * (clock dependency? random number? unordered iteration?).
 *
 * Returns the content hash so consumers can also use it as the
 * stable identifier of a (reducer-version, input-fixture) pair.
 */
export async function assertReducerDeterminism(args: {
  event: Event;
  intentKey: IntentKey;
  adapter: ProjectionAdapter;
  ctx: ReducerCtx;
}): Promise<{ ok: true; outputHash: string } | { ok: false; outputHashes: [string, string] }> {
  const { event, intentKey, adapter, ctx } = args;

  const out1 = await dispatchReducer(event, intentKey, adapter, ctx);
  const out2 = await dispatchReducer(event, intentKey, adapter, ctx);

  const h1 = hashProjectionOutput(out1);
  const h2 = hashProjectionOutput(out2);

  if (h1 === h2) {
    return { ok: true, outputHash: h1 };
  }
  return { ok: false, outputHashes: [h1, h2] };
}

function hashProjectionOutput(out: unknown): string {
  const normalised = normaliseForCanonical(out ?? null);
  const canonical = canonicalJSON(normalised);
  const bytes = sha256(new TextEncoder().encode(canonical));
  return bytesToHex(bytes);
}
