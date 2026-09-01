Feature: FERPA §99.31(a)(6) — research exception (studies for, or on behalf of, schools)

  Citation: ferpa@2024 / §99.31(a)(6)
  Source:   https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31
  Contract: ferpa.99-31.researchException
  Severity: block

  §99.31(a)(6) permits disclosure to organisations conducting studies
  for, or on behalf of, educational agencies or institutions to
  (A) develop, validate, or administer predictive tests; (B)
  administer student aid programs; or (C) improve instruction.

  The statute imposes a **written-agreement** precondition at
  §99.31(a)(6)(iii): the institution and the research organisation
  must execute an agreement that specifies the study's purpose, scope,
  duration, PII access limits, and post-study destruction timeline.
  This Contract verifies that a reference to such an agreement exists
  on the snapshot; the agreement's actual content is validated by
  `Disclosure` records out-of-band.

  An optional `dataDestructionTimelineField` makes a snapshot-level
  destruction-commitment declaration required — useful when the
  operator tracks the destruction timeline alongside the agreement
  reference rather than only inside the agreement text.

  **Fail-loud philosophy** — see the schoolOfficial feature. Either
  half missing or out-of-set fails the Contract: the audit bundle
  needs a positive record of the research-exception invocation AND
  the agreement that authorises it.

  # Each Scenario below has a corresponding `it()` in test/99-31.test.ts.

  Scenario: passes when study purpose and written agreement are both present
    Given a DiscloseToResearchPartner intent
      And the snapshot's `studyPurpose` is `improve-instruction`
      And the snapshot's `researchAgreementId` references a written agreement
    When invariants are evaluated
    Then the Contract passes

  Scenario: fails when study purpose is not in the recognised set
    Given a DiscloseToResearchPartner intent
      And the snapshot's `studyPurpose` is `commercial-marketing`
      And the snapshot's `researchAgreementId` references a written agreement
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: fails when written-agreement reference is missing
    Given a DiscloseToResearchPartner intent
      And the snapshot's `studyPurpose` is `improve-instruction`
      And the snapshot does not carry `researchAgreementId`
    When invariants are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `ferpa.99-31.researchException`

  Scenario: fails when data-destruction-timeline field is configured but missing
    Given a DiscloseToResearchPartner intent configured with `dataDestructionTimelineField`
      And the snapshot's `studyPurpose` is `improve-instruction`
      And the snapshot's `researchAgreementId` references a written agreement
      And the snapshot does not carry the configured destruction-timeline field
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: carries §99.31(a)(6) citation
    Given a default researchException Contract is constructed
    Then the citation regulation is `ferpa@2024`
      And the citation article is `§99.31(a)(6)`
