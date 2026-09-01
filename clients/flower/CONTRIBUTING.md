# Contributing to crawcus-flower

`crawcus-flower` is a reference client for the [CRAWCUS](https://tallyseal.org) open specification. Contributions welcome.

## Where to open issues + PRs

Primary CRAWCUS repository: **https://github.com/tallyseal/spec**

`crawcus-flower` lives at `clients/flower/` within that repository. Open issues and PRs there.

## Scope of contributions

- **Receipt shape or spec-level changes** — discuss on the CRAWCUS main issue tracker first. Client-only PRs that diverge from the spec will be rejected.
- **Flower-specific improvements** — new hook points, thread-safe wrappers, remote sinks, additional example FL apps — welcome.
- **New reference clients for other FL / MLOps / LLM-observability frameworks** — welcome as separate packages under `clients/<framework>/`. Open a discussion on the main CRAWCUS issue tracker to sanity-check fit before drafting.

## Development

```bash
pip install -e ".[dev]"
pytest
ruff check .
```

## Licence + attribution

All contributions land under Apache-2.0. By opening a PR you confirm you have the right to license your contribution under Apache-2.0.

Sign-off (DCO) is not required today. It may become required if the project moves to a Linux Foundation governance model (see the CRAWCUS release plan).

## Code of conduct

CRAWCUS uses the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) v2.1.
