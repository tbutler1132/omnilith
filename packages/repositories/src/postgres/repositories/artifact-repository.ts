import { eq, and, desc, gte, lte, or } from 'drizzle-orm';
import type { Database } from '../db.js';
import { artifacts, artifactRevisions } from '../schema/index.js';
import type {
  ArtifactRepository,
  CreateArtifactInput,
  UpdateArtifactInput,
  ArtifactFilter,
  CreateRevisionInput,
} from '../../interfaces/index.js';
import type { Artifact, Revision, ArtifactStatus, QuerySpec, Id } from '@omnilith/protocol';

export class PgArtifactRepository implements ArtifactRepository {
  constructor(private db: Database) {}

  async create(input: CreateArtifactInput, revision: CreateRevisionInput): Promise<Artifact> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(artifacts)
      .values({
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
      })
      .returning();

    // Create initial revision
    await this.db.insert(artifactRevisions).values({
      id: crypto.randomUUID(),
      artifactId: id,
      version: 1,
      snapshot: {
        title: input.title,
        about: input.about,
        notes: input.notes,
        page: input.page,
        status: input.status ?? 'draft',
      },
      authorNodeId: revision.authorNodeId,
      message: revision.message ?? 'Initial version',
      createdAt: now,
    });

    return this.rowToArtifact(row);
  }

  async get(id: Id): Promise<Artifact | null> {
    const [row] = await this.db.select().from(artifacts).where(eq(artifacts.id, id));
    return row ? this.rowToArtifact(row) : null;
  }

  async list(filter?: ArtifactFilter): Promise<Artifact[]> {
    const conditions = [];

    if (filter?.nodeId) {
      conditions.push(eq(artifacts.nodeId, filter.nodeId));
    }

    if (filter?.status && filter.status.length > 0) {
      conditions.push(or(...filter.status.map((s) => eq(artifacts.status, s))));
    }

    let query = this.db.select().from(artifacts);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    query = query.orderBy(desc(artifacts.updatedAt)) as typeof query;

    if (filter?.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter?.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;

    // Filter by entityRefs in application layer
    let results = rows.map((r) => this.rowToArtifact(r));
    if (filter?.entityRefs && filter.entityRefs.length > 0) {
      results = results.filter((a) =>
        filter.entityRefs!.some((ref) => a.entityRefs?.includes(ref))
      );
    }

    return results;
  }

  async query(nodeId: Id, querySpec: QuerySpec): Promise<Artifact[]> {
    const conditions = [eq(artifacts.nodeId, nodeId)];

    if (querySpec.status && querySpec.status.length > 0) {
      const statusCondition = or(
        ...querySpec.status.map((s) => eq(artifacts.status, s as ArtifactStatus))
      );
      if (statusCondition) conditions.push(statusCondition);
    }

    if (querySpec.timeRange?.start) {
      conditions.push(gte(artifacts.updatedAt, new Date(querySpec.timeRange.start)));
    }

    if (querySpec.timeRange?.end) {
      conditions.push(lte(artifacts.updatedAt, new Date(querySpec.timeRange.end)));
    }

    let query = this.db.select().from(artifacts);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const orderDir = querySpec.orderBy?.direction === 'asc' ? artifacts.updatedAt : desc(artifacts.updatedAt);
    query = query.orderBy(orderDir) as typeof query;

    if (querySpec.limit) {
      query = query.limit(querySpec.limit) as typeof query;
    }

    if (querySpec.offset) {
      query = query.offset(querySpec.offset) as typeof query;
    }

    const rows = await query;
    return rows.map((r) => this.rowToArtifact(r));
  }

  async update(
    id: Id,
    input: UpdateArtifactInput,
    revision: CreateRevisionInput
  ): Promise<Artifact | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const now = new Date();
    const newVersion = existing.trunkVersion + 1;

    const updateData: Partial<typeof artifacts.$inferInsert> = {
      updatedAt: now,
      trunkVersion: newVersion,
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.about !== undefined) updateData.about = input.about;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.page !== undefined) updateData.page = input.page;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.entityRefs !== undefined) updateData.entityRefs = input.entityRefs;

    const [row] = await this.db
      .update(artifacts)
      .set(updateData)
      .where(eq(artifacts.id, id))
      .returning();

    if (!row) return null;

    // Create revision
    await this.db.insert(artifactRevisions).values({
      id: crypto.randomUUID(),
      artifactId: id,
      version: newVersion,
      snapshot: {
        title: row.title,
        about: row.about,
        notes: row.notes ?? undefined,
        page: row.page,
        status: row.status,
      },
      authorNodeId: revision.authorNodeId,
      message: revision.message,
      createdAt: now,
    });

    return this.rowToArtifact(row);
  }

  async updateStatus(id: Id, status: ArtifactStatus, authorNodeId: Id): Promise<Artifact | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const now = new Date();
    const newVersion = existing.trunkVersion + 1;

    const [row] = await this.db
      .update(artifacts)
      .set({
        status,
        trunkVersion: newVersion,
        updatedAt: now,
      })
      .where(eq(artifacts.id, id))
      .returning();

    if (!row) return null;

    // Create revision for status change
    await this.db.insert(artifactRevisions).values({
      id: crypto.randomUUID(),
      artifactId: id,
      version: newVersion,
      snapshot: {
        title: row.title,
        about: row.about,
        notes: row.notes ?? undefined,
        page: row.page,
        status: row.status,
      },
      authorNodeId,
      message: `Status changed to ${status}`,
      createdAt: now,
    });

    return this.rowToArtifact(row);
  }

  async getRevisions(artifactId: Id): Promise<Revision[]> {
    const rows = await this.db
      .select()
      .from(artifactRevisions)
      .where(eq(artifactRevisions.artifactId, artifactId))
      .orderBy(desc(artifactRevisions.version));

    return rows.map((r) => this.rowToRevision(r));
  }

  async getRevision(artifactId: Id, version: number): Promise<Revision | null> {
    const [row] = await this.db
      .select()
      .from(artifactRevisions)
      .where(
        and(
          eq(artifactRevisions.artifactId, artifactId),
          eq(artifactRevisions.version, version)
        )
      );

    return row ? this.rowToRevision(row) : null;
  }

  async getByEntityRef(entityId: Id): Promise<Artifact[]> {
    // Fetch all and filter in application layer for JSONB containment
    const rows = await this.db.select().from(artifacts);
    const filtered = rows.filter((r) => r.entityRefs?.includes(entityId));
    return filtered.map((r) => this.rowToArtifact(r));
  }

  private rowToArtifact(row: typeof artifacts.$inferSelect): Artifact {
    return {
      id: row.id,
      nodeId: row.nodeId,
      title: row.title,
      about: row.about,
      notes: row.notes ?? undefined,
      page: row.page,
      status: row.status,
      trunkVersion: row.trunkVersion,
      entityRefs: row.entityRefs ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rowToRevision(row: typeof artifactRevisions.$inferSelect): Revision {
    return {
      id: row.id,
      artifactId: row.artifactId,
      version: row.version,
      snapshot: row.snapshot,
      authorNodeId: row.authorNodeId,
      message: row.message ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
