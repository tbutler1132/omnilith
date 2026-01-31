// Bundle validation utilities

import {
  BUNDLE_DIRS,
  LOG_FILES,
  NODE_DIRS,
  NODE_FILES,
  ARTIFACT_FILES,
} from './paths.js';

/**
 * Represents a file system abstraction for bundle validation
 * This allows validation to work with different storage backends
 */
export type BundleFileSystem = {
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  listDirectory(path: string): Promise<string[]>;
};

/**
 * Validation error with path and description
 */
export type ValidationError = {
  path: string;
  message: string;
  severity: 'error' | 'warning';
};

/**
 * Result of bundle validation
 */
export type BundleValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    nodeCount: number;
    artifactCount: number;
    surfaceCount: number;
    observationCount: number;
    actionRunCount: number;
  };
};

/**
 * Validate an Omnilith Bundle structure
 */
export async function validateBundle(
  fs: BundleFileSystem,
  bundlePath: string
): Promise<BundleValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const summary = {
    nodeCount: 0,
    artifactCount: 0,
    surfaceCount: 0,
    observationCount: 0,
    actionRunCount: 0,
  };

  const addError = (path: string, message: string) => {
    errors.push({ path, message, severity: 'error' });
  };

  const addWarning = (path: string, message: string) => {
    warnings.push({ path, message, severity: 'warning' });
  };

  const resolvePath = (relativePath: string) => `${bundlePath}/${relativePath}`;

  // Check root directories exist
  const nodesDir = resolvePath(BUNDLE_DIRS.NODES);
  const logDir = resolvePath(BUNDLE_DIRS.LOG);

  if (!(await fs.exists(nodesDir))) {
    addError(nodesDir, 'Missing required nodes directory');
  } else if (!(await fs.isDirectory(nodesDir))) {
    addError(nodesDir, 'nodes must be a directory');
  }

  if (!(await fs.exists(logDir))) {
    addWarning(logDir, 'Missing log directory (optional but recommended)');
  } else if (!(await fs.isDirectory(logDir))) {
    addError(logDir, 'log must be a directory');
  } else {
    // Check log files
    const obsLog = resolvePath(`${BUNDLE_DIRS.LOG}/${LOG_FILES.OBSERVATIONS}`);
    const actLog = resolvePath(`${BUNDLE_DIRS.LOG}/${LOG_FILES.ACTION_RUNS}`);

    if (await fs.exists(obsLog)) {
      try {
        const content = await fs.readFile(obsLog);
        summary.observationCount = content.split('\n').filter((l) => l.trim()).length;
      } catch {
        addError(obsLog, 'Failed to read observations log');
      }
    }

    if (await fs.exists(actLog)) {
      try {
        const content = await fs.readFile(actLog);
        summary.actionRunCount = content.split('\n').filter((l) => l.trim()).length;
      } catch {
        addError(actLog, 'Failed to read action runs log');
      }
    }
  }

  // Validate nodes
  if (await fs.exists(nodesDir)) {
    const nodeIds = await fs.listDirectory(nodesDir);

    for (const nodeId of nodeIds) {
      if (nodeId.startsWith('.')) continue; // Skip hidden files

      const nodeDir = resolvePath(`${BUNDLE_DIRS.NODES}/${nodeId}`);

      if (!(await fs.isDirectory(nodeDir))) {
        addWarning(nodeDir, 'Expected directory in nodes folder');
        continue;
      }

      summary.nodeCount++;

      // Check node.json exists
      const nodeJsonPath = `${nodeDir}/${NODE_FILES.NODE_JSON}`;
      if (!(await fs.exists(nodeJsonPath))) {
        addError(nodeJsonPath, 'Missing required node.json');
      } else {
        try {
          const content = await fs.readFile(nodeJsonPath);
          const node = JSON.parse(content);
          if (!node.id) {
            addError(nodeJsonPath, 'node.json missing required field: id');
          }
          if (!node.kind) {
            addError(nodeJsonPath, 'node.json missing required field: kind');
          }
        } catch {
          addError(nodeJsonPath, 'Invalid JSON in node.json');
        }
      }

      // Check optional subdirectories
      for (const [key, dirName] of Object.entries(NODE_DIRS)) {
        const subDir = `${nodeDir}/${dirName}`;
        if (await fs.exists(subDir)) {
          if (!(await fs.isDirectory(subDir))) {
            addError(subDir, `${dirName} must be a directory`);
          } else if (key === 'ARTIFACTS') {
            // Count artifacts
            const artifactIds = await fs.listDirectory(subDir);
            for (const artifactId of artifactIds) {
              if (artifactId.startsWith('.')) continue;
              const artifactDir = `${subDir}/${artifactId}`;
              if (await fs.isDirectory(artifactDir)) {
                summary.artifactCount++;

                // Check required artifact files
                const pageJson = `${artifactDir}/${ARTIFACT_FILES.PAGE_JSON}`;
                if (!(await fs.exists(pageJson))) {
                  addWarning(pageJson, 'Artifact missing page.json');
                }
              }
            }
          } else if (key === 'SURFACES') {
            // Count surfaces
            const surfaceFiles = await fs.listDirectory(subDir);
            summary.surfaceCount += surfaceFiles.filter(
              (f) => f.endsWith('.json') && !f.startsWith('.')
            ).length;
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary,
  };
}

/**
 * Check if a path looks like a valid Omnilith Bundle
 * Quick check without full validation
 */
export async function isBundlePath(
  fs: BundleFileSystem,
  path: string
): Promise<boolean> {
  const nodesDir = `${path}/${BUNDLE_DIRS.NODES}`;
  return (await fs.exists(nodesDir)) && (await fs.isDirectory(nodesDir));
}
