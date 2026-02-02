// Access Checker - Phase 7.2
//
// Provides access control checking for the protocol.
// Access is explicit and inspectable through grants.
//
// Per the spec (§13):
// - Access is explicit, inspectable, and protocol-level
// - Grants apply to Subject-Nodes and resources
// - Edges have no intrinsic behavior; meaning emerges through policies
//
// This module provides utilities for:
// - Checking explicit grant-based access
// - Helpers for policies to interpret edges as implicit grants

import type {
  Id,
  Node,
  EdgeType,
  Grant,
  ResourceType,
  GrantScope,
} from '@omnilith/protocol';
import type { RepositoryContext } from '@omnilith/repositories';
import { NodeNotFoundError } from '../errors.js';

// --- Types ---

/**
 * Result of an access check
 */
export type AccessCheckResult = {
  /** Whether access is granted */
  allowed: boolean;

  /** The grants that provide access (if allowed) */
  grants: Grant[];

  /** Reason for denial (if not allowed) */
  reason?: string;
};

/**
 * Options for access checking
 */
export type CheckAccessOptions = {
  /**
   * Include edge-based implicit grants in the check.
   * These are grants that policies might derive from edges.
   * Defaults to false (explicit grants only).
   */
  includeEdgeGrants?: boolean;

  /**
   * Edge types that imply read access when the actor is the "from" node.
   * Used only when includeEdgeGrants is true.
   * Defaults to ['follows', 'member_of']
   */
  readEdgeTypes?: EdgeType[];

  /**
   * Edge types that imply write access when the actor is the "from" node.
   * Used only when includeEdgeGrants is true.
   * Defaults to ['maintains']
   */
  writeEdgeTypes?: EdgeType[];
};

/**
 * Input for checking access
 */
export type CheckAccessInput = {
  /** The node requesting access */
  actorNodeId: Id;

  /** The type of resource being accessed */
  resourceType: ResourceType;

  /** The specific resource ID being accessed */
  resourceId: Id;

  /** The scope/operation being requested */
  scope: GrantScope;

  /** Optional: The node that owns the resource (if different from resourceId for node resources) */
  ownerNodeId?: Id;
};

/**
 * Result of a scope check for multiple scopes
 */
export type ScopesCheckResult = {
  /** All scopes that are granted */
  grantedScopes: GrantScope[];

  /** All scopes that are denied */
  deniedScopes: GrantScope[];

  /** Whether all requested scopes are granted */
  allGranted: boolean;
};

// --- Access Checker Class ---

/**
 * AccessChecker provides access control checking based on grants.
 *
 * Access control in the protocol is explicit:
 * - All access is through grants
 * - Grants are inspectable (can query who has access to what)
 * - Edges have no intrinsic access behavior (policies interpret them)
 *
 * @example
 * ```typescript
 * const checker = new AccessChecker(repos);
 *
 * // Check if a node can read an artifact
 * const result = await checker.checkAccess({
 *   actorNodeId: 'viewer-node',
 *   resourceType: 'artifact',
 *   resourceId: 'doc-123',
 *   scope: 'read',
 * });
 *
 * if (result.allowed) {
 *   // Proceed with access
 * } else {
 *   // Access denied: result.reason
 * }
 * ```
 */
export class AccessChecker {
  constructor(private repos: RepositoryContext) {}

  /**
   * Check if an actor has a specific access scope to a resource.
   *
   * This checks explicit grants. For edge-based implicit access,
   * use the includeEdgeGrants option or check edges separately in policies.
   */
  async checkAccess(
    input: CheckAccessInput,
    options: CheckAccessOptions = {}
  ): Promise<AccessCheckResult> {
    const { actorNodeId, resourceType, resourceId, scope, ownerNodeId } = input;
    const { includeEdgeGrants = false, readEdgeTypes, writeEdgeTypes } = options;

    // 1. Check explicit grants
    const grants = await this.repos.grants.query({
      granteeNodeId: actorNodeId,
      resourceType,
      resourceId,
      scope,
      includeRevoked: false,
      includeExpired: false,
    });

    if (grants.length > 0) {
      return {
        allowed: true,
        grants,
      };
    }

    // 2. Check self-access (actor accessing their own node's resources)
    if (resourceType === 'node' && resourceId === actorNodeId) {
      return {
        allowed: true,
        grants: [], // Self-access, no explicit grant needed
      };
    }

    // 3. Check if actor owns the resource (for non-node resources)
    if (ownerNodeId && ownerNodeId === actorNodeId) {
      return {
        allowed: true,
        grants: [], // Owner access
      };
    }

    // 4. Check edge-based implicit grants (if enabled)
    if (includeEdgeGrants) {
      const edgeGrant = await this.checkEdgeBasedAccess(
        actorNodeId,
        resourceType,
        resourceId,
        scope,
        ownerNodeId,
        { readEdgeTypes, writeEdgeTypes }
      );

      if (edgeGrant.allowed) {
        return edgeGrant;
      }
    }

    // Access denied
    return {
      allowed: false,
      grants: [],
      reason: `No grant found for ${scope} access to ${resourceType}:${resourceId}`,
    };
  }

  /**
   * Check access based on edges.
   *
   * This is a helper for policies that want to interpret edges as implicit grants.
   * Per the spec, edges have no intrinsic behavior - this is opt-in via policies.
   *
   * Default interpretations:
   * - 'follows', 'member_of' edges imply read access
   * - 'maintains' edges imply write access
   * - 'shares_with' edges imply read access (bidirectional)
   */
  private async checkEdgeBasedAccess(
    actorNodeId: Id,
    resourceType: ResourceType,
    resourceId: Id,
    scope: GrantScope,
    ownerNodeId?: Id,
    options: Pick<CheckAccessOptions, 'readEdgeTypes' | 'writeEdgeTypes'> = {}
  ): Promise<AccessCheckResult> {
    const { readEdgeTypes = ['follows', 'member_of'], writeEdgeTypes = ['maintains'] } =
      options;

    // Determine target node (the node we need an edge to)
    const targetNodeId = ownerNodeId ?? resourceId;
    if (resourceType !== 'node' && !ownerNodeId) {
      // For non-node resources without owner, we can't check edge access
      return { allowed: false, grants: [] };
    }

    // Get actor's node to access edges
    const actorNode = await this.repos.nodes.get(actorNodeId);
    if (!actorNode) {
      return { allowed: false, grants: [], reason: 'Actor node not found' };
    }

    // Check for relevant edges from actor to target
    const relevantEdges = actorNode.edges.filter((e) => e.toNodeId === targetNodeId);

    if (relevantEdges.length === 0) {
      return { allowed: false, grants: [] };
    }

    // Check if any edge implies the requested scope
    const isReadScope = scope === 'read' || scope === 'observe';
    const isWriteScope = scope === 'write' || scope === 'propose';

    if (isReadScope) {
      const hasReadEdge = relevantEdges.some((e) => readEdgeTypes.includes(e.type));
      if (hasReadEdge) {
        return { allowed: true, grants: [] };
      }
    }

    if (isWriteScope) {
      const hasWriteEdge = relevantEdges.some((e) => writeEdgeTypes.includes(e.type));
      if (hasWriteEdge) {
        return { allowed: true, grants: [] };
      }
    }

    // Check 'shares_with' edges (bidirectional read)
    if (isReadScope) {
      // Check if target shares with actor
      const targetNode = await this.repos.nodes.get(targetNodeId);
      if (targetNode) {
        const sharesWithActor = targetNode.edges.some(
          (e) => e.type === 'shares_with' && e.toNodeId === actorNodeId
        );
        if (sharesWithActor) {
          return { allowed: true, grants: [] };
        }
      }
    }

    return { allowed: false, grants: [] };
  }

  /**
   * Check multiple scopes at once.
   *
   * Returns which scopes are granted and which are denied.
   */
  async checkScopes(
    actorNodeId: Id,
    resourceType: ResourceType,
    resourceId: Id,
    scopes: GrantScope[],
    options: CheckAccessOptions = {}
  ): Promise<ScopesCheckResult> {
    const grantedScopes: GrantScope[] = [];
    const deniedScopes: GrantScope[] = [];

    for (const scope of scopes) {
      const result = await this.checkAccess(
        { actorNodeId, resourceType, resourceId, scope },
        options
      );
      if (result.allowed) {
        grantedScopes.push(scope);
      } else {
        deniedScopes.push(scope);
      }
    }

    return {
      grantedScopes,
      deniedScopes,
      allGranted: deniedScopes.length === 0,
    };
  }

  /**
   * Get all resources of a type that an actor can access.
   *
   * This returns grants, not the resources themselves.
   * Use with caution for large grant sets.
   */
  async getAccessibleResources(
    actorNodeId: Id,
    resourceType: ResourceType,
    scope?: GrantScope
  ): Promise<Grant[]> {
    return this.repos.grants.query({
      granteeNodeId: actorNodeId,
      resourceType,
      scope,
      includeRevoked: false,
      includeExpired: false,
    });
  }

  /**
   * Get all nodes that have access to a resource.
   *
   * Useful for understanding who has access to what.
   */
  async getResourceAccessors(
    resourceType: ResourceType,
    resourceId: Id,
    scope?: GrantScope
  ): Promise<Grant[]> {
    return this.repos.grants.query({
      resourceType,
      resourceId,
      scope,
      includeRevoked: false,
      includeExpired: false,
    });
  }

  /**
   * Check if an actor can perform an action that requires approval authority.
   *
   * This is used for checking if a node can approve ActionRuns.
   * Subject nodes can always approve within their scope.
   * Agents have constraints from their delegation.
   */
  async canApprove(
    approverNodeId: Id,
    targetNodeId: Id,
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<AccessCheckResult> {
    const approverNode = await this.repos.nodes.get(approverNodeId);
    if (!approverNode) {
      throw new NodeNotFoundError(approverNodeId);
    }

    // Subject nodes can approve within their scope
    if (approverNode.kind === 'subject') {
      // Check if they have approve scope for the target node
      if (approverNodeId === targetNodeId) {
        return { allowed: true, grants: [] };
      }

      const hasApproveGrant = await this.repos.grants.hasAccess(
        approverNodeId,
        'node',
        targetNodeId,
        'approve'
      );

      if (hasApproveGrant) {
        return {
          allowed: true,
          grants: await this.repos.grants.query({
            granteeNodeId: approverNodeId,
            resourceType: 'node',
            resourceId: targetNodeId,
            scope: 'approve',
            includeRevoked: false,
            includeExpired: false,
          }),
        };
      }
    }

    // Agent nodes have restrictions
    if (approverNode.kind === 'agent') {
      // High and critical always require subject approval
      if (riskLevel === 'high' || riskLevel === 'critical') {
        return {
          allowed: false,
          grants: [],
          reason: `${riskLevel} risk actions require Subject-Node approval`,
        };
      }

      // Check delegation constraints
      const delegation = await this.repos.nodes.getAgentDelegation(approverNodeId);
      if (!delegation) {
        return {
          allowed: false,
          grants: [],
          reason: 'Agent has no delegation',
        };
      }

      // Check if delegation has expired
      if (delegation.constraints?.expiresAt) {
        if (new Date(delegation.constraints.expiresAt) < new Date()) {
          return {
            allowed: false,
            grants: [],
            reason: 'Agent delegation has expired',
          };
        }
      }

      // Check maxRiskLevel
      if (delegation.constraints?.maxRiskLevel) {
        const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
        if (riskOrder[riskLevel] > riskOrder[delegation.constraints.maxRiskLevel]) {
          return {
            allowed: false,
            grants: [],
            reason: `Agent can only approve up to ${delegation.constraints.maxRiskLevel} risk`,
          };
        }
      }

      // Check if approve is in scopes
      if (!delegation.scopes.includes('approve')) {
        return {
          allowed: false,
          grants: [],
          reason: 'Agent delegation does not include approve scope',
        };
      }

      return { allowed: true, grants: [] };
    }

    // Object nodes cannot approve
    if (approverNode.kind === 'object') {
      return {
        allowed: false,
        grants: [],
        reason: 'Object nodes cannot approve actions',
      };
    }

    return {
      allowed: false,
      grants: [],
      reason: 'Unknown node kind',
    };
  }
}

// --- Factory Function ---

/**
 * Create an AccessChecker instance.
 */
export function createAccessChecker(repos: RepositoryContext): AccessChecker {
  return new AccessChecker(repos);
}

// --- Utility Functions ---

/**
 * Check if a scope implies read access.
 */
export function impliesRead(scope: GrantScope): boolean {
  return scope === 'read' || scope === 'admin' || scope === 'observe';
}

/**
 * Check if a scope implies write access.
 */
export function impliesWrite(scope: GrantScope): boolean {
  return scope === 'write' || scope === 'admin';
}

/**
 * Check if a scope implies admin access.
 */
export function impliesAdmin(scope: GrantScope): boolean {
  return scope === 'admin';
}

/**
 * Get the scopes implied by a given scope.
 *
 * For example, 'admin' implies 'read' and 'write'.
 */
export function getImpliedScopes(scope: GrantScope): GrantScope[] {
  switch (scope) {
    case 'admin':
      return ['admin', 'read', 'write'];
    case 'write':
      return ['write'];
    case 'read':
      return ['read'];
    case 'observe':
      return ['observe'];
    case 'propose':
      return ['propose'];
    case 'approve':
      return ['approve'];
    default:
      return [scope];
  }
}

/**
 * Helper to derive implicit grants from edges.
 *
 * This function is useful for policies that want to treat edges as grants.
 * Per the spec, edges have no intrinsic behavior - this is opt-in interpretation.
 *
 * @example
 * ```typescript
 * // In a policy evaluation:
 * const implicitGrants = deriveGrantsFromEdges(ctx.node, {
 *   follows: ['read'],
 *   member_of: ['read', 'observe'],
 *   maintains: ['read', 'write'],
 * });
 * ```
 */
export function deriveGrantsFromEdges(
  node: Node,
  edgeToScopeMapping: Partial<Record<EdgeType, GrantScope[]>>
): Array<{ toNodeId: Id; scopes: GrantScope[] }> {
  const grants: Array<{ toNodeId: Id; scopes: GrantScope[] }> = [];

  for (const edge of node.edges) {
    const scopes = edgeToScopeMapping[edge.type];
    if (scopes && scopes.length > 0) {
      // Check if we already have a grant to this node
      const existing = grants.find((g) => g.toNodeId === edge.toNodeId);
      if (existing) {
        // Merge scopes
        for (const scope of scopes) {
          if (!existing.scopes.includes(scope)) {
            existing.scopes.push(scope);
          }
        }
      } else {
        grants.push({ toNodeId: edge.toNodeId, scopes: [...scopes] });
      }
    }
  }

  return grants;
}
