// Tests for pack registry

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pack, PackManifest, SemVer } from '@omnilith/protocol';
import {
  packRegistry,
  resolveLoadOrder,
  PackNotFoundError,
  PackAlreadyLoadedError,
  PackDependencyError,
  PackCircularDependencyError,
  type PackRegistrationContext,
} from './registry.js';
import { effectRegistry } from '../effects/index.js';
import { createActionRegistry } from '../actions/index.js';

// --- Test Fixtures ---

function createTestPack(
  name: string,
  version: SemVer = '1.0.0',
  dependencies?: PackManifest['dependencies']
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

function createPackWithContents(
  name: string,
  contents: Pack['contents']
): Pack {
  return {
    manifest: {
      name,
      version: '1.0.0',
      title: `Test Pack: ${name}`,
    },
    contents,
  };
}

// --- Tests ---

describe('PackRegistry', () => {
  beforeEach(() => {
    // Clear the registry before each test
    packRegistry.clear();
    effectRegistry.clear();
  });

  describe('register', () => {
    it('should register a pack', () => {
      const pack = createTestPack('test-pack');
      packRegistry.register(pack);

      expect(packRegistry.get('test-pack')).toBeDefined();
      expect(packRegistry.get('test-pack')?.status).toBe('unloaded');
    });

    it('should throw when registering an already loaded pack', () => {
      const pack = createTestPack('test-pack');
      packRegistry.register(pack);
      packRegistry.loadPack('test-pack');

      expect(() => packRegistry.register(pack)).toThrow(PackAlreadyLoadedError);
    });

    it('should allow re-registering an unloaded pack', () => {
      const pack = createTestPack('test-pack');
      packRegistry.register(pack);
      packRegistry.unloadPack('test-pack');

      // Should not throw
      packRegistry.register(pack);
      expect(packRegistry.get('test-pack')).toBeDefined();
    });
  });

  describe('loadPack', () => {
    it('should load a registered pack', () => {
      const pack = createTestPack('test-pack');
      packRegistry.register(pack);
      packRegistry.loadPack('test-pack');

      expect(packRegistry.has('test-pack')).toBe(true);
      expect(packRegistry.get('test-pack')?.status).toBe('loaded');
      expect(packRegistry.get('test-pack')?.loadedAt).toBeDefined();
    });

    it('should throw PackNotFoundError for unregistered pack', () => {
      expect(() => packRegistry.loadPack('nonexistent')).toThrow(
        PackNotFoundError
      );
    });

    it('should be idempotent for already loaded packs', () => {
      const pack = createTestPack('test-pack');
      packRegistry.register(pack);
      packRegistry.loadPack('test-pack');
      const loadedAt = packRegistry.get('test-pack')?.loadedAt;

      // Load again - should not throw
      packRegistry.loadPack('test-pack');
      expect(packRegistry.get('test-pack')?.loadedAt).toBe(loadedAt);
    });

    it('should throw PackDependencyError when dependencies are missing', () => {
      const pack = createTestPack('dependent-pack', '1.0.0', [
        { name: 'missing-dep' },
      ]);
      packRegistry.register(pack);

      expect(() => packRegistry.loadPack('dependent-pack')).toThrow(
        PackDependencyError
      );
    });

    it('should load pack with satisfied dependencies', () => {
      const depPack = createTestPack('dep-pack');
      const mainPack = createTestPack('main-pack', '1.0.0', [
        { name: 'dep-pack' },
      ]);

      packRegistry.register(depPack);
      packRegistry.loadPack('dep-pack');
      packRegistry.register(mainPack);
      packRegistry.loadPack('main-pack');

      expect(packRegistry.has('main-pack')).toBe(true);
      expect(packRegistry.get('main-pack')?.resolvedDependencies).toContain(
        'dep-pack'
      );
    });

    it('should allow optional dependencies to be missing', () => {
      const pack = createTestPack('test-pack', '1.0.0', [
        { name: 'optional-dep', optional: true },
      ]);
      packRegistry.register(pack);

      // Should not throw
      packRegistry.loadPack('test-pack');
      expect(packRegistry.has('test-pack')).toBe(true);
    });
  });

  describe('unloadPack', () => {
    it('should unload a loaded pack', () => {
      const pack = createTestPack('test-pack');
      packRegistry.register(pack);
      packRegistry.loadPack('test-pack');

      packRegistry.unloadPack('test-pack');

      expect(packRegistry.has('test-pack')).toBe(false);
      expect(packRegistry.get('test-pack')?.status).toBe('unloaded');
    });

    it('should be idempotent for unloaded packs', () => {
      const pack = createTestPack('test-pack');
      packRegistry.register(pack);

      // Should not throw
      packRegistry.unloadPack('test-pack');
      packRegistry.unloadPack('test-pack');
    });
  });

  describe('checkDependencies', () => {
    it('should report missing dependencies', () => {
      const manifest: PackManifest = {
        name: 'test',
        version: '1.0.0',
        title: 'Test',
        dependencies: [{ name: 'missing' }],
      };

      const result = packRegistry.checkDependencies(manifest);
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('missing');
    });

    it('should report version incompatibilities', () => {
      const depPack = createTestPack('dep-pack', '1.0.0');
      packRegistry.register(depPack);
      packRegistry.loadPack('dep-pack');

      const manifest: PackManifest = {
        name: 'test',
        version: '1.0.0',
        title: 'Test',
        dependencies: [{ name: 'dep-pack', minVersion: '2.0.0' }],
      };

      const result = packRegistry.checkDependencies(manifest);
      expect(result.satisfied).toBe(false);
      expect(result.incompatible).toHaveLength(1);
      expect(result.incompatible[0].name).toBe('dep-pack');
    });

    it('should accept compatible versions', () => {
      const depPack = createTestPack('dep-pack', '1.5.0');
      packRegistry.register(depPack);
      packRegistry.loadPack('dep-pack');

      const manifest: PackManifest = {
        name: 'test',
        version: '1.0.0',
        title: 'Test',
        dependencies: [
          { name: 'dep-pack', minVersion: '1.0.0', maxVersion: '2.0.0' },
        ],
      };

      const result = packRegistry.checkDependencies(manifest);
      expect(result.satisfied).toBe(true);
    });
  });

  describe('effect registration', () => {
    it('should register pack effects', () => {
      const mockHandler = vi.fn().mockResolvedValue({});
      const pack = createPackWithContents('effects-pack', {
        effects: [
          {
            effectType: 'pack:effects-pack:test',
            name: 'Test Effect',
          },
        ],
      });

      packRegistry.register(pack);
      packRegistry.loadPack('effects-pack', {
        effectHandlers: {
          'pack:effects-pack:test': mockHandler,
        },
      });

      expect(effectRegistry.has('pack:effects-pack:test')).toBe(true);
    });

    it('should unregister pack effects on unload', () => {
      const mockHandler = vi.fn().mockResolvedValue({});
      const pack = createPackWithContents('effects-pack', {
        effects: [
          {
            effectType: 'pack:effects-pack:test',
            name: 'Test Effect',
          },
        ],
      });

      packRegistry.register(pack);
      packRegistry.loadPack('effects-pack', {
        effectHandlers: {
          'pack:effects-pack:test': mockHandler,
        },
      });
      packRegistry.unloadPack('effects-pack');

      expect(effectRegistry.has('pack:effects-pack:test')).toBe(false);
    });
  });

  describe('action registration', () => {
    it('should register pack actions', () => {
      const mockHandler = vi.fn().mockResolvedValue({});
      const actionRegistry = createActionRegistry();
      const pack = createPackWithContents('actions-pack', {
        actions: [
          {
            actionType: 'pack:actions-pack:test',
            name: 'Test Action',
            riskLevel: 'low',
          },
        ],
      });

      packRegistry.register(pack);
      packRegistry.loadPack('actions-pack', {
        actionRegistry,
        actionHandlers: {
          'pack:actions-pack:test': mockHandler,
        },
      });

      expect(actionRegistry.has('pack:actions-pack:test')).toBe(true);
    });
  });

  describe('extension handlers', () => {
    it('should call entity type handler', () => {
      const onEntityTypeRegistered = vi.fn();
      packRegistry.setExtensionHandlers({ onEntityTypeRegistered });

      const pack = createPackWithContents('entities-pack', {
        entityTypes: [
          {
            typeName: 'pack.entities-pack.widget',
            title: 'Widget',
            schema: { type: 'object' },
          },
        ],
      });

      packRegistry.register(pack);
      packRegistry.loadPack('entities-pack');

      expect(onEntityTypeRegistered).toHaveBeenCalledTimes(1);
      expect(onEntityTypeRegistered).toHaveBeenCalledWith(
        expect.objectContaining({
          typeName: 'pack.entities-pack.widget',
        })
      );
    });

    it('should call block type handler', () => {
      const onBlockTypeRegistered = vi.fn();
      packRegistry.setExtensionHandlers({ onBlockTypeRegistered });

      const pack = createPackWithContents('blocks-pack', {
        blockTypes: [
          {
            blockType: 'blocks-pack/chart',
            name: 'Chart',
          },
        ],
      });

      packRegistry.register(pack);
      packRegistry.loadPack('blocks-pack');

      expect(onBlockTypeRegistered).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRegistrations', () => {
    it('should track all registrations', () => {
      const mockHandler = vi.fn().mockResolvedValue({});
      const pack = createPackWithContents('full-pack', {
        effects: [{ effectType: 'pack:full-pack:effect', name: 'Effect' }],
        entityTypes: [
          { typeName: 'pack.full-pack.entity', title: 'Entity', schema: {} },
        ],
        blockTypes: [{ blockType: 'full-pack/block', name: 'Block' }],
      });

      packRegistry.register(pack);
      packRegistry.loadPack('full-pack', {
        effectHandlers: { 'pack:full-pack:effect': mockHandler },
      });

      const registrations = packRegistry.getRegistrations('full-pack');
      expect(registrations).toBeDefined();
      expect(registrations?.effects).toContain('pack:full-pack:effect');
      expect(registrations?.entityTypes).toContain('pack.full-pack.entity');
      expect(registrations?.blockTypes).toContain('full-pack/block');
    });
  });
});

describe('resolveLoadOrder', () => {
  it('should return packs in dependency order', () => {
    const packA = createTestPack('pack-a');
    const packB = createTestPack('pack-b', '1.0.0', [{ name: 'pack-a' }]);
    const packC = createTestPack('pack-c', '1.0.0', [{ name: 'pack-b' }]);

    const ordered = resolveLoadOrder([packC, packA, packB]);
    const names = ordered.map((p) => p.manifest.name);

    expect(names.indexOf('pack-a')).toBeLessThan(names.indexOf('pack-b'));
    expect(names.indexOf('pack-b')).toBeLessThan(names.indexOf('pack-c'));
  });

  it('should handle diamond dependencies', () => {
    const packA = createTestPack('pack-a');
    const packB = createTestPack('pack-b', '1.0.0', [{ name: 'pack-a' }]);
    const packC = createTestPack('pack-c', '1.0.0', [{ name: 'pack-a' }]);
    const packD = createTestPack('pack-d', '1.0.0', [
      { name: 'pack-b' },
      { name: 'pack-c' },
    ]);

    const ordered = resolveLoadOrder([packD, packC, packB, packA]);
    const names = ordered.map((p) => p.manifest.name);

    expect(names.indexOf('pack-a')).toBeLessThan(names.indexOf('pack-b'));
    expect(names.indexOf('pack-a')).toBeLessThan(names.indexOf('pack-c'));
    expect(names.indexOf('pack-b')).toBeLessThan(names.indexOf('pack-d'));
    expect(names.indexOf('pack-c')).toBeLessThan(names.indexOf('pack-d'));
  });

  it('should throw on circular dependencies', () => {
    const packA = createTestPack('pack-a', '1.0.0', [{ name: 'pack-b' }]);
    const packB = createTestPack('pack-b', '1.0.0', [{ name: 'pack-a' }]);

    expect(() => resolveLoadOrder([packA, packB])).toThrow(
      PackCircularDependencyError
    );
  });

  it('should handle packs with no dependencies', () => {
    const packA = createTestPack('pack-a');
    const packB = createTestPack('pack-b');
    const packC = createTestPack('pack-c');

    const ordered = resolveLoadOrder([packA, packB, packC]);
    expect(ordered).toHaveLength(3);
  });

  it('should skip external dependencies', () => {
    const packA = createTestPack('pack-a', '1.0.0', [
      { name: 'external-pack' },
    ]);

    // Should not throw - external dependency is ignored
    const ordered = resolveLoadOrder([packA]);
    expect(ordered).toHaveLength(1);
  });
});

describe('getLoadedPackNames', () => {
  beforeEach(() => {
    packRegistry.clear();
  });

  it('should return only loaded packs', () => {
    const pack1 = createTestPack('pack-1');
    const pack2 = createTestPack('pack-2');
    const pack3 = createTestPack('pack-3');

    packRegistry.register(pack1);
    packRegistry.register(pack2);
    packRegistry.register(pack3);
    packRegistry.loadPack('pack-1');
    packRegistry.loadPack('pack-2');

    const loaded = packRegistry.getLoadedPackNames();
    expect(loaded).toContain('pack-1');
    expect(loaded).toContain('pack-2');
    expect(loaded).not.toContain('pack-3');
  });
});
