# crawcus verify (`apps/verify`)

A static, single-page browser verifier for CRAWCUS receipt bundles. You drop in a
DSSE envelope (`<bundleSelfHash>.dsse.json`, the format `foundry audit export --verify`
writes), and the page verifies it **inside the tab**. The page has no backend, sends no
telemetry, and never uploads the bundle. The only network request the app can make is
the opt-in "Load crawcus.org anchors (preview)" button, which does a plain GET of a
public trust-anchor list. Bundle data is never part of that request.

## Deployments

- **Public:** https://verify.crawcus.org (Cloudflare Pages project `crawcus-verify-public`, no login).
- **Private preview:** https://crawcus-verify.pages.dev, behind Cloudflare Access.

`public/_headers` sets the security headers on both: a strict CSP (`default-src 'self'`,
no third-party scripts, `frame-ancestors 'none'`), `nosniff`, `no-referrer`, and so on.
The app has no analytics.

The theme can be Light, Dark, or System (the default). The choice is stored in
`localStorage` under `crawcus-verify.theme`.

## Run

```bash
pnpm install && pnpm build                          # workspace packages build to dist/
pnpm --filter @crawcus/verify-app dev               # http://localhost:5173
pnpm --filter @crawcus/verify-app build             # static output in apps/verify/dist
pnpm --filter @crawcus/verify-app test              # result-schema mapping tests
pnpm --filter @crawcus/verify-app gen:samples       # regenerate demo samples (deterministic)
```

The output is plain static files (`base: './'`), so any static host can serve it. To
open a sample directly, add `#sample=good|tampered|untrusted|cosign` to the URL.

## What it checks

1. Everything `@crawcus/verifier`'s `verifyBundle({ bundle })` runs: DSSE envelope shape,
   the ed25519 signature over PAE, RFC 8785 self-hash equivalence, hash-chain integrity,
   and contract re-evaluation.
2. App-level checks, marked `source: "app"`:
   - `trust.signer-pinned`: is the signer key one of the user's pinned ed25519 anchors?
     If no anchors are pinned, this check is `skipped`.
   - `chain.row-walk`: an independent recompute of every row's hash. It runs **even when
     the signature fails**, so the UI can point to the exact row that was tampered with.
     (The library stops at the first signature failure.)

Plain bundle JSON or JSONL with no envelope is accepted too. The chain is still walked,
but the verdict is `fail` because nothing proves who wrote the bundle.

## Architecture

```
src/core/schema.ts   crawcus.verify-result/v1 types (the stable contract)
src/core/verify.ts   verify(bytes, { anchors, verifiedAt }) -> VerifyResultV1. Pure: no DOM, no I/O
src/core/trust.ts    key normalisation + thin adapter for trust-anchors.json (stub)
src/main.ts, ui/     rendering only
```

`src/core` is the piece a future server-side verify API would wrap. That API must return
`VerifyResultV1` **unchanged**, so the browser and the API give byte-for-byte comparable
answers for the same input and `verifiedAt`.

## Result schema: `crawcus.verify-result/v1`

| field | type | meaning |
|---|---|---|
| `schema` | `"crawcus.verify-result/v1"` | schema id; always check this first |
| `verdict` | `"pass" \| "fail" \| "historical-unverifiable"` | overall result. `fail` if any check fails |
| `reason` | string | one-sentence plain-English explanation |
| `verifiedAt` | ISO 8601 | when the check ran |
| `verifier` | `{ name: "crawcus-verify", libraryVersion, buildSha }` | which verifier produced the result |
| `input` | `{ format: "dsse"\|"bundle-json"\|"unknown", byteLength, sha256 }` | identifies the exact input bytes |
| `envelope` | `{ payloadType, payloadByteLength, payloadSha256, signatureCount } \| null` | DSSE facts |
| `signer` | `{ keyId, algorithm: "ed25519", fingerprint: "sha256:<hex>", trust: "trusted"\|"untrusted"\|"no-anchors", anchorLabel? } \| null` | first signature's key |
| `bundle` | `{ bundleId, schemaVersion, selfHash, rowCount, contractCount, timeRange: { earliest, latest }, regulations[] } \| null` | payload summary |
| `chain` | `{ valid, brokenAt: number\|null, links: ChainLink[] }` | per-row hash-chain walk |
| `checks` | `Check[]` | every check performed, in order |

`ChainLink`: `{ index, id, kind, timestamp, contentHash, prevHash, recomputedHash, expectedPrevHash, contentHashOk, prevLinkOk, status: "ok"|"broken"|"after-break" }`

`Check`: `{ id, label, verdict: "pass"|"fail"|"skipped"|"historical-unverifiable", detail, violationKind?, source: "library"|"app", cite?: [{ kind, value }] }`

**Evolution rules.** Within v1, new *optional* fields may be added and new check `id`s
may appear, so consumers must ignore anything they don't recognise. Removing, renaming,
or changing the meaning of a field requires `crawcus.verify-result/v2`.

The exported report (the "export report" button) is this object plus
`source.fileName`.

## Trust anchors

Users can pin ed25519 public keys (hex, base64, or SPKI PEM). Pinned keys are stored only
in `localStorage`. `loadWellKnownTrustAnchors()` is a **stub** for
`https://crawcus.org/.well-known/crawcus-trust-anchors.json`. It reads the TUF-style
document being defined on `cursor/trust-anchors`
(`_type: "crawcus.trust-anchors"`, `keys[]`, `root`, `signatures`) and keeps only
active, unrevoked ed25519 keys. It does **not** verify the document's root signatures,
threshold, or expiry yet. That verification is meant to come from the trust-anchors
package once it lands.

## Samples

`src/samples/` holds samples produced by `scripts/gen-samples.mjs` from fixed **public**
demo seeds, so they are not secrets:
- `good`: 8 rows, payloadType `application/vnd.crawcus.foundry-log+jsonl`
- `tampered`: row 3 edited after signing, so `dsse.signature` fails and row 3 is
  highlighted
- `untrusted`: a valid signature from a key that isn't pinned
- `cosign`: the cross-vendor cosign fixture from `packages/verifier/test/fixtures`
