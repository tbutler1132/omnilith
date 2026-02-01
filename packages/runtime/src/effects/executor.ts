// Effect executor - takes effects from policies and makes them real

import type { Effect, Observation, Id } from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import type {
  EffectExecutionContext,
  EffectExecutionResult,
  EffectsExecutionResult,
  EffectLogger,
} from './types.js';
import { consoleLogger } from './types.js';
import { effectRegistry, isPackEffect } from './registry.js';
import { builtInHandlers } from './handlers.js';
import { UnknownEffectError } from '../errors.js';

// Register built-in handlers on module load
for (const [effectType, handler] of Object.entries(builtInHandlers)) {
  if (!effectRegistry.has(effectType)) {
    effectRegistry.register(effectType, handler);
  }
}

/**
 * Options for effect execution
 */
export type ExecuteEffectsOptions = {
  /**
   * Logger for structured logging (defaults to console)
   */
  logger?: EffectLogger;

  /**
   * Override execution timestamp
   */
  executedAt?: string;

  /**
   * Whether to continue execution after an error (default: true)
   */
  continueOnError?: boolean;

  /**
   * Skip execution of suppress effects (already handled in evaluation)
   */
  skipSuppress?: boolean;
};

/**
 * Execute a single effect.
 *
 * @param effect - The effect to execute
 * @param ctx - Execution context
 * @returns Execution result
 */
export async function executeEffect(
  effect: Effect,
  ctx: EffectExecutionContext
): Promise<EffectExecutionResult> {
  const startTime = Date.now();
  const effectType = effect.effect;

  try {
    // Get the handler
    const handler = effectRegistry.get(effectType);

    if (!handler) {
      // Check if it's a pack effect that might be registered later
      if (isPackEffect(effectType)) {
        ctx.logger.warn(`Unknown pack effect type: ${effectType}`, {
          effect,
          policyId: ctx.policyId,
        });
        return {
          effect,
          success: false,
          error: `Unknown pack effect type: ${effectType}`,
          durationMs: Date.now() - startTime,
        };
      }

      throw new UnknownEffectError(effectType, ctx.policyId);
    }

    // Execute the handler
    const data = await handler(effect, ctx);

    return {
      effect,
      success: true,
      durationMs: Date.now() - startTime,
      data: data ?? undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    ctx.logger.error(`Effect execution failed: ${effectType}`, {
      effect,
      error: errorMessage,
      policyId: ctx.policyId,
    });

    return {
      effect,
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute multiple effects.
 *
 * Effects are executed in order. By default, execution continues even if
 * individual effects fail (errors are captured in results).
 *
 * @param effects - Effects to execute
 * @param repos - Repository context
 * @param observation - The triggering observation
 * @param policyId - The policy that produced these effects
 * @param options - Execution options
 * @returns Execution results
 */
export async function executeEffects(
  effects: Effect[],
  repos: RepositoryContext,
  observation: Observation,
  policyId: Id,
  options: ExecuteEffectsOptions = {}
): Promise<EffectsExecutionResult> {
  const startTime = Date.now();
  const {
    logger = consoleLogger,
    executedAt = new Date().toISOString(),
    continueOnError = true,
    skipSuppress = true,
  } = options;

  const results: EffectExecutionResult[] = [];
  let suppressed = false;
  let suppressReason: string | undefined;

  // Build execution context
  const ctx: EffectExecutionContext = {
    repos,
    observation,
    policyId,
    nodeId: observation.nodeId,
    executedAt,
    logger,
  };

  for (const effect of effects) {
    // Check for suppress effect
    if (effect.effect === 'suppress') {
      suppressed = true;
      suppressReason = (effect as { reason: string }).reason;

      if (skipSuppress) {
        // Log but don't "execute" - suppression is handled in evaluation
        logger.info('Suppress effect noted', {
          reason: suppressReason,
          policyId,
        });
        continue;
      }
    }

    // Execute the effect
    const result = await executeEffect(effect, ctx);
    results.push(result);

    // Stop on error if configured
    if (!result.success && !continueOnError) {
      break;
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  return {
    results,
    successCount,
    failureCount,
    totalDurationMs: Date.now() - startTime,
    suppressed,
    suppressReason,
  };
}

/**
 * Create an execution context for testing or manual execution.
 */
export function createExecutionContext(
  repos: RepositoryContext,
  observation: Observation,
  policyId: Id,
  options: { logger?: EffectLogger; executedAt?: string } = {}
): EffectExecutionContext {
  return {
    repos,
    observation,
    policyId,
    nodeId: observation.nodeId,
    executedAt: options.executedAt ?? new Date().toISOString(),
    logger: options.logger ?? consoleLogger,
  };
}

/**
 * Register a custom effect handler.
 * Use this for pack effects or extending the system.
 *
 * @param effectType - The effect type (use 'pack:name:action' format for packs)
 * @param handler - The handler function
 */
export function registerEffectHandler<T extends Effect>(
  effectType: string,
  handler: (effect: T, ctx: EffectExecutionContext) => Promise<Record<string, unknown> | void>
): void {
  // Type assertion needed because we're storing a specific handler in a generic registry
  effectRegistry.register(effectType, handler as (effect: Effect, ctx: EffectExecutionContext) => Promise<Record<string, unknown> | void>);
}

/**
 * Unregister an effect handler.
 * Primarily for testing or pack unloading.
 */
export function unregisterEffectHandler(effectType: string): boolean {
  return effectRegistry.unregister(effectType);
}

/**
 * Check if a handler is registered for an effect type.
 */
export function hasEffectHandler(effectType: string): boolean {
  return effectRegistry.has(effectType);
}

/**
 * Get all registered effect types.
 */
export function getRegisteredEffectTypes(): string[] {
  return effectRegistry.getRegisteredTypes();
}
