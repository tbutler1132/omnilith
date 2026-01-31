// Surface types - read-only projections

import type { Id, Timestamp, QuerySpec } from './common.js';

/**
 * Surface kinds define the presentation style
 */
export type SurfaceKind = 'page' | 'gallery' | 'timeline' | 'workshop' | 'custom';

/**
 * Surface visibility levels
 */
export type SurfaceVisibility = 'public' | 'node_members' | 'granted' | 'private';

/**
 * Layout modes for surfaces
 */
export type LayoutMode = 'sections' | 'canvas';

/**
 * A Surface is a pure read-only projection governed by the Projection Law.
 * Surfaces NEVER mutate canon.
 */
export type Surface = {
  id: Id;
  nodeId: Id;

  /**
   * Presentation style
   */
  kind: SurfaceKind;

  /**
   * Human-readable title
   */
  title: string;

  /**
   * Who can see this surface
   */
  visibility: SurfaceVisibility;

  /**
   * What content to display
   */
  entry: {
    /**
     * Specific artifact to display
     */
    artifactId?: Id;

    /**
     * Query to select artifacts
     */
    query?: QuerySpec;
  };

  /**
   * Optional layout configuration
   */
  layoutId?: Id;

  /**
   * Optional position for map display
   */
  mapPosition?: {
    left: string; // CSS percentage, e.g., "10%"
    top: string;
  };

  /**
   * Optional category for grouping
   */
  category?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * Section types for sections layout mode
 */
export type SectionType = 'header' | 'body' | 'repeater' | 'footer';

/**
 * A section in a sections-mode layout
 */
export type LayoutSection = {
  id: Id;
  type: SectionType;

  /**
   * Optional title for the section
   */
  title?: string;

  /**
   * For repeater sections: the query to get items
   */
  query?: QuerySpec;

  /**
   * Slots within this section
   */
  slots: LayoutSlot[];
};

/**
 * A slot is a placeholder for content within a section
 */
export type LayoutSlot = {
  id: Id;

  /**
   * What to display in this slot
   */
  binding: {
    /**
     * Field from the artifact to display
     */
    field?: 'title' | 'about' | 'notes' | 'page' | string;

    /**
     * Static content
     */
    static?: string;

    /**
     * Reference to an entity field
     */
    entityField?: {
      entityId: Id;
      field: string;
    };
  };

  /**
   * Optional styling
   */
  style?: Record<string, string>;
};

/**
 * A SurfaceLayout defines how content is arranged.
 * Layouts are presentation-only and read-only.
 */
export type SurfaceLayout = {
  id: Id;
  nodeId: Id;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Layout mode
   * v1: sections only (vertical stack)
   * v1.5+: canvas (free positioning)
   */
  mode: LayoutMode;

  /**
   * For sections mode: the sections configuration
   */
  sections?: LayoutSection[];

  /**
   * For canvas mode: free positioning data (future)
   */
  canvas?: {
    width: number;
    height: number;
    elements: unknown[]; // TBD in v1.5
  };

  createdAt: Timestamp;
  updatedAt: Timestamp;
};
