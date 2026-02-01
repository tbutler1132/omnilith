// Filesystem implementations of BundleReader and BundleWriter.
// Uses Node.js fs module for local filesystem operations.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BundleReader, BundleWriter } from './types.js';

/**
 * Create a BundleWriter that writes to the local filesystem.
 */
export function createFilesystemWriter(): BundleWriter {
  return {
    async writeFile(filePath: string, content: string): Promise<void> {
      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(filePath, content, 'utf-8');
    },

    async mkdir(dirPath: string): Promise<void> {
      await fs.mkdir(dirPath, { recursive: true });
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Create a BundleReader that reads from the local filesystem.
 */
export function createFilesystemReader(): BundleReader {
  return {
    async exists(filePath: string): Promise<boolean> {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },

    async isDirectory(filePath: string): Promise<boolean> {
      try {
        const stat = await fs.stat(filePath);
        return stat.isDirectory();
      } catch {
        return false;
      }
    },

    async readFile(filePath: string): Promise<string> {
      return fs.readFile(filePath, 'utf-8');
    },

    async listDirectory(dirPath: string): Promise<string[]> {
      return fs.readdir(dirPath);
    },
  };
}

/**
 * Create an in-memory BundleWriter for testing.
 * Returns the writer and a Map of all written files.
 */
export function createInMemoryWriter(): {
  writer: BundleWriter;
  files: Map<string, string>;
  directories: Set<string>;
} {
  const files = new Map<string, string>();
  const directories = new Set<string>();

  const writer: BundleWriter = {
    async writeFile(filePath: string, content: string): Promise<void> {
      files.set(filePath, content);

      // Track parent directories
      let dir = path.dirname(filePath);
      while (dir && dir !== '.' && dir !== '/') {
        directories.add(dir);
        dir = path.dirname(dir);
      }
    },

    async mkdir(dirPath: string): Promise<void> {
      directories.add(dirPath);

      // Track parent directories
      let dir = path.dirname(dirPath);
      while (dir && dir !== '.' && dir !== '/') {
        directories.add(dir);
        dir = path.dirname(dir);
      }
    },

    async exists(filePath: string): Promise<boolean> {
      return files.has(filePath) || directories.has(filePath);
    },
  };

  return { writer, files, directories };
}

/**
 * Create an in-memory BundleReader from a Map of files.
 */
export function createInMemoryReader(
  files: Map<string, string>,
  directories?: Set<string>
): BundleReader {
  const dirs = directories ?? new Set<string>();

  // Auto-detect directories from file paths if not provided
  if (!directories) {
    for (const filePath of files.keys()) {
      let dir = path.dirname(filePath);
      while (dir && dir !== '.' && dir !== '/') {
        dirs.add(dir);
        dir = path.dirname(dir);
      }
    }
  }

  return {
    async exists(filePath: string): Promise<boolean> {
      return files.has(filePath) || dirs.has(filePath);
    },

    async isDirectory(filePath: string): Promise<boolean> {
      return dirs.has(filePath);
    },

    async readFile(filePath: string): Promise<string> {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`File not found: ${filePath}`);
      }
      return content;
    },

    async listDirectory(dirPath: string): Promise<string[]> {
      const entries = new Set<string>();
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';

      for (const filePath of files.keys()) {
        if (filePath.startsWith(prefix)) {
          const relativePath = filePath.slice(prefix.length);
          const firstPart = relativePath.split('/')[0];
          if (firstPart) {
            entries.add(firstPart);
          }
        }
      }

      for (const dir of dirs) {
        if (dir.startsWith(prefix)) {
          const relativePath = dir.slice(prefix.length);
          const firstPart = relativePath.split('/')[0];
          if (firstPart) {
            entries.add(firstPart);
          }
        }
      }

      return Array.from(entries);
    },
  };
}
