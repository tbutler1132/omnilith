// Bundle file system abstractions for import/export operations.
// Allows testing and different storage backends (filesystem, S3, etc.)

/**
 * Abstraction for writing bundle files.
 * Implementations can write to local filesystem, S3, etc.
 */
export interface BundleWriter {
  /**
   * Write a file with the given content.
   * Creates parent directories as needed.
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Create a directory (and parents if needed).
   */
  mkdir(path: string): Promise<void>;

  /**
   * Check if a path exists.
   */
  exists(path: string): Promise<boolean>;
}

/**
 * Abstraction for reading bundle files.
 * Matches the BundleFileSystem from protocol/bundle/validation.ts
 */
export interface BundleReader {
  /**
   * Check if a path exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Check if a path is a directory.
   */
  isDirectory(path: string): Promise<boolean>;

  /**
   * Read a file as text.
   */
  readFile(path: string): Promise<string>;

  /**
   * List entries in a directory.
   */
  listDirectory(path: string): Promise<string[]>;
}

/**
 * Summary of an export operation.
 */
export type ExportSummary = {
  bundlePath: string;
  nodeCount: number;
  artifactCount: number;
  surfaceCount: number;
  layoutCount: number;
  entityCount: number;
  entityTypeCount: number;
  variableCount: number;
  episodeCount: number;
  policyCount: number;
  grantCount: number;
  observationCount: number;
  actionRunCount: number;
  exportedAt: string;
};

/**
 * Summary of an import operation.
 */
export type ImportSummary = {
  bundlePath: string;
  nodeCount: number;
  artifactCount: number;
  surfaceCount: number;
  layoutCount: number;
  entityCount: number;
  entityTypeCount: number;
  variableCount: number;
  episodeCount: number;
  policyCount: number;
  grantCount: number;
  observationCount: number;
  actionRunCount: number;
  importedAt: string;
  warnings: string[];
};

/**
 * Options for export operations.
 */
export type ExportOptions = {
  /**
   * Include observations in the export.
   * @default true
   */
  includeObservations?: boolean;

  /**
   * Include action runs in the export.
   * @default true
   */
  includeActionRuns?: boolean;

  /**
   * Filter to specific node IDs. If undefined, exports all nodes.
   */
  nodeIds?: string[];
};

/**
 * Options for import operations.
 */
export type ImportOptions = {
  /**
   * If true, skip entities that already exist (by ID).
   * If false, fail on conflict.
   * @default false
   */
  skipExisting?: boolean;

  /**
   * If true, clear all existing data before import.
   * @default false
   */
  clearBeforeImport?: boolean;
};
