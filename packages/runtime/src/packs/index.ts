// Packs - Extension system for the Omnilith Protocol
//
// This module implements Phase 11 of the implementation plan:
// - Pack registry for managing loaded packs
// - Pack loader for discovery and dependency resolution
// - Integration with action and effect registries

// Registry
export {
  packRegistry,
  resolveLoadOrder,
  packEffectType,
  packActionType,
  // Errors
  PackNotFoundError,
  PackAlreadyLoadedError,
  PackDependencyError,
  PackVersionError,
  PackCircularDependencyError,
  // Types
  type PackRegistrationContext,
  type PackExtensionHandlers,
  type EntityTypeRegistrationHandler,
  type BlockTypeRegistrationHandler,
  type SensorRegistrationHandler,
  type PolicyTemplateRegistrationHandler,
  type VariableTemplateRegistrationHandler,
  type MutableActionRegistry,
} from './registry.js';

// Loader
export {
  loadPack,
  loadPacks,
  unloadPack,
  findDependents,
  canLoadPack,
  getAvailablePacks,
  getLoadedPacks,
  createPack,
  createEmptyPack,
  // Errors
  PackLoadError,
  PackDiscoveryError,
  // Types
  type PackLoadResult,
  type BatchLoadResult,
  type LoadPackOptions,
  type BatchLoadOptions,
  type PackSource,
} from './loader.js';
