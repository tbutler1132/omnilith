import type { Id, Policy } from '@omnilith/protocol';

/**
 * Input for creating a new Policy
 */
export type CreatePolicyInput = {
  id?: Id;
  nodeId: Id;
  name: string;
  description?: string;
  priority: number;
  enabled?: boolean;
  triggers: string[];
  implementation: {
    kind: 'typescript';
    code: string;
  };
};

/**
 * Input for updating a Policy
 */
export type UpdatePolicyInput = {
  name?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  triggers?: string[];
  implementation?: {
    kind: 'typescript';
    code: string;
  };
};

/**
 * Filter for listing Policies
 */
export type PolicyFilter = {
  nodeId?: Id;
  enabled?: boolean;
  limit?: number;
  offset?: number;
};

/**
 * Repository interface for Policy operations.
 *
 * Policies are pure functions that evaluate observations and return Effects.
 * They run in priority order (lower number = higher priority) and can see
 * the Effects produced by earlier policies.
 *
 * Policies are stored as code strings and compiled/executed by the runtime.
 */
export interface PolicyRepository {
  /**
   * Create a new Policy
   */
  create(input: CreatePolicyInput): Promise<Policy>;

  /**
   * Get a Policy by ID
   * @returns Policy or null if not found
   */
  get(id: Id): Promise<Policy | null>;

  /**
   * List Policies with optional filtering
   */
  list(filter?: PolicyFilter): Promise<Policy[]>;

  /**
   * Update a Policy's properties
   * @returns Updated Policy or null if not found
   */
  update(id: Id, input: UpdatePolicyInput): Promise<Policy | null>;

  /**
   * Get all Policies for a Node, ordered by priority
   */
  getByNode(nodeId: Id): Promise<Policy[]>;

  /**
   * Get enabled Policies that match a given observation type.
   * Supports wildcard matching in triggers.
   */
  getByTrigger(nodeId: Id, observationType: string): Promise<Policy[]>;

  /**
   * Enable or disable a Policy
   */
  setEnabled(id: Id, enabled: boolean): Promise<Policy | null>;
}
