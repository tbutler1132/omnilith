// Tests for Block Validation Utilities (Phase 8.3)

import { describe, it, expect } from 'vitest';
import {
  validateBlock,
  validatePageDoc,
  isCoreBlockType,
  CORE_BLOCK_TYPES,
  createBlock,
  createPageDoc,
  createParagraph,
  createHeading,
  createCodeBlock,
  createImage,
  createList,
  createListItem,
  createArtifactRef,
  createDivider,
} from './blocks.js';

describe('isCoreBlockType', () => {
  it('returns true for all core types', () => {
    for (const type of CORE_BLOCK_TYPES) {
      expect(isCoreBlockType(type)).toBe(true);
    }
  });

  it('returns false for unknown types', () => {
    expect(isCoreBlockType('custom')).toBe(false);
    expect(isCoreBlockType('pack:custom:widget')).toBe(false);
    expect(isCoreBlockType('')).toBe(false);
  });
});

describe('validateBlock', () => {
  describe('basic validation', () => {
    it('validates a valid paragraph block', () => {
      const result = validateBlock({
        id: 'block-1',
        type: 'paragraph',
        content: 'Hello world',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects non-object block', () => {
      const result = validateBlock('not an object');

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });

    it('rejects null', () => {
      const result = validateBlock(null);

      expect(result.valid).toBe(false);
    });

    it('requires id field', () => {
      const result = validateBlock({
        type: 'paragraph',
        content: 'Hello',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          path: 'block.id',
        })
      );
    });

    it('requires non-empty id', () => {
      const result = validateBlock({
        id: '  ',
        type: 'paragraph',
        content: 'Hello',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          path: 'block.id',
        })
      );
    });

    it('requires type field', () => {
      const result = validateBlock({
        id: 'block-1',
        content: 'Hello',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          path: 'block.type',
        })
      );
    });

    it('requires content field', () => {
      const result = validateBlock({
        id: 'block-1',
        type: 'paragraph',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          path: 'block.content',
        })
      );
    });
  });

  describe('type validation', () => {
    it('rejects unknown block types by default', () => {
      const result = validateBlock({
        id: 'block-1',
        type: 'unknown_type',
        content: 'Hello',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'UNKNOWN_BLOCK_TYPE',
        })
      );
    });

    it('allows unknown types with allowCustomTypes option', () => {
      const result = validateBlock(
        {
          id: 'block-1',
          type: 'custom_widget',
          content: { data: 'test' },
        },
        { allowCustomTypes: true }
      );

      expect(result.valid).toBe(true);
    });

    it('allows custom types with custom validator', () => {
      const result = validateBlock(
        {
          id: 'block-1',
          type: 'custom_widget',
          content: { data: 'test' },
        },
        {
          customValidators: {
            custom_widget: () => [], // Valid if returns no errors
          },
        }
      );

      expect(result.valid).toBe(true);
    });

    it('custom validator can return errors', () => {
      const result = validateBlock(
        {
          id: 'block-1',
          type: 'custom_widget',
          content: null,
        },
        {
          customValidators: {
            custom_widget: (content) =>
              content === null
                ? [{ path: 'block.content', message: 'Cannot be null', code: 'INVALID_CONTENT' }]
                : [],
          },
        }
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: 'Cannot be null',
        })
      );
    });
  });

  describe('core block content validation', () => {
    it('validates heading with text and level', () => {
      const result = validateBlock({
        id: 'h1',
        type: 'heading',
        content: { text: 'Title', level: 1 },
      });

      expect(result.valid).toBe(true);
    });

    it('rejects heading without text', () => {
      const result = validateBlock({
        id: 'h1',
        type: 'heading',
        content: { level: 1 },
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'block.content.text',
        })
      );
    });

    it('rejects heading with invalid level', () => {
      const result = validateBlock({
        id: 'h1',
        type: 'heading',
        content: { text: 'Title', level: 7 },
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'block.content.level',
        })
      );
    });

    it('validates code block with code string', () => {
      const result = validateBlock({
        id: 'code-1',
        type: 'code',
        content: { code: 'console.log("hello")', language: 'javascript' },
      });

      expect(result.valid).toBe(true);
    });

    it('rejects code block without code', () => {
      const result = validateBlock({
        id: 'code-1',
        type: 'code',
        content: { language: 'javascript' },
      });

      expect(result.valid).toBe(false);
    });

    it('validates image with src', () => {
      const result = validateBlock({
        id: 'img-1',
        type: 'image',
        content: { src: 'https://example.com/image.png' },
      });

      expect(result.valid).toBe(true);
    });

    it('rejects image without src', () => {
      const result = validateBlock({
        id: 'img-1',
        type: 'image',
        content: { alt: 'An image' },
      });

      expect(result.valid).toBe(false);
    });

    it('validates artifact_ref with artifactId', () => {
      const result = validateBlock({
        id: 'ref-1',
        type: 'artifact_ref',
        content: { artifactId: 'artifact-123' },
      });

      expect(result.valid).toBe(true);
    });

    it('rejects artifact_ref without artifactId', () => {
      const result = validateBlock({
        id: 'ref-1',
        type: 'artifact_ref',
        content: {},
      });

      expect(result.valid).toBe(false);
    });

    it('validates embed with url', () => {
      const result = validateBlock({
        id: 'embed-1',
        type: 'embed',
        content: { url: 'https://youtube.com/watch?v=123' },
      });

      expect(result.valid).toBe(true);
    });

    it('validates table with rows', () => {
      const result = validateBlock({
        id: 'table-1',
        type: 'table',
        content: { rows: [['a', 'b'], ['c', 'd']] },
      });

      expect(result.valid).toBe(true);
    });

    it('validates list with ordered flag', () => {
      const result = validateBlock({
        id: 'list-1',
        type: 'list',
        content: { ordered: true },
      });

      expect(result.valid).toBe(true);
    });

    it('validates divider with null content', () => {
      const result = validateBlock({
        id: 'div-1',
        type: 'divider',
        content: null,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('children validation', () => {
    it('validates blocks with valid children', () => {
      const result = validateBlock({
        id: 'list-1',
        type: 'list',
        content: { ordered: false },
        children: [
          { id: 'item-1', type: 'list_item', content: 'First' },
          { id: 'item-2', type: 'list_item', content: 'Second' },
        ],
      });

      expect(result.valid).toBe(true);
    });

    it('rejects non-array children', () => {
      const result = validateBlock({
        id: 'list-1',
        type: 'list',
        content: { ordered: false },
        children: 'not an array',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_TYPE',
          path: 'block.children',
        })
      );
    });

    it('validates nested children recursively', () => {
      const result = validateBlock({
        id: 'list-1',
        type: 'list',
        content: { ordered: false },
        children: [
          { id: 'item-1', type: 'list_item', content: 'First' },
          { id: 'invalid', type: 'list_item' }, // Missing content
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'block.children[1].content',
        })
      );
    });
  });

  describe('metadata validation', () => {
    it('accepts valid metadata object', () => {
      const result = validateBlock({
        id: 'block-1',
        type: 'paragraph',
        content: 'Hello',
        metadata: { highlight: true },
      });

      expect(result.valid).toBe(true);
    });

    it('rejects non-object metadata', () => {
      const result = validateBlock({
        id: 'block-1',
        type: 'paragraph',
        content: 'Hello',
        metadata: 'invalid',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_TYPE',
          path: 'block.metadata',
        })
      );
    });
  });

  describe('path prefix', () => {
    it('uses custom path prefix', () => {
      const result = validateBlock({ type: 'paragraph' }, { pathPrefix: 'page.blocks[0]' });

      expect(result.errors[0].path).toMatch(/^page\.blocks\[0\]/);
    });
  });
});

describe('validatePageDoc', () => {
  it('validates a valid PageDoc', () => {
    const result = validatePageDoc({
      version: 1,
      blocks: [
        { id: 'block-1', type: 'paragraph', content: 'Hello' },
        { id: 'block-2', type: 'paragraph', content: 'World' },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates empty blocks array', () => {
    const result = validatePageDoc({
      version: 1,
      blocks: [],
    });

    expect(result.valid).toBe(true);
  });

  it('rejects non-object PageDoc', () => {
    const result = validatePageDoc('not an object');

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_TYPE');
  });

  it('rejects wrong version', () => {
    const result = validatePageDoc({
      version: 2,
      blocks: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_VALUE',
        path: 'page.version',
      })
    );
  });

  it('rejects missing blocks array', () => {
    const result = validatePageDoc({
      version: 1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_FIELD',
        path: 'page.blocks',
      })
    );
  });

  it('detects duplicate block IDs', () => {
    const result = validatePageDoc({
      version: 1,
      blocks: [
        { id: 'same-id', type: 'paragraph', content: 'First' },
        { id: 'same-id', type: 'paragraph', content: 'Second' },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_ID',
      })
    );
  });

  it('detects duplicate IDs in nested children', () => {
    const result = validatePageDoc({
      version: 1,
      blocks: [
        {
          id: 'list-1',
          type: 'list',
          content: { ordered: false },
          children: [
            { id: 'duplicate', type: 'list_item', content: 'First' },
            { id: 'duplicate', type: 'list_item', content: 'Second' },
          ],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_ID',
      })
    );
  });

  it('validates each block in array', () => {
    const result = validatePageDoc({
      version: 1,
      blocks: [
        { id: 'valid', type: 'paragraph', content: 'Hello' },
        { id: 'invalid' }, // Missing type and content
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('page.blocks[1]'))).toBe(true);
  });

  it('passes options to block validation', () => {
    const result = validatePageDoc(
      {
        version: 1,
        blocks: [{ id: 'custom', type: 'custom_block', content: {} }],
      },
      { allowCustomTypes: true }
    );

    expect(result.valid).toBe(true);
  });
});

describe('block creation helpers', () => {
  describe('createBlock', () => {
    it('creates a basic block', () => {
      const block = createBlock('id-1', 'paragraph', 'Hello');

      expect(block).toEqual({
        id: 'id-1',
        type: 'paragraph',
        content: 'Hello',
      });
    });

    it('creates a block with children', () => {
      const child = createBlock('child-1', 'list_item', 'Item');
      const block = createBlock('list-1', 'list', { ordered: true }, { children: [child] });

      expect(block.children).toEqual([child]);
    });

    it('creates a block with metadata', () => {
      const block = createBlock('id-1', 'paragraph', 'Hello', {
        metadata: { highlight: true },
      });

      expect(block.metadata).toEqual({ highlight: true });
    });
  });

  describe('createPageDoc', () => {
    it('creates an empty PageDoc', () => {
      const page = createPageDoc();

      expect(page).toEqual({ version: 1, blocks: [] });
    });

    it('creates a PageDoc with blocks', () => {
      const blocks = [createParagraph('p1', 'Hello')];
      const page = createPageDoc(blocks);

      expect(page.blocks).toEqual(blocks);
    });
  });

  describe('createParagraph', () => {
    it('creates a paragraph block', () => {
      const block = createParagraph('p1', 'Hello world');

      expect(block).toEqual({
        id: 'p1',
        type: 'paragraph',
        content: 'Hello world',
      });
      expect(validateBlock(block).valid).toBe(true);
    });
  });

  describe('createHeading', () => {
    it('creates a heading with default level', () => {
      const block = createHeading('h1', 'Title');

      expect(block.content).toEqual({ text: 'Title', level: 1 });
      expect(validateBlock(block).valid).toBe(true);
    });

    it('creates a heading with specified level', () => {
      const block = createHeading('h2', 'Subtitle', 2);

      expect(block.content).toEqual({ text: 'Subtitle', level: 2 });
      expect(validateBlock(block).valid).toBe(true);
    });
  });

  describe('createCodeBlock', () => {
    it('creates a code block', () => {
      const block = createCodeBlock('code-1', 'const x = 1', 'javascript');

      expect(block.content).toEqual({ code: 'const x = 1', language: 'javascript' });
      expect(validateBlock(block).valid).toBe(true);
    });

    it('creates code block without language', () => {
      const block = createCodeBlock('code-1', 'plain text');

      expect(block.content).toEqual({ code: 'plain text', language: undefined });
      expect(validateBlock(block).valid).toBe(true);
    });
  });

  describe('createImage', () => {
    it('creates an image block', () => {
      const block = createImage('img-1', 'https://example.com/img.png', 'An image');

      expect(block.content).toEqual({
        src: 'https://example.com/img.png',
        alt: 'An image',
      });
      expect(validateBlock(block).valid).toBe(true);
    });
  });

  describe('createList', () => {
    it('creates an unordered list', () => {
      const items = [createListItem('i1', 'First'), createListItem('i2', 'Second')];
      const list = createList('list-1', items);

      expect(list.content).toEqual({ ordered: false });
      expect(list.children).toEqual(items);
      expect(validateBlock(list).valid).toBe(true);
    });

    it('creates an ordered list', () => {
      const items = [createListItem('i1', 'First')];
      const list = createList('list-1', items, true);

      expect(list.content).toEqual({ ordered: true });
    });
  });

  describe('createListItem', () => {
    it('creates a list item', () => {
      const item = createListItem('item-1', 'Content');

      expect(item).toEqual({
        id: 'item-1',
        type: 'list_item',
        content: 'Content',
      });
      expect(validateBlock(item).valid).toBe(true);
    });
  });

  describe('createArtifactRef', () => {
    it('creates an artifact reference', () => {
      const ref = createArtifactRef('ref-1', 'artifact-123');

      expect(ref.content).toEqual({ artifactId: 'artifact-123' });
      expect(validateBlock(ref).valid).toBe(true);
    });
  });

  describe('createDivider', () => {
    it('creates a divider', () => {
      const div = createDivider('div-1');

      expect(div).toEqual({
        id: 'div-1',
        type: 'divider',
        content: null,
      });
      expect(validateBlock(div).valid).toBe(true);
    });
  });
});

describe('complex document validation', () => {
  it('validates a complete document with various block types', () => {
    const page = createPageDoc([
      createHeading('h1', 'Document Title', 1),
      createParagraph('intro', 'This is the introduction.'),
      createHeading('h2', 'Section 1', 2),
      createList('list-1', [
        createListItem('li-1', 'First point'),
        createListItem('li-2', 'Second point'),
      ]),
      createCodeBlock('code-1', 'console.log("Hello")', 'javascript'),
      createImage('img-1', 'https://example.com/diagram.png', 'Architecture diagram'),
      createDivider('div-1'),
      createArtifactRef('ref-1', 'related-doc-123'),
    ]);

    const result = validatePageDoc(page);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('catches multiple errors in a complex document', () => {
    const result = validatePageDoc({
      version: 1,
      blocks: [
        { id: 'h1', type: 'heading', content: { text: 'Title', level: 1 } }, // Valid
        { id: '', type: 'paragraph', content: 'Missing ID' }, // Invalid ID
        { id: 'code', type: 'code', content: {} }, // Missing code field
        { id: 'dup', type: 'paragraph', content: 'First' },
        { id: 'dup', type: 'paragraph', content: 'Duplicate' }, // Duplicate ID
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
