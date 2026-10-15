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

## Local smoke tests

`allowUntrustedSigner: true` keeps a successful integrity result at
`pass` when the signer is not in a policy. `trust.decision` is still
`untrusted`. Do not set this in production. A key revoked for
`key-compromise`, and a malformed policy, still return `fail`.

## What did not change

Hash-chain checks, contract re-evaluation, and the DSSE payload bytes
are unchanged. Countersigned verify results now include the `trust`
object because they sign the whole `VerifyResult`.
