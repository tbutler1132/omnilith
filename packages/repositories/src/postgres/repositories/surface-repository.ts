import { eq, and, or, asc } from 'drizzle-orm';
import type { Database } from '../db.js';
import { surfaces, surfaceLayouts } from '../schema/index.js';
import type {
  SurfaceRepository,
  CreateSurfaceInput,
  UpdateSurfaceInput,
  SurfaceFilter,
  CreateLayoutInput,
  UpdateLayoutInput,
} from '../../interfaces/index.js';
import type { Surface, SurfaceLayout, Id } from '@omnilith/protocol';

export class PgSurfaceRepository implements SurfaceRepository {
  constructor(private db: Database) {}

  async create(input: CreateSurfaceInput): Promise<Surface> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(surfaces)
      .values({
        id,
        nodeId: input.nodeId,
        kind: input.kind,
        title: input.title,
        visibility: input.visibility,
        entryArtifactId: input.entry.artifactId,
        entryQuery: input.entry.query,
        layoutId: input.layoutId,
        mapPosition: input.mapPosition,
        category: input.category,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.rowToSurface(row);
  }

  async get(id: Id): Promise<Surface | null> {
    const [row] = await this.db.select().from(surfaces).where(eq(surfaces.id, id));
    return row ? this.rowToSurface(row) : null;
  }

  async list(filter?: SurfaceFilter): Promise<Surface[]> {
    const conditions = [];

    if (filter?.nodeId) {
      conditions.push(eq(surfaces.nodeId, filter.nodeId));
    }

    if (filter?.kind) {
      conditions.push(eq(surfaces.kind, filter.kind));
    }

    if (filter?.visibility && filter.visibility.length > 0) {
      conditions.push(or(...filter.visibility.map((v) => eq(surfaces.visibility, v))));
    }

    if (filter?.category) {
      conditions.push(eq(surfaces.category, filter.category));
    }

    let query = this.db.select().from(surfaces);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    query = query.orderBy(asc(surfaces.title)) as typeof query;

    if (filter?.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter?.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;
    return rows.map((r) => this.rowToSurface(r));
  }

  async update(id: Id, input: UpdateSurfaceInput): Promise<Surface | null> {
    const updateData: Partial<typeof surfaces.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.visibility !== undefined) updateData.visibility = input.visibility;
    if (input.entry?.artifactId !== undefined)
      updateData.entryArtifactId = input.entry.artifactId;
    if (input.entry?.query !== undefined) updateData.entryQuery = input.entry.query;
    if (input.layoutId !== undefined) updateData.layoutId = input.layoutId;
    if (input.mapPosition !== undefined) updateData.mapPosition = input.mapPosition;
    if (input.category !== undefined) updateData.category = input.category;

    const [row] = await this.db
      .update(surfaces)
      .set(updateData)
      .where(eq(surfaces.id, id))
      .returning();

    return row ? this.rowToSurface(row) : null;
  }

  async delete(id: Id): Promise<boolean> {
    const result = await this.db.delete(surfaces).where(eq(surfaces.id, id));
    return (result.count ?? 0) > 0;
  }

  async getByNode(nodeId: Id): Promise<Surface[]> {
    const rows = await this.db
      .select()
      .from(surfaces)
      .where(eq(surfaces.nodeId, nodeId))
      .orderBy(asc(surfaces.title));

    return rows.map((r) => this.rowToSurface(r));
  }

  async getVisible(nodeId: Id, viewerNodeId: Id | null): Promise<Surface[]> {
    // Get all surfaces for the node
    const allSurfaces = await this.getByNode(nodeId);

    // Filter based on visibility and viewer
    return allSurfaces.filter((surface) => {
      if (surface.visibility === 'public') return true;
      if (surface.visibility === 'private') return viewerNodeId === nodeId;
      if (surface.visibility === 'node_members') {
        // For now, treat owner as member
        return viewerNodeId === nodeId;
      }
      if (surface.visibility === 'granted') {
        // Would need to check grants - for now, allow if viewer is owner
        return viewerNodeId === nodeId;
      }
      return false;
    });
  }

  // Layout operations

  async createLayout(input: CreateLayoutInput): Promise<SurfaceLayout> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(surfaceLayouts)
      .values({
        id,
        nodeId: input.nodeId,
        name: input.name,
        mode: input.mode,
        sections: input.sections,
        canvas: input.canvas,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.rowToLayout(row);
  }

  async getLayout(id: Id): Promise<SurfaceLayout | null> {
    const [row] = await this.db
      .select()
      .from(surfaceLayouts)
      .where(eq(surfaceLayouts.id, id));
    return row ? this.rowToLayout(row) : null;
  }

  async updateLayout(id: Id, input: UpdateLayoutInput): Promise<SurfaceLayout | null> {
    const updateData: Partial<typeof surfaceLayouts.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.sections !== undefined) updateData.sections = input.sections;
    if (input.canvas !== undefined) updateData.canvas = input.canvas;

    const [row] = await this.db
      .update(surfaceLayouts)
      .set(updateData)
      .where(eq(surfaceLayouts.id, id))
      .returning();

    return row ? this.rowToLayout(row) : null;
  }

  async deleteLayout(id: Id): Promise<boolean> {
    const result = await this.db.delete(surfaceLayouts).where(eq(surfaceLayouts.id, id));
    return (result.count ?? 0) > 0;
  }

  async getLayoutsByNode(nodeId: Id): Promise<SurfaceLayout[]> {
    const rows = await this.db
      .select()
      .from(surfaceLayouts)
      .where(eq(surfaceLayouts.nodeId, nodeId))
      .orderBy(asc(surfaceLayouts.name));

    return rows.map((r) => this.rowToLayout(r));
  }

  private rowToSurface(row: typeof surfaces.$inferSelect): Surface {
    return {
      id: row.id,
      nodeId: row.nodeId,
      kind: row.kind,
      title: row.title,
      visibility: row.visibility,
      entry: {
        artifactId: row.entryArtifactId ?? undefined,
        query: row.entryQuery ?? undefined,
      },
      layoutId: row.layoutId ?? undefined,
      mapPosition: row.mapPosition ?? undefined,
      category: row.category ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rowToLayout(row: typeof surfaceLayouts.$inferSelect): SurfaceLayout {
    return {
      id: row.id,
      nodeId: row.nodeId,
      name: row.name,
      mode: row.mode,
      sections: row.sections ?? undefined,
      canvas: row.canvas ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
