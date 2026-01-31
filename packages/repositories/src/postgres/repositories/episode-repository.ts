import { eq, and, or, desc } from 'drizzle-orm';
import type { Database } from '../db.js';
import { episodes } from '../schema/index.js';
import type {
  EpisodeRepository,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  EpisodeFilter,
} from '../../interfaces/index.js';
import type { Episode, EpisodeStatus, Id } from '@omnilith/protocol';

export class PgEpisodeRepository implements EpisodeRepository {
  constructor(private db: Database) {}

  async create(input: CreateEpisodeInput): Promise<Episode> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(episodes)
      .values({
        id,
        nodeId: input.nodeId,
        title: input.title,
        description: input.description,
        kind: input.kind,
        variables: input.variables,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        relatedArtifactIds: input.relatedArtifactIds,
        status: input.status ?? 'planned',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.rowToEpisode(row);
  }

  async get(id: Id): Promise<Episode | null> {
    const [row] = await this.db.select().from(episodes).where(eq(episodes.id, id));
    return row ? this.rowToEpisode(row) : null;
  }

  async list(filter?: EpisodeFilter): Promise<Episode[]> {
    const conditions = [];

    if (filter?.nodeId) {
      conditions.push(eq(episodes.nodeId, filter.nodeId));
    }

    if (filter?.status && filter.status.length > 0) {
      conditions.push(or(...filter.status.map((s) => eq(episodes.status, s))));
    }

    if (filter?.kind) {
      conditions.push(eq(episodes.kind, filter.kind));
    }

    let query = this.db.select().from(episodes);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    query = query.orderBy(desc(episodes.updatedAt)) as typeof query;

    if (filter?.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter?.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;

    // Filter by variableId in application layer
    let results = rows.map((r) => this.rowToEpisode(r));
    if (filter?.variableId) {
      results = results.filter((ep) =>
        ep.variables.some((v) => v.variableId === filter.variableId)
      );
    }

    return results;
  }

  async update(id: Id, input: UpdateEpisodeInput): Promise<Episode | null> {
    const updateData: Partial<typeof episodes.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.variables !== undefined) updateData.variables = input.variables;
    if (input.startsAt !== undefined)
      updateData.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined)
      updateData.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (input.relatedArtifactIds !== undefined)
      updateData.relatedArtifactIds = input.relatedArtifactIds;
    if (input.status !== undefined) updateData.status = input.status;

    const [row] = await this.db
      .update(episodes)
      .set(updateData)
      .where(eq(episodes.id, id))
      .returning();

    return row ? this.rowToEpisode(row) : null;
  }

  async updateStatus(id: Id, status: EpisodeStatus): Promise<Episode | null> {
    const [row] = await this.db
      .update(episodes)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, id))
      .returning();

    return row ? this.rowToEpisode(row) : null;
  }

  async getActive(nodeId: Id): Promise<Episode[]> {
    const rows = await this.db
      .select()
      .from(episodes)
      .where(and(eq(episodes.nodeId, nodeId), eq(episodes.status, 'active')))
      .orderBy(desc(episodes.startsAt));

    return rows.map((r) => this.rowToEpisode(r));
  }

  async getByVariable(variableId: Id): Promise<Episode[]> {
    const rows = await this.db.select().from(episodes);

    const results = rows
      .map((r) => this.rowToEpisode(r))
      .filter((ep) => ep.variables.some((v) => v.variableId === variableId));

    return results;
  }

  async getByArtifact(artifactId: Id): Promise<Episode[]> {
    const rows = await this.db.select().from(episodes);

    const results = rows
      .map((r) => this.rowToEpisode(r))
      .filter((ep) => ep.relatedArtifactIds?.includes(artifactId));

    return results;
  }

  private rowToEpisode(row: typeof episodes.$inferSelect): Episode {
    return {
      id: row.id,
      nodeId: row.nodeId,
      title: row.title,
      description: row.description ?? undefined,
      kind: row.kind,
      variables: row.variables,
      startsAt: row.startsAt?.toISOString(),
      endsAt: row.endsAt?.toISOString(),
      relatedArtifactIds: row.relatedArtifactIds ?? undefined,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
