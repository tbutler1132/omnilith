import { eq, and } from 'drizzle-orm';
import type { Database } from '../db.js';
import { variables } from '../schema/index.js';
import type {
  VariableRepository,
  CreateVariableInput,
  UpdateVariableInput,
  VariableFilter,
} from '../../interfaces/index.js';
import type { Variable, ComputeSpec, Id } from '@omnilith/protocol';

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
        computeSpecs: input.computeSpecs ?? [],
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

  async addComputeSpec(variableId: Id, spec: ComputeSpec): Promise<Variable | null> {
    const variable = await this.get(variableId);
    if (!variable) return null;

    const updatedSpecs = [...variable.computeSpecs, spec];

    const [row] = await this.db
      .update(variables)
      .set({
        computeSpecs: updatedSpecs,
        updatedAt: new Date(),
      })
      .where(eq(variables.id, variableId))
      .returning();

    return row ? this.rowToVariable(row) : null;
  }

  async updateComputeSpec(
    variableId: Id,
    specId: Id,
    spec: Partial<ComputeSpec>
  ): Promise<Variable | null> {
    const variable = await this.get(variableId);
    if (!variable) return null;

    const updatedSpecs = variable.computeSpecs.map((s) =>
      s.id === specId ? { ...s, ...spec } : s
    );

    const [row] = await this.db
      .update(variables)
      .set({
        computeSpecs: updatedSpecs,
        updatedAt: new Date(),
      })
      .where(eq(variables.id, variableId))
      .returning();

    return row ? this.rowToVariable(row) : null;
  }

  async removeComputeSpec(variableId: Id, specId: Id): Promise<Variable | null> {
    const variable = await this.get(variableId);
    if (!variable) return null;

    const updatedSpecs = variable.computeSpecs.filter((s) => s.id !== specId);

    const [row] = await this.db
      .update(variables)
      .set({
        computeSpecs: updatedSpecs,
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
      computeSpecs: row.computeSpecs,
      prior: row.prior ?? undefined,
      target: row.target ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
