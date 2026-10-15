<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# CRAWCUS trust policy

Media type: `application/vnd.crawcus.trust-policy+json`. Schema version: `1`.

A verifier loads this document out of band. It is not inside the bundle.
The reference implementation parses it with `parseTrustPolicy` and will
not return `pass` for a signature whose public key is absent from it.

## Version 1 document

```json
{
  "crawcusTrustPolicy": 1,
  "policyId": "example-2026",
  "description": "Example pinned signers",
  "requireTrustedSigner": true,
  "anchors": [
    {
      "type": "ed25519-pinned",
      "id": "example-2026-q3",
      "publicKey": "<64 lowercase hex chars, or 32-byte base64>",
      "notBefore": "2026-07-01T00:00:00Z",
      "notAfter": "2026-12-31T23:59:59Z",
      "payloadTypes": ["application/vnd.crawcus.bundle+jsonl"],
      "label": "Example signer"
    }
  ],
  "revoked": [
    {
      "publicKey": "<64 lowercase hex chars>",
      "revokedAt": "2026-09-15T00:00:00Z",
      "reason": "key-compromise"
    }
  ]
}
```

`requireTrustedSigner` defaults to true when omitted. Setting it to
false does not make this version return `pass` for an untrusted signer.
The only library hatch is the explicit TEST-ONLY `allowUntrustedSignerForTestsOnly` option (never set in production),
and even then `trust.decision` stays `untrusted`.

### Parsing

Parsing is strict. Any of the following is `policy.malformed` and the
bundle verdict is `fail`:

- input is not a JSON object
- `crawcusTrustPolicy` is not the integer `1`
- `policyId` does not match `[a-z0-9._-]{1,64}`
- `anchors` is missing, empty, or longer than 128
- duplicate anchor `id`
- a public key that is not 32 bytes
- a timestamp that is not RFC 3339
- `notBefore` later than `notAfter`
- unknown fields, including top-level `threshold`
- a `revoked` entry with an unknown `reason`

The reference parser normalises public keys to lowercase hex before it
computes the fingerprint, so hex and base64 spellings of the same key
fingerprint identically. Object key order does not affect the
fingerprint. The fingerprint is `sha256` over the RFC 8785 canonical
form of that normalised policy, as lowercase hex.

### How a signature is checked

1. Each DSSE signature is an integrity check against the 32-byte key
   decoded from its own `keyid`. The `keyid` is only a hint. A keyid
   that does not decode, or a signature that does not verify against
   the key it names, is `signature.invalid` (`fail`). That is the
   keyid-spoof case: the hint names a pinned key and the signature was
   produced by a different key.
2. For each signature that does verify, the verified public key is
   compared to the policy. The embedded keyid string is not trusted
   on its own.
3. The first signature in array order that both verifies and is
   authorised is the one reported. A later trusted signature is used
   when an earlier signature verifies but is not authorised.
4. With no policy, the verdict is `untrusted-signer` and the reason
   is `signer.untrusted.no-policy`.

### Validity windows

`notBefore` and `notAfter` are inclusive. For a pinned key the signing
time is the bundle's latest event timestamp
(`signingTimeSource: bundle-latest-event-ts`). That timestamp is inside
the signed payload, so the holder of the key can choose it. A window
therefore bounds honest use. It is not a security boundary against a
holder who back-dates. If a window is set and no signing time is
available, the reason is `signer.untrusted.signing-time-unknown`.

The verifier never consults the wall clock. The same bundle and the
same policy produce the same trust decision.

When `payloadTypes` is omitted, the anchor authorises the
`application/vnd.crawcus.*+jsonl` family. When it is set, the envelope
`payloadType` must be an exact member of the list.

### Revocation

Revocation wins over anchors.

| `reason` | Effect |
|---|---|
| `key-compromise` | `fail` / `signer.untrusted.revoked` for every bundle signed by that key, including bundles whose signing time is before `revokedAt`. A compromised key can back-date. |
| `superseded` or `retired` | `untrusted-signer` / `signer.untrusted.revoked` when the signing time is at or after `revokedAt`. An earlier signing time is still accepted. If that time is only the bundle's own timestamp, the check detail says the signing time is self-asserted. If no signing time is available, the reason is `signer.untrusted.signing-time-unknown`. The library surfaces a self-asserted time as `trust.signer.signingTimeSelfAsserted: true`. |

### Rotation

1. Add the new anchor with `notBefore` set to the rotation instant `T`.
2. Set `notAfter` on the old anchor to `T` plus the overlap.
3. After the overlap, move the old key to `revoked` with reason
   `superseded` and `revokedAt` at the end of the overlap.
4. Publish the new policy and its fingerprint.

### Reserved for a later version

Version 1 rejects unknown fields so a future TUF-style document cannot
be mistaken for a version 1 policy. A later `crawcusTrustPolicy` value
is the extension point. The fields anticipated, and not implemented, are:

- per-role thresholds (`threshold` is rejected in version 1) for
  root, targets, snapshot, and timestamp roles
- a policy `expires` instant corresponding to a TUF timestamp role
- a snapshot hash of the previous policy, so a rotation can name what
  it replaced
- mirror URLs. The library stays offline; a caller may fetch a policy
  before verification and pass the bytes in

`sigstore-identity` anchors are parsed so a file can name them:

```json
{
  "type": "sigstore-identity",
  "id": "foundry-release-ci",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "https://github.com/example/repo/.github/workflows/sign.yml@refs/heads/main",
  "requireTlog": true
}
```

Exactly one of `subject` or `subjectRegExp` is required. This version
does not return `pass` because a sigstore anchor matched. A policy that
contains only those anchors fails closed for an ed25519 signature
(`signer.untrusted.unknown-key`).

## What must not be pinned

Test vectors, including the RFC 8032 §7.1 public key, are not production
keys. Conformance vectors in `@crawcus/tck` are labelled `TEST ONLY` and
use keys generated for that purpose.
