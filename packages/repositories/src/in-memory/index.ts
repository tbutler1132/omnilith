// In-memory repository implementations for development and testing
//
// This module provides a complete in-memory implementation of all repositories,
// useful for:
// - Local development without a database
// - Fast unit testing
// - Prototyping UI components
//
// Data does not persist between restarts.

import type {
  Node,
  Edge,
  AgentDelegation,
  Observation,
  Artifact,
  Revision,
  Variable,
  Episode,
  Policy,
  ActionRun,
  Surface,
  SurfaceLayout,
  Entity,
  EntityEvent,
  EntityType,
  Grant,
} from '@omnilith/protocol';
import type {
  RepositoryContext,
  TransactionalRepositoryContext,
  NodeRepository,
  ObservationRepository,
  ArtifactRepository,
  VariableRepository,
  EpisodeRepository,
  PolicyRepository,
  ActionRunRepository,
  SurfaceRepository,
  EntityRepository,
  GrantRepository,
} from '../interfaces/index.js';

/**
 * In-memory data store that can be accessed for debugging/inspection.
 */
export interface InMemoryDataStore {
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  delegations: Map<string, AgentDelegation>;
  observations: Map<string, Observation>;
  artifacts: Map<string, Artifact>;
  revisions: Map<string, Revision[]>;
  variables: Map<string, Variable>;
  episodes: Map<string, Episode>;
  policies: Map<string, Policy>;
  actionRuns: Map<string, ActionRun>;
  surfaces: Map<string, Surface>;
  layouts: Map<string, SurfaceLayout>;
  entities: Map<string, Entity>;
  entityEvents: Map<string, EntityEvent[]>;
  entityTypes: Map<string, EntityType>;
  grants: Map<string, Grant>;
}

/**
 * Extended repository context with access to underlying data and clear function.
 */
export interface InMemoryRepositoryContext extends TransactionalRepositoryContext {
  /** Direct access to underlying data stores (for debugging/testing) */
  _data: InMemoryDataStore;
  /** Clear all data */
  clear(): void;
}

/**
 * Create a complete in-memory repository context.
 *
 * All data is stored in memory and will not persist between restarts.
 * Useful for development and testing.
 *
 * @example
 * ```typescript
 * const repos = createInMemoryRepositoryContext();
 *
 * // Use like any other repository context
 * const node = await repos.nodes.create({ kind: 'subject', name: 'Test' });
 *
 * // Access underlying data for debugging
 * console.log(repos._data.nodes.size);
 *
 * // Clear all data
 * repos.clear();
 * ```
 */
export function createInMemoryRepositoryContext(): InMemoryRepositoryContext {
  // Data stores
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Edge>();
  const delegations = new Map<string, AgentDelegation>();
  const observations = new Map<string, Observation>();
  const artifacts = new Map<string, Artifact>();
  const revisions = new Map<string, Revision[]>();
  const variables = new Map<string, Variable>();
  const episodes = new Map<string, Episode>();
  const policies = new Map<string, Policy>();
  const actionRuns = new Map<string, ActionRun>();
  const surfaces = new Map<string, Surface>();
  const layouts = new Map<string, SurfaceLayout>();
  const entities = new Map<string, Entity>();
  const entityEvents = new Map<string, EntityEvent[]>();
  const entityTypes = new Map<string, EntityType>();
  const grants = new Map<string, Grant>();

  // Node repository
  const nodeRepo: NodeRepository = {
    async create(input) {
      const id = input.id ?? `node-${nodes.size + 1}`;
      const now = new Date().toISOString();
      const node: Node = {
        id,
        kind: input.kind,
        name: input.name,
        description: input.description,
        edges: [],
        createdAt: now,
        updatedAt: now,
      };
      nodes.set(id, node);
      return node;
    },
    async get(id) {
      return nodes.get(id) ?? null;
    },
    async list(filter) {
      let result = Array.from(nodes.values());
      if (filter?.kind) {
        result = result.filter((n) => n.kind === filter.kind);
      }
      return result;
    },
    async update(id, input) {
      const node = nodes.get(id);
      if (!node) return null;
      if (input.name !== undefined) node.name = input.name;
      if (input.description !== undefined) node.description = input.description;
      node.updatedAt = new Date().toISOString();
      return node;
    },
    async addEdge(input) {
      const id = input.id ?? `edge-${edges.size + 1}`;
      const edge: Edge = {
        id,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        type: input.type,
        metadata: input.metadata,
        createdAt: new Date().toISOString(),
      };
      edges.set(id, edge);
      return edge;
    },
    async removeEdge(edgeId) {
      return edges.delete(edgeId);
    },
    async getEdges(nodeId) {
      return Array.from(edges.values()).filter(
        (e) => e.fromNodeId === nodeId || e.toNodeId === nodeId
      );
    },
    async setAgentDelegation(delegation) {
      delegations.set(delegation.agentNodeId, delegation);
    },
    async getAgentDelegation(agentNodeId) {
      return delegations.get(agentNodeId) ?? null;
    },
    async revokeAgentDelegation(agentNodeId) {
      return delegations.delete(agentNodeId);
    },
  };

  // Observation repository
  const observationRepo: ObservationRepository = {
    async append(input) {
      const id = input.id ?? `obs-${observations.size + 1}`;
      const observation: Observation = {
        id,
        nodeId: input.nodeId,
        type: input.type,
        timestamp: input.timestamp ?? new Date().toISOString(),
        payload: input.payload,
        provenance: input.provenance,
        tags: input.tags,
      };
      observations.set(id, observation);
      return observation;
    },
    async get(id) {
      return observations.get(id) ?? null;
    },
    async query(filter) {
      let result = Array.from(observations.values());
      if (filter.nodeId) {
        result = result.filter((o) => o.nodeId === filter.nodeId);
      }
      if (filter.type) {
        result = result.filter((o) => o.type === filter.type);
      }
      if (filter.typePrefix) {
        result = result.filter((o) => o.type.startsWith(filter.typePrefix!));
      }
      if (filter.tags && filter.tags.length > 0) {
        result = result.filter((o) => filter.tags!.some((t) => o.tags?.includes(t)));
      }
      // Time window filtering
      if (filter.window?.hours) {
        const cutoff = new Date(Date.now() - filter.window.hours * 60 * 60 * 1000);
        result = result.filter((o) => new Date(o.timestamp) >= cutoff);
      }
      if (filter.window?.since) {
        result = result.filter((o) => new Date(o.timestamp) >= new Date(filter.window!.since!));
      }
      // Legacy time range
      if (filter.timeRange?.start) {
        result = result.filter((o) => new Date(o.timestamp) >= new Date(filter.timeRange!.start!));
      }
      if (filter.timeRange?.end) {
        result = result.filter((o) => new Date(o.timestamp) <= new Date(filter.timeRange!.end!));
      }
      // Sort by timestamp descending
      result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return result.slice(0, filter.limit ?? 100);
    },
    async count(filter) {
      const result = await this.query({ ...filter, limit: 10000 });
      return result.length;
    },
    async getByType(nodeId, typePattern, limit) {
      return Array.from(observations.values())
        .filter((o) => o.nodeId === nodeId && o.type.startsWith(typePattern.replace('*', '')))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit ?? 100);
    },
    async getRecent(nodeId, limit) {
      return Array.from(observations.values())
        .filter((o) => o.nodeId === nodeId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    },
    async *stream(filter) {
      const result = await this.query(filter);
      for (const obs of result) {
        yield obs;
      }
    },
  };

  // Artifact repository
  const artifactRepo: ArtifactRepository = {
    async create(input, revision) {
      const id = input.id ?? `artifact-${artifacts.size + 1}`;
      const now = new Date().toISOString();
      const artifact: Artifact = {
        id,
        nodeId: input.nodeId,
        title: input.title,
        about: input.about,
        notes: input.notes,
        page: input.page,
        status: input.status ?? 'draft',
        trunkVersion: 1,
        entityRefs: input.entityRefs,
        createdAt: now,
        updatedAt: now,
      };
      artifacts.set(id, artifact);

      // Create initial revision
      const rev: Revision = {
        id: `rev-${id}-1`,
        artifactId: id,
        version: 1,
        snapshot: {
          title: artifact.title,
          about: artifact.about,
          notes: artifact.notes,
          page: artifact.page,
          status: artifact.status,
        },
        authorNodeId: revision.authorNodeId,
        message: revision.message ?? 'Initial version',
        createdAt: now,
      };
      revisions.set(id, [rev]);

      return artifact;
    },
    async get(id) {
      return artifacts.get(id) ?? null;
    },
    async list(filter) {
      let result = Array.from(artifacts.values());
      if (filter?.nodeId) {
        result = result.filter((a) => a.nodeId === filter.nodeId);
      }
      if (filter?.status && filter.status.length > 0) {
        result = result.filter((a) => filter.status!.includes(a.status));
      }
      if (filter?.entityRefs && filter.entityRefs.length > 0) {
        result = result.filter((a) =>
          filter.entityRefs!.some((ref) => a.entityRefs?.includes(ref))
        );
      }
      // Sort by updatedAt descending
      result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      if (filter?.offset) {
        result = result.slice(filter.offset);
      }
      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }
      return result;
    },
    async query(nodeId, querySpec) {
      let result = Array.from(artifacts.values()).filter((a) => a.nodeId === nodeId);
      if (querySpec.status && querySpec.status.length > 0) {
        result = result.filter((a) => querySpec.status!.includes(a.status));
      }
      return result;
    },
    async update(id, input, revision) {
      const existing = artifacts.get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const newVersion = existing.trunkVersion + 1;

      const updated: Artifact = {
        ...existing,
        title: input.title ?? existing.title,
        about: input.about ?? existing.about,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        page: input.page ?? existing.page,
        status: input.status ?? existing.status,
        entityRefs: input.entityRefs !== undefined ? input.entityRefs : existing.entityRefs,
        trunkVersion: newVersion,
        updatedAt: now,
      };
      artifacts.set(id, updated);

      // Create revision
      const artifactRevisions = revisions.get(id) ?? [];
      artifactRevisions.push({
        id: `rev-${id}-${newVersion}`,
        artifactId: id,
        version: newVersion,
        snapshot: {
          title: updated.title,
          about: updated.about,
          notes: updated.notes,
          page: updated.page,
          status: updated.status,
        },
        authorNodeId: revision.authorNodeId,
        message: revision.message,
        createdAt: now,
      });
      revisions.set(id, artifactRevisions);

      return updated;
    },
    async updateStatus(id, status, authorNodeId) {
      const existing = artifacts.get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const newVersion = existing.trunkVersion + 1;

      const updated: Artifact = {
        ...existing,
        status,
        trunkVersion: newVersion,
        updatedAt: now,
      };
      artifacts.set(id, updated);

      // Create revision for status change
      const artifactRevisions = revisions.get(id) ?? [];
      artifactRevisions.push({
        id: `rev-${id}-${newVersion}`,
        artifactId: id,
        version: newVersion,
        snapshot: {
          title: updated.title,
          about: updated.about,
          notes: updated.notes,
          page: updated.page,
          status: updated.status,
        },
        authorNodeId,
        message: `Status changed to ${status}`,
        createdAt: now,
      });
      revisions.set(id, artifactRevisions);

      return updated;
    },
    async getRevisions(artifactId) {
      const artifactRevisions = revisions.get(artifactId) ?? [];
      return [...artifactRevisions].sort((a, b) => b.version - a.version);
    },
    async getRevision(artifactId, version) {
      const artifactRevisions = revisions.get(artifactId) ?? [];
      return artifactRevisions.find((r) => r.version === version) ?? null;
    },
    async getByEntityRef(entityId) {
      return Array.from(artifacts.values()).filter((a) => a.entityRefs?.includes(entityId));
    },
  };

  // Variable repository
  const variableRepo: VariableRepository = {
    async create(input) {
      const id = input.id ?? `var-${variables.size + 1}`;
      const now = new Date().toISOString();
      const variable: Variable = {
        id,
        nodeId: input.nodeId,
        key: input.key,
        title: input.title,
        description: input.description,
        kind: input.kind,
        unit: input.unit,
        viableRange: input.viableRange,
        preferredRange: input.preferredRange,
        computeSpecs: input.computeSpecs ?? [],
        prior: input.prior,
        target: input.target,
        createdAt: now,
        updatedAt: now,
      };
      variables.set(id, variable);
      return variable;
    },
    async get(id) {
      return variables.get(id) ?? null;
    },
    async getByKey(nodeId, key) {
      return (
        Array.from(variables.values()).find((v) => v.nodeId === nodeId && v.key === key) ?? null
      );
    },
    async list(filter) {
      let result = Array.from(variables.values());
      if (filter?.nodeId) {
        result = result.filter((v) => v.nodeId === filter.nodeId);
      }
      if (filter?.kind) {
        result = result.filter((v) => v.kind === filter.kind);
      }
      if (filter?.offset) {
        result = result.slice(filter.offset);
      }
      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }
      return result;
    },
    async update(id, input) {
      const variable = variables.get(id);
      if (!variable) return null;

      const updated: Variable = {
        ...variable,
        title: input.title ?? variable.title,
        description: input.description !== undefined ? input.description : variable.description,
        unit: input.unit !== undefined ? input.unit : variable.unit,
        viableRange: input.viableRange !== undefined ? input.viableRange : variable.viableRange,
        preferredRange:
          input.preferredRange !== undefined ? input.preferredRange : variable.preferredRange,
        prior: input.prior !== undefined ? input.prior : variable.prior,
        target: input.target !== undefined ? input.target : variable.target,
        updatedAt: new Date().toISOString(),
      };
      variables.set(id, updated);
      return updated;
    },
    async addComputeSpec(variableId, spec) {
      const variable = variables.get(variableId);
      if (!variable) return null;

      const updated: Variable = {
        ...variable,
        computeSpecs: [...variable.computeSpecs, spec],
        updatedAt: new Date().toISOString(),
      };
      variables.set(variableId, updated);
      return updated;
    },
    async updateComputeSpec(variableId, specId, spec) {
      const variable = variables.get(variableId);
      if (!variable) return null;

      const updated: Variable = {
        ...variable,
        computeSpecs: variable.computeSpecs.map((s) => (s.id === specId ? { ...s, ...spec } : s)),
        updatedAt: new Date().toISOString(),
      };
      variables.set(variableId, updated);
      return updated;
    },
    async removeComputeSpec(variableId, specId) {
      const variable = variables.get(variableId);
      if (!variable) return null;

      const updated: Variable = {
        ...variable,
        computeSpecs: variable.computeSpecs.filter((s) => s.id !== specId),
        updatedAt: new Date().toISOString(),
      };
      variables.set(variableId, updated);
      return updated;
    },
    async getByNode(nodeId) {
      return Array.from(variables.values()).filter((v) => v.nodeId === nodeId);
    },
  };

  // Episode repository
  const episodeRepo: EpisodeRepository = {
    async create(input) {
      const id = input.id ?? `episode-${episodes.size + 1}`;
      const now = new Date().toISOString();
      const episode: Episode = {
        id,
        nodeId: input.nodeId,
        title: input.title,
        description: input.description,
        kind: input.kind,
        variables: input.variables,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        relatedArtifactIds: input.relatedArtifactIds,
        status: input.status ?? 'planned',
        createdAt: now,
        updatedAt: now,
      };
      episodes.set(id, episode);
      return episode;
    },
    async get(id) {
      return episodes.get(id) ?? null;
    },
    async list(filter) {
      let result = Array.from(episodes.values());
      if (filter?.nodeId) {
        result = result.filter((e) => e.nodeId === filter.nodeId);
      }
      if (filter?.status && filter.status.length > 0) {
        result = result.filter((e) => filter.status!.includes(e.status));
      }
      if (filter?.kind) {
        result = result.filter((e) => e.kind === filter.kind);
      }
      if (filter?.variableId) {
        result = result.filter((e) => e.variables.some((v) => v.variableId === filter.variableId));
      }
      // Sort by updatedAt descending
      result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      if (filter?.offset) {
        result = result.slice(filter.offset);
      }
      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }
      return result;
    },
    async update(id, input) {
      const episode = episodes.get(id);
      if (!episode) return null;

      const updated: Episode = {
        ...episode,
        title: input.title ?? episode.title,
        description: input.description !== undefined ? input.description : episode.description,
        variables: input.variables ?? episode.variables,
        startsAt: input.startsAt !== undefined ? input.startsAt : episode.startsAt,
        endsAt: input.endsAt !== undefined ? input.endsAt : episode.endsAt,
        relatedArtifactIds:
          input.relatedArtifactIds !== undefined
            ? input.relatedArtifactIds
            : episode.relatedArtifactIds,
        status: input.status ?? episode.status,
        updatedAt: new Date().toISOString(),
      };
      episodes.set(id, updated);
      return updated;
    },
    async updateStatus(id, status) {
      const episode = episodes.get(id);
      if (!episode) return null;
      episode.status = status;
      episode.updatedAt = new Date().toISOString();
      return episode;
    },
    async getActive(nodeId) {
      return Array.from(episodes.values()).filter(
        (e) => e.nodeId === nodeId && e.status === 'active'
      );
    },
    async getByVariable(variableId) {
      return Array.from(episodes.values()).filter((e) =>
        e.variables.some((v) => v.variableId === variableId)
      );
    },
    async getByArtifact(artifactId) {
      return Array.from(episodes.values()).filter((e) =>
        e.relatedArtifactIds?.includes(artifactId)
      );
    },
  };

  // Policy repository
  const policyRepo: PolicyRepository = {
    async create(input) {
      const id = input.id ?? `policy-${policies.size + 1}`;
      const now = new Date().toISOString();
      const policy: Policy = {
        id,
        nodeId: input.nodeId,
        name: input.name,
        description: input.description,
        priority: input.priority,
        enabled: input.enabled ?? true,
        triggers: input.triggers,
        implementation: input.implementation,
        createdAt: now,
        updatedAt: now,
      };
      policies.set(id, policy);
      return policy;
    },
    async get(id) {
      return policies.get(id) ?? null;
    },
    async list(filter) {
      let result = Array.from(policies.values());
      if (filter?.nodeId) {
        result = result.filter((p) => p.nodeId === filter.nodeId);
      }
      if (filter?.enabled !== undefined) {
        result = result.filter((p) => p.enabled === filter.enabled);
      }
      return result;
    },
    async update(id, input) {
      const policy = policies.get(id);
      if (!policy) return null;

      const updated: Policy = {
        ...policy,
        name: input.name ?? policy.name,
        description: input.description !== undefined ? input.description : policy.description,
        priority: input.priority ?? policy.priority,
        triggers: input.triggers ?? policy.triggers,
        implementation: input.implementation ?? policy.implementation,
        updatedAt: new Date().toISOString(),
      };
      policies.set(id, updated);
      return updated;
    },
    async getByNode(nodeId) {
      return Array.from(policies.values())
        .filter((p) => p.nodeId === nodeId)
        .sort((a, b) => b.priority - a.priority);
    },
    async getByTrigger(nodeId, observationType) {
      return Array.from(policies.values())
        .filter(
          (p) =>
            p.nodeId === nodeId &&
            p.enabled &&
            p.triggers.some((pattern) => {
              // Triggers are observation type patterns like "health.*" or "work.task.completed"
              if (pattern === observationType) return true;
              // Check wildcard patterns
              if (pattern.endsWith('*')) {
                return observationType.startsWith(pattern.slice(0, -1));
              }
              return false;
            })
        )
        .sort((a, b) => b.priority - a.priority);
    },
    async setEnabled(id, enabled) {
      const policy = policies.get(id);
      if (!policy) return null;
      policy.enabled = enabled;
      policy.updatedAt = new Date().toISOString();
      return policy;
    },
  };

  // ActionRun repository
  const actionRunRepo: ActionRunRepository = {
    async create(input) {
      const id = input.id ?? `run-${actionRuns.size + 1}`;
      const now = new Date().toISOString();
      const actionRun: ActionRun = {
        id,
        nodeId: input.nodeId,
        proposedBy: input.proposedBy,
        action: input.action,
        riskLevel: input.riskLevel,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      actionRuns.set(id, actionRun);
      return actionRun;
    },
    async get(id) {
      return actionRuns.get(id) ?? null;
    },
    async query(filter) {
      let result = Array.from(actionRuns.values());
      if (filter?.nodeId) {
        result = result.filter((r) => r.nodeId === filter.nodeId);
      }
      if (filter?.status && filter.status.length > 0) {
        result = result.filter((r) => filter.status!.includes(r.status));
      }
      // Sort by createdAt descending
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return result;
    },
    async getPending(nodeId) {
      return Array.from(actionRuns.values())
        .filter((r) => r.nodeId === nodeId && r.status === 'pending')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    },
    async getPendingApproval(nodeId) {
      return Array.from(actionRuns.values())
        .filter((r) => r.nodeId === nodeId && r.status === 'pending' && r.riskLevel !== 'low')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    },
    async approve(id, approval) {
      const run = actionRuns.get(id);
      if (!run) return null;
      run.status = 'approved';
      run.approval = approval;
      run.updatedAt = new Date().toISOString();
      return run;
    },
    async reject(id, rejection) {
      const run = actionRuns.get(id);
      if (!run) return null;
      run.status = 'rejected';
      run.rejection = { ...rejection, rejectedAt: new Date().toISOString() };
      run.updatedAt = new Date().toISOString();
      return run;
    },
    async markExecuted(id, execution) {
      const run = actionRuns.get(id);
      if (!run) return null;
      run.status = 'executed';
      run.execution = execution;
      run.updatedAt = new Date().toISOString();
      return run;
    },
    async markFailed(id, execution) {
      const run = actionRuns.get(id);
      if (!run) return null;
      run.status = 'failed';
      run.execution = { ...execution, result: undefined };
      run.updatedAt = new Date().toISOString();
      return run;
    },
    async countByStatus(nodeId) {
      const runs = Array.from(actionRuns.values()).filter((r) => r.nodeId === nodeId);
      return {
        pending: runs.filter((r) => r.status === 'pending').length,
        approved: runs.filter((r) => r.status === 'approved').length,
        rejected: runs.filter((r) => r.status === 'rejected').length,
        executed: runs.filter((r) => r.status === 'executed').length,
        failed: runs.filter((r) => r.status === 'failed').length,
      };
    },
  };

  // Surface repository
  const surfaceRepo: SurfaceRepository = {
    async create(input) {
      const id = input.id ?? `surface-${surfaces.size + 1}`;
      const now = new Date().toISOString();
      const surface: Surface = {
        id,
        nodeId: input.nodeId,
        kind: input.kind,
        title: input.title,
        visibility: input.visibility,
        entry: input.entry,
        layoutId: input.layoutId,
        inlineLayout: input.inlineLayout,
        mapPosition: input.mapPosition,
        category: input.category,
        createdAt: now,
        updatedAt: now,
      };
      surfaces.set(id, surface);
      return surface;
    },
    async get(id) {
      return surfaces.get(id) ?? null;
    },
    async list(filter) {
      let result = Array.from(surfaces.values());
      if (filter?.nodeId) {
        result = result.filter((s) => s.nodeId === filter.nodeId);
      }
      if (filter?.kind) {
        result = result.filter((s) => s.kind === filter.kind);
      }
      if (filter?.visibility && filter.visibility.length > 0) {
        result = result.filter((s) => filter.visibility!.includes(s.visibility));
      }
      if (filter?.category) {
        result = result.filter((s) => s.category === filter.category);
      }
      // Sort by title
      result.sort((a, b) => a.title.localeCompare(b.title));
      if (filter?.offset) {
        result = result.slice(filter.offset);
      }
      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }
      return result;
    },
    async update(id, input) {
      const existing = surfaces.get(id);
      if (!existing) return null;

      const updated: Surface = {
        ...existing,
        title: input.title ?? existing.title,
        visibility: input.visibility ?? existing.visibility,
        entry: input.entry
          ? {
              artifactId: input.entry.artifactId ?? existing.entry.artifactId,
              query: input.entry.query ?? existing.entry.query,
            }
          : existing.entry,
        layoutId: input.layoutId !== undefined ? input.layoutId : existing.layoutId,
        inlineLayout: input.inlineLayout !== undefined ? input.inlineLayout : existing.inlineLayout,
        mapPosition: input.mapPosition !== undefined ? input.mapPosition : existing.mapPosition,
        category: input.category !== undefined ? input.category : existing.category,
        updatedAt: new Date().toISOString(),
      };
      surfaces.set(id, updated);
      return updated;
    },
    async delete(id) {
      return surfaces.delete(id);
    },
    async getByNode(nodeId) {
      return Array.from(surfaces.values())
        .filter((s) => s.nodeId === nodeId)
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    async getVisible(nodeId, _viewerNodeId) {
      // In dev mode, return all surfaces for simplicity
      return Array.from(surfaces.values())
        .filter((s) => s.nodeId === nodeId)
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    async createLayout(input) {
      const id = input.id ?? `layout-${layouts.size + 1}`;
      const now = new Date().toISOString();
      const layout: SurfaceLayout = {
        id,
        nodeId: input.nodeId,
        name: input.name,
        mode: input.mode,
        sections: input.sections,
        canvas: input.canvas,
        createdAt: now,
        updatedAt: now,
      };
      layouts.set(id, layout);
      return layout;
    },
    async getLayout(id) {
      return layouts.get(id) ?? null;
    },
    async updateLayout(id, input) {
      const existing = layouts.get(id);
      if (!existing) return null;

      const updated: SurfaceLayout = {
        ...existing,
        name: input.name ?? existing.name,
        sections: input.sections ?? existing.sections,
        canvas: input.canvas ?? existing.canvas,
        updatedAt: new Date().toISOString(),
      };
      layouts.set(id, updated);
      return updated;
    },
    async deleteLayout(id) {
      return layouts.delete(id);
    },
    async getLayoutsByNode(nodeId) {
      return Array.from(layouts.values()).filter((l) => l.nodeId === nodeId);
    },
  };

  // Entity repository
  const entityRepo: EntityRepository = {
    async createType(input) {
      const id = input.id ?? `type-${entityTypes.size + 1}`;
      const now = new Date().toISOString();
      const entityType: EntityType = {
        id,
        nodeId: input.nodeId,
        typeName: input.typeName,
        title: input.title,
        description: input.description,
        schema: input.schema,
        eventTypes: input.eventTypes,
        createdAt: now,
        updatedAt: now,
      };
      entityTypes.set(id, entityType);
      return entityType;
    },
    async getType(id) {
      return entityTypes.get(id) ?? null;
    },
    async getTypeByName(nodeId, typeName) {
      return (
        Array.from(entityTypes.values()).find(
          (t) => t.nodeId === nodeId && t.typeName === typeName
        ) ?? null
      );
    },
    async listTypes(nodeId) {
      return Array.from(entityTypes.values())
        .filter((t) => t.nodeId === nodeId)
        .sort((a, b) => a.typeName.localeCompare(b.typeName));
    },
    async create(input, actorNodeId) {
      const id = input.id ?? `entity-${entities.size + 1}`;
      const now = new Date().toISOString();

      // Create initial event
      const initialEvent: EntityEvent = {
        id: `event-${id}-1`,
        entityId: id,
        type: 'created',
        data: input.initialState ?? {},
        timestamp: now,
        actorNodeId,
      };

      const entity: Entity = {
        id,
        nodeId: input.nodeId,
        typeId: input.typeId,
        state: input.initialState ?? {},
        events: [initialEvent],
        createdAt: now,
        updatedAt: now,
      };
      entities.set(id, entity);
      entityEvents.set(id, [initialEvent]);

      return entity;
    },
    async get(id) {
      const entity = entities.get(id);
      if (!entity) return null;
      return {
        ...entity,
        events: entityEvents.get(id) ?? [],
      };
    },
    async query(filter) {
      let result = Array.from(entities.values());
      if (filter.nodeId) {
        result = result.filter((e) => e.nodeId === filter.nodeId);
      }
      if (filter.typeId) {
        result = result.filter((e) => e.typeId === filter.typeId);
      }
      if (filter.typeName) {
        const typesByName = Array.from(entityTypes.values()).filter(
          (t) => t.typeName === filter.typeName
        );
        const typeIds = typesByName.map((t) => t.id);
        result = result.filter((e) => typeIds.includes(e.typeId));
      }
      if (filter.offset) {
        result = result.slice(filter.offset);
      }
      if (filter.limit) {
        result = result.slice(0, filter.limit);
      }
      // Return without full event history for list performance
      return result.map((e) => ({ ...e, events: [] }));
    },
    async appendEvent(entityId, event) {
      const entity = entities.get(entityId);
      if (!entity) return null;

      const events = entityEvents.get(entityId) ?? [];
      const newEvent: EntityEvent = {
        id: event.id ?? `event-${entityId}-${events.length + 1}`,
        entityId,
        type: event.type,
        data: event.data,
        timestamp: event.timestamp ?? new Date().toISOString(),
        actorNodeId: event.actorNodeId,
      };
      events.push(newEvent);
      entityEvents.set(entityId, events);

      // Update entity state (simple merge for in-memory)
      entity.state = { ...entity.state, ...(event.data as Record<string, unknown>) };
      entity.events = events;
      entity.updatedAt = new Date().toISOString();

      return entity;
    },
    async getEvents(entityId) {
      return entityEvents.get(entityId) ?? [];
    },
    async queryEvents(filter) {
      let result: EntityEvent[] = [];
      if (filter.entityId) {
        result = entityEvents.get(filter.entityId) ?? [];
      } else {
        // Collect all events
        for (const events of entityEvents.values()) {
          result.push(...events);
        }
      }
      if (filter.type) {
        result = result.filter((e) => e.type === filter.type);
      }
      // Sort by timestamp
      result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (filter.limit) {
        result = result.slice(0, filter.limit);
      }
      return result;
    },
    async materializeState(entityId) {
      const entity = entities.get(entityId);
      return entity?.state ?? null;
    },
  };

  // Grant repository
  const grantRepo: GrantRepository = {
    async create(input) {
      const id = input.id ?? `grant-${grants.size + 1}`;
      const grant: Grant = {
        id,
        granteeNodeId: input.granteeNodeId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        scopes: input.scopes,
        grantorNodeId: input.grantorNodeId,
        grantedAt: new Date().toISOString(),
        expiresAt: input.expiresAt,
      };
      grants.set(id, grant);
      return grant;
    },
    async get(id) {
      return grants.get(id) ?? null;
    },
    async query(filter) {
      let result = Array.from(grants.values());
      if (filter?.granteeNodeId) {
        result = result.filter((g) => g.granteeNodeId === filter.granteeNodeId);
      }
      if (filter?.resourceType) {
        result = result.filter((g) => g.resourceType === filter.resourceType);
      }
      if (filter?.resourceId) {
        result = result.filter((g) => g.resourceId === filter.resourceId);
      }
      if (filter?.grantorNodeId) {
        result = result.filter((g) => g.grantorNodeId === filter.grantorNodeId);
      }
      if (filter?.includeRevoked !== true) {
        result = result.filter((g) => !g.revoked);
      }
      return result;
    },
    async revoke(id, revocation) {
      const grant = grants.get(id);
      if (!grant) return null;
      grant.revoked = { ...revocation, revokedAt: new Date().toISOString() };
      return grant;
    },
    async hasAccess(granteeNodeId, resourceType, resourceId, scope) {
      return Array.from(grants.values()).some(
        (g) =>
          g.granteeNodeId === granteeNodeId &&
          g.resourceType === resourceType &&
          (g.resourceId === resourceId || g.resourceId === '*') &&
          g.scopes.includes(scope) &&
          !g.revoked
      );
    },
    async getForGrantee(granteeNodeId) {
      return Array.from(grants.values()).filter(
        (g) => g.granteeNodeId === granteeNodeId && !g.revoked
      );
    },
    async getForResource(resourceType, resourceId) {
      return Array.from(grants.values()).filter(
        (g) => g.resourceType === resourceType && g.resourceId === resourceId && !g.revoked
      );
    },
    async getByGrantor(grantorNodeId) {
      return Array.from(grants.values()).filter((g) => g.grantorNodeId === grantorNodeId);
    },
    async getGrantedScopes(granteeNodeId, resourceType, resourceId) {
      const matching = Array.from(grants.values()).filter(
        (g) =>
          g.granteeNodeId === granteeNodeId &&
          g.resourceType === resourceType &&
          g.resourceId === resourceId &&
          !g.revoked
      );
      return matching.flatMap((g) => g.scopes);
    },
  };

  // Build context
  const context: RepositoryContext = {
    nodes: nodeRepo,
    observations: observationRepo,
    artifacts: artifactRepo,
    variables: variableRepo,
    episodes: episodeRepo,
    policies: policyRepo,
    actionRuns: actionRunRepo,
    surfaces: surfaceRepo,
    entities: entityRepo,
    grants: grantRepo,
  };

  return {
    ...context,
    // Transaction support (in-memory is always atomic)
    async transaction<T>(fn: (repos: RepositoryContext) => Promise<T>): Promise<T> {
      // In-memory operations are synchronous per-call, so just execute
      return fn(context);
    },
    _data: {
      nodes,
      edges,
      delegations,
      observations,
      artifacts,
      revisions,
      variables,
      episodes,
      policies,
      actionRuns,
      surfaces,
      layouts,
      entities,
      entityEvents,
      entityTypes,
      grants,
    },
    clear() {
      nodes.clear();
      edges.clear();
      delegations.clear();
      observations.clear();
      artifacts.clear();
      revisions.clear();
      variables.clear();
      episodes.clear();
      policies.clear();
      actionRuns.clear();
      surfaces.clear();
      layouts.clear();
      entities.clear();
      entityEvents.clear();
      entityTypes.clear();
      grants.clear();
    },
  };
}
