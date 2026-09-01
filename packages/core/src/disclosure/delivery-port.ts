/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  DeliveryMethod,
  DisclosureContent,
  DisclosureRequirementId,
} from '@crawcus/spec';
import type { SubjectId, TenantId } from '@crawcus/spec';

/**
 * # DeliveryPort — adapter for delivering Disclosures
 *
 * Tallyseal-runtime port — pluggable by `DeliveryMethod`. Each method
 * (in-app / email / sms / mail / api) is a separate adapter
 * implementation. Customers register a `DeliveryRegistry` that maps
 * `DeliveryMethod` → `DeliveryPort` instance.
 *
 * Per the audit memo: *"OEM platforms can register their own notice
 * content via DisclosureContentPort"* — DeliveryPort is the
 * sister-port for actual transport.
 *
 * The runtime invokes `deliver(...)` and records a
 * `DisclosureDelivered` event on success. Failure throws (caller
 * decides retry / queue semantics). Returning success-without-emit is
 * forbidden — the event log is the auditor-defensible delivery proof.
 */
export interface DeliveryPort {
  readonly method: DeliveryMethod;
  deliver(args: DeliveryRequest): Promise<DeliveryResult>;
}

export interface DeliveryRequest {
  readonly tenantId: TenantId;
  readonly subject: SubjectId;
  readonly requirementId: DisclosureRequirementId;
  readonly content: DisclosureContent;
}

export interface DeliveryResult {
  /**
   * Channel-specific receipt identifier (email message-id, SMS
   * provider id, in-app notification id, etc.). Recorded in the
   * `DisclosureDelivered` event payload extension for traceability.
   */
  readonly channelReceiptId: string;
}

/**
 * Registry mapping each `DeliveryMethod` to its adapter. Constructed
 * at runtime config wiring time.
 */
export type DeliveryRegistry = Readonly<Partial<Record<DeliveryMethod, DeliveryPort>>>;
