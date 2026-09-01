import type {
  Warrant,
  WarrantCheckpoint,
  WarrantCtx,
  WarrantEvaluationResult,
  WarrantEvaluationStatus,
} from './types.js';
import type { Timestamp } from '../types/ids.js';
import type { IssuerTrust } from './issuer-trust.js';
import { resolveTrustedPublicKey } from './issuer-trust.js';
import { verifyWarrantSignature } from './verify.js';
import { isoDate } from '../event/canonical-json.js';

/**
 * # evaluateWarrant — the pre / inv / post pure evaluator
 *
 * Pure, total, side-effect-free. Given a Warrant, the materialised
 * evaluation context (intent, spec, tenant, events, current time),
 * the tenant's trust configuration, and the current checkpoint,
 * return a `WarrantEvaluationResult` discriminated by `status`.
 *
 * Mirrors the Contract evaluator pattern (`@crawcus/spec/
 * contract/evaluate.ts`). Validators on a CrawcusSpec may layer
 * additional checks on top of this default — e.g., a tenant might
 * require all `'mga'`-issued Warrants to carry a `billingRef`.
 *
 * ## Evaluation order
 *
 * Failures short-circuit. Order:
 *   1. Revocation — `revokedAt !== null` → `'revoked'`
 *   2. Temporal — `now < issuedAt` → `'not-yet-valid'`;
 *      `now >= expiresAt` → `'expired'`
 *   3. Scope — spec key / region / classification mismatch → `'out-of-scope'`
 *   4. Trust resolution — issuer not in roots + !acceptUnknown → `'untrusted-issuer'`
 *   5. Signature verification — Ed25519 verify fail → `'signature-mismatch'`
 *   6. Otherwise → `'valid'`
 *
 * The order matters for audit-bundle clarity: a revoked Warrant
 * always reports `'revoked'` (not `'signature-mismatch'`) even if
 * the signature is also bad. Order = certainty of the failure
 * reason.
 */
export function evaluateWarrant(
  warrant: Warrant,
  ctx: WarrantCtx,
  trust: IssuerTrust,
  checkpoint: WarrantCheckpoint = 'pre',
): WarrantEvaluationResult {
  const evaluatedAt = isoDate(ctx.now) as Timestamp;

  function result(status: WarrantEvaluationStatus, reason?: string): WarrantEvaluationResult {
    return reason === undefined
      ? { warrantId: warrant.id, checkpoint, status, evaluatedAt }
      : { warrantId: warrant.id, checkpoint, status, reason, evaluatedAt };
  }

  // ============ 1. Revocation ============
  if (warrant.revokedAt !== null) {
    return result('revoked', warrant.revocationReason ?? `revoked at ${warrant.revokedAt}`);
  }

  // ============ 2. Temporal validity ============
  const issuedAt = new Date(warrant.issuedAt);
  if (ctx.now < issuedAt) {
    return result(
      'not-yet-valid',
      `Warrant.issuedAt (${warrant.issuedAt}) is in the future relative to now (${evaluatedAt})`,
    );
  }
  if (warrant.expiresAt !== null) {
    const expiresAt = new Date(warrant.expiresAt);
    if (ctx.now >= expiresAt) {
      return result('expired', `Warrant expired at ${warrant.expiresAt} (now ${evaluatedAt})`);
    }
  }

  // ============ 3. Scope ============
  if (!warrant.scope.specs.includes(ctx.spec.key)) {
    return result(
      'out-of-scope',
      `spec ${ctx.spec.key} not in Warrant.scope.specs (${warrant.scope.specs.join(', ')})`,
    );
  }
  if (
    warrant.scope.regions !== undefined &&
    warrant.scope.regions.length > 0 &&
    !warrant.scope.regions.includes(ctx.tenant.region)
  ) {
    return result(
      'out-of-scope',
      `tenant region ${ctx.tenant.region} not in Warrant.scope.regions (${warrant.scope.regions.join(', ')})`,
    );
  }
  if (
    warrant.scope.classifications !== undefined &&
    warrant.scope.classifications.length > 0 &&
    ctx.spec.classification !== undefined &&
    !warrant.scope.classifications.includes(ctx.spec.classification)
  ) {
    return result(
      'out-of-scope',
      `spec classification ${ctx.spec.classification} not in Warrant.scope.classifications (${warrant.scope.classifications.join(', ')})`,
    );
  }

  // ============ 4. Trust resolution ============
  const resolved = resolveTrustedPublicKey(trust, warrant);
  if (resolved === null) {
    return result(
      'untrusted-issuer',
      `Warrant.issuer.id (${warrant.issuer.id}) not in trust roots and IssuerTrust.acceptUnknown is false`,
    );
  }

  // ============ 5. Signature verification ============
  if (!verifyWarrantSignature(warrant, resolved.publicKey)) {
    return result(
      'signature-mismatch',
      `Ed25519 signature verification failed against ${resolved.trusted === 'explicit' ? 'explicit trust root' : 'TOFU-resolved'} public key for issuer ${warrant.issuer.id}`,
    );
  }

  // ============ Valid ============
  return result('valid');
}
