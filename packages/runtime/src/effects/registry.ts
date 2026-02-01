// Effect handler registry - maps effect types to handlers

import type { Effect } from '@omnilith/protocol';
import type { EffectHandler } from './types.js';

/**
 * Registry for effect handlers.
 * Maps effect type strings to handler functions.
 *
 * Built-in effect types are registered by default.
 * Pack effects can be registered at runtime using the `pack:name:action` format.
 */
class EffectHandlerRegistry {
  private handlers = new Map<string, EffectHandler>();

  /**
   * Register a handler for an effect type.
   *
   * @param effectType - The effect type (e.g., 'log', 'pack:mypack:custom')
   * @param handler - The handler function
   * @throws Error if handler already registered (use forceRegister to override)
   */
  register<T extends Effect>(effectType: string, handler: EffectHandler<T>): void {
    if (this.handlers.has(effectType)) {
      throw new Error(`Effect handler already registered for type: ${effectType}`);
    }
    this.handlers.set(effectType, handler as EffectHandler);
  }

  /**
   * Register a handler, overwriting any existing handler.
   * Use with caution - primarily for testing.
   */
  forceRegister<T extends Effect>(effectType: string, handler: EffectHandler<T>): void {
    this.handlers.set(effectType, handler as EffectHandler);
  }

  /**
   * Unregister a handler for an effect type.
   *
   * @param effectType - The effect type to unregister
   * @returns true if a handler was removed, false if none existed
   */
  unregister(effectType: string): boolean {
    return this.handlers.delete(effectType);
  }

  /**
   * Get the handler for an effect type.
   *
   * @param effectType - The effect type to look up
   * @returns The handler, or undefined if not registered
   */
  get(effectType: string): EffectHandler | undefined {
    return this.handlers.get(effectType);
  }

  /**
   * Check if a handler is registered for an effect type.
   */
  has(effectType: string): boolean {
    return this.handlers.has(effectType);
  }

  /**
   * Get all registered effect types.
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers. Primarily for testing.
   */
  clear(): void {
    this.handlers.clear();
  }
}

/**
 * Global effect handler registry.
 * Built-in handlers are registered automatically when the module loads.
 */
export const effectRegistry = new EffectHandlerRegistry();

/**
 * Check if an effect type is a pack effect (namespaced format).
 * Pack effects follow the pattern: pack:packname:actionname
 */
export function isPackEffect(effectType: string): boolean {
  return effectType.startsWith('pack:');
}

/**
 * Parse a pack effect type into its components.
 *
 * @param effectType - The full effect type string
 * @returns Parsed components or null if not a valid pack effect
 */
export function parsePackEffect(
  effectType: string
): { packName: string; actionName: string } | null {
  if (!isPackEffect(effectType)) {
    return null;
  }

  const parts = effectType.split(':');
  if (parts.length !== 3) {
    return null;
  }

  return {
    packName: parts[1],
    actionName: parts[2],
  };
}

/**
 * Create a namespaced effect type for a pack.
 *
 * @param packName - The pack name
 * @param actionName - The action name within the pack
 * @returns The full effect type string
 */
export function packEffectType(packName: string, actionName: string): string {
  return `pack:${packName}:${actionName}`;
}
