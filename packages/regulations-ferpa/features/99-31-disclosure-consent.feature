Feature: FERPA §99.31 — Conditions for disclosure without consent

  Citation: ferpa@2024 / §99.31
  Source:   https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31
  Contract: ferpa.99-31.disclosureConsent
  Severity: block

  The default rule (34 CFR §99.30) is that an educational agency must
  obtain **written consent** from the parent or eligible student before
  disclosing personally identifiable information from a student's
  education records. §99.31 enumerates the exceptions (legitimate
  educational interest, audit/evaluation, judicial order, etc.).

  Tallyseal v0.0.1 enforces the consent path only. Customers invoking
  §99.31 exceptions should add a `derogations` entry on the CrawcusSpec
  rather than removing this Contract — the audit bundle then shows
  which exception was claimed.

  Consent is recognised in two equivalent ways:
  • a reference on the intent snapshot (`consentField`), or
  • a `ConsentGranted` event with matching `purpose` on the intent's
    event log.

  # Each Scenario below has a corresponding `it()` in test/99-31.test.ts.

  Scenario: passes when consent event reference present in snapshot
    Given a ShareTranscript intent
      And the snapshot has `studentConsentEventId` referencing a consent event
    When invariants are evaluated
    Then the Contract passes

  Scenario: passes when ConsentGranted event for purpose exists
    Given a ShareTranscript intent
      And no consent event reference is in the snapshot
      And the event log contains `ConsentGranted` for purpose `transcript-release`
    When invariants are evaluated
    Then the Contract passes (event-log consent is equivalent to snapshot reference)

  Scenario: fails when neither consent field nor consent event present
    Given a ShareTranscript intent
      And no consent reference in snapshot
      And no ConsentGranted event in the log
    When invariants are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `ferpa.99-31.disclosureConsent`

  Scenario: carries ferpa citation
    Given a default disclosureConsent Contract is constructed
    Then the citation regulation is `ferpa@2024`
      And the citation article is `§99.31`
