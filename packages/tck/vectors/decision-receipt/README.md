# Decision-receipt vectors

These are the test vectors of draft-gruszka-audit-decision-receipts-05, Appendix A, as files:

- the seven vectors of A.3 (V1-good, V1-bad, V2-good, V2-bad, V3-decision, V3-good, V3-bad);
- the fifteen of A.5 (F1 to F15).

Each case names the first check that must fail, or `pass`. A verifier in any language can run these cases without reading the draft.

## Run

```sh
pnpm vectors:decision-receipt
```

This builds `@crawcus/verifier` and runs every case through it. It then writes `REPORT.md` with one row per case, giving the expected result, the result the verifier got, and whether they agree. The run exits 0 only when all 22 cases agree. A run that finds fewer than 22 cases is not green.

## Layout

| Path | What it holds |
|---|---|
| `keys.json` | Both Ed25519 public keys and their keyids |
| `<case>/case.json` | Inputs, check procedure, expected result |
| `<case>/MANIFEST.json` | SHA-256 of every other file in the case |
| `<case>/*_receipt.json` | The DSSE envelope, as the verifier gets it |
| `<case>/*_receipt.jcs` | The signed payload (JCS) |
| `<case>/*.txt`, `*.json` | Action, effect and approval inputs |

The keys come from the draft's labels: each seed is the SHA-256 of `"draft-gruszka-audit-decision-receipts test key <name>"`. A keyid is the OpenSSH SHA-256 fingerprint of the public key's wire form.

In `case.json`:

- `check.procedure` is `decision` (§3.2) or `outcome` (§3.4).
- `check.case.kind` names the per-case check of §3.3: `approval`, `declined` or `executed`.
- `check.consumption`, when present, is the consumption state that §4 checks against.
- `expected` is the draft's first failing check, in the form `3.2 step 7`, `3.3 case 1` or `4 item 2`. An outcome case whose decision receipt fails first gets the prefix `decision `.
- `draft` records the payload size, SHA-256 and signature the draft publishes.

## Where the files come from

`packages/verifier/scripts/build-decision-receipt-vectors.mjs` rebuilds every input, predicate, payload and signature from the definitions in A.1, A.2 and A.5. It refuses to write anything if one byte differs from the values the draft publishes:

- the 18 payload sizes, SHA-256s and signatures;
- the V2-good envelope;
- F15's bytes.

The `--check` option compares the files on disk against a fresh rebuild. The test `packages/verifier/test/decision-receipt-vectors.test.ts` runs that comparison, then every case. It also runs flip controls, which show that each check can fail:

- a verifier that passes everything;
- a duplicate member name;
- a byte order mark;
- an approval that has been consumed;
- a tampered file.

The runner checks MANIFEST.json before it runs a case, so it refuses an edited file.
