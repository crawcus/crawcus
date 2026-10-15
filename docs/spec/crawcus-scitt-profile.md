<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# CRAWCUS as a SCITT payload (profile, draft)

**Status:** draft, version 0. It is not an Internet-Draft and has not been reviewed by the IETF SCITT WG. It has **not yet been tested** against any Transparency Service implementation. Identifiers marked *provisional* are not registered with IANA.

The key words MUST, SHOULD and MAY are used as in BCP 14 ([RFC 2119], [RFC 8174]), but only within this profile.

## 1. Scope

CRAWCUS is an open spec for audit-receipt **payloads**. It defines the receipt fields and their meaning, a regulation mapping (GDPR, EU AI Act, FERPA packages), an offline verifier, and a TCK.

SCITT ([RFC 9943], [RFC 9942]) defines the **transparency envelope**. That covers Signed Statements (COSE_Sign1), Registration with a Transparency Service (TS), Verifiable Data Structures (VDS) and Receipts. RFC 9943 treats the Statement as opaque to the TS (§3). Payload formats are left to profiles.

This profile says how a CRAWCUS bundle is carried as the payload of a SCITT Signed Statement. Each layer keeps its own job:

- CRAWCUS does **not** define a Transparency Service, a VDS, Receipts, or a registration API.
- SCITT does not define CRAWCUS payload semantics or regulation mapping.

## 2. Mapping

### 2.1 Envelope

A CRAWCUS Signed Statement is a tagged `COSE_Sign1` (`#6.18`, [RFC 9052]). It MUST meet RFC 9943 §6:

| Label | Field | Profile requirement | CRAWCUS source |
|---|---|---|---|
| 1 | `alg` | REQUIRED. Slice 1 implements EdDSA (`-8`). ES256 (`-7`) is planned (§6, Q1). | Signer key type |
| 3 | `content_type` | REQUIRED when the payload is attached: `application/vnd.crawcus.bundle+jsonl` (*provisional*). It MUST NOT be present in hash-envelope mode (§4). | Same string as the existing DSSE `payloadType` |
| 4 | `kid` | REQUIRED (RFC 9943 §6, when neither `x5t` nor `x5chain` is present) | Key identifier of the issuer key in the CRAWCUS trust policy |
| 15 | CWT Claims ([RFC 9597]) | REQUIRED | |
| 15 → 1 | `iss` | REQUIRED, a URI tstr of 1–8192 chars | The issuer the trust policy names for this key |
| 15 → 2 | `sub` | REQUIRED, `urn:crawcus:intent:<intent.id>` | Bundle `intent.id`. It groups the Statements about one CRAWCUS subject, so Relying Parties can check completeness per `sub` (RFC 9943 §3, "Subject"). |
| 15 → 6 | `iat` | OPTIONAL | Latest event timestamp. **Self-asserted** (§3). |

The unprotected header MUST be empty at signing. Receipts are added later under label `394` ([RFC 9942]), which turns the Signed Statement into a Transparent Statement (RFC 9943 §7).

**Content type choice.** We reuse the DSSE `payloadType` string, so one identifier names the bundle bytes in both JSON and SCITT modes. The `+jsonl` suffix is inherited and is itself provisional (Q2).

### 2.2 Payload bytes

The payload is exactly the bundle bytes that CRAWCUS already produces: the JCS ([RFC 8785]) canonical JSON. The bytes MUST NOT be re-serialised.

### 2.3 DSSE vs COSE

**Chosen option:** in SCITT mode the COSE_Sign1 signature **replaces** the DSSE envelope. The payload is the bare bundle and is not a DSSE envelope.

Reasons:

1. **One signature, one key, one meaning.** A TS verifies the COSE signature (RFC 9943 §6.3, step 2). If DSSE were nested inside, the same issuer would sign twice over the same bytes. Verifiers would then need a rule for when the two signatures disagree, for example when they use different keys.
2. **Policy stays visible to the TS.** A nested DSSE envelope would hide the bundle's `payloadType` and keyid from the protected header that a Registration Policy can read (RFC 9943 §3, "Registration Policy").
3. **The CRAWCUS verifier is unchanged.** Its integrity and trust logic works on "verified public key + payload bytes". Only the step that extracts the signature differs (DSSE PAE vs COSE `Sig_structure`).

JSON-world tooling (cosign, in-toto) keeps using DSSE mode. Moving between modes means re-signing; nothing is ever wrapped twice.

### 2.4 Attached vs detached

- **Attached** (default): the payload is the bundle bytes.
- **Detached** (`payload = nil`) is allowed by RFC 9943 §6. In that case the Relying Party MUST obtain the exact bundle bytes out of band.
- For privacy, use hash-envelope mode instead (§4).

## 3. Verification

An offline Relying Party verifies two separate layers and reports them separately (RFC 9943 §7.1):

| Step | Check | What it proves | What it does not prove |
|---|---|---|---|
| 1 | Receipt: RFC 9942 §5.2 (RFC9162_SHA256 inclusion proof → Merkle root as payload → COSE signature under a TS key the RP trusts) | The Signed Statement was registered in that TS's VDS at the stated tree size | Anything about who the issuer is or what the payload says |
| 2 | Statement signature: COSE_Sign1 under the key named by `kid` | The bytes were signed by that key | That the key is authorised |
| 3 | CRAWCUS trust policy: the key is pinned for `iss` | The signer is authorised, as in DSSE mode. With no policy it fails closed (`untrusted-signer`). | |
| 4 | CRAWCUS payload: JCS hash equivalence, hash chain, contract re-evaluation | The receipt contents are internally consistent | |

**Time.** CWT `iat` and the bundle event timestamps are signed by the issuer, so they can be back-dated. The TS **registration time** (RFC 9943 §7) is the only time not under the issuer's control. Planned (§5, S3): when a valid Receipt is present, the CRAWCUS verifier uses it as an independent signing-time source for validity windows and `superseded` revocation. Without a Receipt the existing rule stands: only `key-compromise` revocation is a security boundary.

## 4. Privacy and GDPR

RFC 9943 §6.2 allows a Statement over the *hash* of a payload. For CRAWCUS receipts with personal data, issuers SHOULD use COSE Hash Envelope ([draft-ietf-cose-hash-envelope], an Internet-Draft) with these headers:

- `258` (`payload_hash_alg`) = `-16` (SHA-256)
- `259` (`payload_preimage_content_type`) = `application/vnd.crawcus.bundle+jsonl`
- `260` (`payload_location`) is OPTIONAL
- label `3` MUST NOT be present

The payload is then SHA-256 of the bundle bytes.

The TS stores only a digest. That fits the CRAWCUS tombstone and crypto-shred erasure pattern: erasing the preimage leaves the registration verifiable as "something with this digest existed" and discloses nothing more. A Relying Party that holds the bundle checks the digest and then runs §3, steps 3–4.

## 5. Relation to the CRAWCUS Merkle log (PR #3)

PR #3 prototypes a CRAWCUS-native transparency log. This profile makes a **SCITT TS the preferred transparency layer**. The native log is a compatibility mode for deployments with no TS.

If the native log ships, it SHOULD use RFC9162_SHA256 leaf and node hashing, and SHOULD emit RFC 9942 Receipts, so that one Receipt verifier covers both. That is a requirement on PR #3, not something this document claims PR #3 already does.

## 6. Open questions for the WG

- **Q1.** Is EdDSA (`-8`) acceptable for Registration Policies in practice, or should profiles mandate ES256 for interop?
- **Q2.** Media type: `+jsonl` vs `+json`, and is a vendor-tree registration the right path for a statement payload type?
- **Q3.** Is `sub` = one subject per intent the right granularity? Is there a convention for application-level, non-artifact subjects?
- **Q4.** Should a payload profile define a Registration Policy fragment (required `content_type` or `259`, a `sub` scheme), or leave it to each TS?
- **Q5.** Is TS registration time, carried through a Receipt, an accepted source of signing time for issuer key-validity decisions?
- **Q6.** Is there a recommended way to link successive Statements for one `sub`, e.g. a CRAWCUS chain head hash in a protected header?

## 7. Worked example (illustrative only)

The keys are TEST ONLY: ed25519 from a fixed seed prefixed "TEST". The bytes match the slice-1 golden fixture in `packages/scitt/test/fixtures/`.

Payload (JCS JSON; abbreviated example bundle):

```json
{"bundleVersion":"0.1.0","events":[{"id":"evt_0000","timestamp":"2026-08-11T00:00:00.000Z"}],"intent":{"id":"i_test","key":"TestIntent"}}
```

Signed Statement (EDN, attached payload):

```
18([
  / protected / << {
    / alg          / 1: -8,                                   / EdDSA /
    / content_type / 3: "application/vnd.crawcus.bundle+jsonl",
    / kid          / 4: 'test-key-1',
    / CWT Claims   / 15: {
      / iss / 1: "https://issuer.example",
      / sub / 2: "urn:crawcus:intent:i_test",
      / iat / 6: 1786406400
    }
  } >>,
  / unprotected / {},
  / payload     / h'7b2262756e646c6556657273696f6e223a...',   / 137 bytes /
  / signature   / h'...'                                       / 64 bytes /
])
```

After Registration, the Transparent Statement has `{ 394: [ h'<Receipt>' ] }` in its unprotected header. The Receipt's protected header carries `395: 1` (RFC9162_SHA256), and its unprotected header carries `396: { -1: [ <<[tree-size, leaf-index, [path...]]>> ] }` (RFC 9942 §5.2.1).

## References

- [RFC 9943] An Architecture for Trustworthy and Transparent Digital Supply Chains. <https://www.rfc-editor.org/rfc/rfc9943.html>
- [RFC 9942] COSE Receipts. <https://www.rfc-editor.org/rfc/rfc9942.html>
- [RFC 9052] COSE: Structures and Process. [RFC 9597] CWT Claims in COSE Headers. [RFC 8392] CWT. [RFC 8785] JCS. [RFC 9162] Certificate Transparency v2.0.
- [draft-ietf-cose-hash-envelope] COSE Hash Envelope (Internet-Draft, work in progress).
- [draft-ietf-scitt-scrapi] SCITT Reference APIs (Internet-Draft, work in progress). <https://datatracker.ietf.org/doc/draft-ietf-scitt-scrapi/>
