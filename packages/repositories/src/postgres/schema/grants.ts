import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes.js';
import type { ResourceType, GrantScope } from '@omnilith/protocol';

/**
 * Grants table - explicit access control permissions.
 *
 * All access control flows through grants. There's no implicit authorization.
 */
export const grants = pgTable(
  'grants',
  {
    id: text('id').primaryKey(),
    granteeNodeId: text('grantee_node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    resourceType: text('resource_type', {
      enum: ['node', 'artifact', 'surface', 'entity', 'variable', 'episode'],
    })
      .notNull()
      .$type<ResourceType>(),
    resourceId: text('resource_id').notNull(), // Can be '*' for wildcard
    scopes: jsonb('scopes').$type<GrantScope[]>().notNull(),
    grantorNodeId: text('grantor_node_id')
      .notNull()
      .references(() => nodes.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revoked: jsonb('revoked').$type<{
      revokedAt: string;
      revokedBy: string;
      reason?: string;
    }>(),
  },
  (table) => [
    index('grants_grantee_idx').on(table.granteeNodeId),
    index('grants_grantor_idx').on(table.grantorNodeId),
    index('grants_resource_idx').on(table.resourceType, table.resourceId),
    index('grants_grantee_resource_idx').on(
      table.granteeNodeId,
      table.resourceType,
      table.resourceId
    ),
  ]
);
