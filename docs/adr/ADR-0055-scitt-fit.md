<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# ADR-0055: SCITT fit — build plan

**Status:** proposed (draft).
**Profile:** [CRAWCUS as a SCITT payload](../spec/crawcus-scitt-profile.md)

## Decision

Add a `@crawcus/scitt` package. It carries CRAWCUS bundles as SCITT Signed Statements and verifies SCITT Receipts offline. The existing trust-policy verifier keeps deciding signer trust. In SCITT mode the COSE_Sign1 signature replaces DSSE (profile §2.3).

## Libraries

| Need | Choice | Why |
|---|---|---|
| CBOR | [`cbor-x`](https://github.com/kriszyp/cbor-x) (MIT, maintained) | Fast and widely used. Supports tags and `Map` with integer keys. Determinism comes from building maps in RFC 8949 §4.2.1 order (`deterministicMap`). |
| Signatures | `@noble/curves` (already a dependency) | EdDSA now, P-256 (ES256) next. No new crypto dependency. |
| SHA-256 / Merkle | `@noble/hashes` (already a dependency) | RFC 9162 leaf and node hashing |
| COSE SDK | **None.** We build `Sig_structure` and `COSE_Sign1` by hand | The `COSE_Sign1` and `Sig_structure` code is about 100 lines, and the protected header is byte-for-byte under our control. The alternative, [`@transmute/cose`](https://github.com/transmute-industries/cose) (Apache-2.0), was last pushed 2025-07. We can revisit it if we need more of COSE. |

Slice 1 was cross-checked independently: Python `cbor2` plus `cryptography` decoded the golden fixture and verified its signature, and found the protected header already in canonical form.

## Transparency Services to test against

I checked these repositories on 2026-10-15. **Nothing has been tested against any of them yet.**

- [`microsoft/scitt-ccf-ledger`](https://github.com/microsoft/scitt-ccf-ledger) (MIT): active, last pushed 2026-10-14. It is the CCF-based TS behind the CCF Receipt profile (`draft-ietf-scitt-receipts-ccf-profile`). Note that its Receipts use the CCF VDS, not RFC9162_SHA256, so S3 must handle both.
- [`scitt-community/scitt-api-emulator`](https://github.com/scitt-community/scitt-api-emulator) (MIT): **archived**, last pushed 2024-11. Useful only as a reference.
- Other public repositories exist (for example `tradeverifyd/transparency-service`), but I have not assessed them. The list at <https://scitt.io/implementations.html> is the place to pick further targets.

## SCRAPI

`draft-ietf-scitt-scrapi` defines the HTTP surface:

- `POST /entries` registers a `application/cose` Signed Statement. It returns `201` with the Receipt, or `202` with a `Location` to poll.
- `GET /entries/{id}` resolves the Receipt.
- `GET /.well-known/scitt-keys` lists the TS keys.

The registration client should be small and `fetch`-based. It should treat 202 polling as normal, and it should pin the draft revision it was tested against.

## Slices (one small PR each)

| Slice | Content | Done when |
|---|---|---|
| **S1** (this PR) | Package skeleton. Encode a bundle as `COSE_Sign1` (EdDSA, `content_type`, `kid`, CWT `iss`/`sub`/`iat`). Decode with RFC 9943 §6 header checks, then verify the signature. Deterministic golden fixture and unit tests. | CI green; cross-checked independently |
| S2 | Hash-envelope mode (258/259/260, label 3 absent). ES256 (`-7`). Detached-payload API. | Fixtures for each alg/mode |
| S3 | RFC 9942 Receipt verifier: RFC9162_SHA256 inclusion proof → root → COSE signature under a pinned TS key. Then the CCF Receipt profile. | Fixtures with hand-built trees; negative cases (bad index, wrong root, wrong TS key) |
| S4 | `verifyTransparentStatement`: Receipt + statement signature + CRAWCUS trust policy + payload checks (profile §3). Reports each layer separately. TS registration time becomes a `SigningTimeSource`. Depends on PR #2 (trust policy). | End-to-end offline verify |
| S5 | TCK `scitt/` vectors: valid, wrong `content_type`, missing `sub`, tampered payload, untrusted issuer, bad Receipt, hash-envelope | Vectors usable by any runtime |
| S6 | SCRAPI client and an **interop test** against one TS (scitt-ccf-ledger first). Results recorded with versions pinned. | A written interop note. Until then, no "works with" claims |
| S7 | Native-log alignment (PR #3): RFC9162_SHA256 hashing + RFC 9942 Receipts | One Receipt verifier for both |

## Non-goals

- Running a Transparency Service.
- Defining a new VDS.
- Claiming interop before S6 records it.
