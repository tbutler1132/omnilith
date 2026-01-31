// Grant types - explicit access control

import type { Id, Timestamp } from './common.js';

/**
 * Grant scopes define what operations are permitted
 */
export type GrantScope =
  | 'read' // Can view the resource
  | 'write' // Can modify the resource
  | 'admin' // Can manage access to the resource
  | 'observe' // Can create observations in the node
  | 'propose' // Can propose actions
  | 'approve' // Can approve actions (up to risk level)
  | string; // Custom scopes

/**
 * Resource types that can have grants
 */
export type ResourceType = 'node' | 'artifact' | 'surface' | 'entity' | 'variable' | 'episode';

/**
 * A Grant is an explicit permission.
 * Access is explicit and inspectable, not implicit.
 */
export type Grant = {
  id: Id;

  /**
   * The node receiving the grant
   */
  granteeNodeId: Id;

  /**
   * The type of resource being granted access to
   */
  resourceType: ResourceType;

  /**
   * The specific resource ID (or "*" for all of type within grantor's node)
   */
  resourceId: Id | '*';

  /**
   * What operations are permitted
   */
  scopes: GrantScope[];

  /**
   * Who granted this access
   */
  grantorNodeId: Id;

  /**
   * When the grant was created
   */
  grantedAt: Timestamp;

  /**
   * Optional expiration
   */
  expiresAt?: Timestamp;

  /**
   * Whether the grant has been revoked
   */
  revoked?: {
    revokedAt: Timestamp;
    revokedBy: Id;
    reason?: string;
  };
};
