// Tests for Revision Diffing Utility (Phase 8.2)

import { describe, it, expect } from 'vitest';
import type { Revision, PageDoc, Block } from '@omnilith/protocol';
import { diffRevisions, diffPageDocs, summarizeDiff } from './diff.js';

// --- Test Fixtures ---

function createTestRevision(
  version: number,
  overrides: Partial<Revision['snapshot']> = {}
): Revision {
  return {
    id: `rev-${version}`,
    artifactId: 'artifact-1',
    version,
    snapshot: {
      title: `Title v${version}`,
      about: `About v${version}`,
      notes: `Notes v${version}`,
      page: {
        version: 1,
        blocks: [
          { id: 'block-1', type: 'paragraph', content: `Content v${version}` },
        ],
      },
      status: 'draft',
      ...overrides,
    },
    authorNodeId: 'author-1',
    message: `Version ${version}`,
    createdAt: new Date().toISOString(),
  };
}

function createPageDoc(blocks: Block[]): PageDoc {
  return { version: 1, blocks };
}

function createBlock(
  id: string,
  type: string,
  content: unknown,
  metadata?: Record<string, unknown>
): Block {
  return { id, type, content, metadata };
}

// --- Tests ---

describe('diffRevisions', () => {
  describe('field changes', () => {
    it('detects title change', () => {
      const old = createTestRevision(1, { title: 'Old Title' });
      const new_ = createTestRevision(2, { title: 'New Title' });

      const diff = diffRevisions(old, new_);

      expect(diff.hasChanges).toBe(true);
      expect(diff.fieldChanges).toContainEqual({
        field: 'title',
        changeType: 'modified',
        oldValue: 'Old Title',
        newValue: 'New Title',
      });
    });

    it('detects about change', () => {
      const old = createTestRevision(1, { about: 'Old about' });
      const new_ = createTestRevision(2, { about: 'New about' });

      const diff = diffRevisions(old, new_);

      expect(diff.fieldChanges).toContainEqual({
        field: 'about',
        changeType: 'modified',
        oldValue: 'Old about',
        newValue: 'New about',
      });
    });

    it('detects status change', () => {
      const old = createTestRevision(1, { status: 'draft' });
      const new_ = createTestRevision(2, { status: 'active' });

      const diff = diffRevisions(old, new_);

      expect(diff.fieldChanges).toContainEqual({
        field: 'status',
        changeType: 'modified',
        oldValue: 'draft',
        newValue: 'active',
      });
    });

    it('detects notes added', () => {
      const old = createTestRevision(1, { notes: undefined });
      const new_ = createTestRevision(2, { notes: 'New notes' });

      const diff = diffRevisions(old, new_);

      expect(diff.fieldChanges).toContainEqual({
        field: 'notes',
        changeType: 'added',
        oldValue: undefined,
        newValue: 'New notes',
      });
    });

    it('detects notes removed', () => {
      const old = createTestRevision(1, { notes: 'Old notes' });
      const new_ = createTestRevision(2, { notes: undefined });

      const diff = diffRevisions(old, new_);

      expect(diff.fieldChanges).toContainEqual({
        field: 'notes',
        changeType: 'removed',
        oldValue: 'Old notes',
        newValue: undefined,
      });
    });

    it('detects multiple field changes', () => {
      const old = createTestRevision(1, {
        title: 'Old Title',
        about: 'Old about',
        notes: 'Same notes',
        status: 'draft',
      });
      const new_ = createTestRevision(2, {
        title: 'New Title',
        about: 'New about',
        notes: 'Same notes', // Keep notes the same
        status: 'active',
      });
      // Make pages identical to isolate field changes
      new_.snapshot.page = old.snapshot.page;

      const diff = diffRevisions(old, new_);

      expect(diff.summary.fieldsChanged).toBe(3); // title, about, status
    });

    it('reports no changes when fields are identical', () => {
      const old = createTestRevision(1, { title: 'Same' });
      const new_ = createTestRevision(2, { title: 'Same' });
      // Force same about and notes
      new_.snapshot.about = old.snapshot.about;
      new_.snapshot.notes = old.snapshot.notes;
      new_.snapshot.page = old.snapshot.page;

      const diff = diffRevisions(old, new_);

      expect(diff.fieldChanges).toHaveLength(0);
    });
  });

  describe('block changes', () => {
    it('detects added block', () => {
      const old = createTestRevision(1, {
        page: createPageDoc([createBlock('b1', 'paragraph', 'Content 1')]),
      });
      const new_ = createTestRevision(2, {
        page: createPageDoc([
          createBlock('b1', 'paragraph', 'Content 1'),
          createBlock('b2', 'paragraph', 'Content 2'),
        ]),
      });

      const diff = diffRevisions(old, new_);

      expect(diff.summary.blocksAdded).toBe(1);
      expect(diff.blockChanges).toContainEqual(
        expect.objectContaining({
          blockId: 'b2',
          changeType: 'added',
        })
      );
    });

    it('detects removed block', () => {
      const old = createTestRevision(1, {
        page: createPageDoc([
          createBlock('b1', 'paragraph', 'Content 1'),
          createBlock('b2', 'paragraph', 'Content 2'),
        ]),
      });
      const new_ = createTestRevision(2, {
        page: createPageDoc([createBlock('b1', 'paragraph', 'Content 1')]),
      });

      const diff = diffRevisions(old, new_);

      expect(diff.summary.blocksRemoved).toBe(1);
      expect(diff.blockChanges).toContainEqual(
        expect.objectContaining({
          blockId: 'b2',
          changeType: 'removed',
        })
      );
    });

    it('detects modified block content', () => {
      const old = createTestRevision(1, {
        page: createPageDoc([createBlock('b1', 'paragraph', 'Old content')]),
      });
      const new_ = createTestRevision(2, {
        page: createPageDoc([createBlock('b1', 'paragraph', 'New content')]),
      });

      const diff = diffRevisions(old, new_);

      expect(diff.summary.blocksModified).toBe(1);
      expect(diff.blockChanges).toContainEqual(
        expect.objectContaining({
          blockId: 'b1',
          changeType: 'modified',
          contentChanged: true,
        })
      );
    });

    it('detects modified block metadata', () => {
      const old = createTestRevision(1, {
        page: createPageDoc([
          createBlock('b1', 'paragraph', 'Content', { highlight: false }),
        ]),
      });
      const new_ = createTestRevision(2, {
        page: createPageDoc([
          createBlock('b1', 'paragraph', 'Content', { highlight: true }),
        ]),
      });

      const diff = diffRevisions(old, new_);

      expect(diff.blockChanges).toContainEqual(
        expect.objectContaining({
          blockId: 'b1',
          changeType: 'modified',
          metadataChanged: true,
        })
      );
    });

    it('detects block type change', () => {
      const old = createTestRevision(1, {
        page: createPageDoc([createBlock('b1', 'paragraph', 'Content')]),
      });
      const new_ = createTestRevision(2, {
        page: createPageDoc([createBlock('b1', 'heading', 'Content')]),
      });

      const diff = diffRevisions(old, new_);

      expect(diff.summary.blocksModified).toBe(1);
    });

    it('handles complex nested content', () => {
      const old = createTestRevision(1, {
        page: createPageDoc([
          createBlock('b1', 'list', {
            items: ['item 1', 'item 2'],
            ordered: false,
          }),
        ]),
      });
      const new_ = createTestRevision(2, {
        page: createPageDoc([
          createBlock('b1', 'list', {
            items: ['item 1', 'item 2', 'item 3'],
            ordered: false,
          }),
        ]),
      });

      const diff = diffRevisions(old, new_);

      expect(diff.blockChanges).toContainEqual(
        expect.objectContaining({
          blockId: 'b1',
          changeType: 'modified',
          contentChanged: true,
        })
      );
    });

    it('reports no block changes when page is identical', () => {
      const page = createPageDoc([createBlock('b1', 'paragraph', 'Content')]);
      const old = createTestRevision(1, { page });
      const new_ = createTestRevision(2, { page });

      const diff = diffRevisions(old, new_);

      expect(diff.blockChanges).toHaveLength(0);
    });
  });

  describe('version tracking', () => {
    it('tracks from and to versions', () => {
      const old = createTestRevision(3);
      const new_ = createTestRevision(5);

      const diff = diffRevisions(old, new_);

      expect(diff.fromVersion).toBe(3);
      expect(diff.toVersion).toBe(5);
    });
  });

  describe('summary', () => {
    it('provides accurate summary', () => {
      const old = createTestRevision(1, {
        title: 'Old',
        about: 'Same about',
        notes: 'Same notes',
        page: createPageDoc([
          createBlock('b1', 'paragraph', 'Keep'),
          createBlock('b2', 'paragraph', 'Modify'),
          createBlock('b3', 'paragraph', 'Remove'),
        ]),
      });
      const new_ = createTestRevision(2, {
        title: 'New',
        about: 'Same about', // Keep same
        notes: 'Same notes', // Keep same
        page: createPageDoc([
          createBlock('b1', 'paragraph', 'Keep'),
          createBlock('b2', 'paragraph', 'Modified'),
          createBlock('b4', 'paragraph', 'Added'),
        ]),
      });

      const diff = diffRevisions(old, new_);

      expect(diff.summary).toEqual({
        fieldsChanged: 1, // only title changed
        blocksAdded: 1,
        blocksRemoved: 1,
        blocksModified: 1,
      });
    });
  });
});

describe('diffPageDocs', () => {
  it('compares two pages directly', () => {
    const oldPage = createPageDoc([
      createBlock('b1', 'paragraph', 'Old'),
      createBlock('b2', 'paragraph', 'Remove'),
    ]);
    const newPage = createPageDoc([
      createBlock('b1', 'paragraph', 'New'),
      createBlock('b3', 'paragraph', 'Add'),
    ]);

    const changes = diffPageDocs(oldPage, newPage);

    expect(changes).toHaveLength(3);
    expect(changes.map((c) => c.changeType).sort()).toEqual([
      'added',
      'modified',
      'removed',
    ]);
  });

  it('returns empty array for identical pages', () => {
    const page = createPageDoc([createBlock('b1', 'paragraph', 'Content')]);

    const changes = diffPageDocs(page, page);

    expect(changes).toHaveLength(0);
  });
});

describe('summarizeDiff', () => {
  it('returns "No changes" when nothing changed', () => {
    const rev = createTestRevision(1);
    const diff = diffRevisions(rev, rev);

    const summary = summarizeDiff(diff);

    expect(summary).toBe('No changes');
  });

  it('describes field changes', () => {
    const old = createTestRevision(1, { title: 'Old' });
    const new_ = createTestRevision(2, { title: 'New' });
    // Make pages identical
    new_.snapshot.page = old.snapshot.page;
    new_.snapshot.about = old.snapshot.about;
    new_.snapshot.notes = old.snapshot.notes;

    const diff = diffRevisions(old, new_);
    const summary = summarizeDiff(diff);

    expect(summary).toContain('Updated title');
  });

  it('describes status change specifically', () => {
    const old = createTestRevision(1, { status: 'draft' });
    const new_ = createTestRevision(2, { status: 'active' });
    new_.snapshot.page = old.snapshot.page;
    new_.snapshot.about = old.snapshot.about;
    new_.snapshot.notes = old.snapshot.notes;
    new_.snapshot.title = old.snapshot.title;

    const diff = diffRevisions(old, new_);
    const summary = summarizeDiff(diff);

    expect(summary).toContain('Status: draft → active');
  });

  it('describes notes added', () => {
    const old = createTestRevision(1, { notes: undefined });
    const new_ = createTestRevision(2, { notes: 'Notes' });
    new_.snapshot.page = old.snapshot.page;
    new_.snapshot.about = old.snapshot.about;
    new_.snapshot.title = old.snapshot.title;

    const diff = diffRevisions(old, new_);
    const summary = summarizeDiff(diff);

    expect(summary).toContain('Added notes');
  });

  it('describes block changes', () => {
    const old = createTestRevision(1, {
      page: createPageDoc([createBlock('b1', 'paragraph', 'Content')]),
    });
    const new_ = createTestRevision(2, {
      page: createPageDoc([
        createBlock('b1', 'paragraph', 'Content'),
        createBlock('b2', 'paragraph', 'New'),
        createBlock('b3', 'paragraph', 'New 2'),
      ]),
    });
    // Make fields identical
    new_.snapshot.title = old.snapshot.title;
    new_.snapshot.about = old.snapshot.about;
    new_.snapshot.notes = old.snapshot.notes;

    const diff = diffRevisions(old, new_);
    const summary = summarizeDiff(diff);

    expect(summary).toContain('2 blocks added');
  });

  it('uses singular for single block', () => {
    const old = createTestRevision(1, {
      page: createPageDoc([createBlock('b1', 'paragraph', 'Content')]),
    });
    const new_ = createTestRevision(2, {
      page: createPageDoc([createBlock('b1', 'paragraph', 'Modified')]),
    });
    new_.snapshot.title = old.snapshot.title;
    new_.snapshot.about = old.snapshot.about;
    new_.snapshot.notes = old.snapshot.notes;

    const diff = diffRevisions(old, new_);
    const summary = summarizeDiff(diff);

    expect(summary).toContain('1 block modified');
  });

  it('combines multiple change types', () => {
    const old = createTestRevision(1, {
      title: 'Old',
      page: createPageDoc([createBlock('b1', 'paragraph', 'Old')]),
    });
    const new_ = createTestRevision(2, {
      title: 'New',
      page: createPageDoc([
        createBlock('b1', 'paragraph', 'New'),
        createBlock('b2', 'paragraph', 'Added'),
      ]),
    });
    new_.snapshot.about = old.snapshot.about;
    new_.snapshot.notes = old.snapshot.notes;

    const diff = diffRevisions(old, new_);
    const summary = summarizeDiff(diff);

    expect(summary).toContain('Updated title');
    expect(summary).toContain('1 block added');
    expect(summary).toContain('1 block modified');
  });
});
