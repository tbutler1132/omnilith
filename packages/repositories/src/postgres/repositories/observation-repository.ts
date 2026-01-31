import { eq, and, gte, lte, like, desc, sql } from 'drizzle-orm';
import type { Database } from '../db.js';
import { observations } from '../schema/index.js';
import type {
  ObservationRepository,
  AppendObservationInput,
} from '../../interfaces/index.js';
import type { Observation, ObservationFilter, Id } from '@omnilith/protocol';

export class PgObservationRepository implements ObservationRepository {
  constructor(private db: Database) {}

  async append(input: AppendObservationInput): Promise<Observation> {
    const id = input.id ?? crypto.randomUUID();
    const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();

    const [row] = await this.db
      .insert(observations)
      .values({
        id,
        nodeId: input.nodeId,
        type: input.type,
        timestamp,
        payload: input.payload,
        provenance: input.provenance,
        tags: input.tags,
      })
      .returning();

    return this.rowToObservation(row);
  }

  async get(id: Id): Promise<Observation | null> {
    const [row] = await this.db
      .select()
      .from(observations)
      .where(eq(observations.id, id));

    return row ? this.rowToObservation(row) : null;
  }

  async query(filter: ObservationFilter): Promise<Observation[]> {
    const conditions = [];

    if (filter.nodeId) {
      conditions.push(eq(observations.nodeId, filter.nodeId));
    }

    if (filter.type) {
      conditions.push(eq(observations.type, filter.type));
    }

    if (filter.typePrefix) {
      conditions.push(like(observations.type, `${filter.typePrefix}%`));
    }

    if (filter.timeRange?.start) {
      conditions.push(gte(observations.timestamp, new Date(filter.timeRange.start)));
    }

    if (filter.timeRange?.end) {
      conditions.push(lte(observations.timestamp, new Date(filter.timeRange.end)));
    }

    let query = this.db.select().from(observations);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    query = query.orderBy(desc(observations.timestamp)) as typeof query;

    if (filter.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;
    let results = rows.map((r) => this.rowToObservation(r));

    // Filter by tags in application layer (JSONB containment)
    if (filter.tags && filter.tags.length > 0) {
      results = results.filter((obs) =>
        filter.tags!.every((tag) => obs.tags?.includes(tag))
      );
    }

    // Filter by provenance in application layer
    if (filter.provenance?.sourceId) {
      results = results.filter(
        (obs) => obs.provenance.sourceId === filter.provenance!.sourceId
      );
    }

    return results;
  }

  async count(filter: ObservationFilter): Promise<number> {
    const conditions = [];

    if (filter.nodeId) {
      conditions.push(eq(observations.nodeId, filter.nodeId));
    }

    if (filter.type) {
      conditions.push(eq(observations.type, filter.type));
    }

    if (filter.typePrefix) {
      conditions.push(like(observations.type, `${filter.typePrefix}%`));
    }

    if (filter.timeRange?.start) {
      conditions.push(gte(observations.timestamp, new Date(filter.timeRange.start)));
    }

    if (filter.timeRange?.end) {
      conditions.push(lte(observations.timestamp, new Date(filter.timeRange.end)));
    }

    let query = this.db.select({ count: sql<number>`count(*)` }).from(observations);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const [result] = await query;
    return Number(result?.count ?? 0);
  }

  async getByType(nodeId: Id, typePattern: string, limit?: number): Promise<Observation[]> {
    const conditions = [eq(observations.nodeId, nodeId)];

    // Support wildcard matching
    if (typePattern.endsWith('*')) {
      const prefix = typePattern.slice(0, -1);
      conditions.push(like(observations.type, `${prefix}%`));
    } else {
      conditions.push(eq(observations.type, typePattern));
    }

    let query = this.db
      .select()
      .from(observations)
      .where(and(...conditions))
      .orderBy(desc(observations.timestamp));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    const rows = await query;
    return rows.map((r) => this.rowToObservation(r));
  }

  async getRecent(nodeId: Id, limit: number): Promise<Observation[]> {
    const rows = await this.db
      .select()
      .from(observations)
      .where(eq(observations.nodeId, nodeId))
      .orderBy(desc(observations.timestamp))
      .limit(limit);

    return rows.map((r) => this.rowToObservation(r));
  }

  async *stream(filter: ObservationFilter): AsyncGenerator<Observation> {
    // For large datasets, implement cursor-based pagination
    const batchSize = 1000;
    let offset = filter.offset ?? 0;

    while (true) {
      const batch = await this.query({
        ...filter,
        limit: batchSize,
        offset,
      });

      if (batch.length === 0) break;

      for (const obs of batch) {
        yield obs;
      }

      if (batch.length < batchSize) break;
      offset += batchSize;
    }
  }

  private rowToObservation(row: typeof observations.$inferSelect): Observation {
    return {
      id: row.id,
      nodeId: row.nodeId,
      type: row.type,
      timestamp: row.timestamp.toISOString(),
      payload: row.payload,
      provenance: row.provenance,
      tags: row.tags ?? undefined,
    };
  }
}
