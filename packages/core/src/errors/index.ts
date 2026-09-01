/**
 * Typed error classes for the Tallyseal runtime. Each error names a
 * specific contract-violation class; consumers can pattern-match.
 *
 * Concrete throwers land alongside the modules that enforce the
 * relevant invariant:
 *   - LawfulBasisMismatchError, ConsentRequiredError, ReadinessNotMetError,
 *     HashChainBrokenError, RawPIIInPayloadError — all in writeEvent (4c)
 *   - ContractViolationError — in the contract evaluator + writeEvent (4b/4c)
 *
 * 4a ships only the class definitions so downstream code can import +
 * type-check against them without circular sequencing.
 */

abstract class TallysealError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class LawfulBasisMismatchError extends TallysealError {
  readonly code = 'lawful-basis-mismatch' as const;
  constructor(
    message: string,
    readonly expected: string,
    readonly actual: string,
    readonly purpose: string,
  ) {
    super(message);
  }
}

export class RawPIIInPayloadError extends TallysealError {
  readonly code = 'raw-pii-in-payload' as const;
  constructor(
    message: string,
    readonly fieldPath: string,
    readonly piiLevel: string,
  ) {
    super(message);
  }
}

export class HashChainBrokenError extends TallysealError {
  readonly code = 'hash-chain-broken' as const;
  constructor(
    message: string,
    readonly brokenAtIndex: number,
    readonly reason: string,
  ) {
    super(message);
  }
}

export class ConsentRequiredError extends TallysealError {
  readonly code = 'consent-required' as const;
  constructor(
    message: string,
    readonly purpose: string,
    readonly specialCategory?: string,
  ) {
    super(message);
  }
}

export class ReadinessNotMetError extends TallysealError {
  readonly code = 'readiness-not-met' as const;
  constructor(
    message: string,
    readonly missingFields: readonly string[],
  ) {
    super(message);
  }
}

export class ContractViolationError extends TallysealError {
  readonly code = 'contract-violation' as const;
  constructor(
    message: string,
    readonly contractId: string,
    readonly predicateHash: string,
    readonly severity: 'block' | 'warn',
  ) {
    super(message);
  }
}

/**
 * Thrown when a Warrant evaluation fails. Mirrors `ContractViolationError`
 * shape — the discriminator is `status` (one of the
 * `WarrantEvaluationStatus` non-`'valid'` values).
 *
 * Emitted by Tallyseal runtime helpers when an active Warrant check
 * fails at pre / inv / post checkpoint. The runtime ALSO writes a
 * `WarrantViolation` Event to the audit log alongside throwing this
 * error (audit-bundle inspection makes the failure auditor-defensible).
 */
export class WarrantViolationError extends TallysealError {
  readonly code = 'warrant-violation' as const;
  constructor(
    message: string,
    readonly warrantId: string,
    readonly status:
      | 'expired'
      | 'revoked'
      | 'signature-mismatch'
      | 'untrusted-issuer'
      | 'out-of-scope'
      | 'not-yet-valid',
    readonly issuerId: string,
    readonly checkpoint: 'pre' | 'inv' | 'post',
  ) {
    super(message);
  }
}

/**
 * Thrown when a Disclosure evaluation fails at writeEvent pre-check.
 * The runtime persists a `DisclosureRequired` Event to the chain
 * (in its own transaction so the audit trail survives the throw's
 * rollback of the proposed event), then throws this error.
 *
 * Mirrors `WarrantViolationError`. Discriminator is `status`.
 */
export class DisclosureRequiredError extends TallysealError {
  readonly code = 'disclosure-required' as const;
  constructor(
    message: string,
    readonly requirementId: string,
    readonly subject: string,
    readonly status:
      | 'undelivered'
      | 'unacknowledged'
      | 'retracted'
      | 'expired-window'
      | 'subject-missing-session',
    readonly checkpoint: 'pre' | 'inv' | 'post',
  ) {
    super(message);
  }
}

/**
 * Thrown when a Consent primitive #12 evaluation fails at writeEvent
 * pre-check. The runtime persists a `ConsentRequired` Event to the
 * chain (in its own transaction so audit evidence survives the
 * parent throw's rollback), then throws this error.
 *
 * **Distinct from `ConsentRequiredError`** (the older error thrown
 * when `input.specialCategoryBasis` is set without `consentEventId`
 * — that's a syntactic precondition on the writeEvent input).
 * `ConsentInvalidError` is the semantic check: data subject does
 * not have a currently-valid Consent for this processing purpose.
 *
 * Mirrors `DisclosureRequiredError` shape. Discriminator is `status`.
 */
export class ConsentInvalidError extends TallysealError {
  readonly code = 'consent-invalid' as const;
  constructor(
    message: string,
    readonly requirementId: string,
    readonly subject: string,
    readonly processingPurpose: string,
    readonly status: 'missing' | 'withdrawn' | 'purpose-out-of-scope' | 'regulation-mismatch',
    readonly checkpoint: 'pre' | 'inv' | 'post',
  ) {
    super(message);
  }
}

/**
 * Thrown when a Lineage primitive #13 evaluation fails at writeEvent
 * pre-check (Q-CR7 LOCKED 2026-05-22). The runtime persists a
 * `LineageRequired` Event to the chain (separate transaction), then
 * throws this error. Mirrors `ConsentInvalidError`. Discriminator
 * is `status`.
 */
export class LineageInvalidError extends TallysealError {
  readonly code = 'lineage-invalid' as const;
  constructor(
    message: string,
    readonly status:
      | 'missing'
      | 'malformed-prov-o'
      | 'insufficient-inputs'
      | 'blank-node-forbidden',
    readonly checkpoint: 'pre' | 'inv' | 'post',
  ) {
    super(message);
  }
}

/**
 * Thrown when a HumanOversight primitive #14 evaluation fails at
 * writeEvent pre-check (Q-CR8 LOCKED 2026-05-22 — Role + Org
 * abstraction). The runtime persists an `OversightRequired` Event
 * to the chain (separate transaction), then throws this error.
 * Mirrors `LineageInvalidError`. Discriminator is `status`.
 */
export class OversightInvalidError extends TallysealError {
  readonly code = 'oversight-invalid' as const;
  constructor(
    message: string,
    readonly requirementId: string,
    readonly status: 'missing' | 'expired-gap' | 'role-not-accepted' | 'escalated',
    readonly checkpoint: 'pre' | 'inv' | 'post',
  ) {
    super(message);
  }
}

/**
 * Exhaustiveness helper (ratchet #19). Place in default branches of
 * switch statements over discriminated unions; TS will compile-error
 * if a new variant is added without handling.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated-union variant: ${JSON.stringify(value)}`);
}
