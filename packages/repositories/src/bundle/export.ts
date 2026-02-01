// Bundle export functionality.
// Exports the entire repository state to an Omnilith Bundle folder.

import type { RepositoryContext } from '../interfaces/repository-context.js';
import type { BundleWriter, ExportOptions, ExportSummary } from './types.js';
import {
  BUNDLE_DIRS,
  NODE_DIRS,
  NODE_FILES,
  ARTIFACT_FILES,
  nodePath,
  artifactPath,
  surfacePath,
  layoutPath,
  entityPath,
  entityTypePath,
  variablePath,
  episodePath,
  policyPath,
  observationsLogPath,
  actionRunsLogPath,
  stringifyNdjson,
  stringifyNdjsonLine,
} from '@omnilith/protocol';

import type {
  Node,
  Edge,
  AgentDelegation,
  Artifact,
  Surface,
  SurfaceLayout,
  Entity,
  EntityType,
  Variable,
  Episode,
  Policy,
  Grant,
} from '@omnilith/protocol';

/**
 * Bundle representation of a node (includes edges and delegation)
 */
type NodeBundle = {
  id: string;
  kind: Node['kind'];
  name: string;
  description?: string;
  edges: Edge[];
  delegation?: AgentDelegation;
  createdAt: string;
  updatedAt: string;
};

/**
 * Bundle representation of an artifact (for JSON serialization)
 */
type ArtifactBundle = Omit<Artifact, 'page'> & {
  page: unknown;
};

/**
 * Export the entire repository state to an Omnilith Bundle.
 *
 * This is the "save" function for the system. The resulting bundle
 * can be imported into any Omnilith-compatible interpreter.
 *
 * @param repos - Repository context with all data access
 * @param writer - Bundle writer for file operations
 * @param bundlePath - Root path for the bundle
 * @param options - Export options (filtering, what to include)
 * @returns Summary of the export operation
 */
export async function exportBundle(
  repos: RepositoryContext,
  writer: BundleWriter,
  bundlePath: string,
  options: ExportOptions = {}
): Promise<ExportSummary> {
  const {
    includeObservations = true,
    includeActionRuns = true,
    nodeIds,
  } = options;

  const summary: ExportSummary = {
    bundlePath,
    nodeCount: 0,
    artifactCount: 0,
    surfaceCount: 0,
    layoutCount: 0,
    entityCount: 0,
    entityTypeCount: 0,
    variableCount: 0,
    episodeCount: 0,
    policyCount: 0,
    grantCount: 0,
    observationCount: 0,
    actionRunCount: 0,
    exportedAt: new Date().toISOString(),
  };

  // Helper to join paths
  const joinPath = (...parts: string[]) => parts.join('/');


  // Create root directories
  await writer.mkdir(joinPath(bundlePath, BUNDLE_DIRS.NODES));
  await writer.mkdir(joinPath(bundlePath, BUNDLE_DIRS.LOG));

  // Get all nodes (or filtered subset)
  const allNodes = await repos.nodes.list();
  const nodes = nodeIds
    ? allNodes.filter((n) => nodeIds.includes(n.id))
    : allNodes;

  // Export each node and its associated data
  for (const node of nodes) {
    await exportNode(repos, writer, bundlePath, node, summary);
  }

  // Export observations log (NDJSON)
  if (includeObservations) {
    await exportObservationsLog(repos, writer, bundlePath, nodeIds, summary);
  }

  // Export action runs log (NDJSON)
  if (includeActionRuns) {
    await exportActionRunsLog(repos, writer, bundlePath, nodeIds, summary);
  }

  return summary;
}

/**
 * Export a single node and all its associated data.
 */
async function exportNode(
  repos: RepositoryContext,
  writer: BundleWriter,
  bundlePath: string,
  node: Node,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');

  // Create node directories
  const nodeDir = nodePath(node.id);
  await writer.mkdir(joinPath(bundlePath, nodeDir));

  for (const subdir of Object.values(NODE_DIRS)) {
    await writer.mkdir(joinPath(bundlePath, nodeDir, subdir));
  }

  // Get edges and delegation
  const edges = await repos.nodes.getEdges(node.id);
  const delegation = await repos.nodes.getAgentDelegation(node.id);

  // Write node.json
  const nodeBundle: NodeBundle = {
    id: node.id,
    kind: node.kind,
    name: node.name,
    description: node.description,
    edges,
    delegation: delegation ?? undefined,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };

  await writer.writeFile(
    joinPath(bundlePath, nodeDir, NODE_FILES.NODE_JSON),
    JSON.stringify(nodeBundle, null, 2)
  );
  summary.nodeCount++;

  // Export artifacts
  const artifacts = await repos.artifacts.list({ nodeId: node.id });
  for (const artifact of artifacts) {
    await exportArtifact(repos, writer, bundlePath, node.id, artifact, summary);
  }

  // Export surfaces
  const surfaces = await repos.surfaces.getByNode(node.id);
  for (const surface of surfaces) {
    await exportSurface(writer, bundlePath, node.id, surface, summary);
  }

  // Export layouts
  const layouts = await repos.surfaces.getLayoutsByNode(node.id);
  for (const layout of layouts) {
    await exportLayout(writer, bundlePath, node.id, layout, summary);
  }

  // Export entity types
  const entityTypes = await repos.entities.listTypes(node.id);
  for (const entityType of entityTypes) {
    await exportEntityType(writer, bundlePath, node.id, entityType, summary);
  }

  // Export entities
  const entities = await repos.entities.query({ nodeId: node.id });
  for (const entity of entities) {
    await exportEntity(repos, writer, bundlePath, node.id, entity, summary);
  }

  // Export variables
  const variables = await repos.variables.getByNode(node.id);
  for (const variable of variables) {
    await exportVariable(writer, bundlePath, node.id, variable, summary);
  }

  // Export episodes
  const episodes = await repos.episodes.list({ nodeId: node.id });
  for (const episode of episodes) {
    await exportEpisode(writer, bundlePath, node.id, episode, summary);
  }

  // Export policies
  const policies = await repos.policies.getByNode(node.id);
  for (const policy of policies) {
    await exportPolicy(writer, bundlePath, node.id, policy, summary);
  }

  // Export grants (granted TO this node)
  const grants = await repos.grants.getForGrantee(node.id);
  if (grants.length > 0) {
    await exportGrants(writer, bundlePath, node.id, grants, summary);
  }
}

/**
 * Export a single artifact with its revisions.
 */
async function exportArtifact(
  repos: RepositoryContext,
  writer: BundleWriter,
  bundlePath: string,
  nodeId: string,
  artifact: Artifact,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const artPath = artifactPath(nodeId, artifact.id);

  await writer.mkdir(joinPath(bundlePath, artPath));

  // Write about.md
  await writer.writeFile(
    joinPath(bundlePath, artPath, ARTIFACT_FILES.ABOUT_MD),
    artifact.about
  );

  // Write notes.md if present
  if (artifact.notes) {
    await writer.writeFile(
      joinPath(bundlePath, artPath, ARTIFACT_FILES.NOTES_MD),
      artifact.notes
    );
  }

  // Write page.json (the PageDoc structure)
  const artifactBundle: ArtifactBundle = {
    id: artifact.id,
    nodeId: artifact.nodeId,
    title: artifact.title,
    about: artifact.about,
    notes: artifact.notes,
    page: artifact.page,
    status: artifact.status,
    trunkVersion: artifact.trunkVersion,
    entityRefs: artifact.entityRefs,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };

  await writer.writeFile(
    joinPath(bundlePath, artPath, ARTIFACT_FILES.PAGE_JSON),
    JSON.stringify(artifactBundle, null, 2)
  );

  // Write revisions.ndjson
  const revisions = await repos.artifacts.getRevisions(artifact.id);
  if (revisions.length > 0) {
    await writer.writeFile(
      joinPath(bundlePath, artPath, ARTIFACT_FILES.REVISIONS_NDJSON),
      stringifyNdjson(revisions)
    );
  }

  summary.artifactCount++;
}

/**
 * Export a surface.
 */
async function exportSurface(
  writer: BundleWriter,
  bundlePath: string,
  nodeId: string,
  surface: Surface,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const path = surfacePath(nodeId, surface.id);

  await writer.writeFile(
    joinPath(bundlePath, path),
    JSON.stringify(surface, null, 2)
  );

  summary.surfaceCount++;
}

/**
 * Export a layout.
 */
async function exportLayout(
  writer: BundleWriter,
  bundlePath: string,
  nodeId: string,
  layout: SurfaceLayout,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const path = layoutPath(nodeId, layout.id);

  await writer.writeFile(
    joinPath(bundlePath, path),
    JSON.stringify(layout, null, 2)
  );

  summary.layoutCount++;
}

/**
 * Export an entity type.
 */
async function exportEntityType(
  writer: BundleWriter,
  bundlePath: string,
  nodeId: string,
  entityType: EntityType,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const path = entityTypePath(nodeId, entityType.id);

  await writer.writeFile(
    joinPath(bundlePath, path),
    JSON.stringify(entityType, null, 2)
  );

  summary.entityTypeCount++;
}

/**
 * Export an entity with its events.
 */
async function exportEntity(
  repos: RepositoryContext,
  writer: BundleWriter,
  bundlePath: string,
  nodeId: string,
  entity: Entity,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const path = entityPath(nodeId, entity.id);

  // Get events for this entity
  const events = await repos.entities.getEvents(entity.id);

  const entityBundle = {
    ...entity,
    events,
  };

  await writer.writeFile(
    joinPath(bundlePath, path),
    JSON.stringify(entityBundle, null, 2)
  );

  summary.entityCount++;
}

/**
 * Export a variable.
 */
async function exportVariable(
  writer: BundleWriter,
  bundlePath: string,
  nodeId: string,
  variable: Variable,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const path = variablePath(nodeId, variable.id);

  await writer.writeFile(
    joinPath(bundlePath, path),
    JSON.stringify(variable, null, 2)
  );

  summary.variableCount++;
}

/**
 * Export an episode.
 */
async function exportEpisode(
  writer: BundleWriter,
  bundlePath: string,
  nodeId: string,
  episode: Episode,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const path = episodePath(nodeId, episode.id);

  await writer.writeFile(
    joinPath(bundlePath, path),
    JSON.stringify(episode, null, 2)
  );

  summary.episodeCount++;
}

/**
 * Export a policy.
 */
async function exportPolicy(
  writer: BundleWriter,
  bundlePath: string,
  nodeId: string,
  policy: Policy,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const path = policyPath(nodeId, policy.id, 'json');

  await writer.writeFile(
    joinPath(bundlePath, path),
    JSON.stringify(policy, null, 2)
  );

  summary.policyCount++;
}

/**
 * Export grants for a node.
 */
async function exportGrants(
  writer: BundleWriter,
  bundlePath: string,
  nodeId: string,
  grants: Grant[],
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const path = joinPath(nodePath(nodeId), NODE_DIRS.GRANTS, NODE_FILES.GRANTS_JSON);

  await writer.writeFile(
    joinPath(bundlePath, path),
    JSON.stringify(grants, null, 2)
  );

  summary.grantCount += grants.length;
}

/**
 * Export observations to NDJSON log file.
 * Uses streaming for memory efficiency with large logs.
 */
async function exportObservationsLog(
  repos: RepositoryContext,
  writer: BundleWriter,
  bundlePath: string,
  nodeIds: string[] | undefined,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const logPath = observationsLogPath();

  // For multiple nodes, we need to query each
  const nodesToQuery = nodeIds ?? (await repos.nodes.list()).map((n) => n.id);

  let content = '';
  for (const nodeId of nodesToQuery) {
    // Stream observations for this node
    // Use limit of 1000 (max allowed) per batch for streaming
    const stream = repos.observations.stream({ nodeId, limit: 1000 });

    for await (const observation of stream) {
      content += stringifyNdjsonLine(observation);
      summary.observationCount++;
    }
  }

  await writer.writeFile(joinPath(bundlePath, logPath), content);
}

/**
 * Export action runs to NDJSON log file.
 */
async function exportActionRunsLog(
  repos: RepositoryContext,
  writer: BundleWriter,
  bundlePath: string,
  nodeIds: string[] | undefined,
  summary: ExportSummary
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const logPath = actionRunsLogPath();

  // Get all nodes to query
  const nodesToQuery = nodeIds ?? (await repos.nodes.list()).map((n) => n.id);

  let content = '';
  for (const nodeId of nodesToQuery) {
    const actionRuns = await repos.actionRuns.query({ nodeId });

    for (const actionRun of actionRuns) {
      content += stringifyNdjsonLine(actionRun);
      summary.actionRunCount++;
    }
  }

  await writer.writeFile(joinPath(bundlePath, logPath), content);
}
