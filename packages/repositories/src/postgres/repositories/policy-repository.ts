import { eq, and, asc } from 'drizzle-orm';
import type { Database } from '../db.js';
import { policies } from '../schema/index.js';
import type {
  PolicyRepository,
  CreatePolicyInput,
  UpdatePolicyInput,
  PolicyFilter,
} from '../../interfaces/index.js';
import type { Policy, Id } from '@omnilith/protocol';

export class PgPolicyRepository implements PolicyRepository {
  constructor(private db: Database) {}

  async create(input: CreatePolicyInput): Promise<Policy> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(policies)
      .values({
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
      })
      .returning();

    return this.rowToPolicy(row);
  }

  async get(id: Id): Promise<Policy | null> {
    const [row] = await this.db.select().from(policies).where(eq(policies.id, id));
    return row ? this.rowToPolicy(row) : null;
  }

  async list(filter?: PolicyFilter): Promise<Policy[]> {
    const conditions = [];

    if (filter?.nodeId) {
      conditions.push(eq(policies.nodeId, filter.nodeId));
    }

    if (filter?.enabled !== undefined) {
      conditions.push(eq(policies.enabled, filter.enabled));
    }

    let query = this.db.select().from(policies);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // Always order by priority (lower = higher priority)
    query = query.orderBy(asc(policies.priority)) as typeof query;

    if (filter?.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter?.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;
    return rows.map((r) => this.rowToPolicy(r));
  }

  async update(id: Id, input: UpdatePolicyInput): Promise<Policy | null> {
    const updateData: Partial<typeof policies.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.triggers !== undefined) updateData.triggers = input.triggers;
    if (input.implementation !== undefined) updateData.implementation = input.implementation;

    const [row] = await this.db
      .update(policies)
      .set(updateData)
      .where(eq(policies.id, id))
      .returning();

    return row ? this.rowToPolicy(row) : null;
  }

  async getByNode(nodeId: Id): Promise<Policy[]> {
    const rows = await this.db
      .select()
      .from(policies)
      .where(eq(policies.nodeId, nodeId))
      .orderBy(asc(policies.priority));

    return rows.map((r) => this.rowToPolicy(r));
  }

  async getByTrigger(nodeId: Id, observationType: string): Promise<Policy[]> {
    const rows = await this.db
      .select()
      .from(policies)
      .where(and(eq(policies.nodeId, nodeId), eq(policies.enabled, true)))
      .orderBy(asc(policies.priority));

    // Filter by trigger patterns in application layer
    return rows
      .map((r) => this.rowToPolicy(r))
      .filter((policy) =>
        policy.triggers.some((trigger) => this.matchesTrigger(observationType, trigger))
      );
  }

  async setEnabled(id: Id, enabled: boolean): Promise<Policy | null> {
    const [row] = await this.db
      .update(policies)
      .set({
        enabled,
        updatedAt: new Date(),
      })
      .where(eq(policies.id, id))
      .returning();

    return row ? this.rowToPolicy(row) : null;
  }

  /**
   * Match observation type against trigger pattern.
   * Supports wildcards: "health.*" matches "health.sleep", "health.exercise"
   */
  private matchesTrigger(observationType: string, trigger: string): boolean {
    if (trigger === '*') return true;

    if (trigger.endsWith('.*')) {
      const prefix = trigger.slice(0, -2);
      return observationType.startsWith(prefix + '.');
    }

    if (trigger.endsWith('*')) {
      const prefix = trigger.slice(0, -1);
      return observationType.startsWith(prefix);
    }

    return observationType === trigger;
  }

  private rowToPolicy(row: typeof policies.$inferSelect): Policy {
    return {
      id: row.id,
      nodeId: row.nodeId,
      name: row.name,
      description: row.description ?? undefined,
      priority: row.priority,
      enabled: row.enabled,
      triggers: row.triggers,
      implementation: row.implementation,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
