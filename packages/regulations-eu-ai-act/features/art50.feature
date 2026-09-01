Feature: EU AI Act Article 50 — Transparency obligations

  Citation: eu-ai-act@2026-Q2 / Art. 50
  Source:   https://artificialintelligenceact.eu/article/50/
  Contracts:
    - eu-ai-act.art50.aiInteractionDisclosure       (Art. 50(1) — provider)
    - eu-ai-act.art50.syntheticContentMarker        (Art. 50(2) — provider)
    - eu-ai-act.art50.emotionRecognitionDisclosure  (Art. 50(3) — deployer)
    - eu-ai-act.art50.deepFakeDisclosure            (Art. 50(4) — deployer)
  Severity: block (all four)

  Article 50 enumerates four discrete transparency / marking obligations
  on providers (50(1), 50(2)) and deployers (50(3), 50(4)) of certain
  AI systems. Unlike Art. 14, these obligations are NOT gated on the
  high-risk classification — each paragraph has its own scope trigger.

  Tallyseal's enforcement model:
    - 50(1) "AI-interaction" — provider must ensure natural persons are
      informed they're interacting with an AI; Contract requires a
      DisclosureDelivered event (or snapshot reference) before AI-mediated
      events fire on the intent.
    - 50(2) "synthetic-content marker" — provider must mark output
      machine-readably; Contract requires a non-empty provenance marker
      (C2PA URL, watermark hash, signed-manifest pointer) on the snapshot.
    - 50(3) "emotion-recognition / biometric-categorisation" — deployer
      must notify exposed natural persons; Contract is permissive-scoped
      (passes vacuously when the trigger field is absent) and requires
      a DisclosureDelivered event when triggered.
    - 50(4) "deepfake" — deployer must disclose artificial generation;
      Contract mirrors 50(1)'s two-path shape at the deployer layer.

  Derogations (assistive-editing, criminal-investigation, artistic-work)
  must be declared via the CrawcusSpec's `derogations` entry rather than
  by removing the Contract — that preserves the affirmative-claim audit
  trail.

  # Each Scenario below has a corresponding `it()` in test/art50.test.ts.

  # ============ Art. 50(1) — aiInteractionDisclosure ============

  Scenario: passes when snapshot carries a disclosure-event reference
    Given a ChatbotTurn intent
      And the snapshot has `aiDisclosureEventId` referencing a prior DisclosureDelivered event
    When pre-conditions are evaluated
    Then the Contract passes

  Scenario: passes when a DisclosureDelivered event for the requirement exists
    Given a ChatbotTurn intent
      And no snapshot reference is set
      And a `DisclosureDelivered` event with payload.requirementId = `eu-ai-act.art50-1.ai-interaction` is on the log
    When pre-conditions are evaluated
    Then the Contract passes

  Scenario: fails when neither snapshot reference nor matching disclosure event present
    Given a ChatbotTurn intent
      And no snapshot reference is set
      And no matching DisclosureDelivered event on the log
    When pre-conditions are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `eu-ai-act.art50.aiInteractionDisclosure`

  Scenario: fails when only a non-matching DisclosureDelivered event is on the log
    Given a ChatbotTurn intent
      And a `DisclosureDelivered` event with a DIFFERENT payload.requirementId is on the log
    When pre-conditions are evaluated
    Then the Contract fails (requirementId filtering binds disclosures to obligations)

  Scenario: carries Art. 50(1) citation
    Given an aiInteractionDisclosure Contract is constructed
    Then the citation regulation is `eu-ai-act@2026-Q2`
      And the citation article is `Art. 50(1)`

  # ============ Art. 50(2) — syntheticContentMarker ============

  Scenario: passes when the marker field carries a non-empty value
    Given a GenerateImage intent
      And the snapshot has `c2paManifestUrl` populated with a non-empty provenance URL
    When invariants are evaluated
    Then the Contract passes

  Scenario: fails when the marker field is missing entirely
    Given a GenerateImage intent
      And the snapshot does not contain `c2paManifestUrl`
    When invariants are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `eu-ai-act.art50.syntheticContentMarker`

  Scenario: fails when the marker field is present but empty
    Given a GenerateImage intent
      And the snapshot has `c2paManifestUrl` set to the empty string
    When invariants are evaluated
    Then the Contract fails (empty marker provides no machine-readable provenance)

  Scenario: carries Art. 50(2) citation
    Given a syntheticContentMarker Contract is constructed
    Then the citation regulation is `eu-ai-act@2026-Q2`
      And the citation article is `Art. 50(2)`

  # ============ Art. 50(3) — emotionRecognitionDisclosure ============

  Scenario: passes vacuously when the trigger field is absent (out of scope)
    Given an AnalyseTone intent
      And the snapshot does not set `emotionRecognition`
    When pre-conditions are evaluated
    Then the Contract passes (Art. 50(3) only applies when the system performs the regulated processing)

  Scenario: passes when triggered and a matching DisclosureDelivered event exists
    Given an AnalyseTone intent
      And the snapshot has `emotionRecognition: true`
      And a `DisclosureDelivered` event with payload.requirementId = `eu-ai-act.art50-3.emotion-notice` is on the log
    When pre-conditions are evaluated
    Then the Contract passes

  Scenario: fails when triggered but no matching DisclosureDelivered event present
    Given an AnalyseTone intent
      And the snapshot has `emotionRecognition: true`
      And no matching DisclosureDelivered event on the log
    When pre-conditions are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `eu-ai-act.art50.emotionRecognitionDisclosure`

  Scenario: carries Art. 50(3) citation
    Given an emotionRecognitionDisclosure Contract is constructed
    Then the citation regulation is `eu-ai-act@2026-Q2`
      And the citation article is `Art. 50(3)`

  # ============ Art. 50(4) — deepFakeDisclosure ============

  Scenario: passes when snapshot carries a deepfake-disclosure-event reference
    Given a PublishGeneratedVideo intent
      And the snapshot has `deepFakeDisclosureEventId` referencing a prior DisclosureDelivered event
    When pre-conditions are evaluated
    Then the Contract passes

  Scenario: passes when a DisclosureDelivered event for the deepfake requirement exists
    Given a PublishGeneratedVideo intent
      And no snapshot reference is set
      And a `DisclosureDelivered` event with payload.requirementId = `eu-ai-act.art50-4.deepfake-notice` is on the log
    When pre-conditions are evaluated
    Then the Contract passes

  Scenario: fails when neither snapshot reference nor matching disclosure event present (deepfake)
    Given a PublishGeneratedVideo intent
      And no snapshot reference is set
      And no matching DisclosureDelivered event on the log
    When pre-conditions are evaluated
    Then the Contract fails with severity `block`
      And the contract id is `eu-ai-act.art50.deepFakeDisclosure`

  Scenario: carries Art. 50(4) citation
    Given a deepFakeDisclosure Contract is constructed
    Then the citation regulation is `eu-ai-act@2026-Q2`
      And the citation article is `Art. 50(4)`
