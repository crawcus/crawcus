Feature: EU AI Act Article 14 — Human oversight

  Citation: eu-ai-act@2026-Q2 / Art. 14
  Source:   https://artificialintelligenceact.eu/article/14/
  Contract: eu-ai-act.art14.humanOversight
  Severity: block

  "High-risk AI systems shall be designed and developed in such a way,
  including with appropriate human-machine interface tools, that they
  can be effectively overseen by natural persons during the period in
  which they are in use."

  Tallyseal's Suggestion lifecycle (accept / edit / reject) IS the
  Article 14 implementation. Any one of the three actions — accept,
  edit, reject — counts as human oversight, because each carries a
  reasoned human disposition over the AI suggestion.

  Article 14 applies only to systems classified as high-risk under
  Art. 6 + Annex III. Standard-classification intents skip this
  Contract.

  # Each Scenario below has a corresponding `it()` in test/art14.test.ts.

  Scenario: passes for standard classification (Art. 14 not applicable)
    Given a Memo intent with classification `standard`
      And no Suggestion events on the log
    When post-conditions are evaluated
    Then the Contract passes (Art. 14 only applies to high-risk)

  Scenario: fails for high-risk when no Suggestion lifecycle event present
    Given a HiringScreen intent with classification `high-risk`
      And no Suggestion events on the log
    When post-conditions are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `eu-ai-act.art14.humanOversight`

  Scenario: passes for high-risk when SuggestionAccepted event present
    Given a HiringScreen intent with classification `high-risk`
      And a `SuggestionAccepted` event on the log
    When post-conditions are evaluated
    Then the Contract passes

  Scenario: passes when human rejected (also human oversight)
    Given a HiringScreen intent with classification `high-risk`
      And a `SuggestionRejected` event on the log
    When post-conditions are evaluated
    Then the Contract passes (rejection is a reasoned human disposition)

  Scenario: passes when human edited (also human oversight)
    Given a HiringScreen intent with classification `high-risk`
      And a `SuggestionEdited` event on the log
    When post-conditions are evaluated
    Then the Contract passes (edit carries human disposition)

  Scenario: carries eu-ai-act citation
    Given a humanOversight Contract is constructed
    Then the citation regulation is `eu-ai-act@2026-Q2`
      And the citation article is `Art. 14`
