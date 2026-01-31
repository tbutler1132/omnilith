import { eq, or } from 'drizzle-orm';
import type { Database } from '../db.js';
import { nodes, nodeEdges, agentDelegations } from '../schema/index.js';
import type {
  NodeRepository,
  CreateNodeInput,
  UpdateNodeInput,
  NodeFilter,
  CreateEdgeInput,
} from '../../interfaces/index.js';
import type { Node, Edge, AgentDelegation, Id } from '@omnilith/protocol';

export class PgNodeRepository implements NodeRepository {
  constructor(private db: Database) {}

  async create(input: CreateNodeInput): Promise<Node> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const [row] = await this.db
      .insert(nodes)
      .values({
        id,
        kind: input.kind,
        name: input.name,
        description: input.description,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .returning();

    return this.rowToNode(row, []);
  }

  async get(id: Id): Promise<Node | null> {
    const [row] = await this.db.select().from(nodes).where(eq(nodes.id, id));
    if (!row) return null;

    const edges = await this.db
      .select()
      .from(nodeEdges)
      .where(or(eq(nodeEdges.fromNodeId, id), eq(nodeEdges.toNodeId, id)));

    return this.rowToNode(row, edges);
  }

  async list(filter?: NodeFilter): Promise<Node[]> {
    let query = this.db.select().from(nodes);

    if (filter?.kind) {
      query = query.where(eq(nodes.kind, filter.kind)) as typeof query;
    }

    if (filter?.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter?.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;
    const nodeIds = rows.map((r) => r.id);

    // Fetch all edges for these nodes in one query
    const allEdges =
      nodeIds.length > 0
        ? await this.db
            .select()
            .from(nodeEdges)
            .where(
              or(
                ...nodeIds.map((id) => eq(nodeEdges.fromNodeId, id)),
                ...nodeIds.map((id) => eq(nodeEdges.toNodeId, id))
              )
            )
        : [];

    return rows.map((row) => {
      const edges = allEdges.filter(
        (e) => e.fromNodeId === row.id || e.toNodeId === row.id
      );
      return this.rowToNode(row, edges);
    });
  }

  async update(id: Id, input: UpdateNodeInput): Promise<Node | null> {
    const [row] = await this.db
      .update(nodes)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(nodes.id, id))
      .returning();

    if (!row) return null;

    const edges = await this.db
      .select()
      .from(nodeEdges)
      .where(or(eq(nodeEdges.fromNodeId, id), eq(nodeEdges.toNodeId, id)));

    return this.rowToNode(row, edges);
  }

  async addEdge(input: CreateEdgeInput): Promise<Edge> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const [row] = await this.db
      .insert(nodeEdges)
      .values({
        id,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        type: input.type,
        metadata: input.metadata,
        createdAt: new Date(now),
      })
      .returning();

    return this.rowToEdge(row);
  }

  async removeEdge(edgeId: Id): Promise<boolean> {
    const result = await this.db.delete(nodeEdges).where(eq(nodeEdges.id, edgeId));
    return (result.count ?? 0) > 0;
  }

  async getEdges(nodeId: Id): Promise<Edge[]> {
    const rows = await this.db
      .select()
      .from(nodeEdges)
      .where(or(eq(nodeEdges.fromNodeId, nodeId), eq(nodeEdges.toNodeId, nodeId)));

    return rows.map((r) => this.rowToEdge(r));
  }

  async setAgentDelegation(delegation: AgentDelegation): Promise<void> {
    await this.db
      .insert(agentDelegations)
      .values({
        agentNodeId: delegation.agentNodeId,
        sponsorNodeId: delegation.sponsorNodeId,
        grantedAt: new Date(delegation.grantedAt),
        scopes: delegation.scopes,
        constraints: delegation.constraints,
      })
      .onConflictDoUpdate({
        target: agentDelegations.agentNodeId,
        set: {
          sponsorNodeId: delegation.sponsorNodeId,
          grantedAt: new Date(delegation.grantedAt),
          scopes: delegation.scopes,
          constraints: delegation.constraints,
        },
      });
  }

  async getAgentDelegation(agentNodeId: Id): Promise<AgentDelegation | null> {
    const [row] = await this.db
      .select()
      .from(agentDelegations)
      .where(eq(agentDelegations.agentNodeId, agentNodeId));

    return row ? this.rowToDelegation(row) : null;
  }

  async revokeAgentDelegation(agentNodeId: Id): Promise<boolean> {
    const result = await this.db
      .delete(agentDelegations)
      .where(eq(agentDelegations.agentNodeId, agentNodeId));
    return (result.count ?? 0) > 0;
  }

  private rowToNode(
    row: typeof nodes.$inferSelect,
    edges: (typeof nodeEdges.$inferSelect)[]
  ): Node {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description ?? undefined,
      edges: edges.map((e) => this.rowToEdge(e)),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rowToEdge(row: typeof nodeEdges.$inferSelect): Edge {
    return {
      id: row.id,
      fromNodeId: row.fromNodeId,
      toNodeId: row.toNodeId,
      type: row.type,
      metadata: row.metadata ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private rowToDelegation(row: typeof agentDelegations.$inferSelect): AgentDelegation {
    return {
      agentNodeId: row.agentNodeId,
      sponsorNodeId: row.sponsorNodeId,
      grantedAt: row.grantedAt.toISOString(),
      scopes: row.scopes,
      constraints: row.constraints ?? undefined,
    };
  }
}
