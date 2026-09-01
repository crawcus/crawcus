# crawcus-flower

Per-node cryptographic audit receipts for [Flower](https://flower.ai) federated-learning clients.

Every `fit()` call emits a signed, hash-chained [CRAWCUS](https://tallyseal.org) receipt to a local JSONL log. Regulators, auditors, or data subjects verify the chain with any conformant CRAWCUS verifier — no dependency on the framework author, the coordinator, or any single vendor.

## Why

The EU AI Act (effective August 2026) requires AI systems to maintain logs "that cannot be altered in a way which may affect any subsequent evaluation." In federated learning, per-node audit is the tightest place to satisfy this — the coordinator can't attest to what each client actually did with its local data.

CRAWCUS is a small open receipt shape covering both application transactions and AI-inference decisions under one JSON structure, hash-chained per node, GDPR-erasable via crypto-shredding + tombstone. `crawcus-flower` gives you the per-node emitter with three method overrides.

## Install

```bash
pip install crawcus-flower
```

Requires Python 3.10+ and `flwr>=1.7`.

## Quickstart

```python
from crawcus_flower import CrawcusClient, ReceiptStore
import flwr as fl


class HospitalNode(CrawcusClient):
    def actor(self) -> str:
        return "node-42@hospital-example.org"

    def warrant(self, action: str) -> str:
        return "gdpr-art-6-1-e:federated-ml-v1"

    def _fit(self, parameters, config):
        # your existing local training code
        return updated_params, num_examples, {"loss": 0.42}


store = ReceiptStore.local_jsonl("./receipts.jsonl")
client = HospitalNode(store)
fl.client.start_numpy_client(server_address="server:8080", client=client)
```

Every training round appends one receipt to `receipts.jsonl`:

```json
{"seq":1,"action":"flower.fit","args":{"round":1,"config":{}},"result":{"num_examples":100,"metrics":{"loss":0.42}},"actor":"node-42@hospital-example.org","warrant":"gdpr-art-6-1-e:federated-ml-v1","ts":"2026-09-01T14:30:00Z","prev_hash":null,"this_hash":"sha256:..."}
```

## Verify a chain

Any conformant CRAWCUS verifier accepts this JSONL. See the [CRAWCUS TCK](https://tallyseal.org) for the reference verifier and conformance fixtures.

Basic sanity check in Python:

```python
from crawcus_flower import Receipt
import json

prev = None
for line in open("receipts.jsonl"):
    row = json.loads(line)
    r = Receipt(**{k: v for k, v in row.items() if k != "this_hash"})
    assert r.compute_hash() == row["this_hash"], f"tamper at seq {row['seq']}"
    assert row["prev_hash"] == prev, f"chain break at seq {row['seq']}"
    prev = row["this_hash"]
```

## Design choices

**Per-node chain, not federated chain.** Each Flower client has its own independent chain file. Deploy N clients across N sites → N independent chains, each verified separately. `crawcus-flower` does NOT attempt to orchestrate cross-node consent, aggregation proofs, or secure-aggregation attestation — those are federation-layer problems Flower itself owns. CRAWCUS solves *"prove this node did what it says it did with its local data."*

**Reopen-safe chain state.** `ReceiptStore.local_jsonl()` reads any existing JSONL on open and continues from the last hash. Restart the client, restart the machine, resume a training round tomorrow — the chain continues cleanly. Verified by test.

**Not thread-safe.** The JSONL append is unprotected. If your Flower client runs `fit()` concurrently across threads or processes on the same store file, either wrap `ReceiptStore` with a lock or serialise writes upstream. Thread-safe wrapper is banked (trigger: first user asks).

**JCS + SHA-256.** RFC 8785 JSON Canonical Serialization for deterministic hashing across languages. Any language with a JCS library can verify.

**No signing in v0.** The receipt shape reserves an optional `signature` field per CRAWCUS §4. Actual DSSE/Sigstore signing is banked — trigger: first user needs it. Hash-chain integrity works without signing; signing raises the bar from "prove not tampered" to "prove authored by this key."

**GDPR: banked.** CRAWCUS §5 defines a tombstone + crypto-shred pattern for per-subject erasure. Not implemented in v0 — trigger: first user hits a GDPR erasure request.

**File-size expectations.** Each receipt is ~350–500 bytes. A hospital node running 100 rounds/day produces ~40 KB/day, ~15 MB/year. Rotation / archiving is your call; the chain permits splitting at any receipt as long as the split point's `this_hash` is preserved.

## Verify this release

*Placeholder — this section is populated once the package is published via PyPI Trusted Publishers with Sigstore attestations. Command shape will be:*

```bash
# once published:
sigstore verify identity \
  --bundle crawcus_flower-<version>.whl.sigstore \
  --cert-identity https://github.com/tallyseal/spec/.github/workflows/publish.yml@refs/tags/v<version> \
  --cert-oidc-issuer https://token.actions.githubusercontent.com \
  crawcus_flower-<version>.whl
```

*Rationale: publishing an audit-integrity library without cryptographic supply-chain proof would be a self-contradiction. Every CRAWCUS-family release ships with a Sigstore attestation bound to the source repo + workflow.*

## What's next

Banked (fire on named user need):
- `evaluate()` hook — per-eval receipts
- Remote receipt sink (HTTP POST to central log)
- DSSE / Sigstore signing
- GDPR tombstone helpers
- Chain-verifier CLI

## Contributing

CRAWCUS is an open spec. Contributions to this reference client are welcome via the [tallyseal/spec](https://github.com/tallyseal/spec) repository.

## License

Apache-2.0. See `LICENSE`.
