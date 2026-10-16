<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# Trust anchors (`trust-anchors.json`)

`_type`: `crawcus-trust-anchors`. `spec_version`: `1.0.0`.
Schema: [`spec/schemas/trust-anchors-1.0.json`](https://github.com/crawcus/crawcus/blob/main/spec/schemas/trust-anchors-1.0.json).

A trust-anchor document lists every public key a verifier may trust,
with its purpose, validity window and status. It is modelled on
[TUF](https://theupdateframework.github.io/specification/latest/) root
metadata: a threshold of **root keys** signs the document, and root keys
sign nothing else. Verifiers map the document onto a
[trust policy](crawcus-trust-policy.md) (schema version 1, which stays
threshold-free; the threshold lives only here).

!!! warning "No production document yet"
    The copy in the repository and at the `.well-known` URL is a
    **TEST placeholder** generated from public seeds. Its issuer is
    `TEST-ONLY.crawcus.invalid`. Never trust it.

## Location

| Copy | Location |
| :--- | :--- |
| Canonical | `trust/trust-anchors.json` in `crawcus/crawcus` (history: `trust/history/<version>.json`, planned) |
| Mirror | `https://crawcus.org/.well-known/crawcus-trust-anchors.json`, byte-identical, built from `docs/.well-known/` |
| Root pin | `trust/pinned-root.json` (keyids + threshold) and README "Verifying CRAWCUS" |

Remote sources are one ordered list, tried in order:

1. `https://crawcus.org/.well-known/crawcus-trust-anchors.json`
2. `https://raw.githubusercontent.com/crawcus/crawcus/main/trust/trust-anchors.json`

Every source must verify against the trust chain rooted in the pinned
root; no source is trusted because of where it was found. The
reference verifier exports this list as `CRAWCUS_ANCHOR_SOURCES`.
Other issuers supply their own ordered list and pin.

CI (`pnpm lint` → `tools/anchors/anchors.mjs check`) fails when:

- the mirror differs from the canonical copy;
- the README fingerprints or `trust/pinned-root.json` differ from
  `roles.root`;
- a non-TEST document expires less than 30 days from now;
- `version` or `issued_at` is not strictly greater than the previous
  version's (the newest `trust/history/<version>.json` below it, and
  the copy on the git base branch). Every file in `trust/history/` must
  be named `<version>.json` and parse as a valid document with that
  version; an unparseable history file fails the check.

`/trust/` is covered by CODEOWNERS. On any change under `trust/`, the
`trust-anchors` workflow verifies the root threshold signatures against
`trust/pinned-root.json`.

### Publication cadence

A new version is published at least every **6 months**, even if no key
changed, and `expires` is at most 12 months after `issued_at`. This
keeps the CI expiry gate (30 days) from being reached in normal
operation and bounds how long a withheld update can go unnoticed.

## Document

```json
{
  "signed": {
    "_type": "crawcus-trust-anchors",
    "spec_version": "1.0.0",
    "issuer": "crawcus.org",
    "version": 7,
    "issued_at": "2026-11-01T00:00:00Z",
    "expires": "2027-05-01T00:00:00Z",
    "roles": { "root": { "keyids": ["sha256:…", "sha256:…", "sha256:…", "sha256:…"], "threshold": 2 } },
    "keys": [
      {
        "keyid": "sha256:3f9a…",
        "alg": "ed25519",
        "public_key": "MCowBQYDK2VwAyEA…",
        "purpose": "release",
        "deployment": null,
        "custody": "hsm",
        "kms_resource": null,
        "not_before": "2026-11-01T00:00:00Z",
        "not_after": "2028-11-01T00:00:00Z",
        "status": "active",
        "revoked_at": null,
        "revocation_reason": null,
        "superseded_by": null
      }
    ]
  },
  "signatures": [
    { "keyid": "sha256:…", "sig": "base64…" },
    { "keyid": "sha256:…", "sig": "base64…" }
  ]
}
```

### Key identifiers

```
keyid = "sha256:" + lowercase_hex(SHA-256(raw 32-byte ed25519 public key))
```

This is the only derivation in CRAWCUS. The human-facing fingerprint is
the same string, and `TrustResult.signer.keyFingerprint` uses it too.
`public_key` is base64 SubjectPublicKeyInfo DER. A keyid that does not
match its `public_key` rejects the whole document.

### Field rules

- `version` is a positive integer that increases with every publication.
- `expires` is after `issued_at` and at most 12 calendar months later.
  Publishers re-sign at least every 6 months.
- `purpose` is one of `root`, `release`, `test-vectors`,
  `audit-export` (audit bundles of one deployment). Each
  key has exactly one purpose. `deployment` is required for
  `audit-export` and null otherwise.
- `status` is `active`, `retired` or `revoked`. `revoked` requires
  `revoked_at` and `revocation_reason` (`key-compromise`, `superseded`,
  `retired`, the trust-policy names). Both are null otherwise.
- A key with an unknown `purpose` or `status` is ignored, not the file.
  Unknown fields inside `signed` are ignored; they are still covered by
  the signature. Unknown top-level fields reject the document.
- `superseded_by`, when set, must name a different key in the same
  document whose `status` is `active` or `revoked`; otherwise the whole
  document is rejected.
- `not_before` is inclusive and `not_after` is exclusive: a key is
  valid for signing times in `[not_before, not_after)`.
- Root keys are listed in `keys` with `purpose: "root"`.

### Root keys and threshold

The number of root keys (N) and `roles.root.threshold` are configurable
per document; production documents use a threshold of at least 2. Root
keys sign only this document. The TEST placeholder uses N = 2 with
threshold 2.

### Signatures

```
input = DSSE PAE("application/vnd.crawcus.trust-anchors+json", JCS(signed))
```

JCS is RFC 8785. The PAE prefix separates domains, so an anchor
signature never verifies as a bundle signature or the reverse. The
document is valid when at least `roles.root.threshold` signatures verify
from **distinct** keyids in `roles.root.keyids` whose entries have
`purpose: "root"` and `status: "active"`. Duplicate keyids count once.
`threshold` must be at least 2; 1 is accepted only in an explicit
verifier test mode.

## Verifier behaviour

Trust begins with an out-of-band pin of the root keyids and threshold
(the README fingerprints, or a copy embedded in a verifier release) and
moves forward one document at a time.

1. **Bootstrap.** The document's `roles.root` must equal the pin, and it
   must be signed to threshold by that root.
2. **Update.** A candidate N replaces the trusted document T only if:
   N is signed by a threshold of T's root; N is signed by a threshold of
   its own root (so a root rotation needs both); `N.version > T.version`
   (an equal version must be byte-identical); the issuer is unchanged;
   and N has not expired. Otherwise T is kept and the update is reported
   as rejected. The verifier never fails open.
3. **Expiry.** If the trusted document has expired and no valid newer
   one is available, verification fails with `anchors-expired`. This
   holds offline too. An explicit override exists for archival use and
   is never a default.
4. **Local files** (`--anchors <path>` style) and history steps go
   through the same update rule; they cannot replace the root.

Fetching uses HTTPS only, a 1 MiB cap, a 10 s timeout and no redirects.

### Mapping to a trust policy

`trustPolicyFromAnchors(signed, { purpose, deployment? })` selects keys
whose purpose matches the artifact (release → `release`, vectors →
`test-vectors`, audit bundle → `audit-export` plus `deployment`).
`root` is never mapped. Each selected key becomes an `ed25519-pinned`
anchor with `notBefore`/`notAfter`; each revoked key also becomes a
`revoked` row with its reason. The existing evaluator then applies:

| Status | Self-asserted signing time |
| :--- | :--- |
| `revoked` / `key-compromise` | Fail, whatever the signing time |
| `revoked` / `superseded` or `retired` | Accept only if signing time < `revoked_at`; result carries `signingTimeSelfAsserted: true` |
| `active`, `retired` | Signing time must fall in `[not_before, not_after)` |

Until bundles carry an independent signing time, a holder of a
superseded or retired (not compromised) key can back-date into its old
window. Only `key-compromise` is a hard boundary.

## Reference implementation

`@crawcus/verifier` exports `bootstrapTrustAnchors`,
`updateTrustAnchors`, `loadTrustAnchors` (store → local candidates →
remote → expiry, with a pluggable `TrustAnchorsStore`, in-memory by
default, and injected `fetch`), `trustPolicyFromAnchors`, `keyIdFor`,
and `signTrustAnchors` with a pluggable `AnchorSigner`. Signers backed
by hardware or cloud key custody implement `AnchorSigner` outside this
repository.

Tooling: `tools/anchors/{keygen,sign,verify}` and
`tools/anchors/anchors.mjs check|placeholder`. Local key files are for
TEST keys only.

Conformance vectors: `packages/tck/vectors/trust-anchors/`.
