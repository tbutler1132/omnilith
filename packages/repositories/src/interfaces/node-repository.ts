import type { Id, Node, Edge, NodeKind, AgentDelegation } from '@omnilith/protocol';

/**
 * Input for creating a new Node
 */
export type CreateNodeInput = {
  id?: Id;
  kind: NodeKind;
  name: string;
  description?: string;
};

/**
 * Input for updating a Node
 */
export type UpdateNodeInput = {
  name?: string;
  description?: string;
};

/**
 * Input for creating an Edge between Nodes
 */
export type CreateEdgeInput = {
  id?: Id;
  fromNodeId: Id;
  toNodeId: Id;
  type: Edge['type'];
  metadata?: Record<string, unknown>;
};

/**
 * Filter for listing Nodes
 */
export type NodeFilter = {
  kind?: NodeKind;
  limit?: number;
  offset?: number;
};

/**
 * Repository interface for Node operations.
 *
 * Nodes are cybernetic boundaries that scope observations, policies, and authority.
 * They come in three kinds: subject (humans), object (projects/topics), and agent (automated actors).
 */
export interface NodeRepository {
  /**
   * Create a new Node
   */
  create(input: CreateNodeInput): Promise<Node>;

  /**
   * Get a Node by ID
   * @returns Node or null if not found
   */
  get(id: Id): Promise<Node | null>;

  /**
   * List Nodes with optional filtering
   */
  list(filter?: NodeFilter): Promise<Node[]>;

  /**
   * Update a Node's properties
   * @returns Updated Node or null if not found
   */
  update(id: Id, input: UpdateNodeInput): Promise<Node | null>;

  /**
   * Add an Edge between two Nodes
   */
  addEdge(input: CreateEdgeInput): Promise<Edge>;

  /**
   * Remove an Edge by ID
   * @returns true if removed, false if not found
   */
  removeEdge(edgeId: Id): Promise<boolean>;

  /**
   * Get all Edges for a Node (both incoming and outgoing)
   */
  getEdges(nodeId: Id): Promise<Edge[]>;

  /**
   * Store an AgentDelegation (agent authorized by sponsor)
   */
  setAgentDelegation(delegation: AgentDelegation): Promise<void>;

  /**
   * Get the delegation for an agent Node
   * @returns AgentDelegation or null if not delegated
   */
  getAgentDelegation(agentNodeId: Id): Promise<AgentDelegation | null>;

  /**
   * Revoke an agent's delegation
   * @returns true if revoked, false if not found
   */
  revokeAgentDelegation(agentNodeId: Id): Promise<boolean>;
}
