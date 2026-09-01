export { GDPR_VERSION } from './version.js';
export { minorConsent, type MinorConsentOptions } from './art8.js';
export {
  solelyAutomatedDecision,
  type SolelyAutomatedDecisionOptions,
  contractNecessityException,
  type ContractNecessityExceptionOptions,
  explicitConsentException,
  type ExplicitConsentExceptionOptions,
  humanInterventionSafeguards,
  specialCategoryProhibition,
  type SpecialCategoryProhibitionOptions,
} from './art22.js';
export { gdprPersonalDataDefaults, gdprSpecialCategoryDefaults } from './field-defaults.js';
export {
  ageBand,
  ageBandField,
  isMinorBand,
  AGE_BAND_VALUES,
  type AgeBandValue,
  type AdultOnlyOptions,
  type MinorAwareOptions,
  type PassthroughOptions,
} from './age-band.js';
