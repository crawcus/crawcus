Feature: FERPA §99.31(a)(1)(i)(A) — legitimate-educational-interest exception

  Citation: ferpa@2024 / §99.31(a)(1)(i)(A)
  Source:   https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31
  Contract: ferpa.99-31.legitimateEducationalInterest
  Severity: block

  Paired with `schoolOfficial` (§99.31(a)(1)(i)(B)). The (A) branch
  requires the disclosure serve a legitimate educational interest;
  the (B) branch requires the recipient be a school official.
  Together they form the compound §99.31(a)(1)(i) exception.

  The institution's published FERPA notice enumerates which access
  justifications constitute legitimate educational interest. This
  Contract takes that enumeration as `legitimatePurposes` and
  checks the access-justification recorded for this specific
  disclosure.

  **Fail-loud philosophy** — see the schoolOfficial feature. If the
  justification field isn't populated OR the justification isn't in
  the allowed set, the Contract fails.

  # Each Scenario below has a corresponding `it()` in test/99-31.test.ts.

  Scenario: passes when justification is in the legitimate-purposes set
    Given a ViewTranscript intent
      And the snapshot's `accessJustification` is `academic-advising`
      And `legitimatePurposes` includes `academic-advising`
    When invariants are evaluated
    Then the Contract passes

  Scenario: fails when justification is not in the legitimate-purposes set
    Given a ViewTranscript intent
      And the snapshot's `accessJustification` is `personal-curiosity`
      And `legitimatePurposes` does NOT include `personal-curiosity`
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: fails when justification field is missing
    Given a ViewTranscript intent
      And the snapshot does not carry `accessJustification`
    When invariants are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `ferpa.99-31.legitimateEducationalInterest`

  Scenario: carries §99.31(a)(1)(i)(A) citation
    Given a default legitimateEducationalInterest Contract is constructed
    Then the citation regulation is `ferpa@2024`
      And the citation article is `§99.31(a)(1)(i)(A)`
