// Variable estimation module
//
// Implements Phase 4.2: Proxy Evaluation (ComputeSpec evaluation in spec terms)

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
