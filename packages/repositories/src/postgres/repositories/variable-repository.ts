import { eq, and } from 'drizzle-orm';
import type { Database } from '../db.js';
import { variables } from '../schema/index.js';
import type {
  VariableRepository,
  CreateVariableInput,
  UpdateVariableInput,
  VariableFilter,
} from '../../interfaces/index.js';
import type { Variable, ProxySpec, Id } from '@omnilith/protocol';

export class PgVariableRepository implements VariableRepository {
  constructor(private db: Database) {}

  async create(input: CreateVariableInput): Promise<Variable> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(variables)
      .values({
        id,
        nodeId: input.nodeId,
        key: input.key,
        title: input.title,
        description: input.description,
        kind: input.kind,
        unit: input.unit,
        viableRange: input.viableRange,
        preferredRange: input.preferredRange,
        proxies: input.proxies ?? [],
        prior: input.prior,
        target: input.target,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.rowToVariable(row);
  }

  async get(id: Id): Promise<Variable | null> {
    const [row] = await this.db.select().from(variables).where(eq(variables.id, id));
    return row ? this.rowToVariable(row) : null;
  }

  async getByKey(nodeId: Id, key: string): Promise<Variable | null> {
    const [row] = await this.db
      .select()
      .from(variables)
      .where(and(eq(variables.nodeId, nodeId), eq(variables.key, key)));
    return row ? this.rowToVariable(row) : null;
  }

  async list(filter?: VariableFilter): Promise<Variable[]> {
    const conditions = [];

    if (filter?.nodeId) {
      conditions.push(eq(variables.nodeId, filter.nodeId));
    }

    if (filter?.kind) {
      conditions.push(eq(variables.kind, filter.kind));
    }

    let query = this.db.select().from(variables);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    if (filter?.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter?.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;
    return rows.map((r) => this.rowToVariable(r));
  }

  async update(id: Id, input: UpdateVariableInput): Promise<Variable | null> {
    const updateData: Partial<typeof variables.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.unit !== undefined) updateData.unit = input.unit;
    if (input.viableRange !== undefined) updateData.viableRange = input.viableRange;
    if (input.preferredRange !== undefined) updateData.preferredRange = input.preferredRange;
    if (input.prior !== undefined) updateData.prior = input.prior;
    if (input.target !== undefined) updateData.target = input.target;

    const [row] = await this.db
      .update(variables)
      .set(updateData)
      .where(eq(variables.id, id))
      .returning();

    return row ? this.rowToVariable(row) : null;
  }

  async addProxy(variableId: Id, proxy: ProxySpec): Promise<Variable | null> {
    const variable = await this.get(variableId);
    if (!variable) return null;

    const updatedProxies = [...variable.proxies, proxy];

    const [row] = await this.db
      .update(variables)
      .set({
        proxies: updatedProxies,
        updatedAt: new Date(),
      })
      .where(eq(variables.id, variableId))
      .returning();

    return row ? this.rowToVariable(row) : null;
  }

  async updateProxy(
    variableId: Id,
    proxyId: Id,
    proxy: Partial<ProxySpec>
  ): Promise<Variable | null> {
    const variable = await this.get(variableId);
    if (!variable) return null;

    const updatedProxies = variable.proxies.map((p) =>
      p.id === proxyId ? { ...p, ...proxy } : p
    );

    const [row] = await this.db
      .update(variables)
      .set({
        proxies: updatedProxies,
        updatedAt: new Date(),
      })
      .where(eq(variables.id, variableId))
      .returning();

    return row ? this.rowToVariable(row) : null;
  }

  async removeProxy(variableId: Id, proxyId: Id): Promise<Variable | null> {
    const variable = await this.get(variableId);
    if (!variable) return null;

    const updatedProxies = variable.proxies.filter((p) => p.id !== proxyId);

    const [row] = await this.db
      .update(variables)
      .set({
        proxies: updatedProxies,
        updatedAt: new Date(),
      })
      .where(eq(variables.id, variableId))
      .returning();

    return row ? this.rowToVariable(row) : null;
  }

  async getByNode(nodeId: Id): Promise<Variable[]> {
    const rows = await this.db
      .select()
      .from(variables)
      .where(eq(variables.nodeId, nodeId));

    return rows.map((r) => this.rowToVariable(r));
  }

  private rowToVariable(row: typeof variables.$inferSelect): Variable {
    return {
      id: row.id,
      nodeId: row.nodeId,
      key: row.key,
      title: row.title,
      description: row.description ?? undefined,
      kind: row.kind,
      unit: row.unit ?? undefined,
      viableRange: row.viableRange ?? undefined,
      preferredRange: row.preferredRange ?? undefined,
      proxies: row.proxies,
      prior: row.prior ?? undefined,
      target: row.target ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
