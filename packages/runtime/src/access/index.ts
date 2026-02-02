// Access Control module (Phase 7.2)
// Provides access checking based on explicit grants.

export {
  // Main class
  AccessChecker,
  createAccessChecker,
  // Types
  type AccessCheckResult,
  type CheckAccessOptions,
  type CheckAccessInput,
  type ScopesCheckResult,
  // Utility functions
  impliesRead,
  impliesWrite,
  impliesAdmin,
  getImpliedScopes,
  deriveGrantsFromEdges,
} from './checker.js';
