import type {
  Id,
  Surface,
  SurfaceLayout,
  SurfaceKind,
  SurfaceVisibility,
  LayoutMode,
  LayoutSection,
  LayoutSpec,
  QuerySpec,
} from '@omnilith/protocol';

/**
 * Input for creating a new Surface
 */
export type CreateSurfaceInput = {
  id?: Id;
  nodeId: Id;
  kind: SurfaceKind;
  title: string;
  visibility: SurfaceVisibility;
  entry: {
    artifactId?: Id;
    query?: QuerySpec;
  };
  /** Reference to a shared layout (mutually exclusive with inlineLayout) */
  layoutId?: Id;
  /** Inline layout definition (mutually exclusive with layoutId) */
  inlineLayout?: LayoutSpec;
  mapPosition?: { left: string; top: string };
  category?: string;
};

/**
 * Input for updating a Surface
 */
export type UpdateSurfaceInput = {
  title?: string;
  visibility?: SurfaceVisibility;
  entry?: {
    artifactId?: Id;
    query?: QuerySpec;
  };
  /** Reference to a shared layout (mutually exclusive with inlineLayout) */
  layoutId?: Id;
  /** Inline layout definition (mutually exclusive with layoutId) */
  inlineLayout?: LayoutSpec;
  mapPosition?: { left: string; top: string };
  category?: string;
};

/**
 * Input for creating a SurfaceLayout
 */
export type CreateLayoutInput = {
  id?: Id;
  nodeId: Id;
  name: string;
  mode: LayoutMode;
  sections?: LayoutSection[];
  canvas?: {
    width: number;
    height: number;
    elements: unknown[];
  };
};

/**
 * Input for updating a SurfaceLayout
 */
export type UpdateLayoutInput = {
  name?: string;
  sections?: LayoutSection[];
  canvas?: {
    width: number;
    height: number;
    elements: unknown[];
  };
};

/**
 * Filter for listing Surfaces
 */
export type SurfaceFilter = {
  nodeId?: Id;
  kind?: SurfaceKind;
  visibility?: SurfaceVisibility[];
  category?: string;
  limit?: number;
  offset?: number;
};

/**
 * Repository interface for Surface operations.
 *
 * Surfaces are read-only projections that derive their content from canon.
 * They specify WHAT to show (via entry) and HOW (via layout) but never store content.
 * This enforces the Projection Law: surfaces cannot introduce new state.
 */
export interface SurfaceRepository {
  /**
   * Create a new Surface
   */
  create(input: CreateSurfaceInput): Promise<Surface>;

  /**
   * Get a Surface by ID
   * @returns Surface or null if not found
   */
  get(id: Id): Promise<Surface | null>;

  /**
   * List Surfaces with optional filtering
   */
  list(filter?: SurfaceFilter): Promise<Surface[]>;

  /**
   * Update a Surface's properties
   * @returns Updated Surface or null if not found
   */
  update(id: Id, input: UpdateSurfaceInput): Promise<Surface | null>;

  /**
   * Delete a Surface
   * @returns true if deleted, false if not found
   */
  delete(id: Id): Promise<boolean>;

  /**
   * Get all Surfaces for a Node
   */
  getByNode(nodeId: Id): Promise<Surface[]>;

  /**
   * Get Surfaces visible to a viewer (respects visibility rules)
   */
  getVisible(nodeId: Id, viewerNodeId: Id | null): Promise<Surface[]>;

  // --- Layout operations ---

  /**
   * Create a new SurfaceLayout
   */
  createLayout(input: CreateLayoutInput): Promise<SurfaceLayout>;

  /**
   * Get a SurfaceLayout by ID
   */
  getLayout(id: Id): Promise<SurfaceLayout | null>;

  /**
   * Update a SurfaceLayout
   */
  updateLayout(id: Id, input: UpdateLayoutInput): Promise<SurfaceLayout | null>;

  /**
   * Delete a SurfaceLayout
   */
  deleteLayout(id: Id): Promise<boolean>;

  /**
   * Get all layouts for a Node
   */
  getLayoutsByNode(nodeId: Id): Promise<SurfaceLayout[]>;
}
