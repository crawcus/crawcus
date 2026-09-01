import type { SubjectId } from '@crawcus/spec';
import type { Actor, Tenant } from '@crawcus/spec';

/**
 * Minimal HTTP request shape — adapter-side abstraction. Just enough
 * surface for identity resolution; framework-specific request objects
 * (Next.js, Hono, Express) are coerced to this shape by their
 * respective `@tallyseal/server/*` adapters.
 */
export interface HttpRequest {
  readonly headers: Readonly<Record<string, string>>;
  readonly url: string;
  readonly method: string;
}

/**
 * Identity port — who-is-the-user adapter. Implementations:
 * `@tallyseal/identity-clerk` (Y1), `@tallyseal/identity-auth0`,
 * `@tallyseal/identity-workos`, `@tallyseal/identity-supabase`,
 * `@tallyseal/identity-custom`.
 *
 * `resolveSubjects` extracts data-subject IDs from a request payload
 * for GDPR Art. 15 subject indexing — typically a tenant-specific
 * function (e.g., "extract patient IDs from this admission payload").
 */
export interface IdentityPort {
  resolveActor(req: HttpRequest): Promise<Actor>;
  resolveTenant(req: HttpRequest): Promise<Tenant>;
  resolveSubjects(payload: unknown): Promise<readonly SubjectId[]>;
}
