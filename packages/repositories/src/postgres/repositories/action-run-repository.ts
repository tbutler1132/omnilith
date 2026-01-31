import { eq, and, or, desc, sql } from 'drizzle-orm';
import type { Database } from '../db.js';
import { actionRuns } from '../schema/index.js';
import type {
  ActionRunRepository,
  CreateActionRunInput,
  ActionRunFilter,
} from '../../interfaces/index.js';
import type {
  ActionRun,
  ActionRunStatus,
  ActionApproval,
  ActionExecution,
  Id,
} from '@omnilith/protocol';

export class PgActionRunRepository implements ActionRunRepository {
  constructor(private db: Database) {}

  async create(input: CreateActionRunInput): Promise<ActionRun> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(actionRuns)
      .values({
        id,
        nodeId: input.nodeId,
        proposedByPolicyId: input.proposedBy.policyId,
        proposedByObservationId: input.proposedBy.observationId,
        action: input.action,
        riskLevel: input.riskLevel,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.rowToActionRun(row);
  }

  async get(id: Id): Promise<ActionRun | null> {
    const [row] = await this.db.select().from(actionRuns).where(eq(actionRuns.id, id));
    return row ? this.rowToActionRun(row) : null;
  }

  async query(filter: ActionRunFilter): Promise<ActionRun[]> {
    const conditions = [];

    if (filter.nodeId) {
      conditions.push(eq(actionRuns.nodeId, filter.nodeId));
    }

    if (filter.status && filter.status.length > 0) {
      conditions.push(or(...filter.status.map((s) => eq(actionRuns.status, s))));
    }

    if (filter.riskLevel && filter.riskLevel.length > 0) {
      conditions.push(or(...filter.riskLevel.map((r) => eq(actionRuns.riskLevel, r))));
    }

    if (filter.policyId) {
      conditions.push(eq(actionRuns.proposedByPolicyId, filter.policyId));
    }

    let query = this.db.select().from(actionRuns);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    query = query.orderBy(desc(actionRuns.createdAt)) as typeof query;

    if (filter.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;
    return rows.map((r) => this.rowToActionRun(r));
  }

  async getPending(nodeId: Id): Promise<ActionRun[]> {
    const rows = await this.db
      .select()
      .from(actionRuns)
      .where(and(eq(actionRuns.nodeId, nodeId), eq(actionRuns.status, 'pending')))
      .orderBy(desc(actionRuns.createdAt));

    return rows.map((r) => this.rowToActionRun(r));
  }

  async getPendingApproval(nodeId: Id): Promise<ActionRun[]> {
    // Get pending actions that are NOT low risk (low risk auto-approves)
    const rows = await this.db
      .select()
      .from(actionRuns)
      .where(
        and(
          eq(actionRuns.nodeId, nodeId),
          eq(actionRuns.status, 'pending'),
          or(
            eq(actionRuns.riskLevel, 'medium'),
            eq(actionRuns.riskLevel, 'high'),
            eq(actionRuns.riskLevel, 'critical')
          )
        )
      )
      .orderBy(desc(actionRuns.createdAt));

    return rows.map((r) => this.rowToActionRun(r));
  }

  async approve(id: Id, approval: ActionApproval): Promise<ActionRun | null> {
    const [row] = await this.db
      .update(actionRuns)
      .set({
        status: 'approved',
        approval: {
          approvedBy: approval.approvedBy,
          approvedAt: approval.approvedAt,
          method: approval.method,
        },
        updatedAt: new Date(),
      })
      .where(eq(actionRuns.id, id))
      .returning();

    return row ? this.rowToActionRun(row) : null;
  }

  async reject(
    id: Id,
    rejection: { rejectedBy: Id; reason: string }
  ): Promise<ActionRun | null> {
    const now = new Date().toISOString();

    const [row] = await this.db
      .update(actionRuns)
      .set({
        status: 'rejected',
        rejection: {
          rejectedBy: rejection.rejectedBy,
          rejectedAt: now,
          reason: rejection.reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(actionRuns.id, id))
      .returning();

    return row ? this.rowToActionRun(row) : null;
  }

  async markExecuted(id: Id, execution: ActionExecution): Promise<ActionRun | null> {
    const [row] = await this.db
      .update(actionRuns)
      .set({
        status: 'executed',
        execution: {
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          result: execution.result,
        },
        updatedAt: new Date(),
      })
      .where(eq(actionRuns.id, id))
      .returning();

    return row ? this.rowToActionRun(row) : null;
  }

  async markFailed(
    id: Id,
    execution: Omit<ActionExecution, 'result'> & { error: string }
  ): Promise<ActionRun | null> {
    const [row] = await this.db
      .update(actionRuns)
      .set({
        status: 'failed',
        execution: {
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          result: null,
          error: execution.error,
        },
        updatedAt: new Date(),
      })
      .where(eq(actionRuns.id, id))
      .returning();

    return row ? this.rowToActionRun(row) : null;
  }

  async countByStatus(nodeId: Id): Promise<Record<ActionRunStatus, number>> {
    const rows = await this.db
      .select({
        status: actionRuns.status,
        count: sql<number>`count(*)`,
      })
      .from(actionRuns)
      .where(eq(actionRuns.nodeId, nodeId))
      .groupBy(actionRuns.status);

    const counts: Record<ActionRunStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      executed: 0,
      failed: 0,
    };

    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }

    return counts;
  }

  private rowToActionRun(row: typeof actionRuns.$inferSelect): ActionRun {
    return {
      id: row.id,
      nodeId: row.nodeId,
      proposedBy: {
        policyId: row.proposedByPolicyId,
        observationId: row.proposedByObservationId,
      },
      action: row.action,
      riskLevel: row.riskLevel,
      status: row.status,
      approval: row.approval ?? undefined,
      rejection: row.rejection ?? undefined,
      execution: row.execution ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
