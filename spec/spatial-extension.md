# Spatial Extension — Omnilith Protocol

> **Status:** Draft extension. Not yet part of the core protocol.
>
> This extension adds spatial semantics to the Omnilith Protocol, enabling coordinate-based positioning, proximity relationships, and the emergence of territorial dynamics (including markets).

---

## S.0) Design Principles

**Space is optional.** Nodes may exist without coordinates. Spatial semantics apply only to nodes that opt into a Realm.

**Coordinates are canon.** Unlike Map visualization (which is projection), a node's position within a Realm is protocol-level state.

**Scarcity is configurable.** A Realm may be infinite (no scarcity), bounded (finite but unclaimed space exists), or saturated (all space claimed).

**Position affects policy, not identity.** A node's coordinates may influence policy evaluation (proximity filters, territorial effects), but the node's identity and authority remain independent of location.

---

## S.1) Realm (Coordinate Space)

A **Realm** defines a coordinate space within which nodes may be positioned.

```ts
export type Realm = {
  id: string;
  name: string;
  description?: string;

  // Coordinate system
  dimensions: 2 | 3;
  bounds?: {
    min: Coordinates;
    max: Coordinates;
  };
  topology?: "euclidean" | "toroidal" | "hyperbolic";

  // Scarcity model
  scarcity: "infinite" | "bounded" | "saturated";

  // Governance
  governorNodeId?: string;  // Node with administrative authority over the realm

  createdAt: string;
  updatedAt: string;
};

export type Coordinates = {
  x: number;
  y: number;
  z?: number;  // Required if dimensions === 3
};
```

**Topology:**
- `euclidean`: Standard flat space with edges
- `toroidal`: Wraps around (east edge connects to west, etc.)
- `hyperbolic`: Expands exponentially from center (more space at periphery)

**Governor:** A Realm may have a governor Node with special authority (setting policies for unclaimed space, resolving disputes, defining terrain). Governor authority is *advisory* — nodes retain sovereignty within their claimed territory.

---

## S.2) Territory (Spatial Claim)

A **Territory** represents a node's claim to a region of space within a Realm.

```ts
export type Territory = {
  id: string;
  realmId: string;
  nodeId: string;

  // Claimed region
  anchor: Coordinates;          // Center or origin point
  shape: TerritoryShape;

  // Metadata
  terrain?: string;             // e.g., "plaza", "garden", "archive", "wilderness"
  name?: string;

  // Provenance
  claimedAt: string;
  claimedBy: string;            // Subject-Node that claimed
  claimMethod: "genesis" | "homestead" | "transfer" | "grant" | "conquest";

  updatedAt: string;
};

export type TerritoryShape =
  | { type: "point" }                                    // Zero-area presence
  | { type: "circle"; radius: number }
  | { type: "rectangle"; width: number; height: number }
  | { type: "polygon"; vertices: Coordinates[] };
```

**Claim Methods:**
- `genesis`: Created with the Realm (primordial territories)
- `homestead`: Claimed from unclaimed space (first-come)
- `transfer`: Received from another node via voluntary exchange
- `grant`: Assigned by Realm governor or higher authority
- `conquest`: Claimed via policy-defined dispute resolution

**Territory Constraints:**
- A node MAY hold multiple territories (discontiguous claims)
- Territories MUST NOT overlap within a Realm (enforced by interpreter)
- Territories MAY be resized, merged, or subdivided via ActionRuns

---

## S.3) Adjacency and Proximity

Spatial relationships enable new policy inputs.

### S.3.1 Adjacency Types

```ts
export type AdjacencyType =
  | "bordering"      // Territories share a boundary
  | "nearby"         // Within a specified distance
  | "visible"        // Line-of-sight (no obstruction)
  | "connected";     // Linked by edge regardless of distance
```

### S.3.2 Spatial Queries in PolicyContext

The `canon` object in PolicyContext gains spatial methods:

```ts
interface SpatialCanon {
  // Get territories within distance of a point
  getTerritoriesInRadius(
    realmId: string,
    center: Coordinates,
    radius: number,
    limit?: number
  ): Territory[];

  // Get territories adjacent to a given territory
  getAdjacentTerritories(
    territoryId: string,
    adjacencyType: AdjacencyType
  ): Territory[];

  // Calculate distance between two points
  getDistance(
    realmId: string,
    a: Coordinates,
    b: Coordinates
  ): number;

  // Check if a point is within a territory
  isPointInTerritory(
    point: Coordinates,
    territoryId: string
  ): boolean;

  // Get the territory containing a point (if any)
  getTerritoryAt(
    realmId: string,
    point: Coordinates
  ): Territory | null;
}
```

### S.3.3 Proximity Effects

Policies MAY use spatial proximity to modulate effects:

```ts
// Example: Observations from neighboring nodes have higher weight
evaluate(ctx) {
  const myTerritory = ctx.canon.getTerritoryByNode(ctx.node.id);
  if (!myTerritory) return [];

  const neighbors = ctx.canon.getAdjacentTerritories(myTerritory.id, "bordering");
  const neighborNodeIds = neighbors.map(t => t.nodeId);

  if (neighborNodeIds.includes(ctx.observation.nodeId)) {
    return [{ effect: "tag_observation", tags: ["from_neighbor"] }];
  }
  return [];
}
```

---

## S.4) Terrain

**Terrain** is a canonical property of territory that MAY influence rendering, policy, and semantics.

### S.4.1 Standard Terrain Types

| Terrain | Semantic | Typical Use |
|---------|----------|-------------|
| `plaza` | Public, high-traffic | Community spaces, markets |
| `garden` | Cultivated, semi-private | Personal creative spaces |
| `archive` | Static, preserved | Historical records, completed works |
| `workshop` | Active, in-progress | Creation spaces |
| `wilderness` | Unclaimed, raw | Buffer zones, expansion frontier |
| `sanctuary` | Protected, limited access | Private retreats |
| `bridge` | Connective | Links between regions |

Terrain is advisory — it suggests policy and rendering but doesn't enforce behavior.

### S.4.2 Custom Terrain

Packs MAY define custom terrain types with the namespace pattern:

```ts
terrain: "pack:ecology:wetland"
terrain: "pack:urban:district"
```

---

## S.5) Territorial Actions

Standard actions for spatial operations.

### S.5.1 Claim Territory

```ts
export type ClaimTerritoryAction = {
  type: "spatial:claim_territory";
  riskLevel: "medium";
  params: {
    realmId: string;
    anchor: Coordinates;
    shape: TerritoryShape;
    terrain?: string;
    name?: string;
  };
};
```

**Preconditions:**
- Requested region must be unclaimed (or claimable per Realm policy)
- Claiming node must have authority to claim in this Realm
- Region must be within Realm bounds (if bounded)

### S.5.2 Transfer Territory

```ts
export type TransferTerritoryAction = {
  type: "spatial:transfer_territory";
  riskLevel: "high";
  params: {
    territoryId: string;
    toNodeId: string;
    consideration?: {
      // Optional: what the receiver provides in exchange
      // Protocol doesn't enforce this — it's recorded for audit
      description: string;
      value?: unknown;
    };
  };
};
```

**Preconditions:**
- Transferring node must own the territory
- Receiving node must have authority to hold territory in this Realm
- Both nodes must approve (bilateral action)

### S.5.3 Resize Territory

```ts
export type ResizeTerritoryAction = {
  type: "spatial:resize_territory";
  riskLevel: "medium";
  params: {
    territoryId: string;
    newShape: TerritoryShape;
    newAnchor?: Coordinates;
  };
};
```

**Preconditions:**
- New region must not overlap with other territories
- Expansion into claimed space requires transfer first
- Contraction releases space (becomes unclaimed or per Realm policy)

### S.5.4 Abandon Territory

```ts
export type AbandonTerritoryAction = {
  type: "spatial:abandon_territory";
  riskLevel: "medium";
  params: {
    territoryId: string;
    reason?: string;
  };
};
```

Territory becomes unclaimed. Realm policy determines what happens next (open for homesteading, reverts to governor, etc.).

---

## S.6) Spatial Grants

Grants may include spatial constraints.

```ts
export type SpatialGrant = Grant & {
  spatial?: {
    // Grant applies only within these territories
    territoryIds?: string[];

    // Grant applies only within distance of a point
    proximityTo?: {
      coordinates: Coordinates;
      radius: number;
    };

    // Grant applies only in specified terrain
    terrainTypes?: string[];
  };
};
```

**Example:** A node might grant `observe` access to another node, but only within their shared `plaza` territory.

---

## S.7) Market Emergence

The protocol does not define a market — it provides primitives from which markets emerge.

### S.7.1 What the Protocol Provides

| Primitive | Market Function |
|-----------|-----------------|
| Territory ownership | Property rights |
| Transfer actions | Exchange mechanism |
| Scarcity (bounded Realms) | Supply constraint |
| Terrain semantics | Differentiation / location value |
| Adjacency queries | Location externalities |
| Grants | Access rights (rentable?) |

### S.7.2 What Emerges Through Policy

Markets require additional coordination that can be built via Packs:

**Listing/Discovery:**
```ts
// A "market" pack could define observation types for listings
observationType: "pack:market:territory_listed"
payload: {
  territoryId: string;
  askingPrice: { amount: number; currency: string };
  terms: string;
}
```

**Escrow/Settlement:**
```ts
// A bilateral transfer action with consideration tracking
// The "consideration" field in TransferTerritoryAction is audit-only
// Actual value exchange happens outside the spatial protocol
// (or via a separate financial pack)
```

**Price Discovery:**
```ts
// Policies could track transfer history and derive estimates
// These estimates are non-canonical (derived views)
```

### S.7.3 What the Protocol Does NOT Provide

- Currency or token system (out of scope — could be a Pack)
- Automated market-making
- Price enforcement
- Dispute resolution beyond audit trail

The protocol records *that* a transfer happened and *what was stated as consideration*. It does not enforce that consideration was actually provided. Trust and enforcement are social/legal, not protocol-level.

---

## S.8) Bundle Extension

Spatial data extends the Omnilith Bundle:

```
/omnilith-bundle
  /realms
    /<realmId>
      realm.json
      /territories
        <territoryId>.json
  /nodes
    /<nodeId>
      node.json
      spatial.json          # Node's spatial presence (optional)
      ...
```

**spatial.json:**
```json
{
  "territories": [
    {
      "realmId": "main",
      "territoryId": "terr-abc123"
    }
  ],
  "homeRealm": "main",
  "homeCoordinates": { "x": 100, "y": 200 }
}
```

---

## S.9) Interpreter Requirements

Interpreters implementing the Spatial Extension MUST:

1. **Enforce non-overlap** — Reject claims/resizes that would overlap existing territories
2. **Respect bounds** — Reject operations outside Realm bounds (if bounded)
3. **Calculate distances** — Implement distance functions per Realm topology
4. **Index spatially** — Provide efficient spatial queries (R-tree or similar)
5. **Audit transfers** — Record full provenance on all territorial changes

Interpreters MAY:

- Provide spatial visualization (Map rendering)
- Implement custom topology calculations
- Add spatial indexing optimizations
- Define Realm-specific policies

---

## S.10) Visualization (Non-Normative)

The Map visualization described in §16.3.6 of the main spec renders spatial data.

**Rendering Territories:**
- Territory boundaries are drawn according to shape
- Terrain affects visual treatment (color, texture, glow)
- Ownership affects interaction affordances

**Rendering Nodes in Space:**
- Nodes with territories appear at their anchor point
- Node visualization (pulsing, breathing) continues as before
- Spatial context adds proximity-based visual relationships

**The Map is still projection.** Coordinates are canon; how they're drawn is interpreter choice.

---

## S.11) Future Considerations

### S.11.1 Vertical Space (Layers)

3D coordinates enable vertical stacking:
- Underground/foundations
- Surface level
- Elevated/aerial

Different layers might have different scarcity or governance models.

### S.11.2 Temporal Territory

Territories that exist only during certain times:
- Night markets
- Seasonal spaces
- Event venues

Would require `validFrom`/`validUntil` fields on Territory.

### S.11.3 Territorial Policies

Policies that apply based on *where* an observation occurs, not just *what* node:

```ts
// Policy that activates when any observation occurs within my territory
// regardless of which node emitted it
evaluate(ctx) {
  const myTerritories = ctx.canon.getTerritoriesByNode(ctx.node.id);
  const obsLocation = ctx.observation.payload.coordinates;

  for (const terr of myTerritories) {
    if (ctx.canon.isPointInTerritory(obsLocation, terr.id)) {
      return [{ effect: "log", level: "info", message: "Activity in my territory" }];
    }
  }
  return [];
}
```

### S.11.4 Spatial Reputation

Reputation that varies by location — a node might be trusted in one region but unknown in another. Would interact with Grants and proximity.

---

## S.12) Example: Genesis of a Realm

A minimal example of creating a new Realm and initial territories.

**1. Create Realm:**

```json
{
  "id": "realm-alpha",
  "name": "Alpha",
  "dimensions": 2,
  "bounds": {
    "min": { "x": 0, "y": 0 },
    "max": { "x": 10000, "y": 10000 }
  },
  "topology": "euclidean",
  "scarcity": "bounded",
  "governorNodeId": "node-founder",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

**2. Genesis Territories:**

```json
{
  "id": "terr-central-plaza",
  "realmId": "realm-alpha",
  "nodeId": "node-founder",
  "anchor": { "x": 5000, "y": 5000 },
  "shape": { "type": "circle", "radius": 500 },
  "terrain": "plaza",
  "name": "Central Plaza",
  "claimedAt": "2025-01-01T00:00:00Z",
  "claimedBy": "node-founder",
  "claimMethod": "genesis"
}
```

**3. Homestead Claim (later):**

A new node arrives and claims unclaimed space:

```ts
{
  type: "spatial:claim_territory",
  riskLevel: "medium",
  params: {
    realmId: "realm-alpha",
    anchor: { x: 3000, y: 7000 },
    shape: { type: "rectangle", width: 200, height: 200 },
    terrain: "garden",
    name: "My Garden"
  }
}
```

**4. Transfer (later still):**

The founder sells part of the plaza:

```ts
{
  type: "spatial:transfer_territory",
  riskLevel: "high",
  params: {
    territoryId: "terr-plaza-corner",
    toNodeId: "node-buyer",
    consideration: {
      description: "100 tokens via external settlement",
      value: { tokens: 100 }
    }
  }
}
```

The protocol records this. Whether tokens actually changed hands is outside protocol scope.

---

*End of Spatial Extension*
