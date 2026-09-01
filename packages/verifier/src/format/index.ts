/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Format barrel — re-exports the public format renderers.
 *
 * Spec source:
 *   `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1b-spec.md` §2(a)
 *
 * The verifier's primary format dispatch (text / json / jsonld) lives
 * in `verifier-cli/src/format.ts`. This barrel exists for the PDF
 * format only because PDF rendering is a library-level concern (an
 * advanced caller can produce a PDF without going through the CLI),
 * matching the spec §3 public-API surface addition `renderPdf`.
 */

export { renderPdf } from './pdf.js';
