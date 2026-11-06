# @crawcus/verifier

## Unreleased

### Added

- Signed trust-anchor documents (`trust-anchors.json`, spec_version
  1.0.0): `bootstrapTrustAnchors`, `updateTrustAnchors` (root threshold,
  root-rotation chain, rollback/fork rejection, fail-closed expiry),
  `loadTrustAnchors` (pluggable store and fetch, offline mode),
  `trustPolicyFromAnchors` (purpose and deployment binding),
  `signTrustAnchors` with a pluggable `AnchorSigner`. See
  `docs/spec/trust-anchors.md`.

### Changed

- `TrustResult.signer.keyFingerprint` is now `sha256:<hex>`, the single
  CRAWCUS keyid derivation (previously bare hex of the same digest).

## 0.4.0

### Breaking

- Validity windows are half-open, `[notBefore, notAfter)`: a signing
  time equal to `notAfter` is now `signer.untrusted.expired`, and a
  policy with `notBefore == notAfter` is malformed.

- The integrity-only `verifyDsseEnvelope` export is removed. It verified
  a signature against the public key embedded in the envelope and
  returned `pass` with no trust check. Callers must use `verifyBundle`
  with a `trustPolicy`. The integrity primitive is renamed
  `verifyDsseSignatureUntrusted` and is not re-exported from the
  package entrypoint.
- `VerifyOptions.allowUntrustedSigner` is renamed
  `allowUntrustedSignerForTestsOnly`. Same behaviour; louder name.
  Production callers must not set it.
- `verifyBundle` no longer returns `pass` for a signature that merely
  matches the public key embedded in the DSSE envelope. Callers must
  pass `options.trustPolicy` pinning the ed25519 keys they trust.
  With no policy the verdict is `untrusted-signer`
  (`signer.untrusted.no-policy`). A malformed policy is `fail`
  (`policy.malformed`). See `MIGRATION.md`. The Foundry engine, and
  any other consumer, has to supply a policy before honestly signed
  receipts verify again.
- `VerifyResult.trust` is now always present.
- `VerifyVerdict` includes `untrusted-signer`.
- `VERIFIER_VERSION` is `0.4.0`, matching `package.json`. It had been
  stuck at `0.2.0`.

### Added

- Pinned ed25519 trust anchors with optional validity windows,
  payload-type allowlists, and a revocation list
  (`key-compromise`, `superseded`, `retired`).
- `parseTrustPolicy`, `evaluateSignerTrust`, and the trust types.
- The policy fingerprint is sha256 of the canonical policy.
- The schema reserves a later TUF-style rotation document and
  sigstore identity anchors. Those anchors are parsed and are not a
  `pass` in this version. See `docs/spec/crawcus-trust-policy.md`.
- PDF reports include a signer-trust section. Countersigned results
  include the `trust` object.
- `trust.signer.signingTimeSelfAsserted` is `true` when the signing
  time is the bundle's own event timestamp. Validity windows and
  `superseded` / `retired` revocation are not a security boundary
  against a back-dating signer; only `key-compromise` is.

### Fixed

- The `dsse.signature` check cites the signature index that verified
  instead of always `signatures[0]`.

## 0.3.1

### Patch Changes

- Updated dependencies [7a60f29]
  - @crawcus/spec@0.11.0

## 0.3.0

### Minor Changes

- b47a90c: TKT-VERIFIER-1a — Wave-1 `crawcus-verify` CLI

  Adds three new packages + one canon-vocabulary addition per
  `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1a-spec.md`:
  - **`@crawcus/verifier@0.1.0`** (new) — library API
    (`verifyBundle`, `parseSignedBundle`, `verifyDsseEnvelope`,
    `verifyHashChain`, `reevaluateContracts`). 8 Wave-1 checks per spec §5.
  - **`crawcus-verify@0.1.0`** (new) — `npx crawcus-verify ./bundle.dsse.json`
    CLI. Flags + exit codes per spec §4.
  - **`@crawcus/verifier@0.0.1`** (new) — defensive scope claim
    - thin re-export shim of `@crawcus/verifier` per ratchet #23
      brand-neutrality preparation.
  - **`@crawcus/spec`** — additive export of
    `ContractViolationKind` + `CONTRACT_VIOLATION_KINDS` (canon vocabulary
    for verifier failure taxonomy). Pure addition; no existing surface
    changed.

  DSSE v1 envelope (ed25519) wrapping JCS-canonical JSONL bundles per
  `crawcus-format.md` §"Wire-format stability — signed bundle (v0.2)".
  Forward-compat `application/vnd.crawcus.*+jsonl` family dispatch per
  Q-CR9 discriminator discipline.

  All three new packages stay `private: true` per B1.3 spending freeze
  (no `npm publish` until founder unfreeze).

- 882675b: TKT-VERIFIER-1b — Wave-1b `crawcus-verify` auditor surface (PDF + countersign + Homebrew formula)

  Adds three new surfaces per
  `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1b-spec.md`:
  - **`@crawcus/verifier@0.2.0`** — additive-MINOR per ratchet #16:
    new public exports `countersignResult`, `renderPdf`,
    `PAYLOAD_TYPE_VERIFY_RESULT`, types `CountersignInput` +
    `CountersignedResult`. Existing v0.1.0 surface unchanged.
  - **`crawcus-verify@0.2.0`** — additive CLI flags:
    - `--format pdf` emits an auditor-signable PDF report
    - `--countersign FILE` wraps the verify result in a parallel DSSE
      envelope signed by an auditor's ed25519 keypair (PKCS#8 PEM, 64-char
      hex seed, or raw 32 bytes)
    - `--signer-id ID` customises the countersign envelope's keyid
    - `-o / --output FILE` routes output to a file (required for `pdf`
      when stdout is a terminal)
  - **`@crawcus/verifier@0.0.2`** — patch bump; re-export shim follows.

  The PDF generator has **zero dependencies** (hand-written PDF 1.4)
  so the `unshare -n` network-block CI job stays trivially green and
  the verifier-CLI bundle stays well inside its 500 KB cap.

  The countersign payloadType is
  `application/vnd.crawcus.verify-result+jsonl` — fits the canon
  open-enum family per `crawcus-format.md` §"Payload-type family"
  without canon edit. The verify-result envelope is **parallel** to the
  audit-bundle envelope; nested DSSE remains canon-forbidden.

  Homebrew formula scaffolded at `homebrew/Formula/crawcus-verify.rb`;
  tap repo `tallyseal/homebrew-tap` creation deferred until B1.3
  unfreeze + first GitHub Release.

  All three verifier packages remain `private: true` per B1.3 spending
  freeze (no `npm publish` in this change).

### Patch Changes

- Updated dependencies
- Updated dependencies [b47a90c]
  - @crawcus/spec@0.10.0

## 0.1.0

### Minor Changes

- Initial Wave-1 release. Library surface per
  `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1a-spec.md` §3:
  - `verifyBundle({ bundle, options }): VerifyResult`
  - `parseSignedBundle`, `verifyDsseEnvelope`, `verifyHashChain`, `reevaluateContracts`
  - 8 Wave-1 checks per spec §5
  - DSSE envelope (ed25519) with `application/vnd.crawcus.*+jsonl` family dispatch
