Feature: FERPA §99.31(a)(1)(i)(B) — school-official exception

  Citation: ferpa@2024 / §99.31(a)(1)(i)(B)
  Source:   https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31
  Contract: ferpa.99-31.schoolOfficial
  Severity: block

  §99.31(a) enumerates the FERPA exceptions to the §99.30 default
  written-consent rule. The §99.31(a)(1)(i)(B) "school official"
  branch permits disclosure to other school officials within the
  institution whom the institution has determined to have legitimate
  educational interests in the records.

  The institution's published FERPA notice must enumerate which role
  categories qualify as school officials. This Contract takes that
  enumeration as `schoolOfficialRoles` and checks the accessing
  actor's role at runtime.

  **Fail-loud philosophy** — unlike `disclosureConsent` (which is
  permissive: consent OR event satisfies), §99.31 exceptions are
  affirmative claims the institution invokes. If the actor role
  field isn't populated OR the role isn't in the allowed set, the
  Contract fails — the audit bundle needs a positive record of
  which exception was claimed AND that it was valid.

  # Each Scenario below has a corresponding `it()` in test/99-31.test.ts.

  Scenario: passes when actor role is in the school-official set
    Given a ViewTranscript intent
      And the snapshot's `accessorRole` is `registrar`
      And `schoolOfficialRoles` includes `registrar`
    When invariants are evaluated
    Then the Contract passes

  Scenario: fails when actor role is not in the school-official set
    Given a ViewTranscript intent
      And the snapshot's `accessorRole` is `student-volunteer`
      And `schoolOfficialRoles` does NOT include `student-volunteer`
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: fails when actor role field is missing
    Given a ViewTranscript intent
      And the snapshot does not carry `accessorRole`
    When invariants are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `ferpa.99-31.schoolOfficial`

  Scenario: carries §99.31(a)(1)(i)(B) citation
    Given a default schoolOfficial Contract is constructed
    Then the citation regulation is `ferpa@2024`
      And the citation article is `§99.31(a)(1)(i)(B)`
