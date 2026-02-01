// Bundle import functionality.
// Imports an Omnilith Bundle folder into the repository.

import type { RepositoryContext } from '../interfaces/repository-context.js';
import type { BundleReader, ImportOptions, ImportSummary } from './types.js';
import {
  BUNDLE_DIRS,
  NODE_DIRS,
  NODE_FILES,
  ARTIFACT_FILES,
  nodePath,
  parseNdjson,
} from '@omnilith/protocol';

import type {
  Node,
  Edge,
  AgentDelegation,
  Artifact,
  Revision,
  Surface,
  SurfaceLayout,
  Entity,
  EntityEvent,
  EntityType,
  Variable,
  Episode,
  Policy,
  Grant,
  Observation,
  ActionRun,
} from '@omnilith/protocol';

/**
 * Bundle representation of a node (matches export format)
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
 * Bundle representation of an entity (includes events)
 */
type EntityBundle = Entity & {
  events: EntityEvent[];
};

/**
 * Import an Omnilith Bundle into the repository.
 *
 * This is the "load" function for the system. Takes a bundle that was
 * previously exported (or created by another interpreter) and imports
 * all data into the repository.
 *
 * @param repos - Repository context for data access
 * @param reader - Bundle reader for file operations
 * @param bundlePath - Root path of the bundle
 * @param options - Import options (conflict handling, clearing)
 * @returns Summary of the import operation
 */
export async function importBundle(
  repos: RepositoryContext,
  reader: BundleReader,
  bundlePath: string,
  options: ImportOptions = {}
): Promise<ImportSummary> {
  const { skipExisting = false } = options;

  const summary: ImportSummary = {
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
    importedAt: new Date().toISOString(),
    warnings: [],
  };

  // Helper to join paths
  const joinPath = (...parts: string[]) => parts.join('/');

  // Helper to read JSON file
  const readJson = async <T>(path: string): Promise<T> => {
    const content = await reader.readFile(joinPath(bundlePath, path));
    return JSON.parse(content) as T;
  };


  // Verify bundle structure exists
  const nodesDir = joinPath(bundlePath, BUNDLE_DIRS.NODES);
  if (!(await reader.exists(nodesDir))) {
    throw new Error(`Invalid bundle: missing ${BUNDLE_DIRS.NODES} directory`);
  }

  // Get list of nodes to import
  const nodeIds = await reader.listDirectory(nodesDir);

  // First pass: import all nodes (without edges, to avoid FK issues)
  const nodeBundles: Map<string, NodeBundle> = new Map();
  for (const nodeId of nodeIds) {
    const nodeJsonPath = joinPath(nodePath(nodeId), NODE_FILES.NODE_JSON);
    const nodeBundle = await readJson<NodeBundle>(nodeJsonPath);
    nodeBundles.set(nodeId, nodeBundle);

    // Check if node already exists
    const existingNode = await repos.nodes.get(nodeId);
    if (existingNode) {
      if (skipExisting) {
        summary.warnings.push(`Node ${nodeId} already exists, skipping`);
        continue;
      }
      throw new Error(`Node ${nodeId} already exists`);
    }

    // Create the node
    await repos.nodes.create({
      id: nodeBundle.id,
      kind: nodeBundle.kind,
      name: nodeBundle.name,
      description: nodeBundle.description,
    });
    summary.nodeCount++;
  }

  // Second pass: import edges and delegations
  for (const [nodeId, nodeBundle] of nodeBundles) {
    // Import edges
    for (const edge of nodeBundle.edges) {
      try {
        await repos.nodes.addEdge({
          id: edge.id,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          type: edge.type,
          metadata: edge.metadata,
        });
      } catch (error) {
        summary.warnings.push(`Failed to import edge ${edge.id}: ${String(error)}`);
      }
    }

    // Import delegation if present
    if (nodeBundle.delegation) {
      try {
        await repos.nodes.setAgentDelegation(nodeBundle.delegation);
      } catch (error) {
        summary.warnings.push(`Failed to import delegation for ${nodeId}: ${String(error)}`);
      }
    }
  }

  // Third pass: import all node data
  for (const nodeId of nodeIds) {
    // Skip if we skipped the node
    const existingNode = await repos.nodes.get(nodeId);
    if (!existingNode && skipExisting) {
      continue;
    }

    await importNodeData(repos, reader, bundlePath, nodeId, summary, skipExisting);
  }

  // Import logs
  await importLogs(repos, reader, bundlePath, summary, skipExisting);

  return summary;
}

/**
 * Import all data for a single node.
 */
async function importNodeData(
  repos: RepositoryContext,
  reader: BundleReader,
  bundlePath: string,
  nodeId: string,
  summary: ImportSummary,
  skipExisting: boolean
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const nodeDir = nodePath(nodeId);

  // Import entity types first (entities depend on them)
  const entityTypesDir = joinPath(bundlePath, nodeDir, NODE_DIRS.ENTITY_TYPES);
  if (await reader.exists(entityTypesDir) && await reader.isDirectory(entityTypesDir)) {
    const typeFiles = await reader.listDirectory(entityTypesDir);
    for (const file of typeFiles) {
      if (!file.endsWith('.json')) continue;

      const entityType = JSON.parse(
        await reader.readFile(joinPath(entityTypesDir, file))
      ) as EntityType;

      try {
        const existing = await repos.entities.getType(entityType.id);
        if (existing) {
          if (skipExisting) {
            summary.warnings.push(`Entity type ${entityType.id} already exists, skipping`);
            continue;
          }
          throw new Error(`Entity type ${entityType.id} already exists`);
        }

        await repos.entities.createType({
          id: entityType.id,
          nodeId: entityType.nodeId,
          typeName: entityType.typeName,
          title: entityType.title,
          description: entityType.description,
          schema: entityType.schema,
          eventTypes: entityType.eventTypes,
        });
        summary.entityTypeCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        summary.warnings.push(`Failed to import entity type ${entityType.id}: ${String(error)}`);
      }
    }
  }

  // Import variables
  const variablesDir = joinPath(bundlePath, nodeDir, NODE_DIRS.VARIABLES);
  if (await reader.exists(variablesDir) && await reader.isDirectory(variablesDir)) {
    const varFiles = await reader.listDirectory(variablesDir);
    for (const file of varFiles) {
      if (!file.endsWith('.json')) continue;

      const variable = JSON.parse(
        await reader.readFile(joinPath(variablesDir, file))
      ) as Variable;

      try {
        const existing = await repos.variables.get(variable.id);
        if (existing) {
          if (skipExisting) {
            summary.warnings.push(`Variable ${variable.id} already exists, skipping`);
            continue;
          }
          throw new Error(`Variable ${variable.id} already exists`);
        }

        await repos.variables.create({
          id: variable.id,
          nodeId: variable.nodeId,
          key: variable.key,
          title: variable.title,
          description: variable.description,
          kind: variable.kind,
          unit: variable.unit,
          viableRange: variable.viableRange,
          preferredRange: variable.preferredRange,
          computeSpecs: variable.computeSpecs,
          prior: variable.prior,
          target: variable.target,
        });
        summary.variableCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        summary.warnings.push(`Failed to import variable ${variable.id}: ${String(error)}`);
      }
    }
  }

  // Import layouts (surfaces may depend on them)
  const layoutsDir = joinPath(bundlePath, nodeDir, NODE_DIRS.LAYOUTS);
  if (await reader.exists(layoutsDir) && await reader.isDirectory(layoutsDir)) {
    const layoutFiles = await reader.listDirectory(layoutsDir);
    for (const file of layoutFiles) {
      if (!file.endsWith('.json')) continue;

      const layout = JSON.parse(
        await reader.readFile(joinPath(layoutsDir, file))
      ) as SurfaceLayout;

      try {
        const existing = await repos.surfaces.getLayout(layout.id);
        if (existing) {
          if (skipExisting) {
            summary.warnings.push(`Layout ${layout.id} already exists, skipping`);
            continue;
          }
          throw new Error(`Layout ${layout.id} already exists`);
        }

        await repos.surfaces.createLayout({
          id: layout.id,
          nodeId: layout.nodeId,
          name: layout.name,
          mode: layout.mode,
          sections: layout.sections,
          canvas: layout.canvas,
        });
        summary.layoutCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        summary.warnings.push(`Failed to import layout ${layout.id}: ${String(error)}`);
      }
    }
  }

  // Import artifacts
  const artifactsDir = joinPath(bundlePath, nodeDir, NODE_DIRS.ARTIFACTS);
  if (await reader.exists(artifactsDir) && await reader.isDirectory(artifactsDir)) {
    const artifactIds = await reader.listDirectory(artifactsDir);
    for (const artifactId of artifactIds) {
      const artifactDir = joinPath(artifactsDir, artifactId);
      if (!(await reader.isDirectory(artifactDir))) continue;

      await importArtifact(repos, reader, artifactDir, summary, skipExisting);
    }
  }

  // Import entities
  const entitiesDir = joinPath(bundlePath, nodeDir, NODE_DIRS.ENTITIES);
  if (await reader.exists(entitiesDir) && await reader.isDirectory(entitiesDir)) {
    const entityFiles = await reader.listDirectory(entitiesDir);
    for (const file of entityFiles) {
      if (!file.endsWith('.json')) continue;

      const entityBundle = JSON.parse(
        await reader.readFile(joinPath(entitiesDir, file))
      ) as EntityBundle;

      try {
        const existing = await repos.entities.get(entityBundle.id);
        if (existing) {
          if (skipExisting) {
            summary.warnings.push(`Entity ${entityBundle.id} already exists, skipping`);
            continue;
          }
          throw new Error(`Entity ${entityBundle.id} already exists`);
        }

        // Create entity (which creates the initial 'created' event internally)
        await repos.entities.create(
          {
            id: entityBundle.id,
            nodeId: entityBundle.nodeId,
            typeId: entityBundle.typeId,
            initialState: entityBundle.state,
          },
          entityBundle.events[0]?.actorNodeId ?? nodeId
        );

        // Import additional events (skip the first 'created' event)
        for (const event of entityBundle.events.slice(1)) {
          await repos.entities.appendEvent(entityBundle.id, {
            id: event.id,
            type: event.type,
            data: event.data,
            actorNodeId: event.actorNodeId,
            timestamp: event.timestamp,
          });
        }

        summary.entityCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        summary.warnings.push(`Failed to import entity ${entityBundle.id}: ${String(error)}`);
      }
    }
  }

  // Import episodes
  const episodesDir = joinPath(bundlePath, nodeDir, NODE_DIRS.EPISODES);
  if (await reader.exists(episodesDir) && await reader.isDirectory(episodesDir)) {
    const episodeFiles = await reader.listDirectory(episodesDir);
    for (const file of episodeFiles) {
      if (!file.endsWith('.json')) continue;

      const episode = JSON.parse(
        await reader.readFile(joinPath(episodesDir, file))
      ) as Episode;

      try {
        const existing = await repos.episodes.get(episode.id);
        if (existing) {
          if (skipExisting) {
            summary.warnings.push(`Episode ${episode.id} already exists, skipping`);
            continue;
          }
          throw new Error(`Episode ${episode.id} already exists`);
        }

        await repos.episodes.create({
          id: episode.id,
          nodeId: episode.nodeId,
          title: episode.title,
          description: episode.description,
          kind: episode.kind,
          variables: episode.variables,
          startsAt: episode.startsAt,
          endsAt: episode.endsAt,
          relatedArtifactIds: episode.relatedArtifactIds,
          status: episode.status,
        });
        summary.episodeCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        summary.warnings.push(`Failed to import episode ${episode.id}: ${String(error)}`);
      }
    }
  }

  // Import policies
  const policiesDir = joinPath(bundlePath, nodeDir, NODE_DIRS.POLICIES);
  if (await reader.exists(policiesDir) && await reader.isDirectory(policiesDir)) {
    const policyFiles = await reader.listDirectory(policiesDir);
    for (const file of policyFiles) {
      if (!file.endsWith('.json')) continue;

      const policy = JSON.parse(
        await reader.readFile(joinPath(policiesDir, file))
      ) as Policy;

      try {
        const existing = await repos.policies.get(policy.id);
        if (existing) {
          if (skipExisting) {
            summary.warnings.push(`Policy ${policy.id} already exists, skipping`);
            continue;
          }
          throw new Error(`Policy ${policy.id} already exists`);
        }

        await repos.policies.create({
          id: policy.id,
          nodeId: policy.nodeId,
          name: policy.name,
          description: policy.description,
          priority: policy.priority,
          enabled: policy.enabled,
          triggers: policy.triggers,
          implementation: policy.implementation,
        });
        summary.policyCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        summary.warnings.push(`Failed to import policy ${policy.id}: ${String(error)}`);
      }
    }
  }

  // Import surfaces
  const surfacesDir = joinPath(bundlePath, nodeDir, NODE_DIRS.SURFACES);
  if (await reader.exists(surfacesDir) && await reader.isDirectory(surfacesDir)) {
    const surfaceFiles = await reader.listDirectory(surfacesDir);
    for (const file of surfaceFiles) {
      if (!file.endsWith('.json')) continue;

      const surface = JSON.parse(
        await reader.readFile(joinPath(surfacesDir, file))
      ) as Surface;

      try {
        const existing = await repos.surfaces.get(surface.id);
        if (existing) {
          if (skipExisting) {
            summary.warnings.push(`Surface ${surface.id} already exists, skipping`);
            continue;
          }
          throw new Error(`Surface ${surface.id} already exists`);
        }

        await repos.surfaces.create({
          id: surface.id,
          nodeId: surface.nodeId,
          kind: surface.kind,
          title: surface.title,
          visibility: surface.visibility,
          entry: surface.entry,
          layoutId: surface.layoutId,
          inlineLayout: surface.inlineLayout,
          mapPosition: surface.mapPosition,
          category: surface.category,
        });
        summary.surfaceCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        summary.warnings.push(`Failed to import surface ${surface.id}: ${String(error)}`);
      }
    }
  }

  // Import grants
  const grantsPath = joinPath(bundlePath, nodeDir, NODE_DIRS.GRANTS, NODE_FILES.GRANTS_JSON);
  if (await reader.exists(grantsPath)) {
    const grants = JSON.parse(await reader.readFile(grantsPath)) as Grant[];

    for (const grant of grants) {
      try {
        const existing = await repos.grants.get(grant.id);
        if (existing) {
          if (skipExisting) {
            summary.warnings.push(`Grant ${grant.id} already exists, skipping`);
            continue;
          }
          throw new Error(`Grant ${grant.id} already exists`);
        }

        await repos.grants.create({
          id: grant.id,
          granteeNodeId: grant.granteeNodeId,
          resourceType: grant.resourceType,
          resourceId: grant.resourceId,
          scopes: grant.scopes,
          grantorNodeId: grant.grantorNodeId,
          expiresAt: grant.expiresAt,
        });
        summary.grantCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        summary.warnings.push(`Failed to import grant ${grant.id}: ${String(error)}`);
      }
    }
  }
}

/**
 * Import a single artifact with its revisions.
 */
async function importArtifact(
  repos: RepositoryContext,
  reader: BundleReader,
  artifactDir: string,
  summary: ImportSummary,
  skipExisting: boolean
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');
  const pageJsonPath = joinPath(artifactDir, ARTIFACT_FILES.PAGE_JSON);

  if (!(await reader.exists(pageJsonPath))) {
    summary.warnings.push(`Artifact missing page.json: ${artifactDir}`);
    return;
  }

  const artifact = JSON.parse(await reader.readFile(pageJsonPath)) as Artifact;

  try {
    const existing = await repos.artifacts.get(artifact.id);
    if (existing) {
      if (skipExisting) {
        summary.warnings.push(`Artifact ${artifact.id} already exists, skipping`);
        return;
      }
      throw new Error(`Artifact ${artifact.id} already exists`);
    }

    // Create the artifact with initial revision
    await repos.artifacts.create(
      {
        id: artifact.id,
        nodeId: artifact.nodeId,
        title: artifact.title,
        about: artifact.about,
        notes: artifact.notes,
        page: artifact.page,
        status: artifact.status,
        entityRefs: artifact.entityRefs,
      },
      {
        authorNodeId: artifact.nodeId,
        message: 'Imported from bundle',
      }
    );

    // Import additional revisions if present
    const revisionsPath = joinPath(artifactDir, ARTIFACT_FILES.REVISIONS_NDJSON);
    if (await reader.exists(revisionsPath)) {
      const revisionsContent = await reader.readFile(revisionsPath);
      const revisions = parseNdjson<Revision>(revisionsContent);

      // Skip first revision (already created), import the rest
      // Note: This is a simplification - in a full implementation, we'd need
      // a way to import revisions with their original version numbers
      for (const revision of revisions.slice(1)) {
        summary.warnings.push(
          `Revision ${revision.version} for artifact ${artifact.id} cannot be imported ` +
            '(revision import not yet supported)'
        );
      }
    }

    summary.artifactCount++;
  } catch (error) {
    if (!skipExisting) throw error;
    summary.warnings.push(`Failed to import artifact ${artifact.id}: ${String(error)}`);
  }
}

/**
 * Import observation and action run logs.
 */
async function importLogs(
  repos: RepositoryContext,
  reader: BundleReader,
  bundlePath: string,
  summary: ImportSummary,
  skipExisting: boolean
): Promise<void> {
  const joinPath = (...parts: string[]) => parts.join('/');

  // Import observations
  const observationsPath = joinPath(bundlePath, BUNDLE_DIRS.LOG, 'observations.ndjson');
  if (await reader.exists(observationsPath)) {
    const content = await reader.readFile(observationsPath);
    const observations = parseNdjson<Observation>(content);

    for (const observation of observations) {
      try {
        const existing = await repos.observations.get(observation.id);
        if (existing) {
          if (skipExisting) {
            continue; // Silent skip for observations
          }
          throw new Error(`Observation ${observation.id} already exists`);
        }

        await repos.observations.append({
          id: observation.id,
          nodeId: observation.nodeId,
          type: observation.type,
          timestamp: observation.timestamp,
          payload: observation.payload,
          provenance: observation.provenance,
          tags: observation.tags,
        });
        summary.observationCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        // Silent skip for duplicate observations
      }
    }
  }

  // Import action runs
  const actionRunsPath = joinPath(bundlePath, BUNDLE_DIRS.LOG, 'action_runs.ndjson');
  if (await reader.exists(actionRunsPath)) {
    const content = await reader.readFile(actionRunsPath);
    const actionRuns = parseNdjson<ActionRun>(content);

    for (const actionRun of actionRuns) {
      try {
        const existing = await repos.actionRuns.get(actionRun.id);
        if (existing) {
          if (skipExisting) {
            continue; // Silent skip for action runs
          }
          throw new Error(`ActionRun ${actionRun.id} already exists`);
        }

        // Create the action run
        const created = await repos.actionRuns.create({
          id: actionRun.id,
          nodeId: actionRun.nodeId,
          proposedBy: actionRun.proposedBy,
          action: actionRun.action,
          riskLevel: actionRun.riskLevel,
        });

        // Apply status transitions based on the imported state
        if (actionRun.approval) {
          await repos.actionRuns.approve(created.id, actionRun.approval);
        }
        if (actionRun.rejection) {
          await repos.actionRuns.reject(created.id, actionRun.rejection);
        }
        if (actionRun.execution) {
          if ('error' in actionRun.execution && actionRun.execution.error) {
            await repos.actionRuns.markFailed(created.id, {
              startedAt: actionRun.execution.startedAt,
              completedAt: actionRun.execution.completedAt,
              error: actionRun.execution.error,
            });
          } else {
            await repos.actionRuns.markExecuted(created.id, actionRun.execution);
          }
        }

        summary.actionRunCount++;
      } catch (error) {
        if (!skipExisting) throw error;
        summary.warnings.push(`Failed to import action run ${actionRun.id}: ${String(error)}`);
      }
    }
  }
}
