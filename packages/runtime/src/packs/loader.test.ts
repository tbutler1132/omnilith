// Tests for pack loader

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pack, SemVer } from '@omnilith/protocol';
import {
  loadPack,
  loadPacks,
  unloadPack,
  findDependents,
  canLoadPack,
  getAvailablePacks,
  getLoadedPacks,
  createPack,
  createEmptyPack,
  packRegistry,
} from './index.js';
import { effectRegistry } from '../effects/index.js';

// --- Test Fixtures ---

function createTestPack(
  name: string,
  version: SemVer = '1.0.0',
  dependencies?: Pack['manifest']['dependencies']
): Pack {
  return {
    manifest: {
      name,
      version,
      title: `Test Pack: ${name}`,
      dependencies,
    },
    contents: {},
  };
}

// --- Tests ---

describe('loadPack', () => {
  beforeEach(() => {
    packRegistry.clear();
    effectRegistry.clear();
  });

  it('should load a valid pack', () => {
    const pack = createTestPack('test-pack');
    const result = loadPack(pack);

    expect(result.success).toBe(true);
    expect(result.packName).toBe('test-pack');
    expect(packRegistry.has('test-pack')).toBe(true);
  });

  it('should fail on invalid pack', () => {
    const invalidPack = {
      manifest: {
        name: '', // Invalid: empty name
        version: '1.0.0',
        title: 'Invalid Pack',
      },
      contents: {},
    } as Pack;

    const result = loadPack(invalidPack);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Validation failed');
    expect(result.validationResult?.valid).toBe(false);
  });

  it('should skip validation when option is set', () => {
    const invalidPack = {
      manifest: {
        name: '', // Invalid but we skip validation
        version: '1.0.0',
        title: 'Invalid Pack',
      },
      contents: {},
    } as Pack;

    const result = loadPack(invalidPack, { skipValidation: true });

    // Registration may still fail due to empty name, but validation was skipped
    expect(result.validationResult).toBeUndefined();
  });

  it('should pass context to registry', () => {
    const mockHandler = vi.fn().mockResolvedValue({});
    const pack: Pack = {
      manifest: {
        name: 'context-pack',
        version: '1.0.0',
        title: 'Context Pack',
      },
      contents: {
        effects: [
          {
            effectType: 'pack:context-pack:test',
            name: 'Test Effect',
          },
        ],
      },
    };

    const result = loadPack(pack, {
      context: {
        effectHandlers: {
          'pack:context-pack:test': mockHandler,
        },
      },
    });

    expect(result.success).toBe(true);
    expect(effectRegistry.has('pack:context-pack:test')).toBe(true);
  });
});

describe('loadPacks', () => {
  beforeEach(() => {
    packRegistry.clear();
    effectRegistry.clear();
  });

  it('should load multiple packs in dependency order', () => {
    const packA = createTestPack('pack-a');
    const packB = createTestPack('pack-b', '1.0.0', [{ name: 'pack-a' }]);
    const packC = createTestPack('pack-c', '1.0.0', [{ name: 'pack-b' }]);

    const result = loadPacks([packC, packA, packB]);

    expect(result.loaded).toEqual(['pack-a', 'pack-b', 'pack-c']);
    expect(result.failed).toHaveLength(0);
    expect(result.loadOrder).toEqual(['pack-a', 'pack-b', 'pack-c']);
  });

  it('should stop on error by default', () => {
    const validPack = createTestPack('valid-pack');
    const invalidPack = {
      manifest: {
        name: '',
        version: '1.0.0',
        title: 'Invalid',
      },
      contents: {},
    } as Pack;
    const anotherPack = createTestPack('another-pack');

    const result = loadPacks([validPack, invalidPack, anotherPack]);

    expect(result.loaded).toContain('valid-pack');
    expect(result.failed.length).toBeGreaterThan(0);
  });

  it('should continue on error when option is set', () => {
    const validPack1 = createTestPack('valid-pack-1');
    const validPack2 = createTestPack('valid-pack-2');
    const packWithMissingDep = createTestPack('missing-dep', '1.0.0', [
      { name: 'nonexistent' },
    ]);

    const result = loadPacks([validPack1, packWithMissingDep, validPack2], {
      continueOnError: true,
    });

    expect(result.loaded).toContain('valid-pack-1');
    expect(result.loaded).toContain('valid-pack-2');
    expect(result.failed).toHaveLength(1);
  });

  it('should fail all packs on circular dependency', () => {
    const packA = createTestPack('pack-a', '1.0.0', [{ name: 'pack-b' }]);
    const packB = createTestPack('pack-b', '1.0.0', [{ name: 'pack-a' }]);

    const result = loadPacks([packA, packB]);

    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0].error).toContain('Circular dependency');
  });

  it('should track total time', () => {
    const pack = createTestPack('test-pack');
    const result = loadPacks([pack]);

    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('unloadPack', () => {
  beforeEach(() => {
    packRegistry.clear();
    effectRegistry.clear();
  });

  it('should unload a loaded pack', () => {
    const pack = createTestPack('test-pack');
    loadPack(pack);

    const unloaded = unloadPack('test-pack');

    expect(unloaded).toContain('test-pack');
    expect(packRegistry.has('test-pack')).toBe(false);
  });

  it('should unload dependents when option is set', () => {
    const packA = createTestPack('pack-a');
    const packB = createTestPack('pack-b', '1.0.0', [{ name: 'pack-a' }]);
    loadPacks([packA, packB]);

    const unloaded = unloadPack('pack-a', { unloadDependents: true });

    expect(unloaded).toContain('pack-a');
    expect(unloaded).toContain('pack-b');
    expect(packRegistry.has('pack-a')).toBe(false);
    expect(packRegistry.has('pack-b')).toBe(false);
  });
});

describe('findDependents', () => {
  beforeEach(() => {
    packRegistry.clear();
    effectRegistry.clear();
  });

  it('should find packs that depend on a given pack', () => {
    const packA = createTestPack('pack-a');
    const packB = createTestPack('pack-b', '1.0.0', [{ name: 'pack-a' }]);
    const packC = createTestPack('pack-c', '1.0.0', [{ name: 'pack-a' }]);
    const packD = createTestPack('pack-d');
    loadPacks([packA, packB, packC, packD]);

    const dependents = findDependents('pack-a');

    expect(dependents).toContain('pack-b');
    expect(dependents).toContain('pack-c');
    expect(dependents).not.toContain('pack-d');
  });
});

describe('canLoadPack', () => {
  beforeEach(() => {
    packRegistry.clear();
    effectRegistry.clear();
  });

  it('should return true for pack with no dependencies', () => {
    const pack = createTestPack('test-pack');
    const result = canLoadPack(pack);

    expect(result.canLoad).toBe(true);
    expect(result.missingDependencies).toHaveLength(0);
  });

  it('should report missing dependencies', () => {
    const pack = createTestPack('test-pack', '1.0.0', [
      { name: 'missing-dep' },
    ]);
    const result = canLoadPack(pack);

    expect(result.canLoad).toBe(false);
    expect(result.missingDependencies).toContain('missing-dep');
  });

  it('should return true when dependencies are satisfied', () => {
    const depPack = createTestPack('dep-pack');
    loadPack(depPack);

    const pack = createTestPack('test-pack', '1.0.0', [{ name: 'dep-pack' }]);
    const result = canLoadPack(pack);

    expect(result.canLoad).toBe(true);
  });
});

describe('getAvailablePacks / getLoadedPacks', () => {
  beforeEach(() => {
    packRegistry.clear();
    effectRegistry.clear();
  });

  it('should return all available packs', () => {
    const pack1 = createTestPack('pack-1');
    const pack2 = createTestPack('pack-2');
    packRegistry.register(pack1);
    packRegistry.register(pack2);

    const available = getAvailablePacks();

    expect(available).toHaveLength(2);
    expect(available.map((p) => p.name)).toContain('pack-1');
    expect(available.map((p) => p.name)).toContain('pack-2');
  });

  it('should return only loaded packs', () => {
    const pack1 = createTestPack('pack-1');
    const pack2 = createTestPack('pack-2');
    loadPack(pack1);
    packRegistry.register(pack2);

    const loaded = getLoadedPacks();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('pack-1');
  });
});

describe('createPack', () => {
  it('should create a valid pack', () => {
    const pack = createPack(
      {
        name: 'my-pack',
        version: '1.0.0',
        title: 'My Pack',
        description: 'A test pack',
      },
      {
        effects: [
          {
            effectType: 'pack:my-pack:test',
            name: 'Test Effect',
          },
        ],
      }
    );

    expect(pack.manifest.name).toBe('my-pack');
    expect(pack.manifest.version).toBe('1.0.0');
    expect(pack.contents.effects).toHaveLength(1);
  });
});

describe('createEmptyPack', () => {
  it('should create an empty pack with just manifest', () => {
    const pack = createEmptyPack('empty-pack', '1.0.0', 'Empty Pack');

    expect(pack.manifest.name).toBe('empty-pack');
    expect(pack.manifest.version).toBe('1.0.0');
    expect(pack.manifest.title).toBe('Empty Pack');
    expect(pack.contents).toEqual({});
  });
});

describe('validation options', () => {
  beforeEach(() => {
    packRegistry.clear();
    effectRegistry.clear();
  });

  it('should enforce strict naming when option is set', () => {
    const pack: Pack = {
      manifest: {
        name: 'test-pack',
        version: '1.0.0',
        title: 'Test Pack',
      },
      contents: {
        effects: [
          {
            // Not namespaced correctly
            effectType: 'wrong-namespace',
            name: 'Wrong Effect',
          },
        ],
      },
    };

    const result = loadPack(pack, { strictNaming: true });

    // Validation should fail with strict naming
    expect(result.success).toBe(false);
    expect(result.error).toContain('namespaced');
  });
});
