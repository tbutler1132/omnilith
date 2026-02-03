# Spatial-Value Integration — Omnilith Protocol

> **Status:** Draft extension. Requires both Spatial Extension and Value Extension.
>
> This document describes how spatial semantics (territory, proximity, terrain) interact with value semantics (lineage, commitments, capacity, metabolism) and how the Daemon navigates this integrated landscape.

---

## I.0) The Inhabited Landscape

When Spatial and Value extensions combine, the protocol describes not just a coordinate system or a reputation system, but an **inhabited landscape** — a world where:

- **Places have history** — artifacts born there, commitments made there, influence flowing through
- **Neighbors matter** — proximity creates accountability, shared context, local culture
- **Movement has meaning** — traveling between territories is a choice with consequences
- **The Daemon is a guide** — helping you navigate both physical and relational terrain

---

## I.1) Artifacts in Place

### I.1.1 Birthplace

Every artifact has a spatial context if created within a Realm:

```ts
export type ArtifactSpatialContext = {
  artifactId: string;

  // Where it was created
  birthplace?: {
    realmId: string;
    territoryId: string;
    coordinates: Coordinates;
    terrain: string;
  };

  // Where it "lives" now (can differ from birthplace)
  residence?: {
    territoryId: string;
    placedAt: string;
    placedBy: string;
  };
};
```

**Birthplace is immutable** — where something was made is historical fact.

**Residence can change** — an artifact can be "moved" to a different territory (like hanging a painting in a new room).

### I.1.2 Lineage on the Landscape

Lineage links gain spatial dimension:

```ts
export type SpatialLineageView = {
  artifactId: string;

  // Ancestors mapped to space
  ancestorLocations: Array<{
    artifactId: string;
    birthplace: Coordinates;
    territoryId: string;
    nodeId: string;
    distance: number;          // From this artifact's birthplace
  }>;

  // Descendants mapped to space
  descendantLocations: Array<{
    artifactId: string;
    birthplace: Coordinates;
    territoryId: string;
    nodeId: string;
    distance: number;
  }>;

  // Derived metrics
  influenceRadius: number;     // How far descendants spread
  influenceCenter: Coordinates; // Centroid of descendant locations
  localInfluence: number;      // Descendants within same territory
  distantInfluence: number;    // Descendants in other territories
};
```

**Visualization (non-normative):**
- Lineage appears as luminous threads across the landscape
- Threads pulse when influence is recent
- Dense thread clusters suggest "schools of thought"
- Long threads crossing territories show ideas traveling

### I.1.3 Local vs. Distant Influence

Influence that stays local vs. travels far tells different stories:

| Pattern | Meaning |
|---------|---------|
| High local, low distant | Strong local culture, ideas staying home |
| Low local, high distant | Ideas resonating elsewhere more than home |
| High both | Generative hub, ideas spreading everywhere |
| Low both | Isolated work, not yet finding response |

Neither is inherently better — they're different modes of creative participation.

---

## I.2) Place-Bound Commitments

### I.2.1 Spatial Commitment Types

Commitments can be grounded in space:

```ts
export type SpatialCommitment = Commitment & {
  spatial?: {
    // Where the commitment applies
    scope: "global" | "territorial" | "local";

    // For territorial/local scope
    boundTo?: {
      territoryId?: string;
      realmId?: string;
      radius?: number;         // For local scope
      center?: Coordinates;
    };

    // Witness requirements
    witnessProximity?: {
      required: boolean;
      maxDistance: number;     // Witnesses must be within this distance
    };

    // Place-based conditions
    conditions?: {
      mustBeIn?: string[];     // Territory IDs where actions count
      mustNotBeIn?: string[];  // Territories where actions don't count
    };
  };
};
```

### I.2.2 Commitment Scope Semantics

**Global:** Commitment applies everywhere. Standard behavior.

**Territorial:** Commitment applies within a specific territory.
- "I commit to responding to every visitor in my Garden"
- Actions outside the territory don't count toward fulfillment

**Local:** Commitment applies within a radius of a point.
- "I commit to attending weekly gatherings at the Plaza"
- Requires presence at location to fulfill

### I.2.3 Neighbor Witnesses

Spatial proximity enables **neighbor witnessing**:

```ts
export type NeighborWitnessRequirement = {
  type: "neighbor";
  adjacencyType: "bordering" | "nearby";
  minWitnesses: number;

  // Auto-discovery: find eligible witnesses from adjacent territories
  autoDiscover: boolean;
};
```

**Example:**
```
Commitment: "I will maintain my garden daily for 30 days"
Witness requirement: 2 neighbors (bordering territories)
```

When you activate this commitment, neighboring territory owners are notified and can opt-in as witnesses. Their proximity gives them natural visibility into your activity.

**Why this matters:** Neighbor witnessing creates local accountability networks. Your reputation becomes place-based — you might be trusted in your neighborhood but unknown across the realm.

### I.2.4 Pilgrimage Commitments

A commitment to **travel**:

```ts
export type PilgrimageCommitment = Commitment & {
  pilgrimage: {
    waypoints: Array<{
      territoryId: string;
      coordinates?: Coordinates;
      mustVisit: boolean;
      order?: number;          // Required visit order (if any)
    }>;

    // What constitutes a "visit"
    visitRequirement: "presence" | "observation" | "artifact" | "interaction";

    // Time constraints
    minDuration?: number;      // Minutes at each waypoint
  };
};
```

**Example:**
```
Commitment: "Visit the three archives and leave a reflection at each"
Waypoints: [Archive A, Archive B, Archive C]
Visit requirement: artifact (must create something at each)
```

Pilgrimages turn the landscape into a practice — movement becomes meaningful.

---

## I.3) Territorial Reputation

### I.3.1 Local vs. Global Reputation

Reputation becomes place-sensitive:

```ts
export type SpatialReputationMetrics = ReputationMetrics & {
  // Global reputation (as before)
  global: ReputationMetrics;

  // Reputation per territory (where you've made/kept commitments)
  territorial: Record<string, {
    territoryId: string;
    commitmentsMade: number;
    commitmentsFulfilled: number;
    fulfillmentRate: number;
    lastActivity: string;
    localWitnesses: number;    // How many local witnesses involved
  }>;

  // Reputation by terrain type
  byTerrain: Record<string, {
    terrain: string;
    fulfillmentRate: number;
    activityLevel: number;
  }>;

  // Derived
  homeTerritory: string;       // Where you're most active
  reputationSpread: number;    // How distributed across territories
  localTrust: number;          // Avg reputation in territories where you have territory
  foreignTrust: number;        // Avg reputation in territories where you don't
};
```

### I.3.2 Reputation and Access

Territorial reputation could gate access:

```ts
export type SpatialGrant = Grant & {
  requirements?: {
    // Must have minimum reputation in this territory
    localReputation?: {
      territoryId: string;
      minFulfillmentRate: number;
    };

    // Must have been witnessed by N local nodes
    localEndorsements?: {
      territoryId: string;
      minWitnesses: number;
    };
  };
};
```

**Example:** The Central Plaza might require 70% fulfillment rate from commitments made within the Plaza to gain posting privileges. You build trust locally before speaking publicly.

---

## I.4) Spatial Metabolism

### I.4.1 Territorial Health

Territories have their own metabolic state (derived from activity within them):

```ts
export type TerritoryMetabolism = {
  territoryId: string;
  computedAt: string;
  window: "day" | "week" | "month";

  // Activity
  observationsWithin: number;
  artifactsCreated: number;
  artifactsResiding: number;

  // Flow
  visitorsEntered: number;
  visitorsExited: number;
  uniqueVisitors: number;

  // Lineage
  lineageLinksFrom: number;    // Artifacts here citing elsewhere
  lineageLinksTo: number;      // Artifacts elsewhere citing here

  // Commitments
  activeCommitments: number;   // Bound to this territory
  recentFulfillments: number;
  recentBreaks: number;

  // Health
  health: "thriving" | "active" | "quiet" | "dormant" | "abandoned";
  trend: "growing" | "stable" | "declining";
};
```

### I.4.2 Terrain Effects on Personal Metabolism

Your metabolic state shifts based on where you are:

| Terrain | Metabolic Effect |
|---------|------------------|
| Plaza | +observation inflow (high traffic), +outflow pressure |
| Garden | +artifact creation rate, balanced flow |
| Sanctuary | -flow rate (quiet), +regeneration |
| Archive | +lineage discovery, -new creation |
| Wilderness | variable (exploration mode), -stability |
| Workshop | +iteration rate, -external flow |

These aren't rules — they're tendencies. The terrain biases what's natural, not what's possible.

### I.4.3 Movement and Metabolism

Changing location affects your state:

```ts
export type MovementEvent = {
  nodeId: string;
  timestamp: string;

  from: {
    realmId: string;
    territoryId?: string;
    coordinates: Coordinates;
  };

  to: {
    realmId: string;
    territoryId?: string;
    coordinates: Coordinates;
  };

  distance: number;
  crossedTerritories: string[];

  // Effects
  capacityCost: number;        // Long journeys cost more
  metabolicShift?: string;     // If terrain change triggers shift
};
```

**Travel costs capacity.** A journey across the realm is an investment. This prevents frictionless teleportation and makes location choices meaningful.

---

## I.5) Daemon as Landscape Guide

The Daemon gains new capabilities when Spatial and Value extensions combine.

### I.5.1 Spatial Awareness

The Daemon knows where you are, where you've been, and what that means:

```ts
export type DaemonSpatialContext = {
  currentLocation: {
    realmId: string;
    territoryId?: string;
    coordinates: Coordinates;
    terrain?: string;
  };

  // Recent movement
  recentPath: MovementEvent[];

  // Territorial familiarity
  territoriesVisited: Map<string, {
    visitCount: number;
    totalTime: number;
    lastVisit: string;
    relationshipStrength: "stranger" | "visitor" | "regular" | "resident";
  }>;

  // Spatial value context
  nearbyArtifacts: ArtifactReference[];
  nearbyCommitments: Commitment[];     // Commitments bound to current area
  nearbyLineage: LineageLink[];        // Lineage threads passing through
};
```

### I.5.2 Daemon Guidance Modes

**Navigation Assistance:**
```
User: "Where should I go to find inspiration?"

Daemon: "Based on your recent work and lineage patterns:

  Your ancestors cluster in two areas:
  - The Archive District (60% of your cited influences)
  - The Eastern Gardens (30%)

  You haven't visited the Archive in 3 weeks.
  There's new work there from nodes you follow.

  Journey: 450 units, ~15 capacity cost.
  [Show route] [What's new there?]"
```

**Local Context:**
```
[Entering new territory]

◇ Welcome to the Central Plaza.

  This is high-traffic public space. Terrain: plaza
  - 23 artifacts created here this week
  - 5 active place-bound commitments
  - Your reputation here: unknown (no local history)

  3 nodes you follow have work here.
  [Show their work] [Browse local artifacts]
```

**Commitment Scouting:**
```
User: "I want to make a commitment with local witnesses"

Daemon: "Your current territory (Northside Garden) has 4 neighboring territories:

  - East: occupied by [Node A] — you have positive history
  - South: occupied by [Node B] — no history
  - West: unclaimed wilderness
  - North: occupied by [Node C] — they witnessed your last commitment

  [Node A] and [Node C] would be good witness candidates.
  Want me to draft a commitment and notify them?"
```

**Lineage Landscape:**
```
User: "Show me how my influence has spread"

Daemon: [Renders spatial view of descendant locations]

  "Your work has reached 7 territories across the realm:

  - Densest cluster: around your home (local school forming)
  - Furthest reach: Southern Archives, 2000 units away
  - Unexpected: 2 descendants in the Wilderness (pioneering nodes?)

  Notable thread: Your 'On Attention' piece spawned a response chain
  that traveled Plaza → Garden District → Archives.

  [Trace that thread] [Who are these nodes?]"
```

### I.5.3 Place-Based Recommendations

The Daemon suggests based on spatial context:

**At Home (your territory):**
```
◇ Home territory check-in:
  - 2 pending local commitments
  - 1 neighbor waiting for your witness attestation
  - Your garden has been quiet (no visitors in 5 days)

  Consider: create something to draw visitors, or
  visit neighbors to strengthen local ties.
```

**In Public (plaza):**
```
◇ You're in public space. Plaza dynamics:
  - High observation inflow here
  - Your capacity drains faster (social energy)
  - Good place to make visible commitments

  I notice you've been drafting something.
  Publishing here would get more eyes than at home.
  [Compare: publish here vs. publish at home]
```

**In Unfamiliar Territory:**
```
◇ You're in [Node X]'s territory for the first time.

  Local customs I've observed:
  - They publish weekly, usually Sundays
  - High lineage declaration rate (they cite sources often)
  - Their recent work resonates with your Project Y

  Approach: read before speaking, cite if you respond.
  [Show their recent work]
```

**In Wilderness:**
```
◇ Wilderness area — no claimed territories nearby.

  Considerations:
  - No local witnesses available
  - Capacity regen is lower here
  - But: anything you create here is pioneering

  This could be a claim site if you want to expand.
  Current capacity: 67. Claim cost: 50.
  [Survey this area] [Continue exploring]
```

### I.5.4 Spatial-Value Pattern Recognition

The Daemon notices patterns across space and value:

```
◇ I've noticed a pattern in your commitments:

  - Commitments made at home: 85% fulfillment
  - Commitments made in public: 60% fulfillment
  - Commitments made while traveling: 40% fulfillment

  You might be overcommitting when away from home.
  Consider: make commitments when grounded,
  focus on observation when traveling.
```

```
◇ Your lineage geography is shifting:

  Last 6 months: 70% of ancestors from the Archives
  Last 6 weeks: 80% of ancestors from the Eastern Gardens

  Your influences are migrating. Intentional, or drift?
  [Show the shift] [It's intentional]
```

```
◇ Local reputation insight:

  In the Plaza District: 90% fulfillment (trusted)
  In the Northern Reaches: 50% fulfillment (shaky)

  Your Northern commitments tend to be ambitious.
  The distance might be a factor — harder to follow through
  when you're not physically present.
```

---

## I.6) Emergent Spatial-Value Dynamics

### I.6.1 Local Schools

When lineage clusters spatially, **schools** emerge — groups of artifacts and nodes that cite each other within a territory.

```ts
export type LocalSchool = {
  id: string;
  territoryId: string;

  // Members
  coreNodes: string[];           // High mutual citation
  peripheralNodes: string[];     // Cite core but not cited back

  // Artifacts
  foundationalArtifacts: string[]; // Most-cited within school
  recentArtifacts: string[];

  // Metrics
  insularity: number;            // 0-1, how much citation stays internal
  influence: number;             // External descendants
  activity: number;              // Recent lineage activity
};
```

The Daemon might surface schools:
```
◇ A creative school is forming in the Garden District:
  - 5 nodes with high mutual citation
  - 12 artifacts in the core lineage cluster
  - Your work is peripheral (cited but not citing back)

  Want to engage more deeply, or stay at the edge?
```

### I.6.2 Reputation Gradients

Trust varies across space, creating gradients:

```ts
export type ReputationGradient = {
  nodeId: string;
  realmId: string;

  // Heatmap data
  samples: Array<{
    coordinates: Coordinates;
    localReputation: number;
    sampleSource: "commitment" | "witness" | "grant";
  }>;

  // Derived
  trustCenters: Coordinates[];     // High-reputation areas
  trustPeriphery: Coordinates[];   // Low-reputation areas
  expansionFrontier: Coordinates[]; // Areas with potential
};
```

You might be highly trusted in your neighborhood but unknown across the realm. Building wider reputation requires traveling, making commitments in new places, earning local witnesses.

### I.6.3 Pilgrimage Networks

When multiple nodes make similar pilgrimage commitments, paths emerge:

```ts
export type PilgrimagePath = {
  waypoints: string[];           // Territory IDs in order
  travelers: number;             // Nodes who've completed this path
  significance?: string;         // Why this path matters
  artifacts: string[];           // Works created along the path
};
```

The Daemon might suggest established pilgrimages:
```
◇ 12 nodes have traveled the "Three Archives" path.
  Notable works were created at each stop.

  This pilgrimage is associated with deepening practice.
  Duration: typically 2-3 weeks.

  [See the path] [Read pilgrimage reflections]
```

### I.6.4 Territorial Exchange

When spatial and value combine, territories themselves become meaningful to exchange:

**Considerations beyond coordinates:**
- A territory's lineage history (influential works created there)
- Its reputation infrastructure (witnessed commitments, local trust networks)
- Its metabolic patterns (lively vs. quiet, inflow vs. outflow)
- Its terrain (plaza vs. sanctuary, each with different capacity dynamics)

**Transfer complexity:**
```
Daemon: "You've received a transfer offer for the River Garden territory.

  Beyond location, here's what you'd inherit:
  - 3 foundational artifacts (high descendant count)
  - Local school membership (2 neighboring nodes cite heavily)
  - 2 unfulfilled commitments previously bound to this territory
  - Established visitor flow (12 unique visitors/week)

  And what you'd give up in your current territory:
  - Your lineage anchor (14 artifacts born there)
  - Local witness relationships (3 neighbors)
  - Your sanctuary terrain bonus

  This is a meaningful change. Want to think on it?"
```

---

## I.7) Bundle Extension

Spatial-value integration adds to the bundle:

```
/omnilith-bundle
  /realms
    /<realmId>
      realm.json
      /territories
        <territoryId>.json
        <territoryId>.metabolism.json    # Derived, optional
      /schools
        <schoolId>.json                  # Derived, optional
      /paths
        <pathId>.json                    # Pilgrimage paths, derived
  /nodes
    /<nodeId>
      spatial.json
      /artifacts
        /<artifactId>
          spatial-context.json           # Birthplace, residence
      /commitments
        <commitmentId>.json              # May include spatial fields
      /reputation
        spatial-reputation.json          # Derived
```

---

## I.8) Example: A Day in the Inhabited Landscape

**Morning — At Home**

```
[You wake in your Garden territory]

◇ Good morning. Home status:
  - Capacity: 78/100 (regenerated overnight, garden bonus)
  - Local commitments: 1 active ("Tend the garden daily" — day 12/30)
  - Neighbor activity: [Node East] published something last night

  Your garden metabolism is healthy — 3 visitors yesterday,
  2 new lineage links to your recent work.

  [Log garden tending] [See neighbor's work]

You: [Log garden tending observation]

◇ Day 12 logged. 18 to go. You're on track.
```

**Midday — Travel to Plaza**

```
You: "I want to go to the Central Plaza"

Daemon: "Journey: 800 units, across Midlands District.
  Capacity cost: ~20.

  The Plaza is busy today — I see 4 nodes you follow are active there.
  One has new work responding to something you made last month.

  [Begin journey]"

[Travel animation — landscape scrolling, capacity ticking down]

◇ Entering Central Plaza.

  Terrain shift: garden → plaza
  - Higher observation inflow
  - Social energy cost increases
  - Good for visible commitments and lineage discovery

  [Node X]'s response to your work is here.
  [Read it] [Browse the plaza]

You: [Read the response]

[Artifact viewer opens — you see your work cited as ancestor]

Daemon: "This is a 'responds_to' link. They're extending your idea
  about attention into a critique of quantification.

  You could:
  - Respond in turn (continuing the thread)
  - Acknowledge without responding (let them have the last word)
  - Cite them in future work (lineage without direct response)

  [Draft a response here] [Note for later]"
```

**Afternoon — Public Commitment**

```
You: "I want to make a public commitment here"

Daemon: "Making a commitment in the Plaza will be witnessed by many.
  High visibility = high accountability.

  Who should formally witness?
  - [Node X] (author of the response you just read)
  - [Node Y] (frequent Plaza presence, high local reputation)
  - [Node Z] (you've witnessed for them before — reciprocity)

  Or: open witness call (anyone in Plaza can volunteer)

  What's the commitment about?"

You: "I commit to publishing a response to [Node X]'s piece within 7 days"

Daemon: "Draft:

  Title: Response Commitment
  Statement: Publish a meaningful response to '[Article Title]' within 7 days
  Scope: global (not place-bound)
  Witnesses: [Node X] (the one you're responding to)
  Stakes: Public accountability in the Plaza

  This is medium risk — your reputation here is nascent.
  Fulfilling this would significantly boost your Plaza standing.

  [Activate commitment] [Modify]"

You: [Activate]

[Commitment recorded, [Node X] notified, Plaza observers see the commitment]

Daemon: "Commitment active. [Node X] has been notified.

  You've staked reputation on this. 7 days.
  I'll check in at day 5 if you haven't started drafting."
```

**Evening — Return Home**

```
You: "Take me home"

Daemon: "Journey home: 800 units, 20 capacity.
  Current capacity: 45. You'll arrive at 25.

  The garden's sanctuary effect will help you regenerate.
  Quiet evening ahead?

  [Begin journey]"

[Travel — landscape scrolling home]

◇ Home. Garden territory.

  Capacity: 25 (low). Regen rate here: +8/hour (garden bonus).
  You'll be at 65 by morning.

  Today's metabolic summary:
  - Traveled 1600 units (significant journey)
  - 1 new lineage link discovered (Node X's response)
  - 1 public commitment made (7-day countdown started)
  - Garden commitment maintained (day 12/30)

  Suggestion: rest tonight. You've spent a lot of capacity on travel.
  The response can wait until tomorrow when you're regenerated.

  [View commitment timeline] [Good night]"
```

---

## I.9) Invariants (Spatial-Value Integration)

- **Birthplace is immutable** — where an artifact was created cannot change
- **Lineage links are spatial facts** — they record coordinates at time of creation
- **Territorial reputation is derived** — computed from commitments made in that territory
- **Movement costs capacity** — distance has friction
- **The Daemon guides but doesn't teleport** — it can suggest destinations, not bypass the journey
- **Local witnesses must be proximate** — spatial witness requirements are enforced by adjacency
- **School membership is derived** — computed from lineage patterns, not declared

---

*End of Spatial-Value Integration*
