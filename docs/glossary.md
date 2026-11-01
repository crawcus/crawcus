<!--
SPDX-FileCopyrightText: 2026 Paul Wander + CRAWCUS contributors
SPDX-License-Identifier: CC-BY-4.0
-->

# Glossary

CRAWCUS is an open spec we publish (CC-BY-4.0). These are its public
definitions of three terms that are easy to confuse with similarly named
terms elsewhere. The normative text is in
[CRAWCUS format §Terminology](spec/crawcus-format.md#terminology).

## Receipt

A CRAWCUS receipt is the signed record of one business transaction or AI decision, made by the system that performed it. It is not a SCITT receipt. A SCITT receipt (RFC 9943) is the transparency service's later proof that a signed statement was registered in its log. When a CRAWCUS receipt is registered with SCITT, the CRAWCUS receipt is the signed statement and SCITT's receipt is its proof of registration.

## Attestation

In CRAWCUS, an attestation is a signed bundle that collects receipts, their log proofs and the applicable regulation package, so a third party can verify them offline. It is a machine-checkable statement by the signing system, not an auditor's opinion or assurance report.

## Warrant

A warrant is a signed, expiring authorisation that says what an agent or system may do, for whom, and until when. A receipt can cite a warrant to show that the action was in scope.

## Terminology rule

On this site and in the spec, a bare "receipt" always means a CRAWCUS
receipt. When we mean SCITT's object, we write **"SCITT receipt"** or
**"registration receipt"**, never bare "receipt". See
[CRAWCUS and SCITT](scitt.md).

## In plain language

For non-technical readers:

| Spec term | Say instead |
|---|---|
| Attestation | **audit bundle** |
| Warrant | **signed, expiring authorisation** |

Neither term means that an auditor has reviewed, attested to or signed
anything. An audit bundle is produced and signed by the system that did
the work. An auditor may review it, but that review is separate.
