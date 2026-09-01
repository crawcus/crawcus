# @crawcus/regulations-eu-ai-act

EU AI Act (Regulation (EU) 2024/1689) Contract factories for Tallyseal.

Pinned version: **`eu-ai-act@2026-Q2`**.

## Install

```bash
pnpm add @crawcus/regulations-eu-ai-act
```

## Use

```ts
import { defineCrawcusSpec } from '/core';
import { humanOversight, EU_AI_ACT_VERSION } from '@crawcus/regulations-eu-ai-act';

defineCrawcusSpec({
  key: 'HiringScreen',
  projection: 'Candidate',
  version: 1,
  classification: 'high-risk', // Annex III §4 — employment
  fields: { /* ... */ },
  readiness: ({ has }) => has('decision'),
  contracts: {
    post: [humanOversight()],
  },
});
```

## What ships in 0.0.1

- `humanOversight()` — Art. 14 (only fires for `classification: 'high-risk'`)
- `EU_AI_ACT_VERSION` — `'eu-ai-act@2026-Q2'`

## Roadmap

- Art. 5 (prohibited practices) — refusal Contracts for prohibited use cases
- Art. 6 + Annex III (high-risk scope) — `classification` derivation helpers
- Art. 10 (data governance) — data-quality Contracts
- Art. 12 (record-keeping) — 6-month log-retention Contract
- Art. 13 (transparency) — disclosure-to-deployer Contracts
- Art. 22 (automated decisions) — explanation-emission Contract
- Art. 50 (transparency obligations) — AI-content-marking Contracts
- Quarterly refresh per regulator guidance updates

## License

MIT.
