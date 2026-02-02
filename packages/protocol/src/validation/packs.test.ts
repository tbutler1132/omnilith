// Tests for pack validation

import { describe, it, expect } from 'vitest';
import type { Pack, PackManifest, SemVer } from '../types/packs.js';
import {
  validatePack,
  validatePackManifest,
  validatePackContents,
  type PackValidationResult,
} from './packs.js';

// --- Test Fixtures ---

function createValidManifest(): PackManifest {
  return {
    name: 'test-pack',
    version: '1.0.0',
    title: 'Test Pack',
    description: 'A test pack for validation',
  };
}

function createValidPack(): Pack {
  return {
    manifest: createValidManifest(),
    contents: {},
  };
}

// --- Tests ---

describe('validatePack', () => {
  it('should validate a minimal valid pack', () => {
    const pack = createValidPack();
    const result = validatePack(pack);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for non-object input', () => {
    const result = validatePack(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_TYPE');
  });

  it('should fail for missing manifest', () => {
    const result = validatePack({ contents: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('manifest'))).toBe(true);
  });

  it('should fail for missing contents', () => {
    const result = validatePack({ manifest: createValidManifest() });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('contents'))).toBe(true);
  });

  it('should validate a pack with full contents', () => {
    const pack: Pack = {
      manifest: createValidManifest(),
      contents: {
        sensors: [
          {
            sensorType: 'pack.test-pack.sensor',
            name: 'Test Sensor',
            observationTypes: ['test.observation'],
            description: 'A test sensor',
          },
        ],
        policies: [
          {
            templateId: 'test-policy',
            name: 'Test Policy',
            defaultTriggers: ['test.*'],
            implementation: {
              kind: 'typescript',
              code: 'return [];',
            },
            description: 'A test policy',
          },
        ],
        actions: [
          {
            actionType: 'pack:test-pack:test-action',
            name: 'Test Action',
            riskLevel: 'low',
            description: 'A test action',
            paramsSchema: { type: 'object' },
          },
        ],
        effects: [
          {
            effectType: 'pack:test-pack:test-effect',
            name: 'Test Effect',
            description: 'A test effect',
          },
        ],
        entityTypes: [
          {
            typeName: 'pack.test-pack.entity',
            title: 'Test Entity',
            schema: { type: 'object' },
            description: 'A test entity',
          },
        ],
        blockTypes: [
          {
            blockType: 'test-pack/block',
            name: 'Test Block',
            description: 'A test block',
          },
        ],
        variableTemplates: [
          {
            templateId: 'test-variable',
            name: 'Test Variable',
            keyPrefix: 'pack.test-pack.var',
            kind: 'continuous',
            description: 'A test variable',
          },
        ],
      },
    };

    const result = validatePack(pack);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('validatePackManifest', () => {
  it('should validate a valid manifest', () => {
    const result = validatePackManifest(createValidManifest());
    expect(result.valid).toBe(true);
  });

  it('should fail for empty name', () => {
    const manifest = { ...createValidManifest(), name: '' };
    const result = validatePackManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_FIELD')).toBe(true);
  });

  it('should fail for invalid pack name format', () => {
    const manifest = { ...createValidManifest(), name: 'Invalid_Name' };
    const result = validatePackManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_NAME')).toBe(true);
  });

  it('should accept valid pack name formats', () => {
    const validNames = ['a', 'abc', 'my-pack', 'pack-123', 'a-b-c'];

    for (const name of validNames) {
      const manifest = { ...createValidManifest(), name };
      const result = validatePackManifest(manifest);
      expect(result.valid).toBe(true);
    }
  });

  it('should fail for invalid version format', () => {
    const manifest = { ...createValidManifest(), version: 'invalid' as SemVer };
    const result = validatePackManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_VERSION')).toBe(true);
  });

  it('should accept valid version formats', () => {
    const validVersions: SemVer[] = ['0.0.0', '1.0.0', '10.20.30', '1.2.3'];

    for (const version of validVersions) {
      const manifest = { ...createValidManifest(), version };
      const result = validatePackManifest(manifest);
      expect(result.valid).toBe(true);
    }
  });

  it('should warn for missing description', () => {
    const manifest = createValidManifest();
    delete manifest.description;
    const result = validatePackManifest(manifest);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === 'MISSING_DESCRIPTION')).toBe(
      true
    );
  });

  it('should validate dependencies', () => {
    const manifest: PackManifest = {
      ...createValidManifest(),
      dependencies: [
        { name: 'dep-pack', minVersion: '1.0.0', maxVersion: '2.0.0' },
      ],
    };
    const result = validatePackManifest(manifest);

    expect(result.valid).toBe(true);
  });

  it('should fail for invalid dependency', () => {
    const manifest: PackManifest = {
      ...createValidManifest(),
      dependencies: [
        { name: 'Invalid_Dep' }, // Invalid name
      ],
    };
    const result = validatePackManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_NAME')).toBe(true);
  });
});

describe('validatePackContents', () => {
  it('should warn for empty contents', () => {
    const result = validatePackContents({}, 'test-pack');

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === 'EMPTY_CONTENTS')).toBe(true);
  });

  describe('sensors', () => {
    it('should validate valid sensor', () => {
      const result = validatePackContents(
        {
          sensors: [
            {
              sensorType: 'pack.test.sensor',
              name: 'Test Sensor',
              observationTypes: ['test'],
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(true);
    });

    it('should fail for sensor without observationTypes', () => {
      const result = validatePackContents(
        {
          sensors: [
            {
              sensorType: 'pack.test.sensor',
              name: 'Test Sensor',
              observationTypes: [],
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('observationTypes'))).toBe(
        true
      );
    });
  });

  describe('policies', () => {
    it('should validate valid policy', () => {
      const result = validatePackContents(
        {
          policies: [
            {
              templateId: 'test-policy',
              name: 'Test Policy',
              defaultTriggers: ['test.*'],
              implementation: { kind: 'typescript', code: 'return [];' },
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(true);
    });

    it('should fail for policy without implementation', () => {
      const result = validatePackContents(
        {
          policies: [
            {
              templateId: 'test-policy',
              name: 'Test Policy',
              defaultTriggers: ['test.*'],
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('implementation'))).toBe(
        true
      );
    });
  });

  describe('actions', () => {
    it('should validate valid action', () => {
      const result = validatePackContents(
        {
          actions: [
            {
              actionType: 'pack:test:action',
              name: 'Test Action',
              riskLevel: 'low',
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(true);
    });

    it('should fail for invalid risk level', () => {
      const result = validatePackContents(
        {
          actions: [
            {
              actionType: 'pack:test:action',
              name: 'Test Action',
              riskLevel: 'invalid' as 'low',
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('riskLevel'))).toBe(true);
    });

    it('should fail for invalid namespace in strict mode', () => {
      const result = validatePackContents(
        {
          actions: [
            {
              actionType: 'wrong:namespace:action',
              name: 'Test Action',
              riskLevel: 'low',
            },
          ],
        },
        'test',
        { strictNaming: true }
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_NAMESPACE')).toBe(
        true
      );
    });
  });

  describe('effects', () => {
    it('should validate valid effect', () => {
      const result = validatePackContents(
        {
          effects: [
            {
              effectType: 'pack:test:effect',
              name: 'Test Effect',
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('entity types', () => {
    it('should validate valid entity type', () => {
      const result = validatePackContents(
        {
          entityTypes: [
            {
              typeName: 'pack.test.entity',
              title: 'Test Entity',
              schema: { type: 'object' },
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(true);
    });

    it('should fail for missing schema', () => {
      const result = validatePackContents(
        {
          entityTypes: [
            {
              typeName: 'pack.test.entity',
              title: 'Test Entity',
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('schema'))).toBe(true);
    });
  });

  describe('block types', () => {
    it('should validate valid block type', () => {
      const result = validatePackContents(
        {
          blockTypes: [
            {
              blockType: 'test/block',
              name: 'Test Block',
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('variable templates', () => {
    it('should validate valid variable template', () => {
      const result = validatePackContents(
        {
          variableTemplates: [
            {
              templateId: 'test-var',
              name: 'Test Variable',
              keyPrefix: 'pack.test',
              kind: 'continuous',
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(true);
    });

    it('should fail for invalid kind', () => {
      const result = validatePackContents(
        {
          variableTemplates: [
            {
              templateId: 'test-var',
              name: 'Test Variable',
              keyPrefix: 'pack.test',
              kind: 'invalid' as 'continuous',
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('kind'))).toBe(true);
    });
  });

  describe('duplicate detection', () => {
    it('should fail for duplicate sensor types', () => {
      const result = validatePackContents(
        {
          sensors: [
            {
              sensorType: 'pack.test.sensor',
              name: 'Sensor 1',
              observationTypes: ['test'],
            },
            {
              sensorType: 'pack.test.sensor',
              name: 'Sensor 2',
              observationTypes: ['test'],
            },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_DEFINITION')).toBe(
        true
      );
    });

    it('should fail for duplicate action types', () => {
      const result = validatePackContents(
        {
          actions: [
            { actionType: 'pack:test:action', name: 'Action 1', riskLevel: 'low' },
            { actionType: 'pack:test:action', name: 'Action 2', riskLevel: 'low' },
          ],
        },
        'test'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_DEFINITION')).toBe(
        true
      );
    });
  });
});
