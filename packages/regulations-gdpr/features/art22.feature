Feature: GDPR Article 22 — Automated individual decision-making, including profiling

  Citation: gdpr@2025-Q1 / Art. 22
  Source:   https://gdpr-info.eu/art-22-gdpr/
  Contracts: gdpr.art22.solelyAutomatedDecision
             gdpr.art22.contractNecessityException
             gdpr.art22.explicitConsentException
             gdpr.art22.humanInterventionSafeguards
             gdpr.art22.specialCategoryProhibition
  Severity: block (all five)

  Article 22 sets a default *prohibition* on solely-automated
  decisioning that produces legal or similarly significant effects on
  the data subject. The five typed Contracts in this module map
  one-to-one onto the sub-clauses:

  • 22(1) — the prohibition itself + the runtime bridge to Art. 22(2)
    exceptions and Art. 22(3) human-intervention evidence.
  • 22(2)(a) — the contract-necessity exception (institution enumerates
    contract purposes via DPIA).
  • 22(2)(c) — the explicit-consent exception (reuses the existing
    Consent primitive's event-log semantics).
  • 22(3) — structural-spec check that the runtime supports in-loop
    human intervention; per-event evidence lives in
    `eu-ai-act.art14.humanOversight`.
  • 22(4) — amplified prohibition when special-category Art. 9(1) data
    is in scope; requires an Art. 9(2)(a) or 9(2)(g) exemption claim.

  # Each Scenario below has a corresponding `it()` in test/art22.test.ts.
  # The mapping is verified by test/scenario-coverage.test.ts.

  # ============ Art. 22(1) — solelyAutomatedDecision ============

  Scenario: passes when solely-automated flag is absent (Contract does not fire)
    Given a CreditDecision intent
      And the snapshot does not declare `isSolelyAutomated`
    When invariants are evaluated
    Then the Contract passes (Art. 22(1) only fires when solely-automated is positively asserted)

  Scenario: passes when solely-automated AND a permitted exception is claimed
    Given a CreditDecision intent
      And the snapshot has `isSolelyAutomated` = true
      And the snapshot has `art22ExceptionClaimed` = `explicit-consent`
    When invariants are evaluated
    Then the Contract passes (Art. 22(2)(c) exception lifts the prohibition)

  Scenario: passes when solely-automated AND human-oversight event present (Art. 22(3) bridge)
    Given a CreditDecision intent
      And the snapshot has `isSolelyAutomated` = true
      And the event log contains `SuggestionAccepted`
    When invariants are evaluated
    Then the Contract passes (human intervention removes the "solely" qualifier)

  Scenario: fails when solely-automated AND no exception AND no oversight event
    Given a CreditDecision intent
      And the snapshot has `isSolelyAutomated` = true
      And no exception is claimed
      And the event log carries no human-oversight events
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: fails when claimed exception is not in the permitted set
    Given a CreditDecision intent
      And the snapshot has `isSolelyAutomated` = true
      And `art22ExceptionClaimed` is `made-up-exception`
      And `permittedExceptions` does NOT include `made-up-exception`
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: carries Art. 22(1) citation
    Given a default solelyAutomatedDecision Contract is constructed
    Then the citation regulation is `gdpr@2025-Q1`
      And the citation article is `Art. 22(1)`

  # ============ Art. 22(2)(a) — contractNecessityException ============

  Scenario: passes when contract purpose is in the permitted set
    Given a CreditDecision intent
      And the snapshot's `contractPurpose` is `credit-application`
      And `permittedContractPurposes` includes `credit-application`
    When invariants are evaluated
    Then the Contract passes

  Scenario: fails when contract purpose is not in the permitted set
    Given a CreditDecision intent
      And the snapshot's `contractPurpose` is `personal-curiosity`
      And `permittedContractPurposes` does NOT include `personal-curiosity`
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: fails when contract purpose field is missing
    Given a CreditDecision intent
      And the snapshot does not carry `contractPurpose`
    When invariants are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `gdpr.art22.contractNecessityException`

  Scenario: carries Art. 22(2)(a) citation
    Given a default contractNecessityException Contract is constructed
    Then the citation regulation is `gdpr@2025-Q1`
      And the citation article is `Art. 22(2)(a)`

  # ============ Art. 22(2)(c) — explicitConsentException ============

  Scenario: passes when consent event reference present in snapshot
    Given a CreditDecision intent
      And the snapshot has `art22ConsentEventId` referencing a consent event
    When invariants are evaluated
    Then the Contract passes

  Scenario: passes when ConsentGranted event for purpose exists on the chain
    Given a CreditDecision intent
      And no consent event reference is in the snapshot
      And the event log contains `ConsentGranted` for purpose `explicit-consent-art22-credit-decision`
    When invariants are evaluated
    Then the Contract passes (event-log consent is equivalent to snapshot reference)

  Scenario: fails when neither consent field nor matching consent event present
    Given a CreditDecision intent
      And no consent reference in snapshot
      And no matching ConsentGranted event in the log
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: fails when consent event purpose does not match
    Given a CreditDecision intent
      And no consent reference in snapshot
      And the event log contains `ConsentGranted` for purpose `some-other-purpose`
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: carries Art. 22(2)(c) citation
    Given a default explicitConsentException Contract is constructed
    Then the citation regulation is `gdpr@2025-Q1`
      And the citation article is `Art. 22(2)(c)`

  # ============ Art. 22(3) — humanInterventionSafeguards ============

  Scenario: passes when spec declares an in-loop oversight requirement
    Given a CreditDecision spec
      And `oversightRequirements` includes a requirement with `mode = in-loop`
    When pre-checks are evaluated
    Then the Contract passes

  Scenario: fails when spec declares only retrospective oversight (not Art. 22(3) conformant)
    Given a CreditDecision spec
      And `oversightRequirements` contains only `mode = retrospective`
    When pre-checks are evaluated
    Then the Contract fails with severity `block`

  Scenario: fails when spec declares no oversight requirements at all
    Given a CreditDecision spec
      And `oversightRequirements` is undefined
    When pre-checks are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `gdpr.art22.humanInterventionSafeguards`

  Scenario: carries Art. 22(3) citation
    Given a default humanInterventionSafeguards Contract is constructed
    Then the citation regulation is `gdpr@2025-Q1`
      And the citation article is `Art. 22(3)`

  # ============ Art. 22(4) — specialCategoryProhibition ============

  Scenario: passes when special-category flag is absent (Contract does not fire)
    Given a HealthUnderwriting intent
      And the snapshot does not declare `usesArt9Data`
    When invariants are evaluated
    Then the Contract passes (Art. 22(4) only fires when Art. 9(1) processing is positively asserted)

  Scenario: passes when special-category data is used AND a permitted Art. 9(2) exemption is claimed
    Given a HealthUnderwriting intent
      And the snapshot has `usesArt9Data` = true
      And the snapshot has `art9Exemption` = `art9-2-a`
    When invariants are evaluated
    Then the Contract passes

  Scenario: fails when special-category data is used but exemption field is missing
    Given a HealthUnderwriting intent
      And the snapshot has `usesArt9Data` = true
      And the snapshot does not carry `art9Exemption`
    When invariants are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `gdpr.art22.specialCategoryProhibition`

  Scenario: fails when claimed Art. 9(2) exemption is not in the permitted set
    Given a HealthUnderwriting intent
      And the snapshot has `usesArt9Data` = true
      And the snapshot has `art9Exemption` = `art9-2-x`
      And `permittedArt9Exemptions` does NOT include `art9-2-x`
    When invariants are evaluated
    Then the Contract fails with severity `block`

  Scenario: carries Art. 22(4) citation
    Given a default specialCategoryProhibition Contract is constructed
    Then the citation regulation is `gdpr@2025-Q1`
      And the citation article is `Art. 22(4)`
