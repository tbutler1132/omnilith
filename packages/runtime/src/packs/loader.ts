// Pack Loader - discover, validate, and load packs
//
// This implements Phase 11.2 of the implementation plan:
// - Pack discovery from filesystem or provided list
// - Dependency resolution using topological sort
// - Batch loading with proper ordering

import type { Pack, PackManifest } from '@omnilith/protocol';
import { validatePack, type PackValidationResult } from '@omnilith/protocol';
import {
  packRegistry,
  resolveLoadOrder,
  type PackRegistrationContext,
  PackNotFoundError,
  PackDependencyError,
  PackCircularDependencyError,
} from './registry.js';

// --- Error Types ---

/**
 * Error during pack loading
 */
export class PackLoadError extends Error {
  readonly code = 'PACK_LOAD_ERROR';
  readonly packName: string;
  readonly phase: 'validation' | 'dependency' | 'registration';
  readonly cause?: Error;

  constructor(
    packName: string,
    phase: 'validation' | 'dependency' | 'registration',
    message: string,
    cause?: Error
  ) {
    super(`Failed to load pack ${packName} during ${phase}: ${message}`);
    this.name = 'PackLoadError';
    this.packName = packName;
    this.phase = phase;
    this.cause = cause;
  }
}

/**
 * Error when pack discovery fails
 */
export class PackDiscoveryError extends Error {
  readonly code = 'PACK_DISCOVERY_ERROR';
  readonly path?: string;
  readonly cause?: Error;

  constructor(message: string, path?: string, cause?: Error) {
    super(message);
    this.name = 'PackDiscoveryError';
    this.path = path;
    this.cause = cause;
  }
}

// --- Types ---

/**
 * Result of loading a single pack
 */
export type PackLoadResult = {
  packName: string;
  success: boolean;
  error?: string;
  validationResult?: PackValidationResult;
};

/**
 * Result of loading multiple packs
 */
export type BatchLoadResult = {
  /** Successfully loaded packs */
  loaded: string[];

  /** Packs that failed to load */
  failed: PackLoadResult[];

  /** Load order used */
  loadOrder: string[];

  /** Total time in milliseconds */
  totalTimeMs: number;
};

/**
 * Options for pack loading
 */
export type LoadPackOptions = {
  /** Skip validation (not recommended for production) */
  skipValidation?: boolean;

  /** Strict naming convention enforcement */
  strictNaming?: boolean;

  /** Validate JSON schemas in definitions */
  validateSchemas?: boolean;

  /** Registration context for registering pack extensions */
  context?: PackRegistrationContext;
};

/**
 * Options for batch pack loading
 */
export type BatchLoadOptions = LoadPackOptions & {
  /** Continue loading remaining packs even if one fails */
  continueOnError?: boolean;

  /** Load packs in parallel (within dependency constraints) */
  parallel?: boolean;
};

// --- Pack Loading ---

/**
 * Validate and load a single pack.
 *
 * @param pack - The pack to load
 * @param options - Load options
 * @returns Load result
 */
export function loadPack(pack: Pack, options: LoadPackOptions = {}): PackLoadResult {
  const packName = pack.manifest.name;

  // Validate pack
  if (!options.skipValidation) {
    const validationResult = validatePack(pack, {
      strictNaming: options.strictNaming,
      validateSchemas: options.validateSchemas,
    });

    if (!validationResult.valid) {
      return {
        packName,
        success: false,
        error: `Validation failed: ${validationResult.errors.map((e) => e.message).join('; ')}`,
        validationResult,
      };
    }
  }

  // Register pack
  try {
    packRegistry.register(pack);
  } catch (error) {
    if (error instanceof Error && error.message.includes('already loaded')) {
      // Pack already loaded is not an error
      return { packName, success: true };
    }
    return {
      packName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Load pack (register extensions)
  try {
    packRegistry.loadPack(packName, options.context);
    return { packName, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      packName,
      success: false,
      error: message,
    };
  }
}

/**
 * Load multiple packs with dependency resolution.
 *
 * Packs are loaded in dependency order (dependencies first).
 *
 * @param packs - Array of packs to load
 * @param options - Load options
 * @returns Batch load result
 */
export function loadPacks(packs: Pack[], options: BatchLoadOptions = {}): BatchLoadResult {
  const startTime = Date.now();
  const loaded: string[] = [];
  const failed: PackLoadResult[] = [];

  // Resolve load order
  let orderedPacks: Pack[];
  try {
    orderedPacks = resolveLoadOrder(packs);
  } catch (error) {
    if (error instanceof PackCircularDependencyError) {
      // All packs fail due to circular dependency
      for (const pack of packs) {
        failed.push({
          packName: pack.manifest.name,
          success: false,
          error: error.message,
        });
      }
      return {
        loaded: [],
        failed,
        loadOrder: [],
        totalTimeMs: Date.now() - startTime,
      };
    }
    throw error;
  }

  const loadOrder = orderedPacks.map((p) => p.manifest.name);

  // Load packs in order
  for (const pack of orderedPacks) {
    const result = loadPack(pack, options);

    if (result.success) {
      loaded.push(result.packName);
    } else {
      failed.push(result);

      if (!options.continueOnError) {
        // Add remaining packs as skipped
        const remaining = orderedPacks.slice(orderedPacks.indexOf(pack) + 1);
        for (const p of remaining) {
          failed.push({
            packName: p.manifest.name,
            success: false,
            error: `Skipped due to earlier failure: ${result.packName}`,
          });
        }
        break;
      }
    }
  }

  return {
    loaded,
    failed,
    loadOrder,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Unload a pack and its dependents.
 *
 * @param packName - Name of the pack to unload
 * @param options - Options including registration context
 * @returns Names of packs that were unloaded
 */
export function unloadPack(
  packName: string,
  options: { context?: PackRegistrationContext; unloadDependents?: boolean } = {}
): string[] {
  const unloaded: string[] = [];

  if (options.unloadDependents) {
    // Find packs that depend on this one
    const dependents = findDependents(packName);

    // Unload in reverse order (dependents first)
    for (const dependent of dependents.reverse()) {
      packRegistry.unloadPack(dependent, options.context);
      unloaded.push(dependent);
    }
  }

  packRegistry.unloadPack(packName, options.context);
  unloaded.push(packName);

  return unloaded;
}

/**
 * Find all packs that depend on a given pack.
 */
export function findDependents(packName: string): string[] {
  const dependents: string[] = [];

  for (const loadedPack of packRegistry.getAll()) {
    const deps = loadedPack.pack.manifest.dependencies ?? [];
    if (deps.some((d) => d.name === packName)) {
      dependents.push(loadedPack.pack.manifest.name);
    }
  }

  return dependents;
}

/**
 * Check if a pack can be loaded (all dependencies satisfied).
 */
export function canLoadPack(pack: Pack): {
  canLoad: boolean;
  missingDependencies: string[];
  incompatibleDependencies: string[];
} {
  const check = packRegistry.checkDependencies(pack.manifest);
  return {
    canLoad: check.satisfied,
    missingDependencies: check.missing,
    incompatibleDependencies: check.incompatible.map((i) => i.name),
  };
}

/**
 * Get all available packs (registered but not necessarily loaded).
 */
export function getAvailablePacks(): PackManifest[] {
  return packRegistry.getAll().map((p) => p.pack.manifest);
}

/**
 * Get all loaded packs.
 */
export function getLoadedPacks(): PackManifest[] {
  return packRegistry
    .getAll()
    .filter((p) => p.status === 'loaded')
    .map((p) => p.pack.manifest);
}

// --- Pack Discovery ---

/**
 * Pack source - where to load packs from
 */
export type PackSource =
  | { type: 'inline'; packs: Pack[] }
  | { type: 'manifest'; manifests: Array<{ manifest: PackManifest; loader: () => Promise<Pack> }> };

/**
 * Create a pack from a manifest and contents.
 *
 * This is a convenience function for creating packs programmatically.
 */
export function createPack(
  manifest: Omit<PackManifest, 'name' | 'version' | 'title'> & {
    name: string;
    version: `${number}.${number}.${number}`;
    title: string;
  },
  contents: Pack['contents'] = {}
): Pack {
  return {
    manifest: manifest as PackManifest,
    contents,
  };
}

/**
 * Create an empty pack with just a manifest.
 *
 * Useful for declaring dependencies or creating placeholder packs.
 */
export function createEmptyPack(
  name: string,
  version: `${number}.${number}.${number}`,
  title: string
): Pack {
  return {
    manifest: {
      name,
      version,
      title,
    },
    contents: {},
  };
}

// --- Re-exports ---

export {
  packRegistry,
  resolveLoadOrder,
  PackNotFoundError,
  PackDependencyError,
  PackCircularDependencyError,
  type PackRegistrationContext,
} from './registry.js';
