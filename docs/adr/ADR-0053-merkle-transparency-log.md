<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# ADR-0053 — Merkle transparency log for receipts

- **Status:** Proposed. This is a prototype for review. It is not an accepted change to the wire format.
- **Number:** 0053 is the next integer after ADR-0052, the only ADR id this repository cites. The number is provisional.
- **Related:** [ADR-0054](ADR-0054-intoto-receipt-attestation.md). The GDPR heading in [the format spec](../spec/crawcus-format.md#gdpr-erasure) stays a non-normative stub until this proposal is accepted.

## Context

A CRAWCUS receipt is appended to a hash chain: each event's `prevHash` is the previous event's `contentHash`. That detects a changed history only for someone who is shown the whole chain. It does not give a compact signed tree head, an inclusion proof for one receipt, or a consistency proof between two heads. It also stores the personal payload in the chained bytes, so deleting a person's data means rewriting history.

Certificate Transparency (RFC 6962, carried forward by RFC 9162) and the C2SP tiled-log profiles used by [Tessera](https://github.com/transparency-dev/tessera) already define the missing pieces: an append-only Merkle tree, a signed checkpoint, and static tiles a witness can fetch and then check offline.

## Decision

Prototype a second chain mode, `merkle-tlog`, beside the current hash chain. `verifyBundle` is unchanged. The hash chain remains the compatibility mode for existing bundles.

The prototype in `@crawcus/spec` and `@crawcus/verifier`:

1. Hashes the tree as RFC 6962 specifies. A leaf is `SHA-256(0x00 || entry)`. An internal node is `SHA-256(0x01 || left || right)`. RFC 9162 uses the same prefixes. The empty root is `SHA-256()` of the empty string.
2. Produces inclusion proofs and consistency proofs, and verifies them with the RFC 9162 §2.1.4.2 consistency algorithm. A proof from size 0 is rejected.
3. Lays the tree out as [C2SP tlog-tiles](https://c2sp.org/tlog-tiles): 256 hashes per full tile, `x001/x234/067` index paths, partial tiles named `.p/<width>`, entry bundles as big-endian uint16 length prefixes. The published widths for trees of 256 and 70,000 leaves are fixed by a test.
4. Signs a [C2SP tlog-checkpoint](https://c2sp.org/tlog-checkpoint) as a [signed note](https://c2sp.org/signed-note). The note text is origin, decimal size, and standard base64 of the root. The signature is Ed25519, signed-note type `0x01`. The implementation is checked against the signed-note example key. Timestamped cosignatures (`0x04`, `0x06`, including ML-DSA-44) are not produced.
5. Optionally anchors that checkpoint note in a Rekor-shaped tree. The anchor body is `crawcus-rekor-anchor-v1` plus the SHA-256 of the checkpoint note text. Verification takes a tree head the caller already has. The library does not contact Rekor.

Tree sizes above 2^20 are rejected. JavaScript bitwise arithmetic is not a sound implementation of a production log, and this prototype does not pretend otherwise.

## What goes in a leaf

The log entry is a version byte `0x01` followed by a 32-byte commitment. It is not the receipt payload.

```
commitment = SHA-256(
  "crawcus-tlog-commitment-v1" ||
  uint16(len(shredKey)) || shredKey ||
  uint16(len(nonce))    || nonce ||
  uint16(32)            || SHA-256(payload)
)
```

`shredKey` is 32 bytes from a CSPRNG, one key per data subject per controller. `nonce` is 16 bytes from a CSPRNG, unique per leaf. Both live in a side store with the payload. The log stores only the commitment.

Opening a leaf recomputes the commitment. Crypto-shred deletes the shred key, the nonce, and the payload. The commitment stays, so an inclusion proof for that leaf still verifies against the signed checkpoint. That is the erase-but-verify property: the tree still proves a leaf occupied that index, and the opening material needed to connect the leaf to a person is gone.

The in-memory side store deletes those values. It does not encrypt them. A deployment that keeps backups must encrypt the payload and the nonce under the shred key (AES-256-GCM is the construction this proposal expects) and must destroy every copy of the key. Deleting a row in one database does not shred a backup.

## Correlation and dictionary attacks

A public log is an oracle. The leaf format has to be chosen against that.

**Naked hash.** `SHA-256(payload)` as a leaf is not acceptable. Receipts are structured and often low entropy: a subject identifier, a purpose enum, a timestamp rounded to a second. An observer hashes guesses and looks for the digest. Identical payloads also produce identical leaves, which links events across time and, if the same hash is used in two logs, across logs. The prototype checks that the commitment is not equal to this naked hash.

**Public salt, no secret.** `SHA-256(nonce || payload)` with `nonce` published next to the leaf stops identical payloads from colliding. It does not stop a dictionary attack. The observer has the nonce. A salt only helps when it stays secret.

**Secret shred key.** The commitment mixes a 256-bit key into the preimage. An observer who sees the log, and not the key, cannot test a payload guess: each guess still requires the key. The nonce is not written into the log entry either, so a leaked payload alone is not enough to recompute the commitment after the nonce is destroyed. Before shred, an auditor who is given the key, the nonce, and the payload can recompute it and check inclusion.

**Key reuse.** One key per subject is what makes a single deletion cover that subject's leaves. It is also a correlation and dictionary amplifier if the key leaks: every leaf for that subject becomes testable, and two leaves opened with the same key can be recognised as the same subject by whoever holds the key. The key must not be derived from the subject identifier, a password, or any other low-entropy value. A leaked key is a compromise of that subject's receipts; it is not a compromise of other subjects' keys. The log origin must not contain a subject identifier. Use one log per controller, not one log per data subject. A per-subject log publishes that the subject exists and how many events they have, which the commitment cannot hide.

**Identical receipts.** The same payload under the same key and the same nonce commits to the same bytes. The per-leaf nonce is what stops that. Reusing a nonce under one key is a defect in the side store, not a property of the hash.

**What the tree still leaks.** Commitments hide payload contents. They do not hide that an append happened, when the checkpoint moved, or how large the log is. A witness who is shown a consistency proof learns the size at two times. That metadata can be correlated with out-of-band events (a support ticket at 14:02, a checkpoint that grew by one). The proposal does not claim traffic-analysis resistance. Padding the log with dummy commitments would be a different design and is not in this prototype.

**Length.** The log entry is fixed at 33 bytes, so the entry bundle does not leak payload length. The side store must not compensate by putting the length, the subject id, or the payload hash in a public index.

**Rekor.** Anchoring the checkpoint note commits Rekor to "this tree head existed". Anchoring `SHA-256(payload)`, or a hashedrekord of the raw receipt, puts a dictionary oracle in a public log that the controller does not operate. This prototype anchors only the checkpoint note. A future anchor of the commitment itself would be acceptable, because the commitment is not invertible without the key. An anchor of the payload hash would not.

**After shred.** A commitment whose key and nonce are destroyed, and of which no copy remains, is not practically reversible. That is not the same as a legal finding that the leaf is no longer personal data. Anyone who copied the key before deletion can still test guesses. Witnesses who recorded the inclusion proof can still show the leaf has not been edited; they cannot open it unless they also kept the key. The proposal's claim is the technical one: erasure is destruction of the opening material, and verification of the tree does not require that material.

**What this hash is not.** SHA-256 with a secret key is a computational commitment. It is not a Pedersen commitment and it is not information-theoretically hiding. A future version can swap the commitment function without changing the tile layout, because the log entry is an opaque byte string under a version byte.

## Hash-chain compatibility

`chainMode: "hash-chain"` keeps `prevHash` and `contentHash` and runs the existing `verifyChain`. That mode does not provide erase-but-verify. A content hash of a low-entropy event is the naked-hash oracle described above. Personal data does not belong in a hash-chained payload that will be shown to verifiers. The mode exists so current bundles keep verifying while a log is stood up beside them.

A deployment may emit both during a migration. The prototype does not require the hash chain to agree with the Merkle leaf. They commit to different bytes on purpose: the chain commits to the event document, the leaf commits to a keyed digest.

## Consequences

- Verifiers can check one receipt, and the growth of the log, without holding every payload.
- A controller can destroy a subject's opening material without rewriting the tree or asking witnesses to forget a root they have signed.
- Checkpoints are comparable with Tessera and other tlog-tiles clients. The prototype does not serve tiles over HTTP; it builds the bytes those clients would fetch.
- `verifyBundle` and the hash-chain TCK fixtures are unchanged.
- The checkpoint signature is the log's Ed25519 note signature only. Witness cosignatures are a later step.
- The side-store encryption is specified and not implemented. Shipping the prototype as if backups were shredded would be false.

## Open questions

1. Confirm or replace the ADR number.
2. Whether the production checkpoint signature should be ML-DSA-44 cosignature (`0x06`) from the start, with Ed25519 kept as a test algorithm.
3. Who operates the log, and which witnesses must sign before a controller's checkpoint is treated as published.
4. Which Rekor instance, if any, and whether the anchor is the checkpoint note (this prototype) or something else.
5. One log per controller is the recommendation here. A shared public log changes the metadata leakage and needs its own decision.
6. How long tiles stay available. tlog-tiles pruning must not be used as the erasure mechanism.
7. Whether a destroyed-key commitment is anonymous for the controller's GDPR analysis. This ADR does not answer that.
8. The predicate URI and the in-toto packaging are [ADR-0054](ADR-0054-intoto-receipt-attestation.md).
