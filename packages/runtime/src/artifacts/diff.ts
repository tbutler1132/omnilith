// Revision Diffing Utility (Phase 8.2)
//
// Compares two artifact revisions and returns the differences.
// Used for displaying revision history and understanding what changed.

import type { Revision, Block, PageDoc } from '@omnilith/protocol';

/**
 * Types of changes that can occur between revisions
 */
export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

/**
 * A single field change
 */
export type FieldChange<T = unknown> = {
  field: string;
  changeType: ChangeType;
  oldValue?: T;
  newValue?: T;
};

/**
 * Changes to a block within a PageDoc
 */
export type BlockChange = {
  blockId: string;
  changeType: ChangeType;
  oldBlock?: Block;
  newBlock?: Block;
  contentChanged?: boolean;
  metadataChanged?: boolean;
};

/**
 * Summary of all differences between two revisions
 */
export type RevisionDiff = {
  /** The older revision being compared */
  fromVersion: number;
  /** The newer revision being compared */
  toVersion: number;
  /** Whether any changes exist */
  hasChanges: boolean;
  /** Simple text field changes (title, about, notes, status) */
  fieldChanges: FieldChange[];
  /** Block-level changes in the page content */
  blockChanges: BlockChange[];
  /** Summary statistics */
  summary: {
    fieldsChanged: number;
    blocksAdded: number;
    blocksRemoved: number;
    blocksModified: number;
  };
};

/**
 * Compare two artifact revisions and return detailed differences.
 *
 * @param oldRevision - The older revision (lower version number)
 * @param newRevision - The newer revision (higher version number)
 * @returns RevisionDiff describing all changes
 */
export function diffRevisions(oldRevision: Revision, newRevision: Revision): RevisionDiff {
  const fieldChanges: FieldChange[] = [];
  const blockChanges: BlockChange[] = [];

  // Compare simple fields
  const simpleFields = ['title', 'about', 'notes', 'status'] as const;
  for (const field of simpleFields) {
    const oldValue = oldRevision.snapshot[field];
    const newValue = newRevision.snapshot[field];

    if (oldValue !== newValue) {
      let changeType: ChangeType;
      if (oldValue === undefined && newValue !== undefined) {
        changeType = 'added';
      } else if (oldValue !== undefined && newValue === undefined) {
        changeType = 'removed';
      } else {
        changeType = 'modified';
      }

      fieldChanges.push({
        field,
        changeType,
        oldValue,
        newValue,
      });
    }
  }

  // Compare page blocks
  const oldBlocks = oldRevision.snapshot.page.blocks;
  const newBlocks = newRevision.snapshot.page.blocks;

  const oldBlockMap = new Map(oldBlocks.map((b) => [b.id, b]));
  const newBlockMap = new Map(newBlocks.map((b) => [b.id, b]));

  // Find removed and modified blocks
  for (const [id, oldBlock] of oldBlockMap) {
    const newBlock = newBlockMap.get(id);
    if (!newBlock) {
      blockChanges.push({
        blockId: id,
        changeType: 'removed',
        oldBlock,
      });
    } else {
      const contentChanged = !deepEqual(oldBlock.content, newBlock.content);
      const metadataChanged = !deepEqual(oldBlock.metadata, newBlock.metadata);
      const typeChanged = oldBlock.type !== newBlock.type;
      const childrenChanged = !deepEqual(oldBlock.children, newBlock.children);

      if (contentChanged || metadataChanged || typeChanged || childrenChanged) {
        blockChanges.push({
          blockId: id,
          changeType: 'modified',
          oldBlock,
          newBlock,
          contentChanged,
          metadataChanged,
        });
      }
    }
  }

  // Find added blocks
  for (const [id, newBlock] of newBlockMap) {
    if (!oldBlockMap.has(id)) {
      blockChanges.push({
        blockId: id,
        changeType: 'added',
        newBlock,
      });
    }
  }

  // Calculate summary
  const blocksAdded = blockChanges.filter((c) => c.changeType === 'added').length;
  const blocksRemoved = blockChanges.filter((c) => c.changeType === 'removed').length;
  const blocksModified = blockChanges.filter((c) => c.changeType === 'modified').length;

  return {
    fromVersion: oldRevision.version,
    toVersion: newRevision.version,
    hasChanges: fieldChanges.length > 0 || blockChanges.length > 0,
    fieldChanges,
    blockChanges,
    summary: {
      fieldsChanged: fieldChanges.length,
      blocksAdded,
      blocksRemoved,
      blocksModified,
    },
  };
}

/**
 * Compare two PageDoc objects and return block-level differences.
 *
 * @param oldPage - The older page content
 * @param newPage - The newer page content
 * @returns Array of block changes
 */
export function diffPageDocs(oldPage: PageDoc, newPage: PageDoc): BlockChange[] {
  const blockChanges: BlockChange[] = [];

  const oldBlockMap = new Map(oldPage.blocks.map((b) => [b.id, b]));
  const newBlockMap = new Map(newPage.blocks.map((b) => [b.id, b]));

  // Find removed and modified blocks
  for (const [id, oldBlock] of oldBlockMap) {
    const newBlock = newBlockMap.get(id);
    if (!newBlock) {
      blockChanges.push({
        blockId: id,
        changeType: 'removed',
        oldBlock,
      });
    } else {
      const contentChanged = !deepEqual(oldBlock.content, newBlock.content);
      const metadataChanged = !deepEqual(oldBlock.metadata, newBlock.metadata);
      const typeChanged = oldBlock.type !== newBlock.type;
      const childrenChanged = !deepEqual(oldBlock.children, newBlock.children);

      if (contentChanged || metadataChanged || typeChanged || childrenChanged) {
        blockChanges.push({
          blockId: id,
          changeType: 'modified',
          oldBlock,
          newBlock,
          contentChanged,
          metadataChanged,
        });
      }
    }
  }

  // Find added blocks
  for (const [id, newBlock] of newBlockMap) {
    if (!oldBlockMap.has(id)) {
      blockChanges.push({
        blockId: id,
        changeType: 'added',
        newBlock,
      });
    }
  }

  return blockChanges;
}

/**
 * Get a human-readable summary of changes between revisions.
 *
 * @param diff - The revision diff to summarize
 * @returns A human-readable string describing the changes
 */
export function summarizeDiff(diff: RevisionDiff): string {
  if (!diff.hasChanges) {
    return 'No changes';
  }

  const parts: string[] = [];

  // Field changes
  for (const change of diff.fieldChanges) {
    switch (change.changeType) {
      case 'added':
        parts.push(`Added ${change.field}`);
        break;
      case 'removed':
        parts.push(`Removed ${change.field}`);
        break;
      case 'modified':
        if (change.field === 'status') {
          parts.push(`Status: ${change.oldValue} → ${change.newValue}`);
        } else {
          parts.push(`Updated ${change.field}`);
        }
        break;
    }
  }

  // Block changes summary
  const { blocksAdded, blocksRemoved, blocksModified } = diff.summary;
  if (blocksAdded > 0) {
    parts.push(`${blocksAdded} block${blocksAdded > 1 ? 's' : ''} added`);
  }
  if (blocksRemoved > 0) {
    parts.push(`${blocksRemoved} block${blocksRemoved > 1 ? 's' : ''} removed`);
  }
  if (blocksModified > 0) {
    parts.push(`${blocksModified} block${blocksModified > 1 ? 's' : ''} modified`);
  }

  return parts.join(', ');
}

/**
 * Simple deep equality check for comparing block content.
 * Handles primitives, arrays, and plain objects.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}
