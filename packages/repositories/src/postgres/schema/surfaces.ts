import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes.js';
import { artifacts } from './artifacts.js';
import type { QuerySpec, LayoutSection, SurfaceKind, SurfaceVisibility, LayoutMode, LayoutSpec } from '@omnilith/protocol';

/**
 * Surface layouts table - controls how content is arranged.
 */
export const surfaceLayouts = pgTable(
  'surface_layouts',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mode: text('mode', { enum: ['sections', 'canvas'] })
      .notNull()
      .$type<LayoutMode>(),
    sections: jsonb('sections').$type<LayoutSection[]>(),
    canvas: jsonb('canvas').$type<{
      width: number;
      height: number;
      elements: unknown[];
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('surface_layouts_node_idx').on(table.nodeId)]
);

/**
 * Surfaces table - read-only projection configurations.
 *
 * PROJECTION LAW: Surfaces never store content directly. They reference
 * artifacts and define how to present them. All content derives from canon.
 */
export const surfaces = pgTable(
  'surfaces',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['page', 'gallery', 'timeline', 'workshop', 'custom'],
    })
      .notNull()
      .$type<SurfaceKind>(),
    title: text('title').notNull(),
    visibility: text('visibility', {
      enum: ['public', 'node_members', 'granted', 'private'],
    })
      .notNull()
      .$type<SurfaceVisibility>()
      .default('private'),
    entryArtifactId: text('entry_artifact_id').references(() => artifacts.id),
    entryQuery: jsonb('entry_query').$type<QuerySpec>(),
    layoutId: text('layout_id').references(() => surfaceLayouts.id),
    inlineLayout: jsonb('inline_layout').$type<LayoutSpec>(),
    mapPosition: jsonb('map_position').$type<{ left: string; top: string }>(),
    category: text('category'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('surfaces_node_idx').on(table.nodeId),
    index('surfaces_kind_idx').on(table.kind),
    index('surfaces_visibility_idx').on(table.visibility),
    index('surfaces_node_visibility_idx').on(table.nodeId, table.visibility),
  ]
);
