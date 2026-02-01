// Tests for bundle import/export functionality.
// Verifies round-trip: export → import → verify identical state.

import { describe, it, expect, beforeEach } from 'vitest';
import { exportBundle } from './export.js';
import { importBundle } from './import.js';
import { createInMemoryWriter, createInMemoryReader } from './fs.js';
import type { RepositoryContext } from '../interfaces/repository-context.js';
import type {
  Node,
  Edge,
  AgentDelegation,
  Artifact,
  Revision,
  Observation,
  ActionRun,
  Variable,
  Episode,
  Policy,
  Surface,
  SurfaceLayout,
  Entity,
  EntityEvent,
  EntityType,
  Grant,
} from '@omnilith/protocol';

// In-memory repository implementations for testing
function createInMemoryRepositoryContext(): RepositoryContext & {
  _data: {
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
  };
  clear(): void;
} {
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

  const context: RepositoryContext = {
    nodes: {
      async create(input) {
        const id = input.id ?? `node-${nodes.size + 1}`;
        const node: Node = {
          id,
          kind: input.kind,
          name: input.name,
          description: input.description,
          edges: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
        if (input.name) node.name = input.name;
        if (input.description) node.description = input.description;
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
    },

    observations: {
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
        return result.slice(0, filter.limit);
      },
      async count(filter) {
        const result = await this.query(filter);
        return result.length;
      },
      async getByType(nodeId, typePattern, limit) {
        return Array.from(observations.values())
          .filter((o) => o.nodeId === nodeId && o.type.startsWith(typePattern))
          .slice(0, limit ?? 100);
      },
      async getRecent(nodeId, limit) {
        return Array.from(observations.values())
          .filter((o) => o.nodeId === nodeId)
          .slice(-limit);
      },
      async *stream(filter) {
        const result = await this.query(filter);
        for (const obs of result) {
          yield obs;
        }
      },
    },

    artifacts: {
      async create(input, revision) {
        const id = input.id ?? `artifact-${artifacts.size + 1}`;
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
          message: revision.message,
          createdAt: new Date().toISOString(),
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
        return result;
      },
      async query(nodeId, _query) {
        return Array.from(artifacts.values()).filter((a) => a.nodeId === nodeId);
      },
      async update(id, _input, _revision) {
        const artifact = artifacts.get(id);
        if (!artifact) return null;
        // Update fields
        return artifact;
      },
      async updateStatus(id, status, _authorNodeId) {
        const artifact = artifacts.get(id);
        if (!artifact) return null;
        artifact.status = status;
        return artifact;
      },
      async getRevisions(artifactId) {
        return revisions.get(artifactId) ?? [];
      },
      async getRevision(artifactId, version) {
        const revs = revisions.get(artifactId);
        return revs?.find((r) => r.version === version) ?? null;
      },
      async getByEntityRef(entityId) {
        return Array.from(artifacts.values()).filter(
          (a) => a.entityRefs?.includes(entityId)
        );
      },
    },

    variables: {
      async create(input) {
        const id = input.id ?? `var-${variables.size + 1}`;
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        variables.set(id, variable);
        return variable;
      },
      async get(id) {
        return variables.get(id) ?? null;
      },
      async getByKey(nodeId, key) {
        return Array.from(variables.values()).find(
          (v) => v.nodeId === nodeId && v.key === key
        ) ?? null;
      },
      async list(filter) {
        let result = Array.from(variables.values());
        if (filter?.nodeId) {
          result = result.filter((v) => v.nodeId === filter.nodeId);
        }
        return result;
      },
      async update(id, _input) {
        const variable = variables.get(id);
        if (!variable) return null;
        return variable;
      },
      async addComputeSpec(variableId, _spec) {
        return variables.get(variableId) ?? null;
      },
      async updateComputeSpec(variableId, _specId, _spec) {
        return variables.get(variableId) ?? null;
      },
      async removeComputeSpec(variableId, _specId) {
        return variables.get(variableId) ?? null;
      },
      async getByNode(nodeId) {
        return Array.from(variables.values()).filter((v) => v.nodeId === nodeId);
      },
    },

    episodes: {
      async create(input) {
        const id = input.id ?? `ep-${episodes.size + 1}`;
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
        return result;
      },
      async update(id, _input) {
        return episodes.get(id) ?? null;
      },
      async updateStatus(id, status) {
        const episode = episodes.get(id);
        if (!episode) return null;
        episode.status = status;
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
    },

    policies: {
      async create(input) {
        const id = input.id ?? `policy-${policies.size + 1}`;
        const policy: Policy = {
          id,
          nodeId: input.nodeId,
          name: input.name,
          description: input.description,
          priority: input.priority,
          enabled: input.enabled ?? true,
          triggers: input.triggers,
          implementation: input.implementation,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
        return result;
      },
      async update(id, _input) {
        return policies.get(id) ?? null;
      },
      async getByNode(nodeId) {
        return Array.from(policies.values()).filter((p) => p.nodeId === nodeId);
      },
      async getByTrigger(nodeId, _observationType) {
        return Array.from(policies.values()).filter((p) => p.nodeId === nodeId);
      },
      async setEnabled(id, enabled) {
        const policy = policies.get(id);
        if (!policy) return null;
        policy.enabled = enabled;
        return policy;
      },
    },

    actionRuns: {
      async create(input) {
        const id = input.id ?? `run-${actionRuns.size + 1}`;
        const actionRun: ActionRun = {
          id,
          nodeId: input.nodeId,
          proposedBy: input.proposedBy,
          action: input.action,
          riskLevel: input.riskLevel,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
        return result;
      },
      async getPending(nodeId) {
        return Array.from(actionRuns.values()).filter(
          (r) => r.nodeId === nodeId && r.status === 'pending'
        );
      },
      async getPendingApproval(nodeId) {
        return Array.from(actionRuns.values()).filter(
          (r) => r.nodeId === nodeId && r.status === 'pending' && r.riskLevel !== 'low'
        );
      },
      async approve(id, approval) {
        const run = actionRuns.get(id);
        if (!run) return null;
        run.status = 'approved';
        run.approval = approval;
        return run;
      },
      async reject(id, rejection) {
        const run = actionRuns.get(id);
        if (!run) return null;
        run.status = 'rejected';
        run.rejection = { ...rejection, rejectedAt: new Date().toISOString() };
        return run;
      },
      async markExecuted(id, execution) {
        const run = actionRuns.get(id);
        if (!run) return null;
        run.status = 'executed';
        run.execution = execution;
        return run;
      },
      async markFailed(id, execution) {
        const run = actionRuns.get(id);
        if (!run) return null;
        run.status = 'failed';
        run.execution = { ...execution, result: undefined };
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
    },

    surfaces: {
      async create(input) {
        const id = input.id ?? `surface-${surfaces.size + 1}`;
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
        return result;
      },
      async update(id, _input) {
        return surfaces.get(id) ?? null;
      },
      async delete(id) {
        return surfaces.delete(id);
      },
      async getByNode(nodeId) {
        return Array.from(surfaces.values()).filter((s) => s.nodeId === nodeId);
      },
      async getVisible(nodeId, _viewerNodeId) {
        return Array.from(surfaces.values()).filter((s) => s.nodeId === nodeId);
      },
      async createLayout(input) {
        const id = input.id ?? `layout-${layouts.size + 1}`;
        const layout: SurfaceLayout = {
          id,
          nodeId: input.nodeId,
          name: input.name,
          mode: input.mode,
          sections: input.sections,
          canvas: input.canvas,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        layouts.set(id, layout);
        return layout;
      },
      async getLayout(id) {
        return layouts.get(id) ?? null;
      },
      async updateLayout(id, _input) {
        return layouts.get(id) ?? null;
      },
      async deleteLayout(id) {
        return layouts.delete(id);
      },
      async getLayoutsByNode(nodeId) {
        return Array.from(layouts.values()).filter((l) => l.nodeId === nodeId);
      },
    },

    entities: {
      async createType(input) {
        const id = input.id ?? `type-${entityTypes.size + 1}`;
        const entityType: EntityType = {
          id,
          nodeId: input.nodeId,
          typeName: input.typeName,
          title: input.title,
          description: input.description,
          schema: input.schema,
          eventTypes: input.eventTypes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        entityTypes.set(id, entityType);
        return entityType;
      },
      async getType(id) {
        return entityTypes.get(id) ?? null;
      },
      async getTypeByName(nodeId, typeName) {
        return Array.from(entityTypes.values()).find(
          (t) => t.nodeId === nodeId && t.typeName === typeName
        ) ?? null;
      },
      async listTypes(nodeId) {
        return Array.from(entityTypes.values()).filter((t) => t.nodeId === nodeId);
      },
      async create(input, actorNodeId) {
        const id = input.id ?? `entity-${entities.size + 1}`;

        // Create initial event
        const initialEvent: EntityEvent = {
          id: `event-${id}-1`,
          entityId: id,
          type: 'created',
          data: {},
          timestamp: new Date().toISOString(),
          actorNodeId,
        };

        const entity: Entity = {
          id,
          nodeId: input.nodeId,
          typeId: input.typeId,
          state: input.initialState ?? {},
          events: [initialEvent],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        entities.set(id, entity);

        // Also store in entityEvents for getEvents
        entityEvents.set(id, [initialEvent]);

        return entity;
      },
      async get(id) {
        return entities.get(id) ?? null;
      },
      async query(filter) {
        let result = Array.from(entities.values());
        if (filter?.nodeId) {
          result = result.filter((e) => e.nodeId === filter.nodeId);
        }
        return result;
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
        entity.events = events;

        return entity;
      },
      async getEvents(entityId) {
        return entityEvents.get(entityId) ?? [];
      },
      async queryEvents(_filter) {
        return [];
      },
      async materializeState(entityId) {
        const entity = entities.get(entityId);
        return entity?.state ?? null;
      },
    },

    grants: {
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
          (g) => g.resourceType === resourceType && g.resourceId === resourceId
        );
      },
      async getByGrantor(grantorNodeId) {
        return Array.from(grants.values()).filter(
          (g) => g.grantorNodeId === grantorNodeId
        );
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
    },
  };

  return {
    ...context,
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

describe('Bundle Export/Import', () => {
  let repos: ReturnType<typeof createInMemoryRepositoryContext>;

  beforeEach(() => {
    repos = createInMemoryRepositoryContext();
  });

  describe('exportBundle', () => {
    it('should export an empty database', async () => {
      const { writer, files } = createInMemoryWriter();

      const summary = await exportBundle(repos, writer, '/test/bundle');

      expect(summary.nodeCount).toBe(0);
      expect(summary.artifactCount).toBe(0);
      expect(files.has('/test/bundle/log/observations.ndjson')).toBe(true);
      expect(files.has('/test/bundle/log/action_runs.ndjson')).toBe(true);
    });

    it('should export nodes with their data', async () => {
      // Create a node
      const node = await repos.nodes.create({
        id: 'node-1',
        kind: 'subject',
        name: 'Test Node',
        description: 'A test node',
      });

      // Create an artifact
      await repos.artifacts.create(
        {
          id: 'artifact-1',
          nodeId: node.id,
          title: 'Test Artifact',
          about: 'About this artifact',
          page: { version: 1, blocks: [] },
        },
        { authorNodeId: node.id }
      );

      // Create a variable
      await repos.variables.create({
        id: 'var-1',
        nodeId: node.id,
        key: 'test_var',
        title: 'Test Variable',
        kind: 'continuous',
      });

      const { writer, files } = createInMemoryWriter();
      const summary = await exportBundle(repos, writer, '/test/bundle');

      expect(summary.nodeCount).toBe(1);
      expect(summary.artifactCount).toBe(1);
      expect(summary.variableCount).toBe(1);

      // Check node.json exists
      expect(files.has('/test/bundle/nodes/node-1/node.json')).toBe(true);

      // Check artifact files exist
      expect(
        files.has('/test/bundle/nodes/node-1/artifacts/artifact-1/page.json')
      ).toBe(true);
      expect(
        files.has('/test/bundle/nodes/node-1/artifacts/artifact-1/about.md')
      ).toBe(true);

      // Check variable file exists
      expect(files.has('/test/bundle/nodes/node-1/variables/var-1.json')).toBe(
        true
      );
    });

    it('should export observations to NDJSON log', async () => {
      const node = await repos.nodes.create({
        id: 'node-1',
        kind: 'subject',
        name: 'Test Node',
      });

      await repos.observations.append({
        id: 'obs-1',
        nodeId: node.id,
        type: 'test.event',
        payload: { value: 42 },
        provenance: { sourceId: node.id },
      });

      await repos.observations.append({
        id: 'obs-2',
        nodeId: node.id,
        type: 'test.event',
        payload: { value: 43 },
        provenance: { sourceId: node.id },
      });

      const { writer, files } = createInMemoryWriter();
      const summary = await exportBundle(repos, writer, '/test/bundle');

      expect(summary.observationCount).toBe(2);

      const logContent = files.get('/test/bundle/log/observations.ndjson');
      expect(logContent).toBeDefined();

      const lines = logContent!.trim().split('\n').filter(Boolean);
      expect(lines.length).toBe(2);

      const obs1 = JSON.parse(lines[0]);
      expect(obs1.id).toBe('obs-1');
      expect(obs1.payload.value).toBe(42);
    });
  });

  describe('importBundle', () => {
    it('should import a bundle into empty database', async () => {
      // First export some data
      const node = await repos.nodes.create({
        id: 'node-1',
        kind: 'subject',
        name: 'Test Node',
      });

      await repos.variables.create({
        id: 'var-1',
        nodeId: node.id,
        key: 'test_var',
        title: 'Test Variable',
        kind: 'continuous',
      });

      const { writer, files, directories } = createInMemoryWriter();
      await exportBundle(repos, writer, '/test/bundle');

      // Clear the database
      repos.clear();

      // Import from the bundle
      const reader = createInMemoryReader(files, directories);
      const summary = await importBundle(repos, reader, '/test/bundle');

      expect(summary.nodeCount).toBe(1);
      expect(summary.variableCount).toBe(1);

      // Verify the data was imported
      const importedNode = await repos.nodes.get('node-1');
      expect(importedNode).toBeDefined();
      expect(importedNode!.name).toBe('Test Node');

      const importedVar = await repos.variables.get('var-1');
      expect(importedVar).toBeDefined();
      expect(importedVar!.key).toBe('test_var');
    });

    it('should skip existing entities when skipExisting is true', async () => {
      // Create initial data
      await repos.nodes.create({
        id: 'node-1',
        kind: 'subject',
        name: 'Original Node',
      });

      // Export
      const { writer, files, directories } = createInMemoryWriter();
      await exportBundle(repos, writer, '/test/bundle');

      // Don't clear - the node already exists

      // Import with skipExisting
      const reader = createInMemoryReader(files, directories);
      const summary = await importBundle(repos, reader, '/test/bundle', {
        skipExisting: true,
      });

      expect(summary.warnings.length).toBeGreaterThan(0);
      expect(summary.warnings[0]).toContain('already exists');
    });
  });

  describe('round-trip', () => {
    it('should preserve data through export and import', async () => {
      // Create comprehensive test data
      const node = await repos.nodes.create({
        id: 'node-1',
        kind: 'subject',
        name: 'Test Node',
        description: 'A comprehensive test',
      });

      await repos.artifacts.create(
        {
          id: 'artifact-1',
          nodeId: node.id,
          title: 'Test Doc',
          about: 'About the document',
          notes: 'Some notes',
          page: {
            version: 1,
            blocks: [
              { id: 'block-1', type: 'paragraph', content: 'Hello world' },
            ],
          },
          status: 'active',
        },
        { authorNodeId: node.id, message: 'Initial commit' }
      );

      await repos.variables.create({
        id: 'var-1',
        nodeId: node.id,
        key: 'sleep_quality',
        title: 'Sleep Quality',
        kind: 'continuous',
        unit: 'hours',
        viableRange: { min: 6, max: 10 },
        preferredRange: { min: 7, max: 9 },
      });

      await repos.observations.append({
        id: 'obs-1',
        nodeId: node.id,
        type: 'health.sleep',
        payload: { hours: 7.5 },
        provenance: { sourceId: node.id, method: 'manual_entry' },
        tags: ['sleep', 'health'],
      });

      await repos.policies.create({
        id: 'policy-1',
        nodeId: node.id,
        name: 'Sleep Monitor',
        description: 'Monitors sleep observations',
        priority: 100,
        enabled: true,
        triggers: ['health.sleep.*'],
        implementation: {
          kind: 'typescript',
          code: 'return [];',
        },
      });

      // Export
      const { writer, files, directories } = createInMemoryWriter();
      const exportSummary = await exportBundle(repos, writer, '/test/bundle');

      expect(exportSummary.nodeCount).toBe(1);
      expect(exportSummary.artifactCount).toBe(1);
      expect(exportSummary.variableCount).toBe(1);
      expect(exportSummary.observationCount).toBe(1);
      expect(exportSummary.policyCount).toBe(1);

      // Clear and reimport
      repos.clear();

      const reader = createInMemoryReader(files, directories);
      const importSummary = await importBundle(repos, reader, '/test/bundle');

      expect(importSummary.nodeCount).toBe(exportSummary.nodeCount);
      expect(importSummary.artifactCount).toBe(exportSummary.artifactCount);
      expect(importSummary.variableCount).toBe(exportSummary.variableCount);
      expect(importSummary.observationCount).toBe(exportSummary.observationCount);
      expect(importSummary.policyCount).toBe(exportSummary.policyCount);

      // Verify imported data matches
      const importedNode = await repos.nodes.get('node-1');
      expect(importedNode!.name).toBe('Test Node');
      expect(importedNode!.description).toBe('A comprehensive test');

      const importedArtifact = await repos.artifacts.get('artifact-1');
      expect(importedArtifact!.title).toBe('Test Doc');
      expect(importedArtifact!.about).toBe('About the document');

      const importedVar = await repos.variables.get('var-1');
      expect(importedVar!.key).toBe('sleep_quality');
      expect(importedVar!.viableRange).toEqual({ min: 6, max: 10 });

      const importedPolicy = await repos.policies.get('policy-1');
      expect(importedPolicy!.name).toBe('Sleep Monitor');
      expect(importedPolicy!.triggers).toEqual(['health.sleep.*']);
    });
  });
});
