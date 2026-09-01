# @crawcus/verifier

CRAWCUS audit-bundle verifier — library surface.

- **Offline.** No network calls. Period.
- **Deterministic.** Same bundle bytes → same `VerifyResult`.
- **Third-party-runnable.** Any auditor can run this against any
  CRAWCUS-conformant audit bundle without contacting Tallyseal.

This package is the library half of the verifier. The CLI binary
lives at [`crawcus-verify`](../verifier-cli/README.md).

## Install

```sh
pnpm add @crawcus/verifier
```

## Usage

```ts
import { verifyBundle } from '@crawcus/verifier';
import { readFile } from 'node:fs/promises';

const bundle = await readFile('./bundle.dsse.json');
const result = verifyBundle({ bundle });

if (result.verdict === 'pass') {
  console.log(`OK — ${result.bundleMetadata.eventCount} events`);
} else {
  for (const check of result.checks) {
    if (check.verdict === 'fail') console.error(`FAIL ${check.id}: ${check.detail}`);
  }
}
```

## What it checks (Wave-1)

The 8 Wave-1 checks per the
[Wave-1a ticket spec](../../docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1a-spec.md) §5:

1. **DSSE envelope shape** — `payloadType` in the
   `application/vnd.crawcus.*+jsonl` family
2. **DSSE signature** — ed25519 over PAE(payloadType, payload)
3. **JCS canonicalisation hash equivalence** — RFC 8785 byte-equality
4. **Hash chain integrity** — each event's `prevHash` matches
5. **Embedded predicate source text required** —
   `bundle.predicateSources[contractId]` present
6. **Contract pre/inv/post re-evaluation** — historical-result audit
7. **Historical-unverifiable discrete state** — retired predicate
   surfaced without failing
8. **DisclosureSignal SIGNAL-not-gate lint** — Q-CR9 LOCKED
   predicate-name discipline

## Wave-1b auditor surface (`v0.2.0`)

Wave-1b adds two surfaces for Big-4 auditor walkthroughs (per
[TKT-VERIFIER-1b spec](../../docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1b-spec.md)):

### Auditor-signable PDF report

```ts
import { renderPdf, verifyBundle } from '@crawcus/verifier';
import { writeFile } from 'node:fs/promises';

const result = verifyBundle({ bundle });
const pdf = renderPdf(result);
await writeFile('./auditor-report.pdf', pdf);
```

The PDF contains: verdict headline + bundle metadata table + per-check
verdict rows + verifier identity block + wet-signature line
("Reviewed by: __________ Date: __________") + footer.

The PDF generator has **zero dependencies** — it hand-writes a
PDF 1.4 document. Trade-off: text-only rendering (Helvetica built-in;
non-ASCII characters folded to `?` to preserve visual length). The
upside is the `unshare -n` network-block CI job (per Wave-1a §9)
stays trivially green and the verifier-CLI bundle stays well inside
its 500 KB cap.

### Auditor countersign — `countersignResult`

The auditor wraps the verifier output in a **parallel** DSSE envelope
signed with their own ed25519 keypair. This is NOT a modification of
the original audit-bundle envelope — both envelopes verify
independently against their respective public keys (nested DSSE is
explicitly canon-forbidden per `crawcus-format.md:706`).

```ts
import { countersignResult, verifyBundle } from '@crawcus/verifier';
import { readFile, writeFile } from 'node:fs/promises';

const bundle = await readFile('./bundle.dsse.json');
const result = verifyBundle({ bundle });

const signerKey = await readFile('./auditor-key.pem', 'utf-8');
const countersigned = countersignResult({
  result,
  signerKey,
  signerKeyId: 'auditor@bigfour.example',
});

await writeFile('./countersigned.json', countersigned.envelope);
```

The countersign envelope's `payloadType` is
`application/vnd.crawcus.verify-result+jsonl` — sits inside the canon
open-enum family per [`crawcus-format.md` §"Payload-type family (open
enum per Q-CR9 discipline)"](../../docs/notebook/02-product/crawcus-format.md).
The signature is computed over the standard DSSE PAE
(`PAE(payloadType, JCS(VerifyResult))`), so one PAE implementation
verifies both envelopes.

#### Generating an auditor keypair

```sh
openssl genpkey -algorithm ed25519 -out auditor-key.pem
# Or just a raw hex seed:
openssl genpkey -algorithm ed25519 -outform DER \
  | tail -c 32 \
  | od -An -tx1 -w64 \
  | tr -d ' \n' > auditor-hex.txt
```

The `countersignResult` API accepts either format (`signerKey` may be
a PKCS#8 PEM string, a 64-char hex string, or raw 32 bytes).

## Wave-2 deferrals

Not in v0.2.0:

- Key transparency log (verify a chain of countersigns)
- Multi-signer envelope aggregation
- ContractViolation severity grading
- Cross-bundle replay detection
- Key revocation
- Auditor identity verification

Each of the above ships in a separate Wave-2 architecture memo when
a real customer pulls — per the [Q-VERIFIER-CLI-OSS-LOCK
decision-log
row](../../docs/notebook/09-operating/decision-log.md) "Wave-2
deferrals" subsection.

## References

- [Q-VERIFIER-CLI-OSS-LOCK memo](../../docs/notebook/02-product/q-verifier-cli-oss-lock-memo.md) — parent decision
- [Open-Q1 memo](../../docs/notebook/02-product/q-verifier-cli-oss-lock-open-q1-signed-bundle-wrapper-memo.md) — DSSE choice
- [Wave-1a ticket spec](../../docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1a-spec.md)
- [Wave-1b ticket spec](../../docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1b-spec.md)
- [`crawcus-format.md` §"Wire-format stability — signed bundle (v0.2)"](../../docs/notebook/02-product/crawcus-format.md) — canon
- [NFR D5](../../docs/notebook/07-engineering/nfrs.md) — the third-party-verifiable requirement

## License

MIT
