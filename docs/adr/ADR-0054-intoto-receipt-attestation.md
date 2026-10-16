<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# ADR-0054 — Receipts as in-toto Statement v1

- **Status:** Proposed. Prototype for review. Not an accepted predicate registration.
- **Number:** 0054, provisional, following [ADR-0053](ADR-0053-merkle-transparency-log.md).
- **Related:** The DSSE envelope in the format spec stays the outer wrapper. Signer trust for that envelope is out of scope here.

## Context

CRAWCUS already puts a bundle in a DSSE envelope, the same envelope in-toto and SLSA use. The payload type is `application/vnd.crawcus.*+jsonl`, which a generic in-toto verifier will not interpret. in-toto's Statement v1 is the layer that names a subject by digest and points at a predicate type. Emitting a receipt as that statement lets an in-toto or SLSA-shaped tool see the envelope without teaching it the CRAWCUS bundle schema. The receipt-specific claims stay in a predicate this project defines.

## Decision

Emit a receipt as an in-toto [Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) and keep DSSE.

| Field | Value |
|---|---|
| DSSE `payloadType` | `application/vnd.in-toto+json` |
| Statement `_type` | `https://in-toto.io/Statement/v1` |
| `predicateType` | `https://crawcus.org/ns/in-toto/receipt/v1` |

The predicate type is `https://crawcus.org/ns/in-toto/receipt/v1`. `crawcus.org` and `crawcus.dev` are owned for the standard, and the identifier uses `crawcus.org` so the type is not under `tallyseal.org`. It is a name, not a URL the verifier fetches. This repository's site configuration and CNAME are unchanged.

The statement bytes are RFC 8785 canonical JSON. The DSSE signature is over those exact bytes. A verifier that re-canonicalises before checking the signature will fail closed if the bytes differ, and the prototype rejects a payload that is not already canonical.

The predicate has `v: 1` and `chainMode`. Unknown fields are rejected. In particular a `payload` field is rejected, so a personal receipt body cannot be pasted into the published attestation by mistake.

### Merkle mode

`chainMode` is `merkle-tlog`. The predicate carries the log origin, leaf index, tree size, log entry, inclusion proof, and root hash from [ADR-0053](ADR-0053-merkle-transparency-log.md).

The in-toto subject is the log entry, not the personal payload:

```
subject[0].name = "<log origin>#<leaf index>"
subject[0].digest.sha256 = hex(SHA-256(log entry))
```

`SHA-256(payload)` is not used. A subject digest of a low-entropy payload would be a dictionary oracle sitting in an attestation that is meant to be publishable. The log entry is the versioned commitment, which is not invertible without the shred key and nonce. The verifier checks that the subject digest matches the log entry and that the inclusion proof connects that entry to the root in the predicate.

### Hash-chain compatibility mode

`chainMode` is `hash-chain`. The predicate carries `contentHash` and `prevHash` only. The subject digest is that `contentHash`. When the caller also supplies the events, the existing `verifyChain` runs and the attestation's content hash must be the chain head.

This mode is how current receipts are wrapped without a log. It inherits the hash chain's limits: the content hash is a naked digest of the event document, and the mode does not erase. Do not use it for personal data. It is the compatibility path, not the one ADR-0053 recommends for new personal receipts.

### What the DSSE signature means here

The prototype signs with Ed25519 and puts the public key in `keyid`, which is what the current verifier checks. That shows the statement bytes were not edited after signing. It does not decide that the signer is an authorised issuer. That decision is the trust-policy work tracked separately. This ADR does not change `verifyBundle`.

## Consequences

- A CRAWCUS receipt can travel in the same DSSE envelope in-toto already verifies, with a predicate type that is specific to this project.
- The published attestation in Merkle mode does not contain the payload. Erasure of the side store does not require collecting issued attestations, because those attestations never held the opening material. An attestation issued in hash-chain mode, or any copy that included the payload, is a separate copy and is not shredded by deleting the log's key.
- Two chain modes share one predicate type, distinguished by `chainMode`, so a verifier can reject an unknown mode instead of guessing.
- The predicate URI is `https://crawcus.org/ns/in-toto/receipt/v1`. `crawcus.dev` is not part of the identifier. Site configuration still uses `tallyseal.org` until a separate cutover.

## Open questions

1. The predicate type is `https://crawcus.org/ns/in-toto/receipt/v1`. A later change of that string is a new predicate type, because verifiers compare it exactly.
2. Whether to register that predicate in the in-toto predicate index.
3. Whether hash-chain mode should remain in this predicate or move to a separate type once Merkle mode is the default.
4. The statement does not carry a checkpoint signature. A verifier that only has the attestation trusts the root inside it as far as the DSSE signer. Binding the predicate root to a signed checkpoint is an extra input, and ADR-0053's offline check is that input. Should a conformant receipt be required to bundle the checkpoint note?
5. Signer trust for the DSSE key is deliberately not decided here.
