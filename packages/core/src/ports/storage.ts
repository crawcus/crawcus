/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentHash, Region } from '@crawcus/spec';
import type { AccessCtx, TenantCtx } from '@crawcus/spec';

/**
 * Blob storage upload options. `region` is REQUIRED — confines the
 * blob to the tenant's residency region (NFR Priv5).
 */
export interface StorageOpts {
  readonly contentType: string;
  readonly cacheControl?: string;
  readonly region: Region;
}

/**
 * Blob reference. Carries the region (verified at read time against
 * the caller's `AccessCtx.tenant.region`) and a content hash for
 * tamper-evidence.
 */
export interface StorageRef {
  readonly key: string;
  readonly region: Region;
  readonly contentHash: ContentHash;
}

/**
 * Storage port — blob adapter. Implementations:
 * `@tallyseal/storage-s3` (Y1), `@tallyseal/storage-r2`,
 * `@tallyseal/storage-gcs`, `@tallyseal/storage-local`.
 *
 * `get`/`delete` require `AccessCtx` (cross-tenant boundary —
 * lawful basis + purpose + reason recorded for every access).
 */
export interface StoragePort {
  put(key: string, data: Uint8Array, opts: StorageOpts, ctx: TenantCtx): Promise<StorageRef>;
  get(ref: StorageRef, ctx: AccessCtx): Promise<Uint8Array>;
  delete(ref: StorageRef, ctx: AccessCtx): Promise<void>;
}
