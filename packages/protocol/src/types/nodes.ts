// Node types - cybernetic boundaries

import type { Id, Timestamp } from './common.js';

/**
 * Node kinds define the role of a node in the system
 */
export type NodeKind = 'subject' | 'object' | 'agent';

/**
 * A Node is a cybernetic membrane that scopes observations,
 * policies, authority, and meaning.
 *
 * Nodes are not users or projects. They are boundaries.
 */
export type Node = {
  id: Id;
  kind: NodeKind;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Optional description
   */
  description?: string;

  /**
   * Edges to other nodes
   */
  edges: Edge[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/**
 * Edge types define semantic relationships between nodes.
 * Edges have no intrinsic behavior - all meaning emerges through policy evaluation.
 */
export type EdgeType = 'follows' | 'member_of' | 'maintains' | 'feeds' | 'shares_with';

/**
 * A directed edge between two nodes
 */
export type Edge = {
  id: Id;
  fromNodeId: Id;
  toNodeId: Id;
  type: EdgeType;

  /**
   * Optional metadata for the edge
   */
  metadata?: Record<string, unknown>;

  createdAt: Timestamp;
};

/**
 * Risk levels for actions
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Agent delegation defines what an Agent-Node can do on behalf of a Subject-Node.
 *
 * Agents CANNOT:
 * - Approve their own ActionRuns above `low` risk
 * - Grant authority to other agents
 * - Modify their own delegation
 */
export type AgentDelegation = {
  agentNodeId: Id;
  sponsorNodeId: Id;
  grantedAt: Timestamp;

  /**
   * Scopes the agent is allowed to operate in
   * e.g., ["observe", "propose_action", "create_artifact"]
   */
  scopes: string[];

  constraints?: {
    /**
     * Maximum risk level the agent can auto-approve
     */
    maxRiskLevel?: RiskLevel;

    /**
     * Effect types the agent is allowed to produce
     */
    allowedEffects?: string[];

    /**
     * When this delegation expires
     */
    expiresAt?: Timestamp;
  };
};
