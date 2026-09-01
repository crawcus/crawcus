import type { ComplianceManifest } from '../types/compliance.js';

/**
 * Identity function for typed compliance manifests. Runtime no-op;
 * the value is purely in TypeScript inference at authoring time.
 *
 * @example
 * import { defineCompliance } from '@crawcus/core';
 *
 * export default defineCompliance({
 *   regulations: ['gdpr@2025-Q1'],
 *   // ... full manifest shape ...
 * });
 */
export function defineCompliance(manifest: ComplianceManifest): ComplianceManifest {
  return manifest;
}
