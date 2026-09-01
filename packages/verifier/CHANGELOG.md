# @crawcus/verifier

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
