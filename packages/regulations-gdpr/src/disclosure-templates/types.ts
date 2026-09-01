/**
 * Shared types for GDPR disclosure-template fillers.
 *
 * Per HF feedback 2026-06-02 item 4: controllers fill blanks; they do
 * not author from scratch and risk missing required sections. These
 * types describe the inputs the canonical filler accepts and the
 * structured output it produces — both auditable and diffable.
 */

/**
 * GDPR Article 6(1) lawful bases for processing personal data.
 * Per-purpose mapping so controllers can declare different bases for
 * different purposes (e.g., `contract` for service-delivery, `consent`
 * for marketing).
 */
export type LawfulBasis =
  | 'consent' // Art. 6(1)(a)
  | 'contract' // Art. 6(1)(b)
  | 'legal-obligation' // Art. 6(1)(c)
  | 'vital-interests' // Art. 6(1)(d)
  | 'public-task' // Art. 6(1)(e)
  | 'legitimate-interests'; // Art. 6(1)(f)

/**
 * Processor / recipient classification per GDPR's controller-processor
 * distinction (Art. 4(7)-(8), Art. 28). Each recipient must be tagged
 * so the disclosure clearly communicates the relationship.
 */
export type RecipientClassification =
  | 'controller' // independent / joint controller
  | 'processor' // acts on the controller's instructions only
  | 'sub-processor' // engaged by a processor
  | 'third-party' // any other recipient (e.g., regulator, recipient under law)
  | 'joint-controller'; // Art. 26 joint controller

/**
 * ISO 8601 duration string — the only retention representation
 * accepted by the fillers. Examples: `P7Y`, `P30D`, `P3M`. Validated
 * at runtime with a lightweight pattern check.
 */
export type IsoDuration = `P${string}`;

/**
 * One disclosure recipient. The label is the disclosed name; the
 * classification binds the relationship. Optional `country` lets the
 * filler render cross-border-transfer language without a separate
 * `transfers` block when the only relevant fact is recipient location.
 */
export interface RecipientEntry {
  readonly label: string;
  readonly classification: RecipientClassification;
  readonly country?: string;
}

/**
 * One data-subject right per Art. 13(2)(b)-(e) / Art. 14(2)(c)-(f) +
 * Art. 15-22. `id` is a stable identifier (e.g., `'access'`,
 * `'erasure'`); `name` is the localised title; `description` is the
 * one-paragraph explanation the disclosure renders.
 */
export interface DataSubjectRight {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly article: string; // e.g. 'Art. 15'
}

/**
 * One section of a rendered disclosure. Sections are ordered per the
 * regulation's required sequence; paragraphs are an ordered list of
 * plain-text paragraphs (the renderer can transform to HTML / Markdown
 * downstream — the template's only job is structure + canonical text).
 */
export interface DisclosureSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

/**
 * Structured output of every `fill()` call. Carries enough metadata
 * for the auditor to verify the section structure matches the
 * regulation's required ordering, and the text is diff-friendly when
 * regulators publish updates.
 */
export interface DisclosureTemplate {
  readonly regulation: string; // e.g. 'gdpr@2025-Q1'
  readonly article: string; // e.g. 'Art. 13'
  readonly title: string; // e.g. 'Information to be provided where personal data are collected from the data subject'
  readonly sections: readonly DisclosureSection[];
}

/**
 * Thrown synchronously by any `fill()` when a required field is
 * missing OR an input fails an Article-specific structural check.
 * Carries the field name + the article reference so the controller
 * can fix the call site quickly.
 *
 * Per ratchet `throw-only-typed-errors`: errors are typed; consumers
 * pattern-match by class.
 */
export class RequiredSectionMissingError extends Error {
  readonly code = 'gdpr.disclosure-templates.required-section-missing' as const;
  constructor(
    message: string,
    readonly article: string,
    readonly fieldPath: string,
  ) {
    super(message);
    this.name = 'RequiredSectionMissingError';
  }
}

const ISO_DURATION_PATTERN = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/;

/**
 * Validate that a string conforms to ISO 8601 duration format. Used by
 * the fillers to reject malformed retention inputs early.
 */
export function isIsoDuration(value: string): value is IsoDuration {
  if (!value.startsWith('P')) return false;
  return ISO_DURATION_PATTERN.test(value);
}
