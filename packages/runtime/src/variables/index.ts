// Variable estimation module
//
// Implements Phase 4.2: Proxy Evaluation (ComputeSpec evaluation in spec terms)
// Implements Phase 4.3: Variable Estimate Derivation

export {
  // Main evaluation functions
  evaluateComputeSpec,
  evaluateComputeSpecs,

  // Helper functions (exported for testing and advanced use)
  matchesObservationType,
  filterByObservationTypes,
  filterByTimeWindow,
  applyCountLimit,
  extractNumericValue,
  aggregate,

  // Types
  type ComputeResult,

  // Errors
  ComputeSpecError,
} from './compute.js';

export {
  // Estimate derivation (Phase 4.3)
  deriveEstimate,
  deriveEstimates,

  // Range helpers
  isInRange,
  isInPreferredBounds,
  getRangeCenter,
  calculateDeviation,
  calculateTrend,

  // Types
  type DeriveEstimateOptions,
  type DeriveEstimatesResult,
} from './estimate.js';
