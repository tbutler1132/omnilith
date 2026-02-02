// Phase 12: Replay and Determinism
//
// Replay module for reconstructing state from canon.
// Per spec §0.5: "Replay re-evaluates decisions, not the external world."
// ActionRuns are NOT re-executed during replay - their recorded results are used.

export {
  // Observation log replay
  replayObservationLog,
  replayObservation,
  groupActionRunsByObservation,
  isReplayError,
  type ReplayObservationOptions,
  type ReplayObservationResult,
  type ReplayLogOptions,
  type ReplayLogResult,
  type ReplayMode,
} from './observation-replay.js';

export {
  // Entity event replay
  replayEntityEvents,
  materializeEntityState,
  verifyEntityState,
  verifyEntities,
  defaultEventReducer,
  type ReplayEntityEventsOptions,
  type ReplayEntityEventsResult,
} from './entity-replay.js';

export {
  // Determinism utilities
  checkPolicyDeterminism,
  checkPoliciesDeterminism,
  detectNonDeterministicPatterns,
  createTestObservation,
  type DeterminismCheckOptions,
  type DeterminismCheckResult,
  type NonDeterministicPattern,
} from './determinism.js';
