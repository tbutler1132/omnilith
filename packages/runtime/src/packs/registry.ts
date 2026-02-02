// Pack Registry - manages loaded packs and their registrations
//
// This implements Phase 11.2 of the implementation plan:
// - PackRegistry: Central registry for all loaded packs
// - Registration of pack actions, effects, entity types, etc.
// - Dependency tracking and status management

import type {
  Pack,
  PackManifest,
  LoadedPack,
  PackStatus,
  PackActionDefinition,
  PackEffectDefinition,
  PackEntityTypeDefinition,
  PackBlockDefinition,
  PackPolicyDefinition,
  PackSensorDefinition,
  PackVariableTemplate,
  SemVer,
  PackDependency,
} from '@omnilith/protocol';
import {
  satisfiesDependency,
  packEffectType as createPackEffectType,
  packActionType as createPackActionType,
} from '@omnilith/protocol';
import type { ActionHandler } from '../actions/index.js';
import type { ActionDefinition } from '@omnilith/protocol';

/**
 * Extended action registry that supports registration.
 * This is the type returned by createActionRegistry().
 */
export type MutableActionRegistry = {
  get(actionType: string): ActionDefinition | undefined;
  getHandler(actionType: string): ActionHandler | undefined;
  has(actionType: string): boolean;
  register(definition: ActionDefinition, handler: ActionHandler): void;
  unregister?(actionType: string): void;
};
import { effectRegistry, type EffectHandler } from '../effects/index.js';

// --- Error Types ---

/**
 * Error when a pack is not found
 */
export class PackNotFoundError extends Error {
  readonly code = 'PACK_NOT_FOUND';
  readonly packName: string;

  constructor(packName: string) {
    super(`Pack not found: ${packName}`);
    this.name = 'PackNotFoundError';
    this.packName = packName;
  }
}

/**
 * Error when a pack is already loaded
 */
export class PackAlreadyLoadedError extends Error {
  readonly code = 'PACK_ALREADY_LOADED';
  readonly packName: string;

  constructor(packName: string) {
    super(`Pack already loaded: ${packName}`);
    this.name = 'PackAlreadyLoadedError';
    this.packName = packName;
  }
}

/**
 * Error when pack dependencies are not satisfied
 */
export class PackDependencyError extends Error {
  readonly code = 'PACK_DEPENDENCY_ERROR';
  readonly packName: string;
  readonly missingDependencies: string[];

  constructor(packName: string, missingDependencies: string[]) {
    super(
      `Pack ${packName} has unmet dependencies: ${missingDependencies.join(', ')}`
    );
    this.name = 'PackDependencyError';
    this.packName = packName;
    this.missingDependencies = missingDependencies;
  }
}

/**
 * Error when pack version is incompatible
 */
export class PackVersionError extends Error {
  readonly code = 'PACK_VERSION_ERROR';
  readonly packName: string;
  readonly required: PackDependency;
  readonly actual: SemVer;

  constructor(packName: string, required: PackDependency, actual: SemVer) {
    const versionRange = required.minVersion
      ? required.maxVersion
        ? `>=${required.minVersion} <${required.maxVersion}`
        : `>=${required.minVersion}`
      : required.maxVersion
        ? `<${required.maxVersion}`
        : 'any';
    super(
      `Pack ${packName} version ${actual} does not satisfy requirement ${versionRange}`
    );
    this.name = 'PackVersionError';
    this.packName = packName;
    this.required = required;
    this.actual = actual;
  }
}

/**
 * Error when there's a circular dependency
 */
export class PackCircularDependencyError extends Error {
  readonly code = 'PACK_CIRCULAR_DEPENDENCY';
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'PackCircularDependencyError';
    this.cycle = cycle;
  }
}

// --- Registry Types ---

/**
 * Registration context for a pack
 */
export type PackRegistrationContext = {
  /** Action registry to register pack actions with (must support register method) */
  actionRegistry?: MutableActionRegistry;

  /** Action handlers for pack actions (keyed by action name, not full type) */
  actionHandlers?: Record<string, ActionHandler>;

  /** Effect handlers for pack effects (keyed by effect name, not full type) */
  effectHandlers?: Record<string, EffectHandler>;
};

/**
 * Handler for entity type registration (to be implemented by the consumer)
 */
export type EntityTypeRegistrationHandler = (
  definition: PackEntityTypeDefinition
) => void;

/**
 * Handler for block type registration (to be implemented by the consumer)
 */
export type BlockTypeRegistrationHandler = (
  definition: PackBlockDefinition
) => void;

/**
 * Handler for sensor registration
 */
export type SensorRegistrationHandler = (
  definition: PackSensorDefinition
) => void;

/**
 * Handler for policy template registration
 */
export type PolicyTemplateRegistrationHandler = (
  definition: PackPolicyDefinition
) => void;

/**
 * Handler for variable template registration
 */
export type VariableTemplateRegistrationHandler = (
  definition: PackVariableTemplate
) => void;

/**
 * Extension handlers that consumers can register
 */
export type PackExtensionHandlers = {
  onEntityTypeRegistered?: EntityTypeRegistrationHandler;
  onBlockTypeRegistered?: BlockTypeRegistrationHandler;
  onSensorRegistered?: SensorRegistrationHandler;
  onPolicyTemplateRegistered?: PolicyTemplateRegistrationHandler;
  onVariableTemplateRegistered?: VariableTemplateRegistrationHandler;
};

// --- Pack Registry ---

/**
 * Registry for loaded packs.
 *
 * The PackRegistry is responsible for:
 * - Tracking which packs are loaded
 * - Managing pack dependencies
 * - Providing registration context for pack extensions
 *
 * The registry integrates with:
 * - effectRegistry (global) for effect handlers
 * - ActionRegistry (provided) for action handlers
 * - Extension handlers for entity types, block types, etc.
 */
class PackRegistry {
  private packs = new Map<string, LoadedPack>();
  private extensionHandlers: PackExtensionHandlers = {};

  // Track registrations for cleanup
  private registrations = new Map<
    string,
    {
      effects: string[];
      actions: string[];
      entityTypes: string[];
      blockTypes: string[];
      sensors: string[];
      policyTemplates: string[];
      variableTemplates: string[];
    }
  >();

  /**
   * Set extension handlers for pack registrations.
   */
  setExtensionHandlers(handlers: PackExtensionHandlers): void {
    this.extensionHandlers = { ...this.extensionHandlers, ...handlers };
  }

  /**
   * Check if a pack is loaded.
   */
  has(packName: string): boolean {
    const pack = this.packs.get(packName);
    return pack?.status === 'loaded';
  }

  /**
   * Get a loaded pack by name.
   */
  get(packName: string): LoadedPack | undefined {
    return this.packs.get(packName);
  }

  /**
   * Get all loaded packs.
   */
  getAll(): LoadedPack[] {
    return Array.from(this.packs.values());
  }

  /**
   * Get pack manifest by name.
   */
  getManifest(packName: string): PackManifest | undefined {
    return this.packs.get(packName)?.pack.manifest;
  }

  /**
   * Get pack version by name.
   */
  getVersion(packName: string): SemVer | undefined {
    return this.packs.get(packName)?.pack.manifest.version;
  }

  /**
   * Get all loaded pack names.
   */
  getLoadedPackNames(): string[] {
    return Array.from(this.packs.entries())
      .filter(([, p]) => p.status === 'loaded')
      .map(([name]) => name);
  }

  /**
   * Check if all dependencies for a pack are satisfied.
   */
  checkDependencies(manifest: PackManifest): {
    satisfied: boolean;
    missing: string[];
    incompatible: Array<{ name: string; required: PackDependency; actual: SemVer }>;
  } {
    const missing: string[] = [];
    const incompatible: Array<{
      name: string;
      required: PackDependency;
      actual: SemVer;
    }> = [];

    for (const dep of manifest.dependencies ?? []) {
      const loadedPack = this.packs.get(dep.name);

      if (!loadedPack || loadedPack.status !== 'loaded') {
        if (!dep.optional) {
          missing.push(dep.name);
        }
        continue;
      }

      const version = loadedPack.pack.manifest.version;
      if (!satisfiesDependency(version, dep)) {
        incompatible.push({
          name: dep.name,
          required: dep,
          actual: version,
        });
      }
    }

    return {
      satisfied: missing.length === 0 && incompatible.length === 0,
      missing,
      incompatible,
    };
  }

  /**
   * Register a pack.
   *
   * This does not load the pack - it just marks it as available.
   * Use loadPack() to actually register the pack's extensions.
   */
  register(pack: Pack): void {
    const existing = this.packs.get(pack.manifest.name);
    if (existing?.status === 'loaded') {
      throw new PackAlreadyLoadedError(pack.manifest.name);
    }

    this.packs.set(pack.manifest.name, {
      pack,
      status: 'unloaded',
    });
  }

  /**
   * Load a pack and register all its extensions.
   *
   * @param packName - The name of a registered pack to load
   * @param context - Registration context with action registry and handlers
   * @throws PackNotFoundError if pack is not registered
   * @throws PackDependencyError if dependencies are not satisfied
   */
  loadPack(packName: string, context: PackRegistrationContext = {}): void {
    const entry = this.packs.get(packName);
    if (!entry) {
      throw new PackNotFoundError(packName);
    }

    if (entry.status === 'loaded') {
      return; // Already loaded
    }

    // Check dependencies
    const depCheck = this.checkDependencies(entry.pack.manifest);
    if (!depCheck.satisfied) {
      entry.status = 'error';
      entry.error = `Unmet dependencies: ${[
        ...depCheck.missing,
        ...depCheck.incompatible.map((i) => `${i.name} (version mismatch)`),
      ].join(', ')}`;
      throw new PackDependencyError(packName, [
        ...depCheck.missing,
        ...depCheck.incompatible.map((i) => i.name),
      ]);
    }

    // Set status to loading
    entry.status = 'loading';

    // Track registrations for this pack
    const registrations = {
      effects: [] as string[],
      actions: [] as string[],
      entityTypes: [] as string[],
      blockTypes: [] as string[],
      sensors: [] as string[],
      policyTemplates: [] as string[],
      variableTemplates: [] as string[],
    };

    try {
      const { pack } = entry;
      const { contents } = pack;

      // Register effects
      if (contents.effects && context.effectHandlers) {
        for (const effectDef of contents.effects) {
          const handler = context.effectHandlers[effectDef.effectType];
          // Also try unprefixed name
          const unprefixedHandler =
            handler ?? context.effectHandlers[effectDef.effectType.split(':').pop()!];
          if (unprefixedHandler) {
            effectRegistry.register(effectDef.effectType, unprefixedHandler);
            registrations.effects.push(effectDef.effectType);
          }
        }
      }

      // Register actions
      if (contents.actions && context.actionRegistry && context.actionHandlers) {
        for (const actionDef of contents.actions) {
          const handler = context.actionHandlers[actionDef.actionType];
          // Also try unprefixed name
          const unprefixedHandler =
            handler ?? context.actionHandlers[actionDef.actionType.split(':').pop()!];
          if (unprefixedHandler) {
            context.actionRegistry.register(
              {
                actionType: actionDef.actionType,
                name: actionDef.name,
                description: actionDef.description,
                riskLevel: actionDef.riskLevel,
                paramsSchema: actionDef.paramsSchema,
              },
              unprefixedHandler
            );
            registrations.actions.push(actionDef.actionType);
          }
        }
      }

      // Register entity types
      if (contents.entityTypes) {
        for (const entityTypeDef of contents.entityTypes) {
          this.extensionHandlers.onEntityTypeRegistered?.(entityTypeDef);
          registrations.entityTypes.push(entityTypeDef.typeName);
        }
      }

      // Register block types
      if (contents.blockTypes) {
        for (const blockTypeDef of contents.blockTypes) {
          this.extensionHandlers.onBlockTypeRegistered?.(blockTypeDef);
          registrations.blockTypes.push(blockTypeDef.blockType);
        }
      }

      // Register sensors
      if (contents.sensors) {
        for (const sensorDef of contents.sensors) {
          this.extensionHandlers.onSensorRegistered?.(sensorDef);
          registrations.sensors.push(sensorDef.sensorType);
        }
      }

      // Register policy templates
      if (contents.policies) {
        for (const policyDef of contents.policies) {
          this.extensionHandlers.onPolicyTemplateRegistered?.(policyDef);
          registrations.policyTemplates.push(policyDef.templateId);
        }
      }

      // Register variable templates
      if (contents.variableTemplates) {
        for (const templateDef of contents.variableTemplates) {
          this.extensionHandlers.onVariableTemplateRegistered?.(templateDef);
          registrations.variableTemplates.push(templateDef.templateId);
        }
      }

      // Mark as loaded
      entry.status = 'loaded';
      entry.loadedAt = new Date().toISOString();
      entry.resolvedDependencies = (entry.pack.manifest.dependencies ?? [])
        .filter((d) => !d.optional || this.has(d.name))
        .map((d) => d.name);

      this.registrations.set(packName, registrations);
    } catch (error) {
      entry.status = 'error';
      entry.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Unload a pack and unregister all its extensions.
   *
   * @param packName - The name of the pack to unload
   * @param context - Registration context (needed for action registry)
   */
  unloadPack(packName: string, context: PackRegistrationContext = {}): void {
    const entry = this.packs.get(packName);
    if (!entry || entry.status !== 'loaded') {
      return;
    }

    const registrations = this.registrations.get(packName);
    if (registrations) {
      // Unregister effects
      for (const effectType of registrations.effects) {
        effectRegistry.unregister(effectType);
      }

      // Unregister actions
      if (context.actionRegistry) {
        for (const actionType of registrations.actions) {
          (context.actionRegistry as { unregister?: (type: string) => void }).unregister?.(
            actionType
          );
        }
      }

      this.registrations.delete(packName);
    }

    entry.status = 'unloaded';
    entry.loadedAt = undefined;
    entry.resolvedDependencies = undefined;
  }

  /**
   * Unregister a pack completely (remove from registry).
   */
  unregister(packName: string, context: PackRegistrationContext = {}): void {
    this.unloadPack(packName, context);
    this.packs.delete(packName);
  }

  /**
   * Clear all packs from the registry.
   */
  clear(context: PackRegistrationContext = {}): void {
    for (const packName of this.packs.keys()) {
      this.unloadPack(packName, context);
    }
    this.packs.clear();
    this.registrations.clear();
  }

  /**
   * Get registration info for a pack.
   */
  getRegistrations(packName: string):
    | {
        effects: string[];
        actions: string[];
        entityTypes: string[];
        blockTypes: string[];
        sensors: string[];
        policyTemplates: string[];
        variableTemplates: string[];
      }
    | undefined {
    return this.registrations.get(packName);
  }
}

/**
 * Global pack registry instance.
 */
export const packRegistry = new PackRegistry();

// --- Utility Functions ---

/**
 * Resolve pack load order using topological sort.
 *
 * @param packs - Array of packs to sort
 * @returns Packs in dependency order (dependencies first)
 * @throws PackCircularDependencyError if there's a circular dependency
 */
export function resolveLoadOrder(packs: Pack[]): Pack[] {
  const packMap = new Map<string, Pack>();
  for (const pack of packs) {
    packMap.set(pack.manifest.name, pack);
  }

  const sorted: Pack[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(packName: string, path: string[] = []): void {
    if (visited.has(packName)) {
      return;
    }

    if (visiting.has(packName)) {
      throw new PackCircularDependencyError([...path, packName]);
    }

    const pack = packMap.get(packName);
    if (!pack) {
      // Dependency not in provided list - assume it's already loaded or will be loaded separately
      return;
    }

    visiting.add(packName);

    for (const dep of pack.manifest.dependencies ?? []) {
      if (!dep.optional || packMap.has(dep.name)) {
        visit(dep.name, [...path, packName]);
      }
    }

    visiting.delete(packName);
    visited.add(packName);
    sorted.push(pack);
  }

  for (const pack of packs) {
    visit(pack.manifest.name);
  }

  return sorted;
}

/**
 * Create a pack effect type string.
 */
export { createPackEffectType as packEffectType };

/**
 * Create a pack action type string.
 */
export { createPackActionType as packActionType };
