import { pgTable, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes.js';
import type { PageDoc } from '@omnilith/protocol';

/**
 * Artifacts table - revisioned content objects.
 */
export const artifacts = pgTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    about: text('about').notNull(), // Markdown description (required)
    notes: text('notes'), // Optional markdown
    page: jsonb('page').$type<PageDoc>().notNull(),
    status: text('status', {
      enum: ['draft', 'active', 'published', 'archived'],
    })
      .notNull()
      .default('draft'),
    trunkVersion: integer('trunk_version').notNull().default(1),
    entityRefs: jsonb('entity_refs').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('artifacts_node_idx').on(table.nodeId),
    index('artifacts_status_idx').on(table.status),
    index('artifacts_node_status_idx').on(table.nodeId, table.status),
  ]
);

/**
 * Artifact revisions table - immutable snapshots of artifact state.
 */
export const artifactRevisions = pgTable(
  'artifact_revisions',
  {
    id: text('id').primaryKey(),
    artifactId: text('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot')
      .$type<{
        title: string;
        about: string;
        notes?: string;
        page: PageDoc;
        status: 'draft' | 'active' | 'published' | 'archived';
      }>()
      .notNull(),
    authorNodeId: text('author_node_id')
      .notNull()
      .references(() => nodes.id),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('artifact_revisions_artifact_idx').on(table.artifactId),
    index('artifact_revisions_artifact_version_idx').on(table.artifactId, table.version),
  ]
);
