/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for EU AI Act disclosure-template fillers.
 *
 * Mirrors `@crawcus/regulations-gdpr/disclosure-templates/types.ts`
 * but kept pack-local so each regulation pack stays independently
 * publishable per the OSS/Cloud axis (CLAUDE.md "Two orthogonal axes").
 */

export interface DisclosureSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

export interface DisclosureTemplate {
  readonly regulation: string;
  readonly article: string;
  readonly title: string;
  readonly sections: readonly DisclosureSection[];
}

export class RequiredSectionMissingError extends Error {
  readonly code = 'eu-ai-act.disclosure-templates.required-section-missing' as const;
  constructor(
    message: string,
    readonly article: string,
    readonly fieldPath: string,
  ) {
    super(message);
    this.name = 'RequiredSectionMissingError';
  }
}
