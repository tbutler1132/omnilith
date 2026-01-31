import { eq, and, or, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { Database } from '../db.js';
import { grants } from '../schema/index.js';
import type {
  GrantRepository,
  CreateGrantInput,
  GrantFilter,
} from '../../interfaces/index.js';
import type { Grant, ResourceType, GrantScope, Id } from '@omnilith/protocol';

export class PgGrantRepository implements GrantRepository {
  constructor(private db: Database) {}

  async create(input: CreateGrantInput): Promise<Grant> {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    const [row] = await this.db
      .insert(grants)
      .values({
        id,
        granteeNodeId: input.granteeNodeId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        scopes: input.scopes,
        grantorNodeId: input.grantorNodeId,
        grantedAt: now,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .returning();

    return this.rowToGrant(row);
  }

  async get(id: Id): Promise<Grant | null> {
    const [row] = await this.db.select().from(grants).where(eq(grants.id, id));
    return row ? this.rowToGrant(row) : null;
  }

  async query(filter: GrantFilter): Promise<Grant[]> {
    const conditions = [];

    if (filter.granteeNodeId) {
      conditions.push(eq(grants.granteeNodeId, filter.granteeNodeId));
    }

    if (filter.grantorNodeId) {
      conditions.push(eq(grants.grantorNodeId, filter.grantorNodeId));
    }

    if (filter.resourceType) {
      conditions.push(eq(grants.resourceType, filter.resourceType));
    }

    if (filter.resourceId) {
      conditions.push(
        or(eq(grants.resourceId, filter.resourceId), eq(grants.resourceId, '*'))
      );
    }

    // By default, exclude revoked grants
    if (!filter.includeRevoked) {
      conditions.push(isNull(grants.revoked));
    }

    // By default, exclude expired grants
    if (!filter.includeExpired) {
      conditions.push(
        or(isNull(grants.expiresAt), sql`${grants.expiresAt} > NOW()`)
      );
    }

    let query = this.db.select().from(grants);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    if (filter.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    if (filter.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;

    // Filter by scope in application layer (JSONB containment)
    let results = rows.map((r) => this.rowToGrant(r));
    if (filter.scope) {
      results = results.filter((g) => g.scopes.includes(filter.scope!));
    }

    return results;
  }

  async revoke(
    id: Id,
    revocation: { revokedBy: Id; reason?: string }
  ): Promise<Grant | null> {
    const now = new Date().toISOString();

    const [row] = await this.db
      .update(grants)
      .set({
        revoked: {
          revokedAt: now,
          revokedBy: revocation.revokedBy,
          reason: revocation.reason,
        },
      })
      .where(eq(grants.id, id))
      .returning();

    return row ? this.rowToGrant(row) : null;
  }

  async hasAccess(
    granteeNodeId: Id,
    resourceType: ResourceType,
    resourceId: Id | '*',
    scope: GrantScope
  ): Promise<boolean> {
    const activeGrants = await this.query({
      granteeNodeId,
      resourceType,
      resourceId,
      scope,
      includeRevoked: false,
      includeExpired: false,
    });

    return activeGrants.length > 0;
  }

  async getForGrantee(granteeNodeId: Id): Promise<Grant[]> {
    return this.query({
      granteeNodeId,
      includeRevoked: false,
      includeExpired: false,
    });
  }

  async getForResource(resourceType: ResourceType, resourceId: Id): Promise<Grant[]> {
    return this.query({
      resourceType,
      resourceId,
      includeRevoked: false,
      includeExpired: false,
    });
  }

  async getByGrantor(grantorNodeId: Id): Promise<Grant[]> {
    return this.query({
      grantorNodeId,
      includeRevoked: false,
      includeExpired: false,
    });
  }

  async getGrantedScopes(
    granteeNodeId: Id,
    resourceType: ResourceType,
    resourceId: Id
  ): Promise<GrantScope[]> {
    const activeGrants = await this.query({
      granteeNodeId,
      resourceType,
      resourceId,
      includeRevoked: false,
      includeExpired: false,
    });

    // Collect all unique scopes
    const scopes = new Set<GrantScope>();
    for (const grant of activeGrants) {
      for (const scope of grant.scopes) {
        scopes.add(scope);
      }
    }

    return Array.from(scopes);
  }

  private rowToGrant(row: typeof grants.$inferSelect): Grant {
    return {
      id: row.id,
      granteeNodeId: row.granteeNodeId,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      scopes: row.scopes,
      grantorNodeId: row.grantorNodeId,
      grantedAt: row.grantedAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString(),
      revoked: row.revoked ?? undefined,
    };
  }
}
