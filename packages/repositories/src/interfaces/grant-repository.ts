import type { Id, Grant, ResourceType, GrantScope, Timestamp } from '@omnilith/protocol';

/**
 * Input for creating a new Grant
 */
export type CreateGrantInput = {
  id?: Id;
  granteeNodeId: Id;
  resourceType: ResourceType;
  resourceId: Id | '*';
  scopes: GrantScope[];
  grantorNodeId: Id;
  expiresAt?: Timestamp;
};

/**
 * Filter for querying Grants
 */
export type GrantFilter = {
  granteeNodeId?: Id;
  grantorNodeId?: Id;
  resourceType?: ResourceType;
  resourceId?: Id;
  scope?: GrantScope;
  includeRevoked?: boolean;
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
};

/**
 * Repository interface for Grant operations.
 *
 * Grants are explicit access control permissions - they say who can do what with which resource.
 * All access control flows through grants; there's no implicit or hidden authorization logic.
 *
 * Grants can be revoked and have optional expiration dates.
 */
export interface GrantRepository {
  /**
   * Create a new Grant
   */
  create(input: CreateGrantInput): Promise<Grant>;

  /**
   * Get a Grant by ID
   * @returns Grant or null if not found
   */
  get(id: Id): Promise<Grant | null>;

  /**
   * Query Grants with filters
   */
  query(filter: GrantFilter): Promise<Grant[]>;

  /**
   * Revoke a Grant
   */
  revoke(
    id: Id,
    revocation: { revokedBy: Id; reason?: string }
  ): Promise<Grant | null>;

  /**
   * Check if a specific access is granted.
   * Returns true only for active (non-revoked, non-expired) grants.
   */
  hasAccess(
    granteeNodeId: Id,
    resourceType: ResourceType,
    resourceId: Id | '*',
    scope: GrantScope
  ): Promise<boolean>;

  /**
   * Get all active grants for a grantee Node
   */
  getForGrantee(granteeNodeId: Id): Promise<Grant[]>;

  /**
   * Get all active grants for a specific resource
   */
  getForResource(resourceType: ResourceType, resourceId: Id): Promise<Grant[]>;

  /**
   * Get all grants created by a grantor Node
   */
  getByGrantor(grantorNodeId: Id): Promise<Grant[]>;

  /**
   * Check multiple scopes at once for efficiency.
   * Returns the scopes that are granted.
   */
  getGrantedScopes(
    granteeNodeId: Id,
    resourceType: ResourceType,
    resourceId: Id
  ): Promise<GrantScope[]>;
}
