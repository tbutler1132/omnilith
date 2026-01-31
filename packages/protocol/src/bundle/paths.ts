// Omnilith Bundle path constants
// Defines the canonical folder/file structure for bundle interchange

/**
 * Root-level directories in an Omnilith Bundle
 */
export const BUNDLE_DIRS = {
  NODES: 'nodes',
  LOG: 'log',
} as const;

/**
 * Files in the log directory (append-only NDJSON)
 */
export const LOG_FILES = {
  OBSERVATIONS: 'observations.ndjson',
  ACTION_RUNS: 'action_runs.ndjson',
} as const;

/**
 * Directories within each node folder
 */
export const NODE_DIRS = {
  ARTIFACTS: 'artifacts',
  SURFACES: 'surfaces',
  LAYOUTS: 'layouts',
  ENTITIES: 'entities',
  ENTITY_TYPES: 'entity-types',
  VARIABLES: 'variables',
  EPISODES: 'episodes',
  POLICIES: 'policies',
  GRANTS: 'grants',
} as const;

/**
 * Fixed file names within node directories
 */
export const NODE_FILES = {
  NODE_JSON: 'node.json',
  GRANTS_JSON: 'grants.json',
} as const;

/**
 * Files within an artifact directory
 */
export const ARTIFACT_FILES = {
  ABOUT_MD: 'about.md',
  NOTES_MD: 'notes.md',
  PAGE_JSON: 'page.json',
  REVISIONS_NDJSON: 'revisions.ndjson',
} as const;

/**
 * Build a path to a node directory
 */
export function nodePath(nodeId: string): string {
  return `${BUNDLE_DIRS.NODES}/${nodeId}`;
}

/**
 * Build a path to a node's subdirectory
 */
export function nodeSubPath(
  nodeId: string,
  subdir: keyof typeof NODE_DIRS
): string {
  return `${nodePath(nodeId)}/${NODE_DIRS[subdir]}`;
}

/**
 * Build a path to an artifact directory
 */
export function artifactPath(nodeId: string, artifactId: string): string {
  return `${nodeSubPath(nodeId, 'ARTIFACTS')}/${artifactId}`;
}

/**
 * Build a path to a specific artifact file
 */
export function artifactFilePath(
  nodeId: string,
  artifactId: string,
  file: keyof typeof ARTIFACT_FILES
): string {
  return `${artifactPath(nodeId, artifactId)}/${ARTIFACT_FILES[file]}`;
}

/**
 * Build a path to a surface file
 */
export function surfacePath(nodeId: string, surfaceId: string): string {
  return `${nodeSubPath(nodeId, 'SURFACES')}/${surfaceId}.json`;
}

/**
 * Build a path to a layout file
 */
export function layoutPath(nodeId: string, layoutId: string): string {
  return `${nodeSubPath(nodeId, 'LAYOUTS')}/${layoutId}.json`;
}

/**
 * Build a path to an entity file
 */
export function entityPath(nodeId: string, entityId: string): string {
  return `${nodeSubPath(nodeId, 'ENTITIES')}/${entityId}.json`;
}

/**
 * Build a path to an entity type file
 */
export function entityTypePath(nodeId: string, typeId: string): string {
  return `${nodeSubPath(nodeId, 'ENTITY_TYPES')}/${typeId}.json`;
}

/**
 * Build a path to a variable file
 */
export function variablePath(nodeId: string, variableId: string): string {
  return `${nodeSubPath(nodeId, 'VARIABLES')}/${variableId}.json`;
}

/**
 * Build a path to an episode file
 */
export function episodePath(nodeId: string, episodeId: string): string {
  return `${nodeSubPath(nodeId, 'EPISODES')}/${episodeId}.json`;
}

/**
 * Build a path to a policy file
 */
export function policyPath(
  nodeId: string,
  policyId: string,
  ext: 'json' | 'ts' = 'json'
): string {
  return `${nodeSubPath(nodeId, 'POLICIES')}/${policyId}.${ext}`;
}

/**
 * Build a path to the observations log
 */
export function observationsLogPath(): string {
  return `${BUNDLE_DIRS.LOG}/${LOG_FILES.OBSERVATIONS}`;
}

/**
 * Build a path to the action runs log
 */
export function actionRunsLogPath(): string {
  return `${BUNDLE_DIRS.LOG}/${LOG_FILES.ACTION_RUNS}`;
}
