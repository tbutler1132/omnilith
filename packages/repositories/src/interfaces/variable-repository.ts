import type { Id, Variable, ComputeSpec, VariableKind, ViableRange } from '@omnilith/protocol';

/**
 * Input for creating a new Variable
 */
export type CreateVariableInput = {
  id?: Id;
  nodeId: Id;
  key: string;
  title: string;
  description?: string;
  kind: VariableKind;
  unit?: string;
  viableRange?: ViableRange;
  preferredRange?: ViableRange;
  computeSpecs?: ComputeSpec[];
  prior?: unknown;
  target?: unknown;
};

/**
 * Input for updating a Variable
 */
export type UpdateVariableInput = {
  title?: string;
  description?: string;
  unit?: string;
  viableRange?: ViableRange;
  preferredRange?: ViableRange;
  prior?: unknown;
  target?: unknown;
};

/**
 * Filter for listing Variables
 */
export type VariableFilter = {
  nodeId?: Id;
  kind?: VariableKind;
  limit?: number;
  offset?: number;
};

/**
 * Repository interface for Variable operations.
 *
 * Variables are what the system regulates - quantities with viable and preferred ranges.
 * Each Variable has ComputeSpecs that define how to estimate its current value from observations.
 * VariableEstimates are derived (not stored) and computed on-demand.
 */
export interface VariableRepository {
  /**
   * Create a new Variable
   */
  create(input: CreateVariableInput): Promise<Variable>;

  /**
   * Get a Variable by ID
   * @returns Variable or null if not found
   */
  get(id: Id): Promise<Variable | null>;

  /**
   * Get a Variable by key within a Node
   * @returns Variable or null if not found
   */
  getByKey(nodeId: Id, key: string): Promise<Variable | null>;

  /**
   * List Variables with optional filtering
   */
  list(filter?: VariableFilter): Promise<Variable[]>;

  /**
   * Update a Variable's properties
   * @returns Updated Variable or null if not found
   */
  update(id: Id, input: UpdateVariableInput): Promise<Variable | null>;

  /**
   * Add a ComputeSpec to a Variable
   * @returns Updated Variable or null if not found
   */
  addComputeSpec(variableId: Id, spec: ComputeSpec): Promise<Variable | null>;

  /**
   * Update a ComputeSpec on a Variable
   * @returns Updated Variable or null if not found
   */
  updateComputeSpec(variableId: Id, specId: Id, spec: Partial<ComputeSpec>): Promise<Variable | null>;

  /**
   * Remove a ComputeSpec from a Variable
   * @returns Updated Variable or null if not found
   */
  removeComputeSpec(variableId: Id, specId: Id): Promise<Variable | null>;

  /**
   * Get all Variables for a Node
   */
  getByNode(nodeId: Id): Promise<Variable[]>;
}
