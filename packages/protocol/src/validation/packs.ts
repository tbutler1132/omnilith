// Pack Validation Utilities (Phase 11.1)
//
// Validates pack manifests and contents.
// Ensures packs are well-formed before loading.

import type { PackManifest } from '../types/packs.js';
import {
  isValidPackName,
  isValidSemVer,
  packEffectType,
  packActionType,
  packEntityType,
  packBlockType,
} from '../types/packs.js';
import type { RiskLevel } from '../types/nodes.js';

/**
 * Result of validating a pack
 */
export type PackValidationResult = {
  valid: boolean;
  errors: PackValidationError[];
  warnings: PackValidationWarning[];
};

/**
 * A validation error (pack cannot be loaded)
 */
export type PackValidationError = {
  path: string;
  message: string;
  code: PackValidationErrorCode;
};

/**
 * A validation warning (pack can still be loaded but may have issues)
 */
export type PackValidationWarning = {
  path: string;
  message: string;
  code: PackValidationWarningCode;
};

/**
 * Validation error codes
 */
export type PackValidationErrorCode =
  | 'MISSING_FIELD'
  | 'INVALID_TYPE'
  | 'INVALID_VALUE'
  | 'INVALID_NAME'
  | 'INVALID_VERSION'
  | 'INVALID_NAMESPACE'
  | 'DUPLICATE_DEFINITION'
  | 'CIRCULAR_DEPENDENCY'
  | 'INVALID_SCHEMA'
  | 'INVALID_CODE';

/**
 * Validation warning codes
 */
export type PackValidationWarningCode =
  | 'MISSING_DESCRIPTION'
  | 'MISSING_SCHEMA'
  | 'DEPRECATED_FEATURE'
  | 'EMPTY_CONTENTS';

/**
 * Options for pack validation
 */
export type ValidatePackOptions = {
  /** Check for naming convention violations */
  strictNaming?: boolean;
  /** Validate JSON schemas in definitions */
  validateSchemas?: boolean;
  /** Validate policy code syntax */
  validatePolicyCode?: boolean;
};

const VALID_RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

/**
 * Validate a complete Pack.
 *
 * @param pack - The pack to validate
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export function validatePack(
  pack: unknown,
  options: ValidatePackOptions = {}
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];

  // Check pack is an object
  if (!pack || typeof pack !== 'object') {
    errors.push({
      path: 'pack',
      message: 'Pack must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const p = pack as Record<string, unknown>;

  // Validate manifest
  if (!p.manifest || typeof p.manifest !== 'object') {
    errors.push({
      path: 'pack.manifest',
      message: 'Pack must have a manifest object',
      code: 'MISSING_FIELD',
    });
  } else {
    const manifestResult = validatePackManifest(p.manifest, options);
    errors.push(...manifestResult.errors);
    warnings.push(...manifestResult.warnings);
  }

  // Validate contents
  if (!p.contents || typeof p.contents !== 'object') {
    errors.push({
      path: 'pack.contents',
      message: 'Pack must have a contents object',
      code: 'MISSING_FIELD',
    });
  } else {
    const packName = (p.manifest as PackManifest | undefined)?.name ?? 'unknown';
    const contentsResult = validatePackContents(p.contents, packName, options);
    errors.push(...contentsResult.errors);
    warnings.push(...contentsResult.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a pack manifest.
 */
export function validatePackManifest(
  manifest: unknown,
  _options: ValidatePackOptions = {}
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];
  const path = 'manifest';

  if (!manifest || typeof manifest !== 'object') {
    errors.push({
      path,
      message: 'Manifest must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const m = manifest as Record<string, unknown>;

  // Required: name
  if (typeof m.name !== 'string' || m.name.trim() === '') {
    errors.push({
      path: `${path}.name`,
      message: 'Pack must have a non-empty name',
      code: 'MISSING_FIELD',
    });
  } else if (!isValidPackName(m.name)) {
    errors.push({
      path: `${path}.name`,
      message:
        'Pack name must be lowercase alphanumeric with dashes (e.g., "my-pack")',
      code: 'INVALID_NAME',
    });
  }

  // Required: version
  if (typeof m.version !== 'string' || m.version.trim() === '') {
    errors.push({
      path: `${path}.version`,
      message: 'Pack must have a version',
      code: 'MISSING_FIELD',
    });
  } else if (!isValidSemVer(m.version)) {
    errors.push({
      path: `${path}.version`,
      message: 'Pack version must be valid semver (e.g., "1.0.0")',
      code: 'INVALID_VERSION',
    });
  }

  // Required: title
  if (typeof m.title !== 'string' || m.title.trim() === '') {
    errors.push({
      path: `${path}.title`,
      message: 'Pack must have a title',
      code: 'MISSING_FIELD',
    });
  }

  // Optional but recommended: description
  if (m.description !== undefined && typeof m.description !== 'string') {
    errors.push({
      path: `${path}.description`,
      message: 'Description must be a string',
      code: 'INVALID_TYPE',
    });
  } else if (!m.description) {
    warnings.push({
      path: `${path}.description`,
      message: 'Pack should have a description',
      code: 'MISSING_DESCRIPTION',
    });
  }

  // Optional: author
  if (m.author !== undefined && typeof m.author !== 'string') {
    errors.push({
      path: `${path}.author`,
      message: 'Author must be a string',
      code: 'INVALID_TYPE',
    });
  }

  // Optional: license
  if (m.license !== undefined && typeof m.license !== 'string') {
    errors.push({
      path: `${path}.license`,
      message: 'License must be a string',
      code: 'INVALID_TYPE',
    });
  }

  // Optional: homepage
  if (m.homepage !== undefined && typeof m.homepage !== 'string') {
    errors.push({
      path: `${path}.homepage`,
      message: 'Homepage must be a string',
      code: 'INVALID_TYPE',
    });
  }

  // Optional: dependencies
  if (m.dependencies !== undefined) {
    if (!Array.isArray(m.dependencies)) {
      errors.push({
        path: `${path}.dependencies`,
        message: 'Dependencies must be an array',
        code: 'INVALID_TYPE',
      });
    } else {
      m.dependencies.forEach((dep: unknown, index: number) => {
        const depResult = validatePackDependency(dep, `${path}.dependencies[${index}]`);
        errors.push(...depResult.errors);
        warnings.push(...depResult.warnings);
      });
    }
  }

  // Optional: protocolVersion
  if (m.protocolVersion !== undefined) {
    if (typeof m.protocolVersion !== 'string' || !isValidSemVer(m.protocolVersion)) {
      errors.push({
        path: `${path}.protocolVersion`,
        message: 'Protocol version must be valid semver',
        code: 'INVALID_VERSION',
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a pack dependency.
 */
function validatePackDependency(
  dependency: unknown,
  path: string
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];

  if (!dependency || typeof dependency !== 'object') {
    errors.push({
      path,
      message: 'Dependency must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const d = dependency as Record<string, unknown>;

  // Required: name
  if (typeof d.name !== 'string' || d.name.trim() === '') {
    errors.push({
      path: `${path}.name`,
      message: 'Dependency must have a name',
      code: 'MISSING_FIELD',
    });
  } else if (!isValidPackName(d.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'Dependency name must be a valid pack name',
      code: 'INVALID_NAME',
    });
  }

  // Optional: minVersion
  if (d.minVersion !== undefined) {
    if (typeof d.minVersion !== 'string' || !isValidSemVer(d.minVersion)) {
      errors.push({
        path: `${path}.minVersion`,
        message: 'minVersion must be valid semver',
        code: 'INVALID_VERSION',
      });
    }
  }

  // Optional: maxVersion
  if (d.maxVersion !== undefined) {
    if (typeof d.maxVersion !== 'string' || !isValidSemVer(d.maxVersion)) {
      errors.push({
        path: `${path}.maxVersion`,
        message: 'maxVersion must be valid semver',
        code: 'INVALID_VERSION',
      });
    }
  }

  // Optional: optional
  if (d.optional !== undefined && typeof d.optional !== 'boolean') {
    errors.push({
      path: `${path}.optional`,
      message: 'optional must be a boolean',
      code: 'INVALID_TYPE',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate pack contents.
 */
export function validatePackContents(
  contents: unknown,
  packName: string,
  options: ValidatePackOptions = {}
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];
  const path = 'contents';

  if (!contents || typeof contents !== 'object') {
    errors.push({
      path,
      message: 'Contents must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const c = contents as Record<string, unknown>;

  // Track all defined identifiers for duplicate detection
  const definedIds = new Set<string>();

  // Validate sensors
  if (c.sensors !== undefined) {
    if (!Array.isArray(c.sensors)) {
      errors.push({
        path: `${path}.sensors`,
        message: 'Sensors must be an array',
        code: 'INVALID_TYPE',
      });
    } else {
      c.sensors.forEach((sensor: unknown, index: number) => {
        const result = validateSensorDefinition(
          sensor,
          packName,
          `${path}.sensors[${index}]`,
          definedIds,
          options
        );
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      });
    }
  }

  // Validate policies
  if (c.policies !== undefined) {
    if (!Array.isArray(c.policies)) {
      errors.push({
        path: `${path}.policies`,
        message: 'Policies must be an array',
        code: 'INVALID_TYPE',
      });
    } else {
      c.policies.forEach((policy: unknown, index: number) => {
        const result = validatePolicyDefinition(
          policy,
          packName,
          `${path}.policies[${index}]`,
          definedIds,
          options
        );
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      });
    }
  }

  // Validate actions
  if (c.actions !== undefined) {
    if (!Array.isArray(c.actions)) {
      errors.push({
        path: `${path}.actions`,
        message: 'Actions must be an array',
        code: 'INVALID_TYPE',
      });
    } else {
      c.actions.forEach((action: unknown, index: number) => {
        const result = validateActionDefinition(
          action,
          packName,
          `${path}.actions[${index}]`,
          definedIds,
          options
        );
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      });
    }
  }

  // Validate effects
  if (c.effects !== undefined) {
    if (!Array.isArray(c.effects)) {
      errors.push({
        path: `${path}.effects`,
        message: 'Effects must be an array',
        code: 'INVALID_TYPE',
      });
    } else {
      c.effects.forEach((effect: unknown, index: number) => {
        const result = validateEffectDefinition(
          effect,
          packName,
          `${path}.effects[${index}]`,
          definedIds,
          options
        );
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      });
    }
  }

  // Validate entity types
  if (c.entityTypes !== undefined) {
    if (!Array.isArray(c.entityTypes)) {
      errors.push({
        path: `${path}.entityTypes`,
        message: 'Entity types must be an array',
        code: 'INVALID_TYPE',
      });
    } else {
      c.entityTypes.forEach((entityType: unknown, index: number) => {
        const result = validateEntityTypeDefinition(
          entityType,
          packName,
          `${path}.entityTypes[${index}]`,
          definedIds,
          options
        );
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      });
    }
  }

  // Validate block types
  if (c.blockTypes !== undefined) {
    if (!Array.isArray(c.blockTypes)) {
      errors.push({
        path: `${path}.blockTypes`,
        message: 'Block types must be an array',
        code: 'INVALID_TYPE',
      });
    } else {
      c.blockTypes.forEach((blockType: unknown, index: number) => {
        const result = validateBlockDefinition(
          blockType,
          packName,
          `${path}.blockTypes[${index}]`,
          definedIds,
          options
        );
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      });
    }
  }

  // Validate variable templates
  if (c.variableTemplates !== undefined) {
    if (!Array.isArray(c.variableTemplates)) {
      errors.push({
        path: `${path}.variableTemplates`,
        message: 'Variable templates must be an array',
        code: 'INVALID_TYPE',
      });
    } else {
      c.variableTemplates.forEach((template: unknown, index: number) => {
        const result = validateVariableTemplate(
          template,
          packName,
          `${path}.variableTemplates[${index}]`,
          definedIds,
          options
        );
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      });
    }
  }

  // Check for empty contents
  const hasContent =
    (c.sensors && (c.sensors as unknown[]).length > 0) ||
    (c.policies && (c.policies as unknown[]).length > 0) ||
    (c.actions && (c.actions as unknown[]).length > 0) ||
    (c.effects && (c.effects as unknown[]).length > 0) ||
    (c.entityTypes && (c.entityTypes as unknown[]).length > 0) ||
    (c.blockTypes && (c.blockTypes as unknown[]).length > 0) ||
    (c.variableTemplates && (c.variableTemplates as unknown[]).length > 0);

  if (!hasContent) {
    warnings.push({
      path,
      message: 'Pack has no contents defined',
      code: 'EMPTY_CONTENTS',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a sensor definition.
 */
function validateSensorDefinition(
  sensor: unknown,
  packName: string,
  path: string,
  definedIds: Set<string>,
  options: ValidatePackOptions
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];

  if (!sensor || typeof sensor !== 'object') {
    errors.push({
      path,
      message: 'Sensor must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const s = sensor as Record<string, unknown>;

  // Required: sensorType
  if (typeof s.sensorType !== 'string' || s.sensorType.trim() === '') {
    errors.push({
      path: `${path}.sensorType`,
      message: 'Sensor must have a sensorType',
      code: 'MISSING_FIELD',
    });
  } else {
    // Check namespace if strict
    if (options.strictNaming && !s.sensorType.startsWith(`pack.${packName}.`)) {
      errors.push({
        path: `${path}.sensorType`,
        message: `Sensor type should be namespaced as pack.${packName}.*`,
        code: 'INVALID_NAMESPACE',
      });
    }

    // Check for duplicates
    if (definedIds.has(`sensor:${s.sensorType}`)) {
      errors.push({
        path: `${path}.sensorType`,
        message: `Duplicate sensor type: ${s.sensorType}`,
        code: 'DUPLICATE_DEFINITION',
      });
    }
    definedIds.add(`sensor:${s.sensorType}`);
  }

  // Required: name
  if (typeof s.name !== 'string' || s.name.trim() === '') {
    errors.push({
      path: `${path}.name`,
      message: 'Sensor must have a name',
      code: 'MISSING_FIELD',
    });
  }

  // Required: observationTypes
  if (!Array.isArray(s.observationTypes) || s.observationTypes.length === 0) {
    errors.push({
      path: `${path}.observationTypes`,
      message: 'Sensor must have at least one observation type',
      code: 'MISSING_FIELD',
    });
  } else {
    s.observationTypes.forEach((type, index) => {
      if (typeof type !== 'string' || type.trim() === '') {
        errors.push({
          path: `${path}.observationTypes[${index}]`,
          message: 'Observation type must be a non-empty string',
          code: 'INVALID_VALUE',
        });
      }
    });
  }

  // Optional: description
  if (!s.description) {
    warnings.push({
      path: `${path}.description`,
      message: 'Sensor should have a description',
      code: 'MISSING_DESCRIPTION',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a policy definition.
 */
function validatePolicyDefinition(
  policy: unknown,
  packName: string,
  path: string,
  definedIds: Set<string>,
  options: ValidatePackOptions
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];

  if (!policy || typeof policy !== 'object') {
    errors.push({
      path,
      message: 'Policy must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const p = policy as Record<string, unknown>;

  // Required: templateId
  if (typeof p.templateId !== 'string' || p.templateId.trim() === '') {
    errors.push({
      path: `${path}.templateId`,
      message: 'Policy must have a templateId',
      code: 'MISSING_FIELD',
    });
  } else {
    // Check for duplicates
    if (definedIds.has(`policy:${p.templateId}`)) {
      errors.push({
        path: `${path}.templateId`,
        message: `Duplicate policy template: ${p.templateId}`,
        code: 'DUPLICATE_DEFINITION',
      });
    }
    definedIds.add(`policy:${p.templateId}`);
  }

  // Required: name
  if (typeof p.name !== 'string' || p.name.trim() === '') {
    errors.push({
      path: `${path}.name`,
      message: 'Policy must have a name',
      code: 'MISSING_FIELD',
    });
  }

  // Required: defaultTriggers
  if (!Array.isArray(p.defaultTriggers) || p.defaultTriggers.length === 0) {
    errors.push({
      path: `${path}.defaultTriggers`,
      message: 'Policy must have at least one default trigger',
      code: 'MISSING_FIELD',
    });
  }

  // Required: implementation
  if (!p.implementation || typeof p.implementation !== 'object') {
    errors.push({
      path: `${path}.implementation`,
      message: 'Policy must have an implementation',
      code: 'MISSING_FIELD',
    });
  } else {
    const impl = p.implementation as Record<string, unknown>;
    if (impl.kind !== 'typescript') {
      errors.push({
        path: `${path}.implementation.kind`,
        message: 'Policy implementation kind must be "typescript"',
        code: 'INVALID_VALUE',
      });
    }
    if (typeof impl.code !== 'string' || impl.code.trim() === '') {
      errors.push({
        path: `${path}.implementation.code`,
        message: 'Policy implementation must have code',
        code: 'MISSING_FIELD',
      });
    } else if (options.validatePolicyCode) {
      // Basic syntax check (just ensure it's parseable)
      try {
        // This is a very basic check - real validation would use a parser
        if (!impl.code.includes('return') && !impl.code.includes('=>')) {
          warnings.push({
            path: `${path}.implementation.code`,
            message: 'Policy code should return effects',
            code: 'MISSING_DESCRIPTION',
          });
        }
      } catch {
        errors.push({
          path: `${path}.implementation.code`,
          message: 'Policy code has syntax errors',
          code: 'INVALID_CODE',
        });
      }
    }
  }

  // Optional: description
  if (!p.description) {
    warnings.push({
      path: `${path}.description`,
      message: 'Policy should have a description',
      code: 'MISSING_DESCRIPTION',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an action definition.
 */
function validateActionDefinition(
  action: unknown,
  packName: string,
  path: string,
  definedIds: Set<string>,
  options: ValidatePackOptions
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];

  if (!action || typeof action !== 'object') {
    errors.push({
      path,
      message: 'Action must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const a = action as Record<string, unknown>;

  // Required: actionType
  if (typeof a.actionType !== 'string' || a.actionType.trim() === '') {
    errors.push({
      path: `${path}.actionType`,
      message: 'Action must have an actionType',
      code: 'MISSING_FIELD',
    });
  } else {
    const expectedPrefix = packActionType(packName, '');
    if (options.strictNaming && !a.actionType.startsWith(expectedPrefix)) {
      errors.push({
        path: `${path}.actionType`,
        message: `Action type should be namespaced as ${expectedPrefix}*`,
        code: 'INVALID_NAMESPACE',
      });
    }

    // Check for duplicates
    if (definedIds.has(`action:${a.actionType}`)) {
      errors.push({
        path: `${path}.actionType`,
        message: `Duplicate action type: ${a.actionType}`,
        code: 'DUPLICATE_DEFINITION',
      });
    }
    definedIds.add(`action:${a.actionType}`);
  }

  // Required: name
  if (typeof a.name !== 'string' || a.name.trim() === '') {
    errors.push({
      path: `${path}.name`,
      message: 'Action must have a name',
      code: 'MISSING_FIELD',
    });
  }

  // Required: riskLevel
  if (
    typeof a.riskLevel !== 'string' ||
    !VALID_RISK_LEVELS.includes(a.riskLevel as RiskLevel)
  ) {
    errors.push({
      path: `${path}.riskLevel`,
      message: `Action riskLevel must be one of: ${VALID_RISK_LEVELS.join(', ')}`,
      code: 'INVALID_VALUE',
    });
  }

  // Optional: description
  if (!a.description) {
    warnings.push({
      path: `${path}.description`,
      message: 'Action should have a description',
      code: 'MISSING_DESCRIPTION',
    });
  }

  // Optional: paramsSchema
  if (!a.paramsSchema) {
    warnings.push({
      path: `${path}.paramsSchema`,
      message: 'Action should have a paramsSchema',
      code: 'MISSING_SCHEMA',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an effect definition.
 */
function validateEffectDefinition(
  effect: unknown,
  packName: string,
  path: string,
  definedIds: Set<string>,
  options: ValidatePackOptions
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];

  if (!effect || typeof effect !== 'object') {
    errors.push({
      path,
      message: 'Effect must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const e = effect as Record<string, unknown>;

  // Required: effectType
  if (typeof e.effectType !== 'string' || e.effectType.trim() === '') {
    errors.push({
      path: `${path}.effectType`,
      message: 'Effect must have an effectType',
      code: 'MISSING_FIELD',
    });
  } else {
    const expectedPrefix = packEffectType(packName, '');
    if (options.strictNaming && !e.effectType.startsWith(expectedPrefix)) {
      errors.push({
        path: `${path}.effectType`,
        message: `Effect type should be namespaced as ${expectedPrefix}*`,
        code: 'INVALID_NAMESPACE',
      });
    }

    // Check for duplicates
    if (definedIds.has(`effect:${e.effectType}`)) {
      errors.push({
        path: `${path}.effectType`,
        message: `Duplicate effect type: ${e.effectType}`,
        code: 'DUPLICATE_DEFINITION',
      });
    }
    definedIds.add(`effect:${e.effectType}`);
  }

  // Required: name
  if (typeof e.name !== 'string' || e.name.trim() === '') {
    errors.push({
      path: `${path}.name`,
      message: 'Effect must have a name',
      code: 'MISSING_FIELD',
    });
  }

  // Optional: description
  if (!e.description) {
    warnings.push({
      path: `${path}.description`,
      message: 'Effect should have a description',
      code: 'MISSING_DESCRIPTION',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an entity type definition.
 */
function validateEntityTypeDefinition(
  entityType: unknown,
  packName: string,
  path: string,
  definedIds: Set<string>,
  options: ValidatePackOptions
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];

  if (!entityType || typeof entityType !== 'object') {
    errors.push({
      path,
      message: 'Entity type must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const e = entityType as Record<string, unknown>;

  // Required: typeName
  if (typeof e.typeName !== 'string' || e.typeName.trim() === '') {
    errors.push({
      path: `${path}.typeName`,
      message: 'Entity type must have a typeName',
      code: 'MISSING_FIELD',
    });
  } else {
    const expectedPrefix = packEntityType(packName, '');
    if (options.strictNaming && !e.typeName.startsWith(expectedPrefix)) {
      errors.push({
        path: `${path}.typeName`,
        message: `Entity type should be namespaced as ${expectedPrefix}*`,
        code: 'INVALID_NAMESPACE',
      });
    }

    // Check for duplicates
    if (definedIds.has(`entity:${e.typeName}`)) {
      errors.push({
        path: `${path}.typeName`,
        message: `Duplicate entity type: ${e.typeName}`,
        code: 'DUPLICATE_DEFINITION',
      });
    }
    definedIds.add(`entity:${e.typeName}`);
  }

  // Required: title
  if (typeof e.title !== 'string' || e.title.trim() === '') {
    errors.push({
      path: `${path}.title`,
      message: 'Entity type must have a title',
      code: 'MISSING_FIELD',
    });
  }

  // Required: schema
  if (!e.schema || typeof e.schema !== 'object') {
    errors.push({
      path: `${path}.schema`,
      message: 'Entity type must have a schema object',
      code: 'MISSING_FIELD',
    });
  }

  // Optional: description
  if (!e.description) {
    warnings.push({
      path: `${path}.description`,
      message: 'Entity type should have a description',
      code: 'MISSING_DESCRIPTION',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a block definition.
 */
function validateBlockDefinition(
  blockType: unknown,
  packName: string,
  path: string,
  definedIds: Set<string>,
  options: ValidatePackOptions
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];

  if (!blockType || typeof blockType !== 'object') {
    errors.push({
      path,
      message: 'Block type must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const b = blockType as Record<string, unknown>;

  // Required: blockType
  if (typeof b.blockType !== 'string' || b.blockType.trim() === '') {
    errors.push({
      path: `${path}.blockType`,
      message: 'Block must have a blockType',
      code: 'MISSING_FIELD',
    });
  } else {
    const expectedPrefix = packBlockType(packName, '');
    if (options.strictNaming && !b.blockType.startsWith(expectedPrefix)) {
      errors.push({
        path: `${path}.blockType`,
        message: `Block type should be namespaced as ${expectedPrefix}*`,
        code: 'INVALID_NAMESPACE',
      });
    }

    // Check for duplicates
    if (definedIds.has(`block:${b.blockType}`)) {
      errors.push({
        path: `${path}.blockType`,
        message: `Duplicate block type: ${b.blockType}`,
        code: 'DUPLICATE_DEFINITION',
      });
    }
    definedIds.add(`block:${b.blockType}`);
  }

  // Required: name
  if (typeof b.name !== 'string' || b.name.trim() === '') {
    errors.push({
      path: `${path}.name`,
      message: 'Block must have a name',
      code: 'MISSING_FIELD',
    });
  }

  // Optional: description
  if (!b.description) {
    warnings.push({
      path: `${path}.description`,
      message: 'Block type should have a description',
      code: 'MISSING_DESCRIPTION',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a variable template.
 */
function validateVariableTemplate(
  template: unknown,
  _packName: string,
  path: string,
  definedIds: Set<string>,
  _options: ValidatePackOptions
): PackValidationResult {
  const errors: PackValidationError[] = [];
  const warnings: PackValidationWarning[] = [];

  if (!template || typeof template !== 'object') {
    errors.push({
      path,
      message: 'Variable template must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  const t = template as Record<string, unknown>;

  // Required: templateId
  if (typeof t.templateId !== 'string' || t.templateId.trim() === '') {
    errors.push({
      path: `${path}.templateId`,
      message: 'Variable template must have a templateId',
      code: 'MISSING_FIELD',
    });
  } else {
    // Check for duplicates
    if (definedIds.has(`variable:${t.templateId}`)) {
      errors.push({
        path: `${path}.templateId`,
        message: `Duplicate variable template: ${t.templateId}`,
        code: 'DUPLICATE_DEFINITION',
      });
    }
    definedIds.add(`variable:${t.templateId}`);
  }

  // Required: name
  if (typeof t.name !== 'string' || t.name.trim() === '') {
    errors.push({
      path: `${path}.name`,
      message: 'Variable template must have a name',
      code: 'MISSING_FIELD',
    });
  }

  // Required: keyPrefix
  if (typeof t.keyPrefix !== 'string' || t.keyPrefix.trim() === '') {
    errors.push({
      path: `${path}.keyPrefix`,
      message: 'Variable template must have a keyPrefix',
      code: 'MISSING_FIELD',
    });
  }

  // Required: kind
  const validKinds = ['continuous', 'ordinal', 'categorical', 'boolean'];
  if (typeof t.kind !== 'string' || !validKinds.includes(t.kind)) {
    errors.push({
      path: `${path}.kind`,
      message: `Variable kind must be one of: ${validKinds.join(', ')}`,
      code: 'INVALID_VALUE',
    });
  }

  // Optional: description
  if (!t.description) {
    warnings.push({
      path: `${path}.description`,
      message: 'Variable template should have a description',
      code: 'MISSING_DESCRIPTION',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
