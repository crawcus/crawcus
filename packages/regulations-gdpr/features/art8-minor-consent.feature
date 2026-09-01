Feature: GDPR Article 8(1) — Conditions applicable to child's consent

  Citation: gdpr@2025-Q1 / Art. 8 / §1
  Source:   https://gdpr-info.eu/art-8-gdpr/
  Contract: gdpr.art8.minorConsent
  Severity: block

  In relation to the offer of information society services directly to
  a child, processing of personal data is lawful only if:
  • the child is at least the member-state minor age (13-16, default 16), OR
  • consent is given or authorised by the holder of parental responsibility.

  Tallyseal enforces the consent path via a `consentField` reference on the
  intent snapshot, populated by a separate `ConsentGranted` event. Member
  states that lowered the minor age (UK = 13, IE = 16) configure
  `minorAge` accordingly.

  # Each Scenario below has a corresponding `it()` in test/art8.test.ts.
  # The mapping is verified by test/scenario-coverage.test.ts.

  Scenario: passes when age is unknown (defer to data-quality)
    Given a CreateCourse intent
      And the snapshot does not contain `learnerAge`
    When invariants are evaluated
    Then the Contract passes (age unknown; not this Contract's responsibility)

  Scenario: passes when learner is at or above minorAge
    Given a CreateCourse intent
      And the snapshot has `learnerAge` = 16
      And `minorAge` is configured as 16
    When invariants are evaluated
    Then the Contract passes (subject is not a minor under this regime)

  Scenario: passes when learner is under minorAge AND parental consent present
    Given a CreateCourse intent
      And the snapshot has `learnerAge` = 12
      And the snapshot has `parentalConsentEventId` referencing a consent event
    When invariants are evaluated
    Then the Contract passes (parental consent satisfies Art. 8(1))

  Scenario: fails when learner is under minorAge AND parental consent missing
    Given a CreateCourse intent
      And the snapshot has `learnerAge` = 12
      And the snapshot has no `parentalConsentEventId`
    When invariants are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `gdpr.art8.minorConsent`

  Scenario: respects custom minorAge (UK = 13)
    Given a CreateCourse intent configured with `minorAge` = 13
      And the snapshot has `learnerAge` = 14
      And the snapshot has no parental consent
    When invariants are evaluated
    Then the Contract passes (14 ≥ UK minor age of 13)

  Scenario: carries the gdpr citation
    Given a default minorConsent Contract is constructed
    Then the citation regulation is `gdpr@2025-Q1`
      And the citation article is `Art. 8`
