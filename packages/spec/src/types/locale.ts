import type { Brand } from './brand.js';

/**
 * BCP-47 locale identifier (e.g., 'en', 'en-GB', 'de-DE', 'zh-Hans').
 *
 * Permissive at the type level (Brand<string>); runtime validation
 * happens at compliance-manifest build time, not in the type system,
 * to keep developer ergonomics light.
 */
export type Locale = Brand<string, 'Locale'>;

/**
 * Localised text — either a single string (sugar for `{ en: string }`)
 * or a per-locale record. Used for `askHint`, `description`, `label`,
 * etc. across CrawcusSpec and Contracts.
 */
export type LocalisedText = string | Readonly<Record<string, string>>;
