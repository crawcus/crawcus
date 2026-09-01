export const TALLYSEAL_CRAWCUS_TCK_VERSION = '0.1.0' as const;

export {
  checkScenarioCoverage,
  parseScenarios,
  parseItNames,
  type ScenarioCoverageOptions,
  type ScenarioCoverageReport,
} from './gherkin-coverage.js';

// ============ Fixtures barrel re-export for typed in-tree consumers ============
// Downstream consumers SHOULD import from `@crawcus/tck/fixtures`
// per the package `exports` map. The re-export here is for in-tree tests
// + the audit-bundle composer that wants the fixture surface alongside
// the Gherkin-coverage helper without dual imports.

export {
  TCK_RESULT_PASS,
  type TckResult,
  type TckResultFailure,
  type TckResultPass,
  runDisclosureSignalPositiveCase,
  runDisclosureSignalGateRejectionCase,
  runDisclosureSignalHashMismatchCase,
  buildDeliveredEvent,
  buildSignalEvent,
  type DisclosureSignalFixtureEnv,
  runHashChainContract,
  buildGoldenSequence,
  EXPECTED_CONTENT_HASHES,
  type HashChainContractStore,
  type HashChainContractEnv,
} from './fixtures/index.js';
