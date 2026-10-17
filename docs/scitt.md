<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# CRAWCUS and SCITT

**Status: informative.** The payload profile is a draft: [CRAWCUS as a SCITT payload](spec/crawcus-scitt-profile.md). Interop with Transparency Services is planned but **not yet tested**. This page does not claim that any Transparency Service accepts or certifies CRAWCUS.

## Position

CRAWCUS defines the receipt *payload semantics* and the regulation mapping. [SCITT](https://datatracker.ietf.org/wg/scitt/about/) defines the *transparency envelope*: Signed Statements, Transparency Services and SCITT receipts (COSE Receipts, RFC 9942). The two are complementary layers. CRAWCUS is meant to run on SCITT, not to replace it.

## Two kinds of receipt

A **CRAWCUS receipt** is the signed record of one business transaction or AI decision, made by the system that performed it. A **SCITT receipt** is the Transparency Service's later proof that a Signed Statement was registered in its log. When a CRAWCUS receipt is registered with SCITT, the CRAWCUS receipt is the Signed Statement and the SCITT receipt is its proof of registration. On this site a bare "receipt" always means a CRAWCUS receipt; see the [glossary](glossary.md).

## Why not SCITT alone?

SCITT ([RFC 9943](https://www.rfc-editor.org/rfc/rfc9943.html), [RFC 9942](https://www.rfc-editor.org/rfc/rfc9942.html)) standardises two things:

- how a Signed Statement is registered with a Transparency Service;
- how a verifier gets a SCITT receipt (registration receipt) over a Verifiable Data Structure.

The Statement itself is opaque to the Transparency Service. Auditors of business transactions and AI decisions still need an agreed shape for the payload: what was decided, under which contract, and with which disclosure, consent and oversight fields. They also need to know how that shape maps to GDPR, the EU AI Act or FERPA, and they need an offline verifier and a TCK. CRAWCUS supplies that layer.

## Layers

```
  CRAWCUS (payload)                     SCITT (envelope)
  ─────────────────                     ────────────────
  CRAWCUS receipt bundle (JCS)    →     COSE_Sign1 Signed Statement payload
  Trust policy (pinned issuer keys)     Registration Policy at the TS
  Hash chain + contract checks          Verifiable Data Structure (RFC9162_SHA256)
  Offline verifier + TCK                SCITT receipt (RFC 9942), SCRAPI HTTP API (draft)
```

## What maps to what

| CRAWCUS | SCITT (RFC 9943) | Profile decision |
|---|---|---|
| Canonical bundle bytes (JCS) | Signed Statement payload | Carried as-is; content type `application/vnd.crawcus.bundle+jsonl` (provisional) |
| DSSE / ed25519 signature | Issuer signature on `COSE_Sign1` | In SCITT mode the COSE signature replaces DSSE; no double wrapping |
| Trust-policy issuer key | `kid` + CWT `iss` | The trust policy pins the key for `iss` |
| `intent.id` | CWT `sub` | `urn:crawcus:intent:<id>` |
| Local hash chain | Not a SCITT VDS | Still a CRAWCUS property; a SCITT receipt from the VDS is additional |
| Personal data in the payload | Statement over a hash (RFC 9943 §6.2) | COSE Hash Envelope; the Transparency Service stores only a digest |

## Build status

See [ADR-0055](adr/ADR-0055-scitt-fit.md) for the plan. Done so far: slice 1, which encodes and verifies Signed Statements in `@crawcus/scitt` and has deterministic fixtures. SCITT receipt verification, hash-envelope mode and registration against a Transparency Service are not yet built or tested.

## References

- [RFC 9943](https://www.rfc-editor.org/rfc/rfc9943.html): SCITT architecture (Standards Track, June 2026)
- [RFC 9942](https://www.rfc-editor.org/rfc/rfc9942.html): COSE Receipts (Standards Track, June 2026)
- [draft-ietf-scitt-scrapi](https://datatracker.ietf.org/doc/draft-ietf-scitt-scrapi/): SCITT Reference APIs (Internet-Draft; RFC Editor queue as of 2026-10)
- WG: <https://datatracker.ietf.org/wg/scitt/about/>
