/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Offline verification of a tiled transparency log.
 *
 * The caller supplies the signed checkpoint, the log public key, the
 * leaf, and the proofs. No network. An optional earlier checkpoint
 * root is checked with a consistency proof. An optional Rekor anchor
 * is checked against a Rekor tree head the caller already has.
 */

import {
  hashLeaf,
  parseCheckpointNote,
  verifyConsistency,
  verifyInclusion,
  verifyRekorAnchor,
  verifySignedNote,
  type RekorAnchor,
} from '@crawcus/spec';

export interface OfflineInclusion {
  readonly index: number;
  readonly treeSize: number;
  readonly leafData: Uint8Array;
  readonly proof: readonly Uint8Array[];
}

export interface OfflineConsistency {
  readonly earlierSize: number;
  readonly earlierRoot: Uint8Array;
  readonly proof: readonly Uint8Array[];
}

export interface OfflineLogInput {
  readonly signedCheckpoint: string;
  readonly logPublicKey: Uint8Array;
  readonly inclusion: OfflineInclusion;
  readonly consistency?: OfflineConsistency;
  readonly rekor?: RekorAnchor;
  readonly requireRekor: boolean;
}

export interface OfflineLogResult {
  readonly ok: boolean;
  readonly origin: string | null;
  readonly treeSize: number | null;
  readonly inclusion: boolean;
  readonly consistency: 'not-checked' | 'pass' | 'fail';
  readonly rekor: 'not-required' | 'pass' | 'fail' | 'missing';
  readonly detail: string;
}

export function verifyOfflineLog(input: OfflineLogInput): OfflineLogResult {
  // The key name is the log origin, which is the first checkpoint line.
  const splitOrigin = peekOrigin(input.signedCheckpoint);
  if (splitOrigin === null) {
    return fail('signed checkpoint is malformed', 'fail', input.requireRekor ? 'missing' : 'not-required');
  }
  const signed = verifySignedNote(input.signedCheckpoint, [
    { name: splitOrigin, publicKey: input.logPublicKey },
  ]);
  if (!signed.ok) {
    return fail(signed.reason, 'fail', input.requireRekor ? 'missing' : 'not-required');
  }
  const body = parseCheckpointNote(signed.text);
  if (body === null) return fail('checkpoint body is malformed', 'fail', 'not-required');
  if (input.inclusion.treeSize !== body.size) {
    return fail('inclusion proof tree size does not match the checkpoint', 'fail', 'not-required');
  }
  const included = verifyInclusion(
    input.inclusion.index,
    body.size,
    hashLeaf(input.inclusion.leafData),
    input.inclusion.proof,
    body.rootHash,
  );
  if (!included) {
    return {
      ok: false,
      origin: body.origin,
      treeSize: body.size,
      inclusion: false,
      consistency: 'not-checked',
      rekor: 'not-required',
      detail: 'inclusion proof did not verify against the checkpoint root',
    };
  }

  let consistency: OfflineLogResult['consistency'] = 'not-checked';
  if (input.consistency !== undefined) {
    const ok = verifyConsistency(
      input.consistency.earlierSize,
      body.size,
      input.consistency.proof,
      input.consistency.earlierRoot,
      body.rootHash,
    );
    consistency = ok ? 'pass' : 'fail';
    if (!ok) {
      return {
        ok: false,
        origin: body.origin,
        treeSize: body.size,
        inclusion: true,
        consistency,
        rekor: 'not-required',
        detail: 'consistency proof did not verify',
      };
    }
  }

  if (input.rekor === undefined) {
    if (input.requireRekor) {
      return {
        ok: false,
        origin: body.origin,
        treeSize: body.size,
        inclusion: true,
        consistency,
        rekor: 'missing',
        detail: 'rekor anchor required and not supplied',
      };
    }
    return {
      ok: true,
      origin: body.origin,
      treeSize: body.size,
      inclusion: true,
      consistency,
      rekor: 'not-required',
      detail: 'checkpoint signature and inclusion verified offline',
    };
  }

  const anchor = verifyRekorAnchor(signed.text, input.rekor);
  return {
    ok: anchor.ok,
    origin: body.origin,
    treeSize: body.size,
    inclusion: true,
    consistency,
    rekor: anchor.ok ? 'pass' : 'fail',
    detail: anchor.reason,
  };
}

function peekOrigin(signed: string): string | null {
  const line = signed.split('\n')[0];
  if (line === undefined || line.length === 0) return null;
  return line;
}

function fail(
  detail: string,
  consistency: OfflineLogResult['consistency'],
  rekor: OfflineLogResult['rekor'],
): OfflineLogResult {
  return {
    ok: false,
    origin: null,
    treeSize: null,
    inclusion: false,
    consistency,
    rekor,
    detail,
  };
}
