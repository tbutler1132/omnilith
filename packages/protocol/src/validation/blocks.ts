// Block Validation Utilities (Phase 8.3)
//
// Validates blocks and PageDoc content.
// Supports core block types and extensibility for pack-defined blocks.

import type { Block, BlockType, PageDoc } from '../types/artifacts.js';

/**
 * Result of validating a block or PageDoc
 */
export type BlockValidationResult = {
  valid: boolean;
  errors: BlockValidationError[];
};

/**
 * A validation error with context
 */
export type BlockValidationError = {
  path: string;
  message: string;
  code: BlockValidationErrorCode;
};

/**
 * Validation error codes
 */
export type BlockValidationErrorCode =
  | 'MISSING_FIELD'
  | 'INVALID_TYPE'
  | 'INVALID_VALUE'
  | 'UNKNOWN_BLOCK_TYPE'
  | 'INVALID_CONTENT'
  | 'INVALID_CHILDREN'
  | 'DUPLICATE_ID';

/**
 * Options for block validation
 */
export type ValidateBlockOptions = {
  /** Allow pack-defined block types (not in core set) */
  allowCustomTypes?: boolean;
  /** Custom type validators for pack-defined blocks */
  customValidators?: Record<string, BlockContentValidator>;
  /** Path prefix for error messages */
  pathPrefix?: string;
};

/**
 * Function that validates block content for a specific block type
 */
export type BlockContentValidator = (
  content: unknown,
  block: Block
) => BlockValidationError[];

/**
 * Core block types defined in the protocol
 */
export const CORE_BLOCK_TYPES: readonly BlockType[] = [
  'paragraph',
  'heading',
  'list',
  'list_item',
  'code',
  'blockquote',
  'image',
  'audio',
  'video',
  'divider',
  'table',
  'embed',
  'artifact_ref',
] as const;

/**
 * Check if a block type is a core type
 */
export function isCoreBlockType(type: string): type is BlockType {
  return CORE_BLOCK_TYPES.includes(type as BlockType);
}

/**
 * Validate a single block.
 *
 * @param block - The block to validate
 * @param options - Validation options
 * @returns Validation result with any errors
 */
export function validateBlock(
  block: unknown,
  options: ValidateBlockOptions = {}
): BlockValidationResult {
  const errors: BlockValidationError[] = [];
  const path = options.pathPrefix ?? 'block';

  // Check block is an object
  if (!block || typeof block !== 'object') {
    errors.push({
      path,
      message: 'Block must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors };
  }

  const b = block as Record<string, unknown>;

  // Check required fields
  if (typeof b.id !== 'string' || b.id.trim() === '') {
    errors.push({
      path: `${path}.id`,
      message: 'Block must have a non-empty string id',
      code: 'MISSING_FIELD',
    });
  }

  if (typeof b.type !== 'string' || b.type.trim() === '') {
    errors.push({
      path: `${path}.type`,
      message: 'Block must have a non-empty string type',
      code: 'MISSING_FIELD',
    });
  } else {
    // Validate block type
    const blockType = b.type as string;
    const isCore = isCoreBlockType(blockType);
    const hasCustomValidator = options.customValidators?.[blockType];

    if (!isCore && !options.allowCustomTypes && !hasCustomValidator) {
      errors.push({
        path: `${path}.type`,
        message: `Unknown block type: ${blockType}`,
        code: 'UNKNOWN_BLOCK_TYPE',
      });
    }

    // Validate content based on type
    if (isCore) {
      errors.push(...validateCoreBlockContent(b as Block, path));
    } else if (hasCustomValidator) {
      errors.push(...hasCustomValidator(b.content, b as Block));
    }
  }

  // Check content exists
  if (b.content === undefined) {
    errors.push({
      path: `${path}.content`,
      message: 'Block must have content',
      code: 'MISSING_FIELD',
    });
  }

  // Validate children if present
  if (b.children !== undefined) {
    if (!Array.isArray(b.children)) {
      errors.push({
        path: `${path}.children`,
        message: 'Block children must be an array',
        code: 'INVALID_TYPE',
      });
    } else {
      b.children.forEach((child: unknown, index: number) => {
        const childResult = validateBlock(child, {
          ...options,
          pathPrefix: `${path}.children[${index}]`,
        });
        errors.push(...childResult.errors);
      });
    }
  }

  // Validate metadata if present
  if (b.metadata !== undefined && (typeof b.metadata !== 'object' || b.metadata === null)) {
    errors.push({
      path: `${path}.metadata`,
      message: 'Block metadata must be an object',
      code: 'INVALID_TYPE',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a PageDoc.
 *
 * @param page - The PageDoc to validate
 * @param options - Validation options
 * @returns Validation result with any errors
 */
export function validatePageDoc(
  page: unknown,
  options: ValidateBlockOptions = {}
): BlockValidationResult {
  const errors: BlockValidationError[] = [];

  // Check page is an object
  if (!page || typeof page !== 'object') {
    errors.push({
      path: 'page',
      message: 'PageDoc must be an object',
      code: 'INVALID_TYPE',
    });
    return { valid: false, errors };
  }

  const p = page as Record<string, unknown>;

  // Check version
  if (p.version !== 1) {
    errors.push({
      path: 'page.version',
      message: 'PageDoc version must be 1',
      code: 'INVALID_VALUE',
    });
  }

  // Check blocks array
  if (!Array.isArray(p.blocks)) {
    errors.push({
      path: 'page.blocks',
      message: 'PageDoc must have a blocks array',
      code: 'MISSING_FIELD',
    });
    return { valid: false, errors };
  }

  // Check for duplicate IDs
  const seenIds = new Set<string>();
  const collectIds = (blocks: Block[], path: string): void => {
    blocks.forEach((block, index) => {
      if (block.id) {
        if (seenIds.has(block.id)) {
          errors.push({
            path: `${path}[${index}].id`,
            message: `Duplicate block ID: ${block.id}`,
            code: 'DUPLICATE_ID',
          });
        }
        seenIds.add(block.id);
      }
      if (block.children) {
        collectIds(block.children, `${path}[${index}].children`);
      }
    });
  };
  collectIds(p.blocks as Block[], 'page.blocks');

  // Validate each block
  (p.blocks as unknown[]).forEach((block: unknown, index: number) => {
    const blockResult = validateBlock(block, {
      ...options,
      pathPrefix: `page.blocks[${index}]`,
    });
    errors.push(...blockResult.errors);
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate content for core block types.
 * Returns errors specific to the block type's expected content structure.
 */
function validateCoreBlockContent(block: Block, path: string): BlockValidationError[] {
  const errors: BlockValidationError[] = [];

  switch (block.type) {
    case 'heading': {
      const content = block.content as Record<string, unknown> | undefined;
      if (typeof content !== 'object' || content === null) {
        errors.push({
          path: `${path}.content`,
          message: 'Heading content must be an object with text and level',
          code: 'INVALID_CONTENT',
        });
      } else {
        if (typeof content.text !== 'string') {
          errors.push({
            path: `${path}.content.text`,
            message: 'Heading must have text',
            code: 'INVALID_CONTENT',
          });
        }
        if (typeof content.level !== 'number' || content.level < 1 || content.level > 6) {
          errors.push({
            path: `${path}.content.level`,
            message: 'Heading level must be between 1 and 6',
            code: 'INVALID_CONTENT',
          });
        }
      }
      break;
    }

    case 'code': {
      const content = block.content as Record<string, unknown> | undefined;
      if (typeof content !== 'object' || content === null) {
        errors.push({
          path: `${path}.content`,
          message: 'Code content must be an object',
          code: 'INVALID_CONTENT',
        });
      } else if (typeof content.code !== 'string') {
        errors.push({
          path: `${path}.content.code`,
          message: 'Code block must have code string',
          code: 'INVALID_CONTENT',
        });
      }
      break;
    }

    case 'image':
    case 'audio':
    case 'video': {
      const content = block.content as Record<string, unknown> | undefined;
      if (typeof content !== 'object' || content === null) {
        errors.push({
          path: `${path}.content`,
          message: `${block.type} content must be an object`,
          code: 'INVALID_CONTENT',
        });
      } else if (typeof content.src !== 'string' || content.src.trim() === '') {
        errors.push({
          path: `${path}.content.src`,
          message: `${block.type} must have a non-empty src`,
          code: 'INVALID_CONTENT',
        });
      }
      break;
    }

    case 'artifact_ref': {
      const content = block.content as Record<string, unknown> | undefined;
      if (typeof content !== 'object' || content === null) {
        errors.push({
          path: `${path}.content`,
          message: 'artifact_ref content must be an object',
          code: 'INVALID_CONTENT',
        });
      } else if (typeof content.artifactId !== 'string' || content.artifactId.trim() === '') {
        errors.push({
          path: `${path}.content.artifactId`,
          message: 'artifact_ref must have a non-empty artifactId',
          code: 'INVALID_CONTENT',
        });
      }
      break;
    }

    case 'embed': {
      const content = block.content as Record<string, unknown> | undefined;
      if (typeof content !== 'object' || content === null) {
        errors.push({
          path: `${path}.content`,
          message: 'embed content must be an object',
          code: 'INVALID_CONTENT',
        });
      } else if (typeof content.url !== 'string' || content.url.trim() === '') {
        errors.push({
          path: `${path}.content.url`,
          message: 'embed must have a non-empty url',
          code: 'INVALID_CONTENT',
        });
      }
      break;
    }

    case 'table': {
      const content = block.content as Record<string, unknown> | undefined;
      if (typeof content !== 'object' || content === null) {
        errors.push({
          path: `${path}.content`,
          message: 'table content must be an object',
          code: 'INVALID_CONTENT',
        });
      } else if (!Array.isArray(content.rows)) {
        errors.push({
          path: `${path}.content.rows`,
          message: 'table must have a rows array',
          code: 'INVALID_CONTENT',
        });
      }
      break;
    }

    case 'list': {
      const content = block.content as Record<string, unknown> | undefined;
      if (typeof content !== 'object' || content === null) {
        errors.push({
          path: `${path}.content`,
          message: 'list content must be an object',
          code: 'INVALID_CONTENT',
        });
      } else if (content.ordered !== undefined && typeof content.ordered !== 'boolean') {
        errors.push({
          path: `${path}.content.ordered`,
          message: 'list ordered must be a boolean',
          code: 'INVALID_CONTENT',
        });
      }
      break;
    }

    // Simple types that just need string content
    case 'paragraph':
    case 'blockquote':
    case 'list_item':
      // These can have any content, typically string or rich text
      break;

    case 'divider':
      // Dividers have no meaningful content
      break;
  }

  return errors;
}

/**
 * Create a block helper with common defaults.
 */
export function createBlock(
  id: string,
  type: BlockType | string,
  content: unknown,
  options?: {
    children?: Block[];
    metadata?: Record<string, unknown>;
  }
): Block {
  const block: Block = {
    id,
    type,
    content,
  };

  if (options?.children) {
    block.children = options.children;
  }

  if (options?.metadata) {
    block.metadata = options.metadata;
  }

  return block;
}

/**
 * Create an empty PageDoc.
 */
export function createPageDoc(blocks: Block[] = []): PageDoc {
  return {
    version: 1,
    blocks,
  };
}

/**
 * Create a paragraph block.
 */
export function createParagraph(id: string, text: string): Block {
  return createBlock(id, 'paragraph', text);
}

/**
 * Create a heading block.
 */
export function createHeading(
  id: string,
  text: string,
  level: 1 | 2 | 3 | 4 | 5 | 6 = 1
): Block {
  return createBlock(id, 'heading', { text, level });
}

/**
 * Create a code block.
 */
export function createCodeBlock(
  id: string,
  code: string,
  language?: string
): Block {
  return createBlock(id, 'code', { code, language });
}

/**
 * Create an image block.
 */
export function createImage(
  id: string,
  src: string,
  alt?: string
): Block {
  return createBlock(id, 'image', { src, alt });
}

/**
 * Create a list block.
 */
export function createList(
  id: string,
  items: Block[],
  ordered: boolean = false
): Block {
  return createBlock(id, 'list', { ordered }, { children: items });
}

/**
 * Create a list item block.
 */
export function createListItem(id: string, text: string): Block {
  return createBlock(id, 'list_item', text);
}

/**
 * Create an artifact reference block.
 */
export function createArtifactRef(id: string, artifactId: string): Block {
  return createBlock(id, 'artifact_ref', { artifactId });
}

/**
 * Create a divider block.
 */
export function createDivider(id: string): Block {
  return createBlock(id, 'divider', null);
}
