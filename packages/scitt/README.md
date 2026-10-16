# @crawcus/scitt

**Experimental.** SCITT mode for CRAWCUS: a CRAWCUS bundle carried as the payload of a SCITT Signed Statement (a COSE_Sign1 message, RFC 9943). See the [profile](../../docs/spec/crawcus-scitt-profile.md) and [ADR-0055](../../docs/adr/ADR-0055-scitt-fit.md).

This package is slice 1. It encodes and decodes Signed Statements and verifies their signatures (EdDSA only, attached or detached payload). Receipt verification is not implemented yet. It has **not yet been tested** against any Transparency Service.

```ts
import { encodeSignedStatement, decodeSignedStatement, verifySignedStatementSignature } from '@crawcus/scitt';
```

`verifySignedStatementSignature` checks **integrity only**. It does not decide whether the key is authorised for `iss`; a CRAWCUS trust policy makes that decision.
