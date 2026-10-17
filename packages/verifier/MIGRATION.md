# Migrating to `@crawcus/verifier` 0.4.0

0.4.0 is a behaviour change. `verifyBundle({ bundle })` used to return
`pass` for any bundle whose signature matched the public key embedded
in the envelope. It now returns `untrusted-signer` with reason
`signer.untrusted.no-policy` unless the caller supplies a trust policy.

This includes the Foundry engine and any vendored copy of the verifier.
Those callers must pass a `trustPolicy` that pins the ed25519 public
keys they actually sign with. Until they do, every receipt fails closed,
including receipts that were honestly signed.

## Supply a policy

```ts
import { verifyBundle } from '@crawcus/verifier';

const result = verifyBundle({
  bundle,
  options: {
    trustPolicy: {
      crawcusTrustPolicy: 1,
      policyId: 'foundry-prod',
      anchors: [
        {
          type: 'ed25519-pinned',
          id: 'foundry-2026',
          publicKey: '<64 hex chars of the signer public key>',
          label: 'Foundry receipt signer',
        },
      ],
    },
  },
});
```

`pass` now means the signature verified against a key in that policy
and the integrity checks passed. `result.trust` records the decision,
the reason, the policy fingerprint (`sha256` of the canonical policy),
and the signer key fingerprint. The embedded `keyid` is a hint. Read
`result.trust.signer`, not `bundleMetadata.signerKeyId`, when deciding
who signed.

The policy file format, validity windows, and the revocation list are
specified in `docs/spec/crawcus-trust-policy.md`. Publish the policy
and its fingerprint out of band. The library does not fetch it.

## Local smoke tests (TEST ONLY)

`allowUntrustedSignerForTestsOnly: true` is a test hatch. It keeps a
successful integrity result at `pass` when the signer is not in a
policy, while `trust.decision` stays `untrusted`. Read
`trust.decision`, not just `verdict`. Never set this option in
production, in a service that accepts third-party bundles, or in any
path that feeds an audit decision. Prefer pinning TEST keys in a real
`trustPolicy`. A key revoked for `key-compromise`, and a malformed
policy, still return `fail`.

## Signing time is self-asserted for pinned keys

Pinned-key validity windows (`notBefore` / `notAfter`) and
`superseded` / `retired` revocation are evaluated against the
bundle's latest event timestamp. That timestamp is signed by the key
under evaluation, so a malicious signer can back-date. The check
detail says so, and `trust.signer.signingTimeSelfAsserted` is `true`
when the source is not an independent transparency log. Only
`key-compromise` revocation rejects every bundle for that key,
including back-dated ones. Do not claim that validity windows or
rotation alone defeat a compromised or hostile signer.

## `verifyDsseEnvelope` removed from the public surface

0.3.x exported `verifyDsseEnvelope` as an alias of an integrity-only
check against the public key embedded in the envelope. A `pass` from
that function meant "the envelope was signed by the key it carries",
not "the signer is authorised". That is the same footgun 0.4.0 closes
for `verifyBundle`, so the export is gone.

- Use `verifyBundle({ bundle, options: { trustPolicy } })` — the
  trust-checked public API.
- Callers that evaluate a policy themselves may import
  `verifyDsseSignatureUntrusted` from the package source tree for
  tests, but it is not part of the published public API and will not
  be re-exported. Prefer `verifyBundle`.

## What did not change

Hash-chain checks, contract re-evaluation, and the DSSE payload bytes
are unchanged. Countersigned verify results now include the `trust`
object because they sign the whole `VerifyResult`.
