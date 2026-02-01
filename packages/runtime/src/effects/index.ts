// Effect execution module
// Takes effects from policies and makes them real

// Types
export type {
  EffectExecutionContext,
  EffectExecutionResult,
  EffectsExecutionResult,
  EffectHandler,
  EffectLogger,
  LogEntry,
  ProposeActionOptions,
} from './types.js';

export { consoleLogger, silentLogger, createCapturingLogger } from './types.js';

// Registry
export {
  effectRegistry,
  isPackEffect,
  parsePackEffect,
  packEffectType,
} from './registry.js';

// Handlers
export {
  routeObservationHandler,
  createEntityEventHandler,
  proposeActionHandler,
  tagObservationHandler,
  suppressHandler,
  logHandler,
  builtInHandlers,
} from './handlers.js';

// Executor
export {
  executeEffect,
  executeEffects,
  createExecutionContext,
  registerEffectHandler,
  unregisterEffectHandler,
  hasEffectHandler,
  getRegisteredEffectTypes,
  type ExecuteEffectsOptions,
} from './executor.js';
