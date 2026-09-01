/**
 * Discriminated result type for TCK fixtures. Used by every fixture
 * `runX` function — pass or fail-with-diagnostic. Stable shape across
 * fixtures so any harness can summarise + log uniformly.
 */
export type TckResult = TckResultPass | TckResultFailure;

export interface TckResultPass {
  readonly ok: true;
}

export interface TckResultFailure {
  readonly ok: false;
  /**
   * Short stable code (UPPER_SNAKE_CASE). Used by CI to categorise
   * failures + by audit-bundle lint to surface canonical reasons.
   */
  readonly code: string;
  /**
   * Human-readable diagnostic. MUST cite the canonical spec section
   * driving the assertion so reviewers can trace the rejection back
   * to the locked rule.
   */
  readonly message: string;
}

export const TCK_RESULT_PASS: TckResultPass = { ok: true };
