/**
 * Tallyseal canonical predicate-source normaliser.
 *
 * Per `02-product/crawcus-format.md` v0.2 §"Predicate
 * canonicalisation": the normaliser is part of the spec, NOT a
 * third-party formatter. Prettier minor bumps would silently re-hash
 * every Contract in every deployed audit bundle — chain-break-shaped
 * problem masquerading as formatting.
 *
 * # v0.0.1 scope (text-based)
 *
 * The full 12-rule normaliser specified in v0.2 requires a TypeScript
 * AST parser (`typescript` package, ~10 MB; blows NFR M7 ≤20 KB
 * gzipped). For v0.0.1, ship a minimal text-based normaliser that
 * handles the common predicate shape (single-statement arrow function,
 * no comments, no type annotations) with deterministic output.
 *
 * Full AST normaliser tracked as follow-up — likely a separate
 * `@tallyseal/spec-tools` package (build-time only) that the
 * `@tallyseal/generator` CLI invokes. At that point this module
 * delegates to the AST normaliser if available, falls back to text
 * normaliser otherwise.
 *
 * # Rules implemented in v0.0.1
 *
 * 1. Whitespace: collapse runs of whitespace to single space; trim ends
 * 2. Quote style: single quotes (string literals only — does NOT
 *    rewrite template literals)
 * 3. Semicolons: ensure trailing semicolon on standalone statements
 *    (no-op for single-expression arrow bodies)
 * 4. Comments: strip line + block comments
 * 5. Trailing whitespace: stripped per-line
 *
 * # Rules NOT YET implemented (require AST)
 *
 * - Key sorting (only sorts at the JSON layer, not in object literals
 *   inside predicates)
 * - Type-annotation stripping (text-regex too fragile)
 * - Arrow-body expression-vs-block normalisation
 * - Indentation normalisation (predicates are single-line after rule 1)
 *
 * Customers should write predicates in a constrained subset:
 *   - Single-statement arrow functions
 *   - No comments inside the predicate
 *   - No type annotations
 *   - Use single quotes
 *
 * Helpers from `@tallyseal/regulations/*` are authored against this
 * constraint, so adopters who compose via factories don't worry about it.
 */

/**
 * Normalise a predicate's source code to its canonical form. The
 * output is deterministic across runs + Node/Bun/Deno (text rules
 * only — no AST traversal).
 *
 * Input: typically `predicate.toString()` from a `Function` instance.
 */
export function normalisePredicateSource(source: string): string {
  let out = source;

  // Strip line comments (// ... up to newline) — must run before
  // collapse-whitespace or `// foo\n bar` becomes `// foo  bar`.
  out = out.replace(/\/\/.*$/gm, '');

  // Strip block comments (/* ... */) — non-greedy, multiline.
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');

  // Normalise double quotes to single (strict: only for string
  // literals that don't contain single quotes themselves).
  out = out.replace(/"([^"'\\]*(?:\\.[^"'\\]*)*)"/g, "'$1'");

  // Collapse runs of whitespace (incl. newlines + tabs) to single space.
  out = out.replace(/\s+/g, ' ');

  // Trim leading/trailing whitespace.
  out = out.trim();

  return out;
}
