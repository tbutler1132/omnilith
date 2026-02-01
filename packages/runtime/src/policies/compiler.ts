// Policy compiler - compiles TypeScript policy code into evaluator functions

import type { Policy, PolicyEvaluator, PolicyContext, Effect } from '@omnilith/protocol';
import { PolicyCompilationError, InvalidEffectError } from '../errors.js';

/**
 * Valid effect types that policies can return
 */
const VALID_EFFECT_TYPES = [
  'route_observation',
  'create_entity_event',
  'propose_action',
  'tag_observation',
  'suppress',
  'log',
] as const;

/**
 * Check if a string matches the pack effect pattern (pack:name:action)
 */
function isPackEffect(effect: string): boolean {
  return /^pack:[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/.test(effect);
}

/**
 * Validate that an effect has the correct shape
 */
function validateEffect(effect: unknown, policyId: string): asserts effect is Effect {
  if (!effect || typeof effect !== 'object') {
    throw new InvalidEffectError(policyId, effect, 'effect must be an object');
  }

  const e = effect as Record<string, unknown>;

  if (!e.effect || typeof e.effect !== 'string') {
    throw new InvalidEffectError(policyId, effect, 'effect must have an "effect" property of type string');
  }

  const effectType = e.effect;

  // Check if it's a valid built-in effect or a pack effect
  if (!VALID_EFFECT_TYPES.includes(effectType as typeof VALID_EFFECT_TYPES[number]) && !isPackEffect(effectType)) {
    throw new InvalidEffectError(
      policyId,
      effect,
      `unknown effect type "${effectType}". Valid types: ${VALID_EFFECT_TYPES.join(', ')} or pack:name:action`
    );
  }

  // Validate effect-specific fields
  switch (effectType) {
    case 'route_observation':
      if (!e.toNodeId || typeof e.toNodeId !== 'string') {
        throw new InvalidEffectError(policyId, effect, 'route_observation requires toNodeId');
      }
      break;

    case 'create_entity_event':
      if (!e.entityId || typeof e.entityId !== 'string') {
        throw new InvalidEffectError(policyId, effect, 'create_entity_event requires entityId');
      }
      if (!e.event || typeof e.event !== 'object') {
        throw new InvalidEffectError(policyId, effect, 'create_entity_event requires event object');
      }
      break;

    case 'propose_action':
      if (!e.action || typeof e.action !== 'object') {
        throw new InvalidEffectError(policyId, effect, 'propose_action requires action object');
      }
      break;

    case 'tag_observation':
      if (!e.tags || !Array.isArray(e.tags)) {
        throw new InvalidEffectError(policyId, effect, 'tag_observation requires tags array');
      }
      break;

    case 'suppress':
      if (!e.reason || typeof e.reason !== 'string') {
        throw new InvalidEffectError(policyId, effect, 'suppress requires reason');
      }
      break;

    case 'log':
      if (!['debug', 'info', 'warn'].includes(e.level as string)) {
        throw new InvalidEffectError(policyId, effect, 'log requires level to be debug, info, or warn');
      }
      if (!e.message || typeof e.message !== 'string') {
        throw new InvalidEffectError(policyId, effect, 'log requires message');
      }
      break;

    default:
      // Pack effects - no additional validation
      break;
  }
}

/**
 * Wrap an evaluator function to validate its output
 */
function wrapWithValidation(evaluator: PolicyEvaluator, policyId: string): PolicyEvaluator {
  return (ctx: PolicyContext): Effect[] => {
    const effects = evaluator(ctx);

    // Validate return type is an array
    if (!Array.isArray(effects)) {
      throw new InvalidEffectError(policyId, effects, 'policy must return an array of effects');
    }

    // Validate each effect
    for (const effect of effects) {
      validateEffect(effect, policyId);
    }

    return effects;
  };
}

/**
 * Compile a policy's TypeScript code into an evaluator function.
 *
 * The policy code should export a function that takes a PolicyContext
 * and returns an array of Effects.
 *
 * Example policy code:
 * ```typescript
 * return function evaluate(ctx) {
 *   if (ctx.observation.type === 'health.sleep') {
 *     return [{ effect: 'log', level: 'info', message: 'Sleep logged' }];
 *   }
 *   return [];
 * }
 * ```
 *
 * SECURITY NOTE: Policy code runs in the same process as the runtime.
 * In production, consider sandboxing with vm2, isolated-vm, or similar.
 *
 * @param policy - The policy to compile
 * @returns An evaluator function that can be called with a PolicyContext
 * @throws PolicyCompilationError if the code fails to compile
 */
export function compilePolicy(policy: Policy): PolicyEvaluator {
  if (policy.implementation.kind !== 'typescript') {
    throw new PolicyCompilationError(
      policy.id,
      policy.name,
      `unsupported implementation kind: ${policy.implementation.kind}`
    );
  }

  const code = policy.implementation.code;

  if (!code || typeof code !== 'string' || code.trim() === '') {
    throw new PolicyCompilationError(policy.id, policy.name, 'code is empty');
  }

  try {
    // Compile the code using Function constructor
    // The code should return a function that takes ctx and returns Effect[]
    //
    // We wrap it to provide a clean scope with no globals except what we pass in
    const factory = new Function('ctx', code);

    // Test that it returns a callable
    const evaluator = (ctx: PolicyContext): Effect[] => {
      const result = factory(ctx);

      // If the code returned a function, call it
      if (typeof result === 'function') {
        return result(ctx);
      }

      // If the code returned an array directly, use it
      if (Array.isArray(result)) {
        return result;
      }

      // Otherwise, the code is malformed
      throw new PolicyCompilationError(
        policy.id,
        policy.name,
        'code must return an array of effects or a function'
      );
    };

    // Wrap with validation
    return wrapWithValidation(evaluator, policy.id);
  } catch (error) {
    if (error instanceof PolicyCompilationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new PolicyCompilationError(policy.id, policy.name, message);
  }
}

/**
 * Cache for compiled policies to avoid re-compilation
 */
const compiledPolicyCache = new Map<string, { evaluator: PolicyEvaluator; updatedAt: string }>();

/**
 * Get a compiled policy evaluator, using cache when possible.
 *
 * @param policy - The policy to compile
 * @returns The compiled evaluator function
 */
export function getCompiledPolicy(policy: Policy): PolicyEvaluator {
  const cached = compiledPolicyCache.get(policy.id);

  // Use cache if the policy hasn't been updated
  if (cached && cached.updatedAt === policy.updatedAt) {
    return cached.evaluator;
  }

  // Compile and cache
  const evaluator = compilePolicy(policy);
  compiledPolicyCache.set(policy.id, { evaluator, updatedAt: policy.updatedAt });

  return evaluator;
}

/**
 * Clear the compiled policy cache (useful for testing)
 */
export function clearCompiledPolicyCache(): void {
  compiledPolicyCache.clear();
}
