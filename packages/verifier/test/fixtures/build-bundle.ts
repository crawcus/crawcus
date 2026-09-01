/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test-fixture builder — produces a signed CRAWCUS audit bundle from
 * a small set of inputs. Used by every test file in this package.
 *
 * The builder reuses canon primitives from `@crawcus/spec`:
 *   - `canonicalJSON` (RFC 8785 wrapper)
 *   - `computeContentHash` (the chain-walker's per-event hasher)
 *   - `normaliseForCanonical` + `isoDate`
 *
 * Pure; no I/O; deterministic with respect to inputs.
 *
 * Distinct from the cosign-emitted fixture at
 * `./cosign-emitted-bundle.json` which is committed as static bytes
 * (cosign-CLI-produced; cross-vendor anchor per spec §6c).
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  canonicalJSON,
  computeContentHash,
  hashPredicateSource,
  normaliseForCanonical,
} from '@crawcus/spec';
import type { Event, EventKind } from '@crawcus/spec';
import { preAuthenticationEncoding } from '../../src/dsse.js';

export interface BuildBundleInput {
  /** Optional ed25519 private key (32 bytes). Generated when omitted. */
  readonly privateKey?: Uint8Array;
  /** Event kinds in chain order (default 3 events: Captured / Field / Commit). */
  readonly eventKinds?: readonly EventKind[];
  /** Optional Contract result rows to embed. */
  readonly contractResults?: readonly Record<string, unknown>[];
  /** Optional predicateSources map (contractId → normalised source). */
  readonly predicateSources?: Readonly<Record<string, string>>;
  /** Inject extra DisclosureSignal events at the end of the chain. */
  readonly addDisclosureSignal?: boolean;
  /** Override payloadType (default: application/vnd.crawcus.bundle+jsonl). */
  readonly payloadType?: string;
  /** Skip the chainProof.bundleSelfHash entirely (legacy-bundle test path). */
  readonly omitSelfHash?: boolean;
  /** Tamper hook — invoked on the bundle JSON before canonicalisation. */
  readonly tamperBundle?: (bundle: Record<string, unknown>) => Record<string, unknown>;
  /** Tamper hook — invoked on the DSSE envelope JSON before encoding. */
  readonly tamperEnvelope?: (envelope: Record<string, unknown>) => Record<string, unknown>;
  /** Override the keyid embedded in the envelope (default: hex of pubkey). */
  readonly overrideKeyId?: string;
}

export interface BuiltBundle {
  readonly bundleBytes: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
  readonly bundleJson: Record<string, unknown>;
  readonly payloadType: string;
  readonly keyid: string;
}

const DEFAULT_KINDS: readonly EventKind[] = ['CapturedTurn', 'FieldProposed', 'ProjectionCommit'];

/**
 * Build a signed bundle with a sensible default shape. Reusable across
 * the unit-test suite.
 */
export function buildSignedBundle(input: BuildBundleInput = {}): BuiltBundle {
  const privateKey = input.privateKey ?? ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);

  const eventKinds = input.eventKinds ?? DEFAULT_KINDS;

  // Build the event chain. Each event hashes itself; prevHash chains them.
  const events: Event<{ readonly note: string }>[] = [];
  let prev: string | null = null;
  for (let i = 0; i < eventKinds.length; i++) {
    const hashable = {
      tenantId: 't_test',
      intentId: 'i_test',
      kind: eventKinds[i] ?? 'CapturedTurn',
      version: i,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      actor: { type: 'system', id: 'sys' },
      lawfulBasis: 'contract',
      purpose: 'service-delivery',
      dataSubjectIds: ['s_test'],
      prevHash: prev,
      payload: { note: `event ${String(i)}` },
    };
    const contentHash = computeContentHash(
      hashable as unknown as Omit<Event<{ readonly note: string }>, 'id' | 'contentHash'>,
    );
    const event = {
      id: `evt_${String(i).padStart(4, '0')}`,
      contentHash,
      ...hashable,
    } as unknown as Event<{ readonly note: string }>;
    events.push(event);
    prev = contentHash;
  }

  // Optional DisclosureSignal event appended after the chain.
  if (input.addDisclosureSignal === true) {
    const hashable = {
      tenantId: 't_test',
      intentId: 'i_test',
      kind: 'DisclosureSignal' as EventKind,
      version: events.length,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 1, 0)),
      actor: { type: 'system', id: 'sys' },
      lawfulBasis: 'contract',
      purpose: 'service-delivery',
      dataSubjectIds: ['s_test'],
      prevHash: prev,
      payload: { requirementId: 'req_x', signalType: 'read', contentHash: 'hash_x' },
    };
    const contentHash = computeContentHash(
      hashable as unknown as Omit<Event, 'id' | 'contentHash'>,
    );
    events.push({ id: 'evt_signal', contentHash, ...hashable } as unknown as Event);
    prev = contentHash;
  }

  // Stub chainProof — verifier's chain-walk uses events directly; this
  // is just a structural placeholder so the bundle shape is realistic.
  const chainProof: Record<string, unknown> = {
    intentId: 'i_test',
    fromEventId: events[0]?.id ?? '',
    toEventId: events[events.length - 1]?.id ?? '',
    rootHash: events[events.length - 1]?.contentHash ?? '',
    hashes: events.map((e) => ({
      id: e.id,
      prevHash: e.prevHash,
      contentHash: e.contentHash,
    })),
  };

  let bundleJson: Record<string, unknown> = {
    bundleVersion: '0.1.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    tenant: { id: 't_test', region: 'us-west-2' },
    intent: { id: 'i_test', key: 'TestIntent' },
    spec: { key: 'TestIntent', version: 1, classification: 'unspecified' },
    events,
    chainProof,
  };

  if (input.contractResults !== undefined) {
    bundleJson['contractResults'] = input.contractResults;
  }
  if (input.predicateSources !== undefined) {
    bundleJson['predicateSources'] = input.predicateSources;
  }

  // Compute the bundle's self-hash AFTER all other fields are set
  // (matches `verifyJcsHashEquivalence` strip-self semantics).
  if (input.omitSelfHash !== true) {
    const targetForHash = normaliseForCanonical(bundleJson);
    const canonical = canonicalJSON(targetForHash);
    const selfHash = bytesToHex(sha256(new TextEncoder().encode(canonical)));
    bundleJson = {
      ...bundleJson,
      chainProof: {
        ...(bundleJson['chainProof'] as Record<string, unknown>),
        bundleSelfHash: selfHash,
      },
    };
  }

  if (input.tamperBundle !== undefined) {
    bundleJson = input.tamperBundle(bundleJson);
  }

  // Canonical-JSON the bundle as the JCS payload bytes.
  const canonical = canonicalJSON(normaliseForCanonical(bundleJson));
  const payloadBytes = new TextEncoder().encode(canonical);
  const payloadType = input.payloadType ?? 'application/vnd.crawcus.bundle+jsonl';

  // PAE + sign.
  const pae = preAuthenticationEncoding(payloadType, payloadBytes);
  const sigBytes = ed25519.sign(pae, privateKey);

  const keyid = input.overrideKeyId ?? bytesToHex(publicKey);

  let envelope: Record<string, unknown> = {
    payloadType,
    payload: Buffer.from(payloadBytes).toString('base64'),
    signatures: [
      {
        keyid,
        sig: Buffer.from(sigBytes).toString('base64'),
      },
    ],
  };

  if (input.tamperEnvelope !== undefined) {
    envelope = input.tamperEnvelope(envelope);
  }

  const bundleBytes = new TextEncoder().encode(JSON.stringify(envelope));

  return {
    bundleBytes,
    publicKey,
    privateKey,
    bundleJson,
    payloadType,
    keyid,
  };
}

/** Produce a known SHA-256 hex of a predicate source for fixture wiring. */
export function predHash(source: string): string {
  return hashPredicateSource(source);
}
