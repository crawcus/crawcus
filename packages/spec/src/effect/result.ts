/**
 * Result type re-export from `neverthrow` (cohort-1 dep lock).
 *
 * Tallyseal prefers `Result<T, E>` over silent throws for typed-error
 * surface (ratchet #19 — errors as values). Throws are reserved for
 * invariant violations (the typed `TallysealError` subclasses in
 * `../errors/`).
 *
 * Why this re-export module exists: gives us one swap-point if we
 * ever migrate to `effect`'s Result module (dep-picks §3 re-open
 * trigger). Consumers import from `/core/effect` (via the
 * barrel), not from `neverthrow` directly.
 */
export {
  Result,
  ResultAsync,
  ok,
  err,
  okAsync,
  errAsync,
  fromPromise,
  fromThrowable,
  fromAsyncThrowable,
} from 'neverthrow';
