# Value Extension — Omnilith Protocol

> **Status:** Draft extension. Not yet part of the core protocol.
>
> This extension adds value semantics to the Omnilith Protocol through **Lineage** (influence chains) and **Commitments** (social capital). It explicitly rejects accumulation-based economics in favor of relational, temporal value.

---

## V.0) Philosophy

### V.0.1 What Value Means Here

Value in Omnilith is not a number you accumulate. It's a quality of relationship and history.

**Value is relational:** An artifact's value exists in its connections — what it came from, what it spawned, who engaged with it.

**Value is temporal:** Commitments matter because they unfold over time. A promise kept is worth more than a promise made.

**Value flows, it doesn't pool:** Attention, influence, and trust move through the system. Attempts to hoard them create stagnation.

### V.0.2 What This Extension Does NOT Provide

- **Tokens or currency** — No fungible units of exchange
- **Ownership transfer of value** — You can't sell your reputation or your artifact's influence
- **Speculation** — Nothing here appreciates by sitting idle
- **Artificial scarcity** — Influence expands when shared, it doesn't deplete

### V.0.3 Core Insight

The protocol already has an implicit economy:

| Flow | Nature |
|------|--------|
| Observations | Attention moving through the system |
| Edges | Relationship structure |
| Grants | Authority flowing between nodes |
| Provenance | Credit and responsibility |

This extension makes some of these flows more legible without corrupting them into speculation.

---

## V.1) Lineage (Influence Chains)

Artifacts don't exist in isolation. They respond to, remix, extend, and inspire other artifacts. **Lineage** makes these relationships canonical.

### V.1.1 Lineage Model

```ts
export type Lineage = {
  artifactId: string;

  // Ancestors: what this artifact draws from
  ancestors: AncestorLink[];

  // Note: descendants are NOT stored — they're derived by querying
  // "what artifacts have this artifact as an ancestor?"
};

export type AncestorLink = {
  artifactId: string;
  nodeId: string;              // Node that owns the ancestor (denormalized for query)

  relationship: LineageRelationship;
  weight?: number;             // 0-1, degree of influence (optional)
  note?: string;               // Author's description of the relationship

  addedAt: string;
  addedBy: string;             // Subject-Node who declared this link
};

export type LineageRelationship =
  | "derived_from"      // Direct derivation (fork, adaptation)
  | "inspired_by"       // Indirect influence (saw this, made something different)
  | "responds_to"       // Explicit response (reply, critique, continuation)
  | "remixes"           // Transformative reuse (samples, collages)
  | "cites"             // Reference without transformation
  | "contradicts";      // Explicit disagreement or counter-position
```

### V.1.2 Lineage Rules

**Authorship:**
- Only the artifact's owner can declare ancestors (you say what influenced you)
- You cannot declare yourself as someone else's ancestor (you don't claim influence)
- Ancestor declarations are append-only (you can add links, not remove them)

**Visibility:**
- Lineage is always visible if the artifact is visible
- You cannot hide your influences while showing the work

**Cross-node:**
- Ancestors can be in any node (influence crosses boundaries)
- The ancestor artifact must be visible to the declaring node at time of declaration

### V.1.3 Descendant Queries (Derived)

Descendants are computed, not stored. This respects the Projection Law — descendants are a view, not canon.

```ts
interface LineageQueries {
  // Get all artifacts that declare this artifact as ancestor
  getDescendants(
    artifactId: string,
    options?: {
      relationship?: LineageRelationship;
      depth?: number;           // How many generations (default: 1)
      limit?: number;
    }
  ): ArtifactReference[];

  // Get the full ancestor tree
  getAncestorTree(
    artifactId: string,
    depth?: number
  ): LineageTree;

  // Get influence metrics (derived)
  getInfluenceMetrics(artifactId: string): InfluenceMetrics;
}

export type ArtifactReference = {
  artifactId: string;
  nodeId: string;
  title: string;
  relationship: LineageRelationship;
};

export type LineageTree = {
  artifact: ArtifactReference;
  ancestors: LineageTree[];
};
```

### V.1.4 Influence Metrics (Derived View)

Influence is computed from lineage, never stored as canon.

```ts
export type InfluenceMetrics = {
  artifactId: string;
  computedAt: string;

  // Direct influence
  descendantCount: number;
  descendantsByRelationship: Record<LineageRelationship, number>;

  // Reach (multi-generational)
  totalReach: number;          // All descendants at any depth
  maxDepth: number;            // Deepest descendant chain

  // Diversity
  uniqueNodes: number;         // How many different nodes have descendants
  crossNodeRatio: number;      // % of descendants in other nodes

  // Recency
  recentDescendants: number;   // Last 30 days
  momentum: "growing" | "stable" | "fading";
};
```

**Key insight:** These metrics are interesting but not tradeable. You can see that an artifact was influential. You cannot sell that influence.

### V.1.5 Lineage in Surfaces

Surfaces MAY display lineage information:

```ts
// Surface entry can request lineage display
export type SurfaceEntry = {
  artifactId?: string;
  query?: QuerySpec;

  // Lineage display options
  lineage?: {
    showAncestors?: boolean | number;    // true or depth
    showDescendants?: boolean | number;
    showMetrics?: boolean;
  };
};
```

**Rendering (non-normative):**
- Ancestor chains could appear as threads leading "up" from the artifact
- Descendants could appear as branches flowing "down"
- Metrics could appear as ambient qualities (glow, density, activity)

### V.1.6 Lineage and Provenance Interaction

Lineage is **declared influence** — what the author says shaped the work.

Provenance is **factual origin** — who created this observation/artifact, how, when.

They're complementary:
- An artifact has provenance (who made it)
- An artifact may have lineage (what influenced it)
- An AI-assisted artifact has provenance noting the Daemon's involvement
- That same artifact might have lineage citing human-authored works that informed the prompt

---

## V.2) Commitments (Social Capital)

A **Commitment** is a canonical statement of intent — a promise recorded in the protocol.

Commitments create **social capital**: a track record that others can inspect. Unlike tokens, you can't trade your reputation. You can only build it or damage it through your actions.

### V.2.1 Commitment Model

```ts
export type Commitment = {
  id: string;
  nodeId: string;

  // The promise
  title: string;
  statement: string;           // What you're committing to

  // Structured targets (optional)
  targets?: CommitmentTarget[];

  // Temporal scope
  startsAt?: string;
  deadline?: string;           // When this should be fulfilled by

  // Visibility and witnessing
  visibility: "private" | "node_members" | "public";
  witnesses?: string[];        // Node IDs who can see and verify

  // Stakes (optional, semantic only)
  stakes?: string;             // What's at risk, in the author's words

  // Lifecycle
  status: CommitmentStatus;
  resolution?: CommitmentResolution;

  // Linkage
  episodeId?: string;          // Commitment may be part of an Episode
  relatedArtifactIds?: string[];

  createdAt: string;
  updatedAt: string;
};

export type CommitmentTarget = {
  variableId: string;
  intent: "reach" | "maintain" | "avoid";
  threshold?: {
    operator: "gte" | "lte" | "eq" | "in_range";
    value: number | ViableRange;
  };
};

export type CommitmentStatus =
  | "draft"           // Not yet active
  | "active"          // In progress
  | "fulfilled"       // Successfully completed
  | "broken"          // Failed to meet
  | "released"        // Mutually dissolved (if witnessed)
  | "expired";        // Deadline passed without resolution

export type CommitmentResolution = {
  status: "fulfilled" | "broken" | "released" | "expired";
  resolvedAt: string;
  resolvedBy: string;           // Node that marked resolution

  // Evidence
  evidence?: Array<{
    type: "observation" | "artifact" | "variable_estimate" | "witness_attestation";
    id: string;
    note?: string;
  }>;

  // Witness confirmations (for witnessed commitments)
  witnessConfirmations?: Array<{
    witnessNodeId: string;
    confirmedAt: string;
    agrees: boolean;
    note?: string;
  }>;
};
```

### V.2.2 Commitment Lifecycle

```
draft → active → fulfilled
                 broken
                 released
                 expired
```

**Draft:** Commitment exists but isn't "live." Can be edited or deleted.

**Active:** Commitment is in force. Can no longer be edited. Clock is ticking.

**Fulfilled:** Author (or system, for variable-based targets) marks as complete. Witnesses may confirm.

**Broken:** Author admits failure, or deadline passes without fulfillment, or witnesses attest to failure.

**Released:** All parties (author + witnesses) agree to dissolve. Not a failure, not a success — circumstances changed.

**Expired:** Deadline passed with no resolution. Treated as ambiguous (not automatically "broken").

### V.2.3 Commitment Rules

**Authorship:**
- Only the node can create commitments for itself
- You cannot commit someone else to something

**Immutability:**
- Active commitments cannot be edited (only resolved)
- Draft commitments can be edited or deleted
- Resolution is append-only (you can add evidence, not change the outcome)

**Witnessing:**
- Witnesses are optional but add weight
- Witnessed commitments require witness confirmation for clean resolution
- Witnesses can dispute a self-declared "fulfilled" status

**Variables:**
- If a commitment has variable targets, the system can auto-detect fulfillment
- This doesn't auto-resolve — it surfaces a notification for the author to confirm

### V.2.4 Reputation (Derived View)

Reputation is computed from commitment history. It is **never stored as canon** — always derived.

```ts
export type ReputationMetrics = {
  nodeId: string;
  computedAt: string;

  // Volume
  totalCommitments: number;
  activeCommitments: number;

  // Track record
  fulfilled: number;
  broken: number;
  released: number;
  expired: number;

  // Ratios
  fulfillmentRate: number;     // fulfilled / (fulfilled + broken)
  completionRate: number;      // (fulfilled + released) / total resolved

  // Patterns
  averageCommitmentDuration: number;  // days
  longestStreak: number;              // consecutive fulfillments
  currentStreak: number;

  // Witness involvement
  witnessedCommitments: number;
  witnessConfirmationRate: number;    // % of witnessed that witnesses confirmed

  // Recency weighting (recent matters more)
  recentFulfillmentRate: number;      // last 90 days
  trend: "improving" | "stable" | "declining";
};
```

### V.2.5 Commitment Actions

```ts
// Create commitment (starts as draft)
export type CreateCommitmentAction = {
  type: "commitment:create";
  riskLevel: "low";
  params: Omit<Commitment, "id" | "status" | "resolution" | "createdAt" | "updatedAt">;
};

// Activate commitment (draft → active)
export type ActivateCommitmentAction = {
  type: "commitment:activate";
  riskLevel: "medium";  // Once active, you're on the hook
  params: {
    commitmentId: string;
  };
};

// Resolve commitment
export type ResolveCommitmentAction = {
  type: "commitment:resolve";
  riskLevel: "medium";
  params: {
    commitmentId: string;
    status: "fulfilled" | "broken" | "released";
    evidence?: CommitmentResolution["evidence"];
    note?: string;
  };
};

// Witness attestation
export type AttestCommitmentAction = {
  type: "commitment:attest";
  riskLevel: "low";
  params: {
    commitmentId: string;
    agrees: boolean;
    note?: string;
  };
};
```

### V.2.6 Commitments and Episodes

Commitments and Episodes are complementary:

| Concept | Purpose |
|---------|---------|
| Episode | Coordinates action toward a variable outcome |
| Commitment | Stakes reputation on an outcome |

A regulatory Episode might spawn a Commitment: "I commit to getting my sleep variable back in range by Friday."

An exploratory Episode might explicitly NOT have a commitment: "I'm probing this boundary — I don't know if I can do it."

```ts
// Episode can reference commitments
export type Episode = {
  // ...existing fields
  commitmentIds?: string[];    // Commitments made as part of this episode
};
```

### V.2.7 Policies and Commitments

Policies can read commitment state but cannot create or resolve commitments (that requires user action through Prism).

```ts
// In PolicyContext.canon
interface CommitmentQueries {
  getActiveCommitments(nodeId: string): Commitment[];
  getCommitment(id: string): Commitment | null;
  getReputationMetrics(nodeId: string): ReputationMetrics;
}

// Example policy: warn when active commitment deadline is approaching
evaluate(ctx) {
  const commitments = ctx.canon.getActiveCommitments(ctx.node.id);
  const now = new Date(ctx.evaluatedAt);

  for (const c of commitments) {
    if (!c.deadline) continue;
    const deadline = new Date(c.deadline);
    const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursRemaining < 24 && hoursRemaining > 0) {
      return [{
        effect: "log",
        level: "warn",
        message: `Commitment "${c.title}" due in ${Math.round(hoursRemaining)} hours`
      }];
    }
  }
  return [];
}
```

---

## V.3) Capacity (Pacing Mechanism)

**Capacity** is a regenerating resource that paces action. It prevents spam and abuse without creating artificial scarcity for speculation.

### V.3.1 Capacity Model

```ts
export type Capacity = {
  nodeId: string;

  current: number;
  max: number;
  regenRate: number;           // Units per hour

  lastUpdated: string;         // For calculating regeneration

  // Modifiers (temporary bonuses/penalties)
  modifiers: CapacityModifier[];
};

export type CapacityModifier = {
  id: string;
  source: string;              // What granted this modifier
  sourceType: "territory" | "commitment" | "episode" | "grant" | "policy";

  effect: {
    maxBonus?: number;         // Add to max capacity
    regenBonus?: number;       // Add to regen rate
    costMultiplier?: number;   // Multiply action costs (< 1 = discount)
  };

  expiresAt?: string;
  reason?: string;
};
```

### V.3.2 Capacity Dynamics

**Regeneration:**
```ts
function getCurrentCapacity(cap: Capacity, now: Date): number {
  const hoursSinceUpdate = (now.getTime() - new Date(cap.lastUpdated).getTime()) / (1000 * 60 * 60);
  const effectiveRegen = cap.regenRate + sum(cap.modifiers.map(m => m.effect.regenBonus ?? 0));
  const effectiveMax = cap.max + sum(cap.modifiers.map(m => m.effect.maxBonus ?? 0));

  const regenerated = cap.current + (hoursSinceUpdate * effectiveRegen);
  return Math.min(regenerated, effectiveMax);
}
```

**Costs:**
Actions declare capacity costs. The interpreter deducts capacity when actions execute.

```ts
export type ActionDefinition = {
  // ...existing fields
  capacityCost?: number;
};

// Example costs (tunable by interpreter)
const DEFAULT_COSTS = {
  "spatial:claim_territory": 50,
  "spatial:transfer_territory": 20,
  "commitment:activate": 10,
  "artifact:publish": 5,
};
```

### V.3.3 Capacity Sources

| Source | Effect | Philosophy |
|--------|--------|------------|
| Base | Everyone starts with some capacity | Basic agency |
| Territory (plaza) | +max, +regen | Being in public space energizes |
| Territory (sanctuary) | +max, -cost | Private space is efficient |
| Fulfilled commitment | +regen (temporary) | Keeping promises builds momentum |
| Broken commitment | -regen (temporary) | Breaking promises drains energy |
| Active episode | -cost for related actions | Focus enables efficiency |
| High reputation | +max | Trust compounds into capacity |

### V.3.4 Capacity is NOT Tradeable

You cannot:
- Transfer capacity to another node
- Store excess capacity beyond max
- Convert capacity to/from anything else

Capacity is personal pacing. It ensures that even in an infinite realm, you can't spam infinite claims. It regenerates so it doesn't create permanent scarcity.

---

## V.4) Metabolic View (System Health)

The **Metabolic View** is a derived lens on system health — how well attention and value are flowing.

### V.4.1 Metabolic Metrics (Derived)

```ts
export type MetabolicMetrics = {
  nodeId: string;
  computedAt: string;
  window: "hour" | "day" | "week";

  // Flows
  observationsReceived: number;
  observationsEmitted: number;
  uniqueSourceNodes: number;
  uniqueDestinationNodes: number;

  // Artifact activity
  artifactsCreated: number;
  artifactsRevised: number;
  lineageLinksAdded: number;      // How much you're connecting to others' work
  descendantsGained: number;      // How much others are connecting to yours

  // Commitment activity
  commitmentsActivated: number;
  commitmentsFulfilled: number;
  commitmentsBroken: number;

  // Capacity
  capacityUtilization: number;    // avg current / max
  actionsExecuted: number;

  // Health assessment
  flowBalance: number;            // (in - out) / (in + out), -1 to 1
  health: "thriving" | "active" | "quiet" | "stagnant" | "depleted";
};
```

### V.4.2 Health Interpretation

| Health | Pattern | Implication |
|--------|---------|-------------|
| Thriving | High flow in both directions, positive lineage growth | System is alive and connected |
| Active | Moderate flow, some commitments in progress | Normal operation |
| Quiet | Low flow, few commitments, stable capacity | Resting or dormant |
| Stagnant | Very low flow, no new lineage, capacity full but unused | Possible disengagement |
| Depleted | Outflow >> inflow, broken commitments, low capacity | Burnout or overextension |

### V.4.3 Metabolic Policies

Policies can use metabolic state to trigger interventions:

```ts
// Example: Suggest rest when approaching depletion
evaluate(ctx) {
  const metrics = ctx.derived.getMetabolicMetrics(ctx.node.id, "week");

  if (metrics.health === "depleted" ||
      (metrics.commitmentsBroken > metrics.commitmentsFulfilled)) {
    return [{
      effect: "propose_action",
      action: {
        type: "episode:create",
        riskLevel: "low",
        params: {
          kind: "regulatory",
          title: "Recovery Period",
          description: "System suggests reducing commitments and allowing regeneration",
          variables: [{ variableId: "capacity", intent: "stabilize" }]
        }
      }
    }];
  }
  return [];
}
```

---

## V.5) Bundle Extension

Value data extends the Omnilith Bundle:

```
/omnilith-bundle
  /nodes
    /<nodeId>
      node.json
      capacity.json             # Current capacity state
      /artifacts
        /<artifactId>
          ...
          lineage.json          # Ancestor declarations
      /commitments
        <commitmentId>.json
      /metrics                  # Derived, not canon (may be omitted)
        metabolic.json
        reputation.json
```

**lineage.json:**
```json
{
  "artifactId": "art-123",
  "ancestors": [
    {
      "artifactId": "art-456",
      "nodeId": "node-other",
      "relationship": "inspired_by",
      "weight": 0.7,
      "note": "The structural approach came from here",
      "addedAt": "2025-06-15T10:00:00Z",
      "addedBy": "node-me"
    }
  ]
}
```

**commitment.json:**
```json
{
  "id": "commit-789",
  "nodeId": "node-me",
  "title": "Daily writing practice",
  "statement": "I will write at least 500 words every day for 30 days",
  "targets": [
    {
      "variableId": "var-writing-streak",
      "intent": "reach",
      "threshold": { "operator": "gte", "value": 30 }
    }
  ],
  "startsAt": "2025-07-01T00:00:00Z",
  "deadline": "2025-07-31T23:59:59Z",
  "visibility": "public",
  "witnesses": ["node-friend"],
  "status": "active",
  "createdAt": "2025-06-28T14:00:00Z",
  "updatedAt": "2025-07-01T00:00:00Z"
}
```

---

## V.6) Integration with Spatial Extension

If both Value and Spatial extensions are active, they interact:

### V.6.1 Territory and Capacity

```ts
// Territory terrain affects capacity
const TERRAIN_MODIFIERS: Record<string, Partial<CapacityModifier["effect"]>> = {
  "plaza": { maxBonus: 20, regenBonus: 2 },
  "sanctuary": { costMultiplier: 0.8 },
  "wilderness": { regenBonus: -1 },  // Harsh environment
  "workshop": { costMultiplier: 0.9, maxBonus: 10 },
};
```

### V.6.2 Lineage and Location

Artifacts inherit spatial context:

```ts
export type ArtifactSpatialContext = {
  artifactId: string;
  createdInTerritory?: string;       // Where it was first created
  currentTerritory?: string;         // Where it "lives" now (if different)
};
```

This enables queries like "show me all artifacts created in the Central Plaza" or "what was made in my garden."

### V.6.3 Commitment and Witness Proximity

Witnessed commitments could require spatial proximity:

```ts
export type Commitment = {
  // ...existing fields
  witnessRequirements?: {
    proximity?: {
      realmId: string;
      maxDistance: number;
    };
  };
};
```

This creates "local" commitments — promises made in a place, witnessed by neighbors.

---

## V.7) Anti-Patterns (What This Prevents)

### V.7.1 Speculation

**Blocked:** You cannot buy low and sell high because nothing is tradeable.
- Influence metrics are derived, not owned
- Reputation is personal, not transferable
- Capacity regenerates, can't be hoarded

### V.7.2 Attention Harvesting

**Blocked:** Creating low-quality content to "farm" descendants doesn't work.
- Lineage requires explicit declaration by the descendant author
- You can't claim influence, only receive it
- Quality (what spawns genuine responses) wins over quantity

### V.7.3 Commitment Gaming

**Blocked:** Making easy commitments to pad your fulfillment rate is visible.
- Metrics include commitment difficulty (variable targets, duration)
- Witnessed commitments carry more weight
- Recent track record is weighted higher than historical

### V.7.4 Capacity Hoarding

**Blocked:** Stockpiling capacity for a big move doesn't work.
- Capacity caps at max
- Regeneration is steady, not burstable
- The system rewards rhythm, not accumulation

---

## V.8) Example Scenarios

### V.8.1 The Influential Artifact

Alice creates an artifact exploring a new approach to personal knowledge management.

1. Alice publishes the artifact (costs 5 capacity)
2. Bob sees it, is inspired, creates his own artifact
3. Bob declares lineage: `{ relationship: "inspired_by", artifactId: alice-artifact }`
4. Carol sees Bob's work, creates a response
5. Carol declares lineage to both Alice and Bob

**Result:**
- Alice's influence metrics show 2 descendants (Bob, Carol)
- Alice's reach shows depth of 2 (Bob → Carol chain)
- Alice did nothing to "earn" this — it emerged from creating something generative
- Alice cannot sell or trade this influence

### V.8.2 The Kept Promise

David makes a public commitment to meditate daily for a week, witnessed by his friend Eve.

1. David creates commitment (draft)
2. David activates commitment (costs 10 capacity, status → active)
3. Each day, David logs meditation observations
4. After 7 days, David resolves as fulfilled, citing observation IDs as evidence
5. Eve confirms the resolution

**Result:**
- David's fulfillment rate increases
- David gets a temporary regen bonus (momentum from kept promise)
- David's reputation metrics improve
- Eve's attestation adds weight to the record

### V.8.3 The Broken Promise

Frank commits to finishing a project by Friday. He doesn't.

1. Frank creates and activates commitment
2. Friday passes, commitment auto-expires
3. Frank honestly resolves as "broken" with a note explaining why

**Result:**
- Frank's broken count increases
- Frank gets a temporary regen penalty
- But: Frank's honesty is recorded (he didn't let it silently expire)
- Future commitments from Frank carry context: he's broken promises but owned it

### V.8.4 The Recovery Episode

Grace notices her metabolic metrics show "depleted" health.

1. System policy proposes a Recovery Episode
2. Grace accepts, creating an Episode with intent: "stabilize" on her capacity variable
3. Grace releases two non-critical commitments (with witness agreement)
4. Grace reduces observation output, lets capacity regenerate
5. Episode completes when capacity returns to viable range

**Result:**
- Grace's health improves to "quiet" then "active"
- Released commitments don't count as broken
- The episode is recorded — Grace took care of herself

---

## V.9) Future Considerations

### V.9.1 Lineage Visualization

The Map could render lineage as visible threads:
- Ancestor links as threads reaching "up" or "back"
- Descendant clusters as branches reaching "down" or "forward"
- Influence metrics as ambient glow or density

### V.9.2 Collective Commitments

Multiple nodes making a shared commitment:

```ts
export type CollectiveCommitment = Commitment & {
  participants: Array<{
    nodeId: string;
    role: "co-author" | "supporter" | "witness";
    joinedAt: string;
  }>;
  quorum?: {
    minParticipants: number;
    minFulfillmentRate: number;  // % of participants who must fulfill
  };
};
```

### V.9.3 Lineage Webs

Analysis of lineage patterns across the system:
- Schools of thought (clusters of mutual influence)
- Lineage diversity (breadth vs depth)
- Bridge artifacts (connecting otherwise separate clusters)

### V.9.4 Capacity Sharing (Carefully)

Limited, consensual capacity assistance:

```ts
export type CapacityGift = {
  fromNodeId: string;
  toNodeId: string;
  amount: number;
  reason: string;
  // Constraints:
  // - Costs the giver 2x the amount (discourages gaming)
  // - Max once per day between same nodes
  // - Cannot push recipient above their max
};
```

This enables help without enabling markets.

---

## V.10) Daemon Integration

The Daemon (§7.1 of main spec) is the user's personal Agent-Node — always present, observing, advising, drafting. The Value Extension creates new surfaces for Daemon interaction and raises interesting questions about the Daemon's own participation in value flows.

### V.10.1 Daemon and Lineage

#### Lineage Discovery

The Daemon can help users discover influences they might not have consciously tracked.

**Ambient Mode:**
```
◇ This artifact shares structural patterns with three pieces you read last month.
  Want to see them?
```

**Invoked Mode:**
```
User: "What influenced this piece?"

Daemon: "Based on your recent observations and reading history, I notice resonance with:
- [Artifact X] — similar framing of the problem
- [Artifact Y] — you viewed this repeatedly before drafting
- [External resource] — cited in your notes

Would you like to declare any of these as ancestors?"
```

The Daemon **suggests** lineage. The user **declares** it. The Daemon cannot add lineage links itself — that would violate the principle that you declare your own influences.

#### Descendant Awareness

The Daemon notices when the user's work is cited:

```
◇ Your artifact "On Attention" was cited by 2 new pieces this week.
  [View descendants]
```

This surfaces influence without the user having to check metrics.

#### AI-Assisted Artifacts and Lineage

When the Daemon helps draft an artifact, the provenance records `assistedBy: "daemon:user-123"`. But what about **lineage**?

**Design decision:** Daemon assistance is **not** lineage.

Rationale:
- Lineage is about influence *between artifacts*
- The Daemon is a tool, not an author with its own corpus
- If Daemon-assistance counted as lineage, every AI-assisted artifact would have the same "ancestor"
- That's not informative — it collapses meaningful provenance into noise

Instead:
- `provenance.assistedBy` tracks AI involvement (factual)
- `lineage.ancestors` tracks conceptual influences (semantic)
- These are orthogonal

**However:** If the Daemon surfaces a specific artifact during drafting and the user draws from it, that *is* a legitimate ancestor — the human-artifact influence, not the daemon-human mediation.

### V.10.2 Daemon and Commitments

#### Drafting Commitments

The Daemon can help craft commitments:

**Invoked Mode:**
```
User: "Help me make a commitment about writing"

Daemon: "Based on your recent writing patterns and variable history, here's a draft:

  Title: Daily Writing Practice
  Statement: Write at least 300 words daily for 14 days
  Target: writing_streak variable ≥ 14
  Deadline: [14 days from now]

  This is achievable based on your history — you've hit similar streaks 3 times
  in the past 6 months. Want to adjust the difficulty?"
```

The Daemon drafts, but **activation requires user action**. Commitment activation is a `medium` risk action precisely because it puts reputation on the line.

#### Commitment Tracking

The Daemon monitors active commitments:

**Ambient Mode (approaching deadline):**
```
◇ "Daily Writing Practice" — 2 days remaining, 11/14 days complete.
  You're on track.
```

**Ambient Mode (at risk):**
```
◇ "Daily Writing Practice" — missed yesterday.
  Current: 11/14. Need 3 consecutive days to fulfill.
  [Log today's writing] [Discuss options]
```

**Proactive Mode (pattern recognition):**
```
◇ I notice your commitments tend to break around day 10-12.
  Would a shorter initial commitment help build momentum?
```

#### Evidence Gathering

When resolving commitments, the Daemon helps assemble evidence:

```
User: "I think I fulfilled my writing commitment"

Daemon: "Let me check... Yes, I found 14 consecutive daily writing observations:
  [Jun 1] 450 words — artifact revision
  [Jun 2] 320 words — new draft
  ...
  [Jun 14] 580 words — published artifact

  Ready to mark as fulfilled? I'll attach these as evidence."
```

#### Can the Daemon Make Commitments?

**Interesting question.** The Daemon is an Agent-Node with its own identity. Could it have its own commitments?

**Option A: No (current design)**
- Commitments are about human accountability
- The Daemon serves the user, it doesn't have independent goals
- Daemon "commitments" would just be features/behaviors, not stakes

**Option B: Yes, subordinate commitments**
- The Daemon could commit *to the user*: "I commit to surfacing deadline reminders 24 hours in advance"
- These would be service-level commitments, not personal growth commitments
- Breaking them would affect the Daemon's reputation *with its sponsor*

**Recommendation:** Defer to v2. For now, the Daemon helps with user commitments but doesn't make its own.

### V.10.3 Daemon and Capacity

#### Does Daemon Activity Cost Capacity?

**Design decision:** Core Daemon functions do not cost user capacity.

Rationale:
- The Daemon is infrastructure, not a separate actor consuming resources
- Charging capacity for Daemon queries would discourage healthy use
- The Daemon's "work" is already constrained by its delegation (can't commit, can only draft)

**However:** If the Daemon proposes actions that the user approves, *those actions* cost capacity normally. The proposal is free; the execution isn't.

#### Capacity-Aware Daemon Behavior

The Daemon adjusts its behavior based on capacity state:

**Low capacity:**
```
◇ Capacity at 15%. I'll hold non-urgent suggestions until you regenerate.
  [Override — show me anyway]
```

**Capacity advice:**
```
User: "Should I claim that territory?"

Daemon: "That would cost 50 capacity. You have 35 currently, regenerating 5/hour.
  You could claim in ~3 hours, or I can remind you when you have enough."
```

**Pattern recognition:**
```
◇ You've been near capacity floor for 3 days.
  Your commitment load might be too high relative to your current rhythm.
  [Review active commitments]
```

### V.10.4 Daemon and Metabolic Health

The Daemon is the primary interpreter of metabolic metrics for the user.

#### Health Monitoring

**Ambient Mode (health shift):**
```
◇ Your metabolic state shifted from "active" to "quiet" this week.
  Observation inflow dropped 60%. This might be intentional rest or disengagement.
  [That's intentional] [Tell me more]
```

**Proactive Mode (warning):**
```
◇ Approaching "depleted" state:
  - 3 broken commitments this month
  - Outflow >> inflow (giving more than receiving)
  - Capacity frequently at floor

  I'd suggest a recovery episode. Want to draft one?
```

#### Health Interpretation

The Daemon translates metrics into meaning:

```
User: "How am I doing?"

Daemon: "Metabolically: 'active' trending toward 'thriving'

  Good signs:
  - Your writing lineage grew — 4 new descendants this month
  - 2/2 commitments fulfilled
  - Capacity utilization healthy (using it, not hoarding it)

  Watch:
  - Your observation diversity dropped — most input from 2 sources
  - Consider expanding your attention surface

  Overall: You're creating generatively and keeping promises.
  The system is working for you."
```

#### Recovery Facilitation

When health declines, the Daemon helps design interventions:

```
Daemon: "Based on your metabolic state, here's a recovery episode draft:

  Title: Consolidation Week
  Kind: regulatory
  Variables: [capacity → stabilize]

  Suggested actions:
  - Release or defer 2 active commitments (I identified candidates)
  - Reduce observation emission by 50%
  - Focus on receiving (reading, not writing)

  Duration: 7 days

  This isn't failure — it's maintenance. The system needs rest to grow.
  [Create episode] [Modify] [Not now]"
```

### V.10.5 Daemon Presence Levels and Value

The user's Daemon presence setting (Quiet / Attentive / Proactive) affects value integration:

| Level | Lineage | Commitments | Capacity | Health |
|-------|---------|-------------|----------|--------|
| **Quiet** | Only on request | Manual tracking | No advice | No monitoring |
| **Attentive** | Surfaces discoveries | Deadline reminders | Low-capacity notice | Shift notifications |
| **Proactive** | Pattern analysis | Risk warnings, drafts | Strategic advice | Intervention proposals |

### V.10.6 Daemon Value Provenance

When the Daemon helps with value-related tasks, provenance is tracked:

```ts
// Daemon-suggested lineage (user still declares)
{
  ancestors: [{
    artifactId: "art-123",
    relationship: "inspired_by",
    addedBy: "user-456",
    suggestedBy: "daemon:user-456",  // New field
    suggestionConfidence: 0.7
  }]
}

// Daemon-drafted commitment (user activates)
{
  id: "commit-789",
  // ...
  provenance: {
    draftedBy: "daemon:user-456",
    activatedBy: "user-456"
  }
}
```

This maintains the principle: **Daemon suggests, user decides, provenance records both.**

### V.10.7 Daemon Invariants (Value Extension)

Extending §7.1.7 from the main spec:

- Daemon CANNOT declare lineage on behalf of the user
- Daemon CANNOT activate, resolve, or attest commitments autonomously
- Daemon CANNOT spend user capacity (proposals are free, approved actions cost normally)
- Daemon CAN read all value metrics (lineage, commitments, capacity, health)
- Daemon CAN draft commitments, suggest lineage, propose recovery episodes
- All Daemon value suggestions carry provenance and confidence scores

### V.10.8 Example: Full Daemon Value Interaction

**Scene:** User has been pushing hard, metabolic health declining.

```
[Tuesday morning]

◇ Good morning. Quick health check:
  - Capacity: 20/100 (recovering from yesterday's territory claim)
  - Active commitments: 4 (2 due this week)
  - Metabolic state: "active" but trending toward "stagnant"
  - Your last 3 artifacts have no descendants yet

  [Dismiss] [Tell me more]

User: "Tell me more"

Daemon: "The pattern I see:

  You're producing (4 artifacts this month) but not connecting:
  - No lineage declared on recent work
  - No new observation sources
  - Descendants down 50% from last month

  This isn't about quantity — it's about flow. You're emitting
  but not receiving or connecting.

  Suggestions:
  1. Spend time with others' work. I can surface artifacts from
     nodes you follow that might resonate.
  2. Revisit your recent pieces and consider their influences.
     Declaring lineage often sparks new thinking.
  3. One commitment due Friday looks tight given your capacity
     trajectory. Want to review it?"

User: "Show me those artifacts"

Daemon: [Surfaces 5 recent artifacts from followed nodes,
         noting potential resonance with user's recent work]

User: [Reads one, starts a response artifact]

Daemon: (Ambient, while drafting)
◇ This feels like it responds to [Artifact X].
  Want to declare that relationship?

User: "Yes, responds_to"

[Lineage link added, Daemon-suggested, user-declared]

User: [Finishes draft, publishes]

Daemon: "Nice. That's your first 'responds_to' link in 3 weeks.
  Capacity cost: 5 (publish). Current: 18.

  Re: Friday's commitment — you have 72 hours and need to
  complete 2 more items. Achievable but tight.
  Want me to remind you Thursday morning?"

User: "Yes"

Daemon: [Sets internal reminder, no canon change needed]

[Friday morning]

◇ Commitment "Complete Q2 review" due today.
  Status: 1/3 items done.

  Based on yesterday's activity, this looks at risk.
  Options:
  - Push through (you have capacity: 45)
  - Request release from witness (if applicable)
  - Let it break and own it honestly

  What would you like to do?

User: "I'll push through"

Daemon: "Okay. I'll stay quiet and let you focus.
  Ping me if you need help gathering evidence for resolution."

[Friday evening]

User: "Done. Mark it fulfilled."

Daemon: "Confirming completion of 'Complete Q2 review':
  - Item 1: Completed Jun 10 [observation link]
  - Item 2: Completed Jun 12 [observation link]
  - Item 3: Completed today [observation link]

  Evidence attached. This was witnessed by [Node X].
  [Send for witness confirmation] [Resolve without confirmation]"

User: "Send for confirmation"

[Resolution recorded, witness notified, fulfillment rate updated]

Daemon: "Done. Your fulfillment streak is now 5.
  You've got a capacity boost coming from that.

  Metabolic check: trending back toward 'active'.
  The responds_to link helped. Keep connecting."
```

---

## V.11) Philosophical Notes

### V.11.1 Why This Isn't Gamification

Gamification adds points to motivate behavior. This system makes existing value flows **legible**, not artificial.

- Lineage already exists (ideas influence ideas) — we're making it visible
- Reputation already exists (track records matter) — we're making it inspectable
- Capacity already exists (you can't do infinite things) — we're making it explicit

The Daemon doesn't reward you for good behavior. It helps you see what's already true.

### V.11.2 Why the Daemon Doesn't Optimize

The Daemon could theoretically "optimize" your metrics — suggest commitments you'll definitely keep, find easy influence wins, manage capacity for maximum throughput.

But that would corrupt the system.

The Daemon's role is **clarity**, not optimization:
- "Here's what I see"
- "Here are your options"
- "Here's what might happen"

The user decides what matters. The Daemon illuminates; it doesn't steer.

### V.11.3 The Gift Economy Undertone

Notice what's not here:
- No exchange rates
- No accumulation goals
- No scarcity to exploit

What emerges instead:
- Lineage as citation (giving credit)
- Commitments as promises (giving your word)
- Descendants as influence (receiving response)
- Capacity as rhythm (giving and taking rest)

This is closer to a **gift economy** than a market economy. Value flows through generosity and reciprocity, not transaction and accumulation.

The Daemon is not your accountant. It's more like a friend who helps you notice the gifts you're giving and receiving.

---

*End of Value Extension*
