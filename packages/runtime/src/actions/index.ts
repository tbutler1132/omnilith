// ActionRun Lifecycle (Phase 3.1)
//
// This module implements the ActionRun lifecycle:
// - Creation with risk level resolution
// - Approval (manual or auto)
// - Rejection with reason
// - Execution with result capture

export {
  // Lifecycle functions
  createActionRun,
  approveActionRun,
  rejectActionRun,
  executeActionRun,
  getPendingApprovals,
  getActionRunsByStatus,

  // Registry
  createActionRegistry,

  // Utilities
  compareRiskLevels,
  requiresManualApproval,

  // Error types
  ActionRunNotFoundError,
  InvalidActionStateError,
  InsufficientAuthorityError,
  ActionExecutionError,

  // Types
  type CreateActionRunInput,
  type CreateActionRunOptions,
  type CreateActionRunResult,
  type ApproveActionRunInput,
  type RejectActionRunInput,
  type ExecuteActionRunInput,
  type ExecuteActionRunOptions,
  type ExecuteActionRunResult,
  type ActionRegistry,
  type ActionHandler,
  type ActionExecutionContext,
} from './lifecycle.js';

// Core Action Handlers (Phase 3.2)
export {
  // Registration helper
  registerCoreActions,

  // Individual definitions (for reference/extension)
  coreActionDefinitions,
  coreActionHandlers,

  // Artifact actions
  createArtifactDefinition,
  createArtifactHandler,
  updateArtifactDefinition,
  updateArtifactHandler,
  updateArtifactStatusDefinition,
  updateArtifactStatusHandler,

  // Episode actions
  createEpisodeDefinition,
  createEpisodeHandler,
  updateEpisodeStatusDefinition,
  updateEpisodeStatusHandler,

  // Entity actions
  createEntityDefinition,
  createEntityHandler,
  createEntityEventDefinition,
  createEntityEventHandler,

  // Variable actions
  createVariableDefinition,
  createVariableHandler,

  // Grant actions
  createGrantDefinition,
  createGrantHandler,
  revokeGrantDefinition,
  revokeGrantHandler,
} from './handlers.js';
