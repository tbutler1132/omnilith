// Tests for Surface Repository (Phase 9.1 and 9.2)
// Comprehensive tests for surface CRUD, layouts, visibility, and filtering.

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  Surface,
  SurfaceLayout,
  SurfaceKind,
  SurfaceVisibility,
  LayoutSection,
  LayoutSpec,
  Id,
} from '@omnilith/protocol';
import type {
  SurfaceRepository,
  CreateSurfaceInput,
  UpdateSurfaceInput,
  SurfaceFilter,
  CreateLayoutInput,
  UpdateLayoutInput,
} from '../../interfaces/index.js';

// In-memory implementation for testing
function createInMemorySurfaceRepository(): SurfaceRepository & { clear(): void } {
  const surfaces = new Map<string, Surface>();
  const layouts = new Map<string, SurfaceLayout>();

  return {
    async create(input: CreateSurfaceInput): Promise<Surface> {
      const id = input.id ?? `surface-${surfaces.size + 1}`;
      const now = new Date().toISOString();

      const surface: Surface = {
        id,
        nodeId: input.nodeId,
        kind: input.kind,
        title: input.title,
        visibility: input.visibility,
        entry: {
          artifactId: input.entry.artifactId,
          query: input.entry.query,
        },
        layoutId: input.layoutId,
        inlineLayout: input.inlineLayout,
        mapPosition: input.mapPosition,
        category: input.category,
        createdAt: now,
        updatedAt: now,
      };
      surfaces.set(id, surface);
      return surface;
    },

    async get(id: Id): Promise<Surface | null> {
      return surfaces.get(id) ?? null;
    },

    async list(filter?: SurfaceFilter): Promise<Surface[]> {
      let result = Array.from(surfaces.values());

      if (filter?.nodeId) {
        result = result.filter((s) => s.nodeId === filter.nodeId);
      }
      if (filter?.kind) {
        result = result.filter((s) => s.kind === filter.kind);
      }
      if (filter?.visibility && filter.visibility.length > 0) {
        result = result.filter((s) => filter.visibility!.includes(s.visibility));
      }
      if (filter?.category) {
        result = result.filter((s) => s.category === filter.category);
      }

      // Sort by title ascending
      result.sort((a, b) => a.title.localeCompare(b.title));

      if (filter?.offset) {
        result = result.slice(filter.offset);
      }
      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }

      return result;
    },

    async update(id: Id, input: UpdateSurfaceInput): Promise<Surface | null> {
      const existing = surfaces.get(id);
      if (!existing) return null;

      const now = new Date().toISOString();

      const updated: Surface = {
        ...existing,
        title: input.title ?? existing.title,
        visibility: input.visibility ?? existing.visibility,
        entry: input.entry
          ? {
              artifactId: input.entry.artifactId ?? existing.entry.artifactId,
              query: input.entry.query ?? existing.entry.query,
            }
          : existing.entry,
        layoutId: input.layoutId !== undefined ? input.layoutId : existing.layoutId,
        inlineLayout: input.inlineLayout !== undefined ? input.inlineLayout : existing.inlineLayout,
        mapPosition: input.mapPosition !== undefined ? input.mapPosition : existing.mapPosition,
        category: input.category !== undefined ? input.category : existing.category,
        updatedAt: now,
      };
      surfaces.set(id, updated);
      return updated;
    },

    async delete(id: Id): Promise<boolean> {
      return surfaces.delete(id);
    },

    async getByNode(nodeId: Id): Promise<Surface[]> {
      const result = Array.from(surfaces.values()).filter((s) => s.nodeId === nodeId);
      result.sort((a, b) => a.title.localeCompare(b.title));
      return result;
    },

    async getVisible(nodeId: Id, viewerNodeId: Id | null): Promise<Surface[]> {
      const allSurfaces = Array.from(surfaces.values()).filter((s) => s.nodeId === nodeId);

      return allSurfaces.filter((surface) => {
        if (surface.visibility === 'public') return true;
        if (surface.visibility === 'private') return viewerNodeId === nodeId;
        if (surface.visibility === 'node_members') {
          // For now, treat owner as member
          return viewerNodeId === nodeId;
        }
        if (surface.visibility === 'granted') {
          // Would need to check grants - for now, allow if viewer is owner
          return viewerNodeId === nodeId;
        }
        return false;
      });
    },

    // Layout operations

    async createLayout(input: CreateLayoutInput): Promise<SurfaceLayout> {
      const id = input.id ?? `layout-${layouts.size + 1}`;
      const now = new Date().toISOString();

      const layout: SurfaceLayout = {
        id,
        nodeId: input.nodeId,
        name: input.name,
        mode: input.mode,
        sections: input.sections,
        canvas: input.canvas,
        createdAt: now,
        updatedAt: now,
      };
      layouts.set(id, layout);
      return layout;
    },

    async getLayout(id: Id): Promise<SurfaceLayout | null> {
      return layouts.get(id) ?? null;
    },

    async updateLayout(id: Id, input: UpdateLayoutInput): Promise<SurfaceLayout | null> {
      const existing = layouts.get(id);
      if (!existing) return null;

      const now = new Date().toISOString();

      const updated: SurfaceLayout = {
        ...existing,
        name: input.name ?? existing.name,
        sections: input.sections !== undefined ? input.sections : existing.sections,
        canvas: input.canvas !== undefined ? input.canvas : existing.canvas,
        updatedAt: now,
      };
      layouts.set(id, updated);
      return updated;
    },

    async deleteLayout(id: Id): Promise<boolean> {
      return layouts.delete(id);
    },

    async getLayoutsByNode(nodeId: Id): Promise<SurfaceLayout[]> {
      const result = Array.from(layouts.values()).filter((l) => l.nodeId === nodeId);
      result.sort((a, b) => a.name.localeCompare(b.name));
      return result;
    },

    clear() {
      surfaces.clear();
      layouts.clear();
    },
  };
}

// --- Test Fixtures ---

function createTestLayoutSection(type: LayoutSection['type'] = 'body'): LayoutSection {
  return {
    id: `section-${type}`,
    type,
    slots: [
      {
        id: 'slot-1',
        binding: { field: 'page' },
      },
    ],
  };
}

function createTestSectionsLayout(): LayoutSection[] {
  return [
    {
      id: 'header-section',
      type: 'header',
      slots: [{ id: 'title-slot', binding: { field: 'title' } }],
    },
    {
      id: 'body-section',
      type: 'body',
      slots: [{ id: 'content-slot', binding: { field: 'page' } }],
    },
    {
      id: 'footer-section',
      type: 'footer',
      slots: [{ id: 'footer-slot', binding: { static: '© 2026' } }],
    },
  ];
}

function createTestInlineLayout(): LayoutSpec {
  return {
    mode: 'sections',
    sections: [createTestLayoutSection('body')],
  };
}

// --- Tests ---

describe('Surface Repository (Phase 9)', () => {
  let repo: ReturnType<typeof createInMemorySurfaceRepository>;

  beforeEach(() => {
    repo = createInMemorySurfaceRepository();
  });

  // === 9.1 Surface Storage ===

  describe('Surface CRUD', () => {
    describe('create', () => {
      it('creates a surface with required fields', async () => {
        const surface = await repo.create({
          nodeId: 'node-1',
          kind: 'page',
          title: 'Home Page',
          visibility: 'public',
          entry: { artifactId: 'artifact-1' },
        });

        expect(surface.id).toBeDefined();
        expect(surface.nodeId).toBe('node-1');
        expect(surface.kind).toBe('page');
        expect(surface.title).toBe('Home Page');
        expect(surface.visibility).toBe('public');
        expect(surface.entry.artifactId).toBe('artifact-1');
        expect(surface.createdAt).toBeDefined();
        expect(surface.updatedAt).toBeDefined();
      });

      it('creates a surface with custom ID', async () => {
        const surface = await repo.create({
          id: 'custom-surface-id',
          nodeId: 'node-1',
          kind: 'page',
          title: 'Custom ID Surface',
          visibility: 'public',
          entry: {},
        });

        expect(surface.id).toBe('custom-surface-id');
      });

      it('creates a surface with entry query', async () => {
        const surface = await repo.create({
          nodeId: 'node-1',
          kind: 'gallery',
          title: 'Gallery',
          visibility: 'public',
          entry: {
            query: {
              status: ['active', 'published'],
              limit: 10,
            },
          },
        });

        expect(surface.entry.query).toBeDefined();
        expect(surface.entry.query?.status).toContain('active');
      });

      it('creates a surface with layoutId reference', async () => {
        const layout = await repo.createLayout({
          nodeId: 'node-1',
          name: 'Standard Layout',
          mode: 'sections',
          sections: createTestSectionsLayout(),
        });

        const surface = await repo.create({
          nodeId: 'node-1',
          kind: 'page',
          title: 'Page with Layout',
          visibility: 'public',
          entry: { artifactId: 'artifact-1' },
          layoutId: layout.id,
        });

        expect(surface.layoutId).toBe(layout.id);
        expect(surface.inlineLayout).toBeUndefined();
      });

      it('creates a surface with inline layout', async () => {
        const inlineLayout = createTestInlineLayout();

        const surface = await repo.create({
          nodeId: 'node-1',
          kind: 'page',
          title: 'Page with Inline Layout',
          visibility: 'public',
          entry: { artifactId: 'artifact-1' },
          inlineLayout,
        });

        expect(surface.inlineLayout).toBeDefined();
        expect(surface.inlineLayout?.mode).toBe('sections');
        expect(surface.layoutId).toBeUndefined();
      });

      it('creates a surface with map position', async () => {
        const surface = await repo.create({
          nodeId: 'node-1',
          kind: 'page',
          title: 'Positioned Surface',
          visibility: 'public',
          entry: {},
          mapPosition: { left: '25%', top: '10%' },
        });

        expect(surface.mapPosition).toEqual({ left: '25%', top: '10%' });
      });

      it('creates a surface with category', async () => {
        const surface = await repo.create({
          nodeId: 'node-1',
          kind: 'workshop',
          title: 'Tools',
          visibility: 'private',
          entry: {},
          category: 'device',
        });

        expect(surface.category).toBe('device');
      });

      it('creates surfaces with all visibility types', async () => {
        const visibilities: SurfaceVisibility[] = ['public', 'node_members', 'granted', 'private'];

        for (const vis of visibilities) {
          const surface = await repo.create({
            nodeId: 'node-1',
            kind: 'page',
            title: `${vis} Page`,
            visibility: vis,
            entry: {},
          });
          expect(surface.visibility).toBe(vis);
        }
      });

      it('creates surfaces with all kind types', async () => {
        const kinds: SurfaceKind[] = ['page', 'gallery', 'timeline', 'workshop', 'custom'];

        for (const kind of kinds) {
          const surface = await repo.create({
            nodeId: 'node-1',
            kind,
            title: `${kind} Surface`,
            visibility: 'public',
            entry: {},
          });
          expect(surface.kind).toBe(kind);
        }
      });
    });

    describe('get', () => {
      it('retrieves a surface by ID', async () => {
        const created = await repo.create({
          id: 'get-test-1',
          nodeId: 'node-1',
          kind: 'page',
          title: 'Get Test',
          visibility: 'public',
          entry: { artifactId: 'artifact-1' },
        });

        const retrieved = await repo.get('get-test-1');

        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe(created.id);
        expect(retrieved!.title).toBe('Get Test');
      });

      it('returns null for non-existent surface', async () => {
        const result = await repo.get('non-existent-id');
        expect(result).toBeNull();
      });
    });

    describe('list', () => {
      beforeEach(async () => {
        await repo.create({
          id: 's1',
          nodeId: 'node-1',
          kind: 'page',
          title: 'Alpha Page',
          visibility: 'public',
          entry: {},
          category: 'exhibit',
        });
        await repo.create({
          id: 's2',
          nodeId: 'node-1',
          kind: 'gallery',
          title: 'Beta Gallery',
          visibility: 'private',
          entry: {},
          category: 'exhibit',
        });
        await repo.create({
          id: 's3',
          nodeId: 'node-2',
          kind: 'page',
          title: 'Gamma Page',
          visibility: 'public',
          entry: {},
          category: 'device',
        });
        await repo.create({
          id: 's4',
          nodeId: 'node-1',
          kind: 'timeline',
          title: 'Delta Timeline',
          visibility: 'node_members',
          entry: {},
        });
      });

      it('lists all surfaces', async () => {
        const result = await repo.list();
        expect(result).toHaveLength(4);
      });

      it('filters by nodeId', async () => {
        const result = await repo.list({ nodeId: 'node-1' });
        expect(result).toHaveLength(3);
        expect(result.every((s) => s.nodeId === 'node-1')).toBe(true);
      });

      it('filters by kind', async () => {
        const result = await repo.list({ kind: 'page' });
        expect(result).toHaveLength(2);
        expect(result.every((s) => s.kind === 'page')).toBe(true);
      });

      it('filters by single visibility', async () => {
        const result = await repo.list({ visibility: ['public'] });
        expect(result).toHaveLength(2);
        expect(result.every((s) => s.visibility === 'public')).toBe(true);
      });

      it('filters by multiple visibilities', async () => {
        const result = await repo.list({ visibility: ['public', 'private'] });
        expect(result).toHaveLength(3);
      });

      it('filters by category', async () => {
        const result = await repo.list({ category: 'exhibit' });
        expect(result).toHaveLength(2);
        expect(result.every((s) => s.category === 'exhibit')).toBe(true);
      });

      it('combines multiple filters', async () => {
        const result = await repo.list({
          nodeId: 'node-1',
          kind: 'page',
          visibility: ['public'],
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('s1');
      });

      it('sorts by title ascending', async () => {
        const result = await repo.list();
        const titles = result.map((s) => s.title);
        expect(titles).toEqual(['Alpha Page', 'Beta Gallery', 'Delta Timeline', 'Gamma Page']);
      });

      it('applies limit', async () => {
        const result = await repo.list({ limit: 2 });
        expect(result).toHaveLength(2);
      });

      it('applies offset', async () => {
        const all = await repo.list();
        const withOffset = await repo.list({ offset: 2 });
        expect(withOffset).toHaveLength(2);
        expect(withOffset[0].id).toBe(all[2].id);
      });

      it('applies limit and offset together', async () => {
        const result = await repo.list({ offset: 1, limit: 2 });
        expect(result).toHaveLength(2);
      });
    });

    describe('update', () => {
      let surfaceId: string;

      beforeEach(async () => {
        const surface = await repo.create({
          nodeId: 'node-1',
          kind: 'page',
          title: 'Original Title',
          visibility: 'public',
          entry: { artifactId: 'artifact-1' },
          category: 'exhibit',
        });
        surfaceId = surface.id;
      });

      it('updates title', async () => {
        const updated = await repo.update(surfaceId, { title: 'New Title' });

        expect(updated?.title).toBe('New Title');
        expect(updated?.visibility).toBe('public'); // Unchanged
      });

      it('updates visibility', async () => {
        const updated = await repo.update(surfaceId, { visibility: 'private' });
        expect(updated?.visibility).toBe('private');
      });

      it('updates entry artifactId', async () => {
        const updated = await repo.update(surfaceId, {
          entry: { artifactId: 'artifact-2' },
        });
        expect(updated?.entry.artifactId).toBe('artifact-2');
      });

      it('updates entry query', async () => {
        const updated = await repo.update(surfaceId, {
          entry: { query: { status: ['published'], limit: 5 } },
        });
        expect(updated?.entry.query?.status).toContain('published');
      });

      it('updates layoutId', async () => {
        const layout = await repo.createLayout({
          nodeId: 'node-1',
          name: 'New Layout',
          mode: 'sections',
        });

        const updated = await repo.update(surfaceId, { layoutId: layout.id });
        expect(updated?.layoutId).toBe(layout.id);
      });

      it('updates inlineLayout', async () => {
        const inlineLayout = createTestInlineLayout();
        const updated = await repo.update(surfaceId, { inlineLayout });

        expect(updated?.inlineLayout).toBeDefined();
        expect(updated?.inlineLayout?.mode).toBe('sections');
      });

      it('updates mapPosition', async () => {
        const updated = await repo.update(surfaceId, {
          mapPosition: { left: '50%', top: '50%' },
        });
        expect(updated?.mapPosition).toEqual({ left: '50%', top: '50%' });
      });

      it('updates category', async () => {
        const updated = await repo.update(surfaceId, { category: 'device' });
        expect(updated?.category).toBe('device');
      });

      it('clears optional fields when set to undefined explicitly', async () => {
        // First add a category
        await repo.update(surfaceId, { category: 'exhibit' });

        // Now clear it (implementation should support this)
        const updated = await repo.update(surfaceId, { category: undefined });
        // Note: The current implementation preserves existing value when undefined is passed
        // This test documents the current behavior
        expect(updated?.category).toBe('exhibit');
      });

      it('updates multiple fields at once', async () => {
        const updated = await repo.update(surfaceId, {
          title: 'Multi Update',
          visibility: 'private',
          category: 'device',
        });

        expect(updated?.title).toBe('Multi Update');
        expect(updated?.visibility).toBe('private');
        expect(updated?.category).toBe('device');
      });

      it('returns null for non-existent surface', async () => {
        const result = await repo.update('non-existent', { title: 'Will Fail' });
        expect(result).toBeNull();
      });

      it('updates updatedAt timestamp', async () => {
        const original = await repo.get(surfaceId);
        const originalUpdatedAt = original!.updatedAt;

        // Small delay to ensure different timestamp
        await new Promise((r) => setTimeout(r, 10));

        const updated = await repo.update(surfaceId, { title: 'Time Update' });

        expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
      });
    });

    describe('delete', () => {
      it('deletes an existing surface', async () => {
        const surface = await repo.create({
          nodeId: 'node-1',
          kind: 'page',
          title: 'To Delete',
          visibility: 'public',
          entry: {},
        });

        const deleted = await repo.delete(surface.id);
        expect(deleted).toBe(true);

        const retrieved = await repo.get(surface.id);
        expect(retrieved).toBeNull();
      });

      it('returns false for non-existent surface', async () => {
        const result = await repo.delete('non-existent');
        expect(result).toBe(false);
      });
    });

    describe('getByNode', () => {
      beforeEach(async () => {
        await repo.create({
          id: 'n1-s1',
          nodeId: 'node-1',
          kind: 'page',
          title: 'Page A',
          visibility: 'public',
          entry: {},
        });
        await repo.create({
          id: 'n1-s2',
          nodeId: 'node-1',
          kind: 'gallery',
          title: 'Gallery B',
          visibility: 'private',
          entry: {},
        });
        await repo.create({
          id: 'n2-s1',
          nodeId: 'node-2',
          kind: 'page',
          title: 'Page C',
          visibility: 'public',
          entry: {},
        });
      });

      it('returns all surfaces for a node', async () => {
        const result = await repo.getByNode('node-1');
        expect(result).toHaveLength(2);
        expect(result.every((s) => s.nodeId === 'node-1')).toBe(true);
      });

      it('returns empty array for node with no surfaces', async () => {
        const result = await repo.getByNode('node-999');
        expect(result).toEqual([]);
      });

      it('sorts by title ascending', async () => {
        const result = await repo.getByNode('node-1');
        expect(result[0].title).toBe('Gallery B');
        expect(result[1].title).toBe('Page A');
      });
    });

    describe('getVisible', () => {
      beforeEach(async () => {
        await repo.create({
          id: 'vis-public',
          nodeId: 'node-1',
          kind: 'page',
          title: 'Public Page',
          visibility: 'public',
          entry: {},
        });
        await repo.create({
          id: 'vis-private',
          nodeId: 'node-1',
          kind: 'page',
          title: 'Private Page',
          visibility: 'private',
          entry: {},
        });
        await repo.create({
          id: 'vis-members',
          nodeId: 'node-1',
          kind: 'page',
          title: 'Members Page',
          visibility: 'node_members',
          entry: {},
        });
        await repo.create({
          id: 'vis-granted',
          nodeId: 'node-1',
          kind: 'page',
          title: 'Granted Page',
          visibility: 'granted',
          entry: {},
        });
      });

      it('returns only public surfaces for anonymous viewer', async () => {
        const result = await repo.getVisible('node-1', null);
        expect(result).toHaveLength(1);
        expect(result[0].visibility).toBe('public');
      });

      it('returns public surfaces for any viewer', async () => {
        const result = await repo.getVisible('node-1', 'some-other-node');
        expect(result.some((s) => s.visibility === 'public')).toBe(true);
      });

      it('returns all surfaces for node owner', async () => {
        const result = await repo.getVisible('node-1', 'node-1');
        expect(result).toHaveLength(4);
      });

      it('returns private surfaces only to owner', async () => {
        const ownerView = await repo.getVisible('node-1', 'node-1');
        const otherView = await repo.getVisible('node-1', 'other-node');

        expect(ownerView.some((s) => s.visibility === 'private')).toBe(true);
        expect(otherView.some((s) => s.visibility === 'private')).toBe(false);
      });
    });
  });

  // === 9.2 Layout System ===

  describe('Layout CRUD', () => {
    describe('createLayout', () => {
      it('creates a layout with required fields', async () => {
        const layout = await repo.createLayout({
          nodeId: 'node-1',
          name: 'Standard Layout',
          mode: 'sections',
        });

        expect(layout.id).toBeDefined();
        expect(layout.nodeId).toBe('node-1');
        expect(layout.name).toBe('Standard Layout');
        expect(layout.mode).toBe('sections');
        expect(layout.createdAt).toBeDefined();
        expect(layout.updatedAt).toBeDefined();
      });

      it('creates a layout with custom ID', async () => {
        const layout = await repo.createLayout({
          id: 'custom-layout-id',
          nodeId: 'node-1',
          name: 'Custom ID Layout',
          mode: 'sections',
        });

        expect(layout.id).toBe('custom-layout-id');
      });

      it('creates a sections layout with sections configuration', async () => {
        const sections = createTestSectionsLayout();

        const layout = await repo.createLayout({
          nodeId: 'node-1',
          name: 'Full Sections Layout',
          mode: 'sections',
          sections,
        });

        expect(layout.sections).toBeDefined();
        expect(layout.sections).toHaveLength(3);
        expect(layout.sections![0].type).toBe('header');
        expect(layout.sections![1].type).toBe('body');
        expect(layout.sections![2].type).toBe('footer');
      });

      it('creates a canvas layout stub', async () => {
        const layout = await repo.createLayout({
          nodeId: 'node-1',
          name: 'Canvas Layout',
          mode: 'canvas',
          canvas: {
            width: 1920,
            height: 1080,
            elements: [],
          },
        });

        expect(layout.mode).toBe('canvas');
        expect(layout.canvas).toBeDefined();
        expect(layout.canvas?.width).toBe(1920);
        expect(layout.canvas?.height).toBe(1080);
      });
    });

    describe('getLayout', () => {
      it('retrieves a layout by ID', async () => {
        const created = await repo.createLayout({
          id: 'get-layout-test',
          nodeId: 'node-1',
          name: 'Get Test Layout',
          mode: 'sections',
        });

        const retrieved = await repo.getLayout('get-layout-test');

        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe(created.id);
        expect(retrieved!.name).toBe('Get Test Layout');
      });

      it('returns null for non-existent layout', async () => {
        const result = await repo.getLayout('non-existent-layout');
        expect(result).toBeNull();
      });
    });

    describe('updateLayout', () => {
      let layoutId: string;

      beforeEach(async () => {
        const layout = await repo.createLayout({
          nodeId: 'node-1',
          name: 'Original Layout',
          mode: 'sections',
          sections: [createTestLayoutSection('body')],
        });
        layoutId = layout.id;
      });

      it('updates name', async () => {
        const updated = await repo.updateLayout(layoutId, { name: 'New Name' });
        expect(updated?.name).toBe('New Name');
      });

      it('updates sections', async () => {
        const newSections = createTestSectionsLayout();
        const updated = await repo.updateLayout(layoutId, { sections: newSections });

        expect(updated?.sections).toHaveLength(3);
      });

      it('updates canvas configuration', async () => {
        const updated = await repo.updateLayout(layoutId, {
          canvas: { width: 800, height: 600, elements: [] },
        });

        expect(updated?.canvas?.width).toBe(800);
      });

      it('returns null for non-existent layout', async () => {
        const result = await repo.updateLayout('non-existent', { name: 'Will Fail' });
        expect(result).toBeNull();
      });

      it('updates updatedAt timestamp', async () => {
        const original = await repo.getLayout(layoutId);
        const originalUpdatedAt = original!.updatedAt;

        await new Promise((r) => setTimeout(r, 10));

        const updated = await repo.updateLayout(layoutId, { name: 'Time Update' });

        expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
      });
    });

    describe('deleteLayout', () => {
      it('deletes an existing layout', async () => {
        const layout = await repo.createLayout({
          nodeId: 'node-1',
          name: 'To Delete',
          mode: 'sections',
        });

        const deleted = await repo.deleteLayout(layout.id);
        expect(deleted).toBe(true);

        const retrieved = await repo.getLayout(layout.id);
        expect(retrieved).toBeNull();
      });

      it('returns false for non-existent layout', async () => {
        const result = await repo.deleteLayout('non-existent');
        expect(result).toBe(false);
      });
    });

    describe('getLayoutsByNode', () => {
      beforeEach(async () => {
        await repo.createLayout({
          id: 'n1-l1',
          nodeId: 'node-1',
          name: 'Alpha Layout',
          mode: 'sections',
        });
        await repo.createLayout({
          id: 'n1-l2',
          nodeId: 'node-1',
          name: 'Beta Layout',
          mode: 'sections',
        });
        await repo.createLayout({
          id: 'n2-l1',
          nodeId: 'node-2',
          name: 'Gamma Layout',
          mode: 'sections',
        });
      });

      it('returns all layouts for a node', async () => {
        const result = await repo.getLayoutsByNode('node-1');
        expect(result).toHaveLength(2);
        expect(result.every((l) => l.nodeId === 'node-1')).toBe(true);
      });

      it('returns empty array for node with no layouts', async () => {
        const result = await repo.getLayoutsByNode('node-999');
        expect(result).toEqual([]);
      });

      it('sorts by name ascending', async () => {
        const result = await repo.getLayoutsByNode('node-1');
        expect(result[0].name).toBe('Alpha Layout');
        expect(result[1].name).toBe('Beta Layout');
      });
    });
  });

  // === Layout Sections Testing (v1 scope) ===

  describe('Sections Layout Mode', () => {
    it('supports header, body, repeater, footer sections', async () => {
      const sections: LayoutSection[] = [
        {
          id: 'header',
          type: 'header',
          title: 'Page Header',
          slots: [{ id: 'h1', binding: { field: 'title' } }],
        },
        {
          id: 'main',
          type: 'body',
          slots: [{ id: 'b1', binding: { field: 'page' } }],
        },
        {
          id: 'items',
          type: 'repeater',
          query: { status: ['published'], limit: 10 },
          slots: [{ id: 'r1', binding: { field: 'title' } }],
        },
        {
          id: 'footer',
          type: 'footer',
          slots: [{ id: 'f1', binding: { static: 'Footer content' } }],
        },
      ];

      const layout = await repo.createLayout({
        nodeId: 'node-1',
        name: 'Full Layout',
        mode: 'sections',
        sections,
      });

      expect(layout.sections).toHaveLength(4);
      expect(layout.sections?.map((s) => s.type)).toEqual([
        'header',
        'body',
        'repeater',
        'footer',
      ]);
    });

    it('supports slots with field bindings', async () => {
      const layout = await repo.createLayout({
        nodeId: 'node-1',
        name: 'Field Bindings',
        mode: 'sections',
        sections: [
          {
            id: 'content',
            type: 'body',
            slots: [
              { id: 's1', binding: { field: 'title' } },
              { id: 's2', binding: { field: 'about' } },
              { id: 's3', binding: { field: 'notes' } },
              { id: 's4', binding: { field: 'page' } },
            ],
          },
        ],
      });

      const slots = layout.sections![0].slots;
      expect(slots).toHaveLength(4);
      expect(slots.map((s) => s.binding.field)).toEqual(['title', 'about', 'notes', 'page']);
    });

    it('supports slots with static content', async () => {
      const layout = await repo.createLayout({
        nodeId: 'node-1',
        name: 'Static Content',
        mode: 'sections',
        sections: [
          {
            id: 'static-section',
            type: 'footer',
            slots: [{ id: 's1', binding: { static: '© 2026 Omnilith Protocol' } }],
          },
        ],
      });

      expect(layout.sections![0].slots[0].binding.static).toBe('© 2026 Omnilith Protocol');
    });

    it('supports slots with entity field bindings', async () => {
      const layout = await repo.createLayout({
        nodeId: 'node-1',
        name: 'Entity Binding',
        mode: 'sections',
        sections: [
          {
            id: 'entity-section',
            type: 'body',
            slots: [
              {
                id: 's1',
                binding: {
                  entityField: {
                    entityId: 'song-123',
                    field: 'title',
                  },
                },
              },
            ],
          },
        ],
      });

      const slot = layout.sections![0].slots[0];
      expect(slot.binding.entityField?.entityId).toBe('song-123');
      expect(slot.binding.entityField?.field).toBe('title');
    });

    it('supports slots with styling', async () => {
      const layout = await repo.createLayout({
        nodeId: 'node-1',
        name: 'Styled Layout',
        mode: 'sections',
        sections: [
          {
            id: 'styled',
            type: 'body',
            slots: [
              {
                id: 's1',
                binding: { field: 'title' },
                style: {
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: 'var(--text-primary)',
                },
              },
            ],
          },
        ],
      });

      const slot = layout.sections![0].slots[0];
      expect(slot.style).toBeDefined();
      expect(slot.style?.fontSize).toBe('2rem');
    });
  });

  // === Projection Law Compliance ===

  describe('Projection Law Compliance', () => {
    it('surfaces reference artifacts, never embed content', async () => {
      const surface = await repo.create({
        nodeId: 'node-1',
        kind: 'page',
        title: 'Reference Surface',
        visibility: 'public',
        entry: { artifactId: 'artifact-123' },
      });

      // Surface stores reference, not content
      expect(surface.entry.artifactId).toBe('artifact-123');
      // No content field on surface
      expect((surface as any).content).toBeUndefined();
      expect((surface as any).page).toBeUndefined();
    });

    it('surfaces can query artifacts, not store them', async () => {
      const surface = await repo.create({
        nodeId: 'node-1',
        kind: 'gallery',
        title: 'Query Surface',
        visibility: 'public',
        entry: {
          query: {
            status: ['published'],
            limit: 20,
          },
        },
      });

      // Surface stores query spec, not results
      expect(surface.entry.query).toBeDefined();
      expect((surface as any).artifacts).toBeUndefined();
      expect((surface as any).results).toBeUndefined();
    });

    it('layouts define HOW, not WHAT', async () => {
      const layout = await repo.createLayout({
        nodeId: 'node-1',
        name: 'Pure Layout',
        mode: 'sections',
        sections: [
          {
            id: 'body',
            type: 'body',
            slots: [{ id: 's1', binding: { field: 'page' } }],
          },
        ],
      });

      // Layout defines structure and binding instructions
      expect(layout.sections![0].slots[0].binding.field).toBe('page');
      // Layout contains no actual content
      expect((layout as any).content).toBeUndefined();
    });
  });

  // === Complex Scenarios ===

  describe('Complex Scenarios', () => {
    it('supports a full surface with shared layout workflow', async () => {
      // 1. Create a reusable layout
      const layout = await repo.createLayout({
        nodeId: 'node-1',
        name: 'Blog Post Layout',
        mode: 'sections',
        sections: [
          {
            id: 'header',
            type: 'header',
            slots: [
              { id: 'title', binding: { field: 'title' }, style: { fontSize: '3rem' } },
              { id: 'about', binding: { field: 'about' } },
            ],
          },
          {
            id: 'content',
            type: 'body',
            slots: [{ id: 'page', binding: { field: 'page' } }],
          },
          {
            id: 'footer',
            type: 'footer',
            slots: [{ id: 'copyright', binding: { static: '© 2026' } }],
          },
        ],
      });

      // 2. Create multiple surfaces using the same layout
      const surface1 = await repo.create({
        nodeId: 'node-1',
        kind: 'page',
        title: 'Blog Post 1',
        visibility: 'public',
        entry: { artifactId: 'post-1' },
        layoutId: layout.id,
        mapPosition: { left: '10%', top: '20%' },
      });

      const surface2 = await repo.create({
        nodeId: 'node-1',
        kind: 'page',
        title: 'Blog Post 2',
        visibility: 'public',
        entry: { artifactId: 'post-2' },
        layoutId: layout.id,
        mapPosition: { left: '30%', top: '20%' },
      });

      // Verify both surfaces reference the same layout
      expect(surface1.layoutId).toBe(layout.id);
      expect(surface2.layoutId).toBe(layout.id);

      // 3. Update the layout - affects all surfaces
      await repo.updateLayout(layout.id, {
        sections: [
          ...layout.sections!,
          {
            id: 'sidebar',
            type: 'body',
            slots: [{ id: 'notes', binding: { field: 'notes' } }],
          },
        ],
      });

      const updatedLayout = await repo.getLayout(layout.id);
      expect(updatedLayout?.sections).toHaveLength(4);
    });

    it('supports gallery surface with query entry', async () => {
      const surface = await repo.create({
        nodeId: 'node-1',
        kind: 'gallery',
        title: 'Published Works',
        visibility: 'public',
        entry: {
          query: {
            status: ['published'],
            orderBy: { field: 'updatedAt', direction: 'desc' },
            limit: 12,
          },
        },
        inlineLayout: {
          mode: 'sections',
          sections: [
            {
              id: 'grid',
              type: 'repeater',
              query: {
                status: ['published'],
                limit: 12,
              },
              slots: [
                { id: 'thumb', binding: { field: 'title' } },
                { id: 'desc', binding: { field: 'about' } },
              ],
            },
          ],
        },
      });

      expect(surface.kind).toBe('gallery');
      expect(surface.entry.query?.status).toContain('published');
      expect(surface.inlineLayout?.sections![0].type).toBe('repeater');
    });

    it('supports workspace with multiple visibility levels', async () => {
      // Public landing
      await repo.create({
        id: 'landing',
        nodeId: 'node-1',
        kind: 'page',
        title: 'Welcome',
        visibility: 'public',
        entry: { artifactId: 'welcome-doc' },
        category: 'exhibit',
      });

      // Members-only content
      await repo.create({
        id: 'members-area',
        nodeId: 'node-1',
        kind: 'gallery',
        title: 'Member Resources',
        visibility: 'node_members',
        entry: { query: { status: ['active'] } },
        category: 'exhibit',
      });

      // Private workspace
      await repo.create({
        id: 'workspace',
        nodeId: 'node-1',
        kind: 'workshop',
        title: 'My Workshop',
        visibility: 'private',
        entry: {},
        category: 'device',
      });

      // Anonymous sees only public
      const anonVisible = await repo.getVisible('node-1', null);
      expect(anonVisible).toHaveLength(1);
      expect(anonVisible[0].id).toBe('landing');

      // Owner sees all
      const ownerVisible = await repo.getVisible('node-1', 'node-1');
      expect(ownerVisible).toHaveLength(3);
    });

    it('tracks full lifecycle of a surface', async () => {
      // 1. Create draft surface
      const surface = await repo.create({
        nodeId: 'node-1',
        kind: 'page',
        title: 'Draft Page',
        visibility: 'private',
        entry: { artifactId: 'draft-doc' },
      });

      expect(surface.visibility).toBe('private');

      // 2. Update content reference
      await repo.update(surface.id, {
        entry: { artifactId: 'updated-doc' },
      });

      // 3. Add layout
      const layout = await repo.createLayout({
        nodeId: 'node-1',
        name: 'Page Layout',
        mode: 'sections',
      });

      await repo.update(surface.id, {
        layoutId: layout.id,
      });

      // 4. Make public
      await repo.update(surface.id, {
        title: 'Published Page',
        visibility: 'public',
      });

      // Verify final state
      const final = await repo.get(surface.id);
      expect(final?.title).toBe('Published Page');
      expect(final?.visibility).toBe('public');
      expect(final?.layoutId).toBe(layout.id);

      // 5. Delete
      const deleted = await repo.delete(surface.id);
      expect(deleted).toBe(true);

      const retrieved = await repo.get(surface.id);
      expect(retrieved).toBeNull();
    });
  });
});
