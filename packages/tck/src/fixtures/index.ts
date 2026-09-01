/**
 * # @crawcus/tck/fixtures
 *
 * Standalone conformance fixtures any CRAWCUS-conformant runtime must
 * satisfy. Each fixture exports:
 *
 *   - One or more `runX` assertion functions returning `TckResult`
 *     (structured pass / fail with diagnostics)
 *   - Helpers (event builders, sample payloads)
 *
 * Fixtures are runtime-agnostic — they consume the public
 * `@crawcus/spec` surface and produce structured results.
 * Vitest / Mocha / a Go test harness can all drive them.
 */

export { TCK_RESULT_PASS } from './result.js';
export type { TckResult, TckResultFailure, TckResultPass } from './result.js';

export {
  runDisclosureSignalPositiveCase,
  runDisclosureSignalGateRejectionCase,
  runDisclosureSignalHashMismatchCase,
  buildDeliveredEvent,
  buildSignalEvent,
  type DisclosureSignalFixtureEnv,
} from './disclosure-signal.fixture.js';

export {
  runHashChainContract,
  buildGoldenSequence,
  EXPECTED_CONTENT_HASHES,
  type HashChainContractStore,
  type HashChainContractEnv,
} from './hash-chain.fixture.js';
