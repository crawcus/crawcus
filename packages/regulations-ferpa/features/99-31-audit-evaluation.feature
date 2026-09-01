Feature: FERPA §99.31(a)(1)(ii) — audit / evaluation / compliance / accreditation exception

  Citation: ferpa@2024 / §99.31(a)(1)(ii)
  Source:   https://www.ecfr.gov/current/title-34/subtitle-A/part-99/subpart-D/section-99.31
  Contract: ferpa.99-31.auditEvaluation
  Severity: block

  §99.31(a)(1)(ii) permits disclosure to authorised representatives of
  the Comptroller General, the Secretary, State or local educational
  authorities, or institutional authorised representatives, for
  audit / evaluation / compliance / accreditation purposes connected
  to a Federal- or State-supported education program.

  The exception is **compound**: the statute requires BOTH (a) the
  recipient be one of the enumerated authorities AND (b) the
  disclosure purpose be one of the enumerated purposes. A state
  agency receiving records for an unrelated reason is not covered;
  neither is an audit by a body the institution has never recognised
  as an authorised authority. We enforce both halves at the runtime
  layer.

  **Fail-loud philosophy** — see the schoolOfficial feature. Either
  half missing or out-of-set fails the Contract: the audit bundle
  needs a positive record of which authority invoked the exception
  and for which audit-eligible purpose.

  # Each Scenario below has a corresponding `it()` in test/99-31.test.ts.

  Scenario: passes when authority and purpose are both recognised
    Given a DiscloseToAuditor intent
      And the snapshot's `requestingAuthority` is `State Education Agency`
      And the snapshot's `disclosurePurpose` is `state-audit`
      And `recognisedAuthorities` includes `State Education Agency`
      And `recognisedPurposes` includes `state-audit`
    When invariants are evaluated
    Then the Contract passes

  Scenario: fails when authority is not in the recognised set
    Given a DiscloseToAuditor intent
      And the snapshot's `requestingAuthority` is `random-vendor`
      And the snapshot's `disclosurePurpose` is `state-audit`
      And `recognisedAuthorities` does NOT include `random-vendor`
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: fails when purpose is not in the recognised set
    Given a DiscloseToAuditor intent
      And the snapshot's `requestingAuthority` is `State Education Agency`
      And the snapshot's `disclosurePurpose` is `marketing-research`
      And `recognisedPurposes` does NOT include `marketing-research`
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: fails when authority field is missing
    Given a DiscloseToAuditor intent
      And the snapshot does not carry `requestingAuthority`
      And the snapshot's `disclosurePurpose` is `state-audit`
    When invariants are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `ferpa.99-31.auditEvaluation`

  Scenario: carries §99.31(a)(1)(ii) citation
    Given a default auditEvaluation Contract is constructed
    Then the citation regulation is `ferpa@2024`
      And the citation article is `§99.31(a)(1)(ii)`
