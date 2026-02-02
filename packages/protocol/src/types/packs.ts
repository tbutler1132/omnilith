// Pack types - extension system for the Omnilith Protocol
//
// Packs bundle sensors, policies, actions, entity types, and block types.
// They are protocol-compliant extensions that can be loaded at runtime.
//
// Naming conventions:
// - Pack names: lowercase, alphanumeric with dashes (e.g., "finance", "health-tracker")
// - Effect types: pack:packname:actionname (e.g., "pack:finance:categorize")
// - Action types: pack:packname:actiontype (e.g., "pack:finance:sync_transactions")
// - Entity types: pack.packname.typename (e.g., "pack.finance.transaction")
// - Block types: packname/blocktype (e.g., "finance/chart")

import type { Id, Timestamp } from './common.js';
import type { RiskLevel } from './nodes.js';

/**
 * Semantic version string (major.minor.patch)
 */
export type SemVer = `${number}.${number}.${number}`;

/**
 * Pack dependency specification
 */
export type PackDependency = {
  /**
   * Name of the required pack
   */
  name: string;

  /**
   * Minimum required version (inclusive)
   */
  minVersion?: SemVer;

  /**
   * Maximum compatible version (exclusive)
   */
  maxVersion?: SemVer;

  /**
   * Whether this dependency is optional
   * Optional dependencies are loaded if available but not required
   */
  optional?: boolean;
};

/**
 * Pack manifest - metadata and dependencies
 */
export type PackManifest = {
  /**
   * Unique pack identifier (lowercase, alphanumeric with dashes)
   */
  name: string;

  /**
   * Semantic version
   */
  version: SemVer;

  /**
   * Human-readable title
   */
  title: string;

  /**
   * Pack description
   */
  description?: string;

  /**
   * Pack author
   */
  author?: string;

  /**
   * License identifier (e.g., "MIT", "Apache-2.0")
   */
  license?: string;

  /**
   * Pack homepage URL
   */
  homepage?: string;

  /**
   * Other packs this pack depends on
   */
  dependencies?: PackDependency[];

  /**
   * Minimum Omnilith Protocol version required
   */
  protocolVersion?: SemVer;
};

/**
 * Sensor definition - how observations are ingested
 */
export type PackSensorDefinition = {
  /**
   * Sensor type identifier (namespaced: pack.packname.sensortype)
   */
  sensorType: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Description of what this sensor does
   */
  description?: string;

  /**
   * Observation types this sensor produces
   */
  observationTypes: string[];

  /**
   * Configuration schema for the sensor
   */
  configSchema?: Record<string, unknown>;
};

/**
 * Policy template definition - reusable policy patterns
 */
export type PackPolicyDefinition = {
  /**
   * Policy template identifier
   */
  templateId: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Description of what this policy does
   */
  description?: string;

  /**
   * Default observation types this policy responds to
   */
  defaultTriggers: string[];

  /**
   * Default priority (can be overridden)
   */
  defaultPriority?: number;

  /**
   * The policy implementation code
   */
  implementation: {
    kind: 'typescript';
    code: string;
  };

  /**
   * Configuration schema for customizing the policy
   */
  configSchema?: Record<string, unknown>;
};

/**
 * Action definition - what actions can be proposed
 */
export type PackActionDefinition = {
  /**
   * Action type identifier (namespaced: pack:packname:actiontype)
   */
  actionType: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Description of what this action does
   */
  description?: string;

  /**
   * Risk level for this action
   */
  riskLevel: RiskLevel;

  /**
   * JSON schema for action parameters
   */
  paramsSchema?: Record<string, unknown>;
};

/**
 * Effect definition - custom effects the pack provides
 */
export type PackEffectDefinition = {
  /**
   * Effect type identifier (namespaced: pack:packname:effectname)
   */
  effectType: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Description of what this effect does
   */
  description?: string;

  /**
   * JSON schema for effect payload
   */
  payloadSchema?: Record<string, unknown>;
};

/**
 * Entity type definition - durable referent schemas
 */
export type PackEntityTypeDefinition = {
  /**
   * Entity type name (namespaced: pack.packname.typename)
   */
  typeName: string;

  /**
   * Human-readable title
   */
  title: string;

  /**
   * Description of this entity type
   */
  description?: string;

  /**
   * JSON schema for entity fields
   */
  schema: Record<string, unknown>;

  /**
   * Event types this entity supports
   */
  eventTypes?: string[];
};

/**
 * Block type definition - custom content blocks
 */
export type PackBlockDefinition = {
  /**
   * Block type identifier (namespaced: packname/blocktype)
   */
  blockType: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Description of this block type
   */
  description?: string;

  /**
   * JSON schema for block content
   */
  contentSchema?: Record<string, unknown>;

  /**
   * Whether this block can have children
   */
  allowChildren?: boolean;
};

/**
 * Variable template - predefined variable configurations
 */
export type PackVariableTemplate = {
  /**
   * Template identifier
   */
  templateId: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Variable key prefix (namespaced: pack.packname.key)
   */
  keyPrefix: string;

  /**
   * Variable kind
   */
  kind: 'continuous' | 'ordinal' | 'categorical' | 'boolean';

  /**
   * Default unit
   */
  unit?: string;

  /**
   * Description
   */
  description?: string;

  /**
   * Suggested viable range
   */
  suggestedViableRange?: {
    min?: number;
    max?: number;
  };

  /**
   * Suggested preferred range
   */
  suggestedPreferredRange?: {
    min?: number;
    max?: number;
  };
};

/**
 * Pack contents - all the extensions bundled in a pack
 */
export type PackContents = {
  /**
   * Sensor definitions
   */
  sensors?: PackSensorDefinition[];

  /**
   * Policy templates
   */
  policies?: PackPolicyDefinition[];

  /**
   * Action definitions
   */
  actions?: PackActionDefinition[];

  /**
   * Custom effect definitions
   */
  effects?: PackEffectDefinition[];

  /**
   * Entity type definitions
   */
  entityTypes?: PackEntityTypeDefinition[];

  /**
   * Block type definitions
   */
  blockTypes?: PackBlockDefinition[];

  /**
   * Variable templates
   */
  variableTemplates?: PackVariableTemplate[];
};

/**
 * A Pack bundles extensions to the Omnilith Protocol.
 *
 * Packs are the primary extension mechanism. They can define:
 * - Sensors for observation ingestion
 * - Policy templates for reusable regulatory logic
 * - Actions for external interactions
 * - Effects for custom policy outputs
 * - Entity types for domain-specific referents
 * - Block types for custom content structures
 * - Variable templates for common measurement patterns
 *
 * All pack-defined types use namespaced identifiers to avoid collisions:
 * - Effects: pack:packname:effectname
 * - Actions: pack:packname:actiontype
 * - Entity types: pack.packname.typename
 * - Block types: packname/blocktype
 */
export type Pack = {
  /**
   * Pack manifest (metadata and dependencies)
   */
  manifest: PackManifest;

  /**
   * Pack contents (all extensions)
   */
  contents: PackContents;
};

/**
 * Pack load status
 */
export type PackStatus = 'unloaded' | 'loading' | 'loaded' | 'error';

/**
 * Loaded pack state (runtime information)
 */
export type LoadedPack = {
  /**
   * The pack definition
   */
  pack: Pack;

  /**
   * Current status
   */
  status: PackStatus;

  /**
   * Error message if status is 'error'
   */
  error?: string;

  /**
   * When the pack was loaded
   */
  loadedAt?: Timestamp;

  /**
   * Resolved dependency graph
   */
  resolvedDependencies?: string[];
};

/**
 * Pack registry entry
 */
export type PackRegistryEntry = {
  /**
   * Pack name (unique identifier)
   */
  name: string;

  /**
   * Pack version
   */
  version: SemVer;

  /**
   * Pack manifest
   */
  manifest: PackManifest;

  /**
   * Whether the pack is currently loaded
   */
  loaded: boolean;

  /**
   * When the pack was registered
   */
  registeredAt: Timestamp;
};

// -----------------------------------------------------------------------------
// Utility type guards
// -----------------------------------------------------------------------------

/**
 * Check if a string matches the pack name format (lowercase alphanumeric with dashes)
 */
export function isValidPackName(name: string): boolean {
  return /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/.test(name);
}

/**
 * Check if a string is a valid semantic version
 */
export function isValidSemVer(version: string): version is SemVer {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Parse a semantic version into components
 */
export function parseSemVer(
  version: SemVer
): { major: number; minor: number; patch: number } {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

/**
 * Compare two semantic versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareSemVer(a: SemVer, b: SemVer): -1 | 0 | 1 {
  const av = parseSemVer(a);
  const bv = parseSemVer(b);

  if (av.major !== bv.major) return av.major < bv.major ? -1 : 1;
  if (av.minor !== bv.minor) return av.minor < bv.minor ? -1 : 1;
  if (av.patch !== bv.patch) return av.patch < bv.patch ? -1 : 1;
  return 0;
}

/**
 * Check if a version satisfies a dependency requirement
 */
export function satisfiesDependency(
  version: SemVer,
  dependency: PackDependency
): boolean {
  if (dependency.minVersion) {
    if (compareSemVer(version, dependency.minVersion) < 0) {
      return false;
    }
  }
  if (dependency.maxVersion) {
    if (compareSemVer(version, dependency.maxVersion) >= 0) {
      return false;
    }
  }
  return true;
}

/**
 * Create a namespaced effect type for a pack
 */
export function packEffectType(packName: string, effectName: string): string {
  return `pack:${packName}:${effectName}`;
}

/**
 * Create a namespaced action type for a pack
 */
export function packActionType(packName: string, actionName: string): string {
  return `pack:${packName}:${actionName}`;
}

/**
 * Create a namespaced entity type for a pack
 */
export function packEntityType(packName: string, typeName: string): string {
  return `pack.${packName}.${typeName}`;
}

/**
 * Create a namespaced block type for a pack
 */
export function packBlockType(packName: string, blockName: string): string {
  return `${packName}/${blockName}`;
}

/**
 * Parse a pack-namespaced effect type
 */
export function parsePackEffectType(
  effectType: string
): { packName: string; effectName: string } | null {
  if (!effectType.startsWith('pack:')) return null;
  const parts = effectType.split(':');
  if (parts.length !== 3) return null;
  return { packName: parts[1], effectName: parts[2] };
}

/**
 * Parse a pack-namespaced action type
 */
export function parsePackActionType(
  actionType: string
): { packName: string; actionName: string } | null {
  if (!actionType.startsWith('pack:')) return null;
  const parts = actionType.split(':');
  if (parts.length !== 3) return null;
  return { packName: parts[1], actionName: parts[2] };
}

/**
 * Parse a pack-namespaced entity type
 */
export function parsePackEntityType(
  entityType: string
): { packName: string; typeName: string } | null {
  if (!entityType.startsWith('pack.')) return null;
  const parts = entityType.split('.');
  if (parts.length !== 3) return null;
  return { packName: parts[1], typeName: parts[2] };
}

/**
 * Parse a pack-namespaced block type
 */
export function parsePackBlockType(
  blockType: string
): { packName: string; blockName: string } | null {
  if (!blockType.includes('/')) return null;
  const parts = blockType.split('/');
  if (parts.length !== 2) return null;
  return { packName: parts[0], blockName: parts[1] };
}
