# Advanced Integration — Omnilith Protocol

> **Status:** Draft extension. Builds on Spatial, Value, and Spatial-Value Integration extensions.
>
> This document covers:
> - **Part A:** Packs in spatial/value context
> - **Part B:** Governance (realm administration, disputes, collective authority)
> - **Part C:** Map visualization (rendering the inhabited landscape)

---

# Part A: Spatial Packs

Packs (§14 of main spec) are portable bundles of capability. When combined with spatial and value semantics, Packs gain new dimensions: they can be **place-bound**, **terrain-specific**, **locally acquired**, and **reputation-gated**.

---

## A.1) Pack Spatial Binding

### A.1.1 Binding Types

Packs can have spatial constraints:

```ts
export type SpatialPack = Pack & {
  spatial?: {
    // Where this pack can be installed
    installationScope: "global" | "realm" | "territorial" | "terrain";

    // For realm scope
    allowedRealms?: string[];

    // For territorial scope
    allowedTerritories?: string[];

    // For terrain scope
    allowedTerrains?: string[];

    // Where pack features activate
    activationScope: "everywhere" | "home_territory" | "installed_location" | "terrain_match";

    // Origin requirements
    mustAcquireAt?: {
      realmId?: string;
      territoryId?: string;
      terrain?: string;
    };
  };
};
```

### A.1.2 Scope Semantics

**Installation Scope** — where you can install the pack:

| Scope | Meaning |
|-------|---------|
| `global` | Install anywhere, no restrictions |
| `realm` | Can only install while in specified realms |
| `territorial` | Can only install while in your own territory |
| `terrain` | Can only install while in matching terrain |

**Activation Scope** — where pack features work:

| Scope | Meaning |
|-------|---------|
| `everywhere` | Pack works regardless of location |
| `home_territory` | Pack only works in your own territories |
| `installed_location` | Pack only works where you installed it |
| `terrain_match` | Pack works in any terrain of the specified type |

### A.1.3 Examples

**Global Pack (standard):**
```json
{
  "id": "sleep-regulation",
  "spatial": {
    "installationScope": "global",
    "activationScope": "everywhere"
  }
}
```
Works anywhere, no restrictions.

**Sanctuary Pack:**
```json
{
  "id": "deep-rest",
  "name": "Deep Rest Protocol",
  "spatial": {
    "installationScope": "terrain",
    "allowedTerrains": ["sanctuary"],
    "activationScope": "terrain_match"
  }
}
```
Can only install while in a sanctuary. Only activates in sanctuary terrain. Provides enhanced regeneration policies that only make sense in quiet spaces.

**Local Craft Pack:**
```json
{
  "id": "garden-cultivation",
  "name": "Garden Cultivation",
  "spatial": {
    "installationScope": "territorial",
    "activationScope": "home_territory",
    "mustAcquireAt": {
      "terrain": "garden"
    }
  }
}
```
Must be acquired while in a garden. Can only install in your own territory. Only works at home. Represents local knowledge that doesn't travel.

---

## A.2) Pack Acquisition

### A.2.1 Acquisition Model

Packs can be acquired through various means:

```ts
export type PackAcquisition = {
  packId: string;
  nodeId: string;
  acquiredAt: string;

  method: PackAcquisitionMethod;
  location?: {
    realmId: string;
    territoryId?: string;
    coordinates: Coordinates;
  };

  // For transfers
  transferredFrom?: string;

  // For earned packs
  earnedThrough?: {
    commitmentId?: string;
    episodeId?: string;
    achievementId?: string;
  };
};

export type PackAcquisitionMethod =
  | "genesis"           // Available from the start
  | "discovered"        // Found in a location
  | "earned"            // Unlocked through achievement
  | "transferred"       // Received from another node
  | "crafted"           // Assembled from components
  | "granted";          // Given by realm governor or authority
```

### A.2.2 Discovery

Packs can be **discoverable** at specific locations:

```ts
export type DiscoverablePack = {
  packId: string;

  // Where it can be found
  discoveryLocations: Array<{
    realmId: string;
    territoryId?: string;
    coordinates?: Coordinates;
    terrain?: string;
    radius?: number;
  }>;

  // Discovery conditions
  discoveryRequirements?: {
    minReputation?: number;        // Local reputation required
    minCommitments?: number;       // Commitments fulfilled in area
    prerequisitePacks?: string[];  // Must have these packs first
    witnessRequired?: boolean;     // Must be witnessed discovering
  };

  // Scarcity (optional)
  maxDiscoveries?: number;         // Total that can exist
  discoveryRate?: number;          // How often it respawns
};
```

**The Daemon helps with discovery:**
```
◇ I sense something in this territory...

  There's a discoverable pack nearby: "Archival Methods"
  Requirements:
  - Local reputation: 60% (you have 72%) ✓
  - 3 commitments fulfilled here (you have 4) ✓

  [Discover pack] [What does it do?]
```

### A.2.3 Pack Transfer

Packs can be transferred between nodes (if the pack allows it):

```ts
export type PackTransferability = {
  transferable: boolean;
  transferConditions?: {
    mustBeInSameTerritory?: boolean;
    mustBeNeighbors?: boolean;
    requiresWitness?: boolean;
    cooldownDays?: number;          // Days before can transfer again
  };
};

export type TransferPackAction = {
  type: "pack:transfer";
  riskLevel: "medium";
  params: {
    packId: string;
    toNodeId: string;
    consideration?: string;         // What's exchanged (audit only)
  };
};
```

**Not all packs transfer.** Some knowledge is personal and doesn't travel. The Daemon might note:
```
◇ "Deep Rest Protocol" cannot be transferred — it's bound to the sanctuary where you learned it.
   But you could guide [Node X] to discover their own.
```

---

## A.3) Terrain-Specific Packs

### A.3.1 Terrain Pack Library

Each terrain type might have associated packs:

| Terrain | Example Packs |
|---------|---------------|
| Plaza | "Public Speaking", "Crowd Reading", "Market Sense" |
| Garden | "Cultivation", "Patient Growth", "Seasonal Rhythms" |
| Sanctuary | "Deep Rest", "Contemplation", "Shielding" |
| Archive | "Research Methods", "Citation Practice", "Deep Reading" |
| Workshop | "Iteration", "Rapid Prototyping", "Focused Craft" |
| Wilderness | "Pathfinding", "Survival", "Pioneer Spirit" |
| Bridge | "Mediation", "Translation", "Connection" |

### A.3.2 Terrain Pack Interactions

Packs can enhance or require terrain effects:

```ts
export type TerrainPackInteraction = {
  packId: string;

  // Terrain bonuses
  terrainBonuses?: Record<string, {
    capacityBonus?: number;
    regenBonus?: number;
    effectAmplification?: number;   // 1.5 = 50% stronger effects
  }>;

  // Terrain requirements
  terrainRequirements?: {
    required?: string[];            // Must be in one of these
    forbidden?: string[];           // Cannot be in these
  };
};
```

**Example — "Deep Reading" pack:**
```json
{
  "id": "deep-reading",
  "terrainBonuses": {
    "archive": { "effectAmplification": 1.5 },
    "sanctuary": { "effectAmplification": 1.2 }
  },
  "terrainRequirements": {
    "forbidden": ["plaza", "wilderness"]
  }
}
```
Deep reading works best in archives, okay in sanctuaries, and not at all in busy or wild places.

---

## A.4) Pack Reputation Requirements

### A.4.1 Reputation-Gated Packs

Some packs require reputation to install or use:

```ts
export type PackReputationRequirements = {
  // Global reputation
  globalMinFulfillment?: number;

  // Local reputation (where installing)
  localMinFulfillment?: number;
  localMinCommitments?: number;
  localMinWitnesses?: number;

  // Specific reputation
  terrainReputation?: {
    terrain: string;
    minFulfillment: number;
  };

  // Lineage requirements
  lineageRequirements?: {
    minDescendants?: number;        // Your work must have influenced N others
    minAncestors?: number;          // You must have cited N others
    minCrossNodeLineage?: number;   // Lineage spanning N different nodes
  };
};
```

**Example — "Elder's Wisdom" pack:**
```json
{
  "id": "elders-wisdom",
  "reputationRequirements": {
    "globalMinFulfillment": 0.8,
    "lineageRequirements": {
      "minDescendants": 20,
      "minCrossNodeLineage": 10
    }
  }
}
```
Only available to nodes with proven track record and demonstrated influence.

---

## A.5) Pack Ecosystems

### A.5.1 Pack Dependencies

Packs can require other packs:

```ts
export type PackDependencies = {
  requires?: string[];              // Must have these installed
  conflicts?: string[];             // Cannot have these installed
  enhances?: string[];              // Works better with these
  supersedes?: string[];            // Replaces these (auto-uninstall)
};
```

### A.5.2 Regional Pack Culture

Different regions might develop distinct pack ecosystems:

```ts
export type RegionalPackCulture = {
  realmId: string;
  region?: {                        // Sub-realm area
    center: Coordinates;
    radius: number;
  };

  // Common packs in this region
  prevalentPacks: Array<{
    packId: string;
    adoptionRate: number;           // % of local nodes with this pack
  }>;

  // Packs originated here
  originatedPacks: string[];

  // Cultural notes
  packPhilosophy?: string;          // How this region thinks about packs
};
```

**The Daemon might note regional pack culture:**
```
◇ You're entering the Archive District.

  Common packs here:
  - "Citation Practice" (87% of residents)
  - "Deep Reading" (72%)
  - "Research Methods" (65%)

  You have "Citation Practice" ✓
  Consider acquiring "Deep Reading" while here — this is where it's discovered.
```

---

# Part B: Governance

How realms are administered, disputes resolved, and collective authority exercised.

---

## B.1) Realm Governance

### B.1.1 Governance Models

Realms can have different governance structures:

```ts
export type RealmGovernance = {
  realmId: string;

  model: GovernanceModel;

  // For governor model
  governor?: {
    nodeId: string;
    grantedAt: string;
    grantedBy: string;              // "genesis" or predecessor nodeId
    term?: {
      expiresAt?: string;
      renewable: boolean;
    };
  };

  // For council model
  council?: {
    members: CouncilMember[];
    quorum: number;                 // Minimum members for valid decision
    votingThreshold: number;        // % needed to pass (0.5 = majority)
  };

  // For constitutional model
  constitution?: {
    artifactId: string;             // The constitutional document
    amendmentProcess: AmendmentProcess;
  };

  // For emergent model
  emergent?: {
    consensusMechanism: string;     // How decisions emerge
    participationThreshold: number;
  };
};

export type GovernanceModel =
  | "founder"          // Single founder with full authority
  | "governor"         // Appointed/elected governor with defined powers
  | "council"          // Multi-member council
  | "constitutional"   // Rules-based with amendment process
  | "emergent"         // Decisions emerge from participation
  | "anarchic";        // No formal governance (wilderness default)

export type CouncilMember = {
  nodeId: string;
  role: "chair" | "member" | "observer";
  joinedAt: string;
  votingWeight?: number;            // Default 1
};
```

### B.1.2 Governor Powers

Governors have defined powers, not absolute authority:

```ts
export type GovernorPowers = {
  // Territory management
  canAssignUnclaimed: boolean;      // Grant unclaimed territory
  canReclaimAbandoned: boolean;     // Reclaim abandoned territories
  canForciblyReclaim: boolean;      // Reclaim occupied territory (rare!)

  // Pack management
  canApproveRegionalPacks: boolean;
  canBanPacks: boolean;

  // Policy
  canSetRealmPolicies: boolean;
  canOverrideNodePolicies: boolean; // Almost always false

  // Disputes
  canArbitrateDisputes: boolean;
  arbitrationBinding: boolean;

  // Membership
  canDenyEntry: boolean;            // Prevent nodes from entering realm
  canExpel: boolean;                // Remove nodes from realm

  // Limits
  powerLimits?: {
    maxTerritoryControl: number;    // % of realm governor can directly control
    cannotAffect?: string[];        // Node IDs with immunity
    requiresWitness?: string[];     // Actions requiring witness
  };
};
```

**Principle:** Governors administer, they don't rule. Node sovereignty within territories is preserved. Governor power over *occupied* territory is severely limited.

### B.1.3 Constitutional Governance

For mature realms, a constitution provides stability:

```ts
export type RealmConstitution = {
  artifactId: string;               // The constitution is an artifact

  // Core principles (cannot be amended)
  inviolableRights: string[];

  // Governance structure
  governanceStructure: {
    model: GovernanceModel;
    transitionRules?: string;       // How governance can change
  };

  // Amendment process
  amendments: {
    proposalRequirements: {
      minReputation?: number;
      minTenure?: number;           // Days in realm
      sponsorsRequired?: number;
    };
    votingPeriod: number;           // Days
    threshold: number;              // % to pass
    cooldown: number;               // Days before another amendment
  };

  // Historical
  ratifiedAt: string;
  ratifiedBy: string[];             // Founding nodes
  amendmentHistory: Amendment[];
};

export type Amendment = {
  id: string;
  proposedBy: string;
  proposedAt: string;
  description: string;
  votingRecord: {
    for: string[];
    against: string[];
    abstain: string[];
  };
  passed: boolean;
  effectiveAt?: string;
};
```

---

## B.2) Territorial Disputes

### B.2.1 Dispute Types

```ts
export type TerritorialDispute = {
  id: string;
  realmId: string;

  type: DisputeType;
  status: "open" | "arbitrating" | "resolved" | "abandoned";

  // Parties
  claimant: string;                 // Node making claim
  respondent?: string;              // Node being challenged (if any)

  // Subject
  territory?: {
    territoryId?: string;           // Existing territory
    proposedClaim?: TerritoryShape; // For boundary disputes
    coordinates?: Coordinates;
  };

  // Process
  filedAt: string;
  evidence: DisputeEvidence[];
  arbitrator?: string;              // Node or "council" or "governor"

  // Resolution
  resolution?: DisputeResolution;
};

export type DisputeType =
  | "boundary"          // Where does my territory end and yours begin?
  | "abandonment"       // Is this territory abandoned? Can I claim it?
  | "encroachment"      // You built into my space
  | "historical_claim"  // I was here first / have historical right
  | "succession"        // Who inherits this territory?
  | "nuisance";         // Your activity harms my territory

export type DisputeEvidence = {
  submittedBy: string;
  submittedAt: string;
  type: "observation" | "artifact" | "commitment" | "witness_statement" | "lineage";
  referenceId: string;
  note?: string;
};

export type DisputeResolution = {
  resolvedAt: string;
  resolvedBy: string;
  method: "agreement" | "arbitration" | "default" | "withdrawal";
  outcome: {
    description: string;
    territoryChanges?: TerritoryChange[];
    compensations?: Compensation[];
    futureObligations?: string[];
  };
  appealable: boolean;
  appealDeadline?: string;
};
```

### B.2.2 Abandonment Claims

Abandoned territory can be reclaimed:

```ts
export type AbandonmentCriteria = {
  realmId: string;

  // Inactivity threshold
  inactivityDays: number;           // Days without observation in territory

  // Metabolic threshold
  metabolicThreshold: "dormant" | "abandoned";

  // Grace period
  gracePeriod: number;              // Days to respond to abandonment notice

  // Claim process
  claimProcess: {
    noticePeriod: number;           // Days notice before claim finalizes
    contestable: boolean;
    contestPeriod?: number;
  };
};
```

**Abandonment flow:**
1. Node A notices Node B's territory has been inactive
2. Node A files abandonment claim with evidence
3. System sends notice to Node B (if reachable)
4. Grace period: Node B can contest by showing activity or intent
5. If uncontested, territory becomes claimable
6. Node A (or others) can claim via normal homestead process

**The Daemon facilitates:**
```
◇ The territory to your east has been dormant for 45 days.

  Realm abandonment threshold: 60 days
  In 15 days, you could file an abandonment claim.

  Alternatively, you could reach out to [Node X] —
  they might be going through something.

  [Set reminder] [View their last activity]
```

### B.2.3 Boundary Disputes

When territories conflict:

```ts
export type BoundaryDispute = TerritorialDispute & {
  type: "boundary";

  boundaryDetails: {
    contestedArea: TerritoryShape;
    claimantBasis: string;          // Why they claim this area
    respondentBasis?: string;       // Why they claim this area

    // Historical evidence
    originalClaims: Array<{
      nodeId: string;
      claimedAt: string;
      shape: TerritoryShape;
    }>;
  };
};
```

**Resolution methods:**
1. **Direct negotiation:** Parties agree on boundary
2. **Mediation:** Third party facilitates agreement
3. **Arbitration:** Governor or council decides (if binding arbitration enabled)
4. **Split:** Contested area divided
5. **Buffer:** Contested area becomes neutral/unclaimed

### B.2.4 Dispute Arbitration

```ts
export type ArbitrationProcess = {
  disputeId: string;

  arbitrator: {
    nodeId: string;
    role: "governor" | "council" | "appointed" | "random_eligible";
    acceptedAt: string;
  };

  // Process
  phases: Array<{
    name: "submission" | "response" | "evidence" | "deliberation" | "ruling";
    deadline: string;
    completed: boolean;
  }>;

  // Hearing (optional)
  hearing?: {
    scheduledAt: string;
    location?: Coordinates;          // Spatial meeting point
    attendees: string[];
    transcript?: string;             // Artifact ID of transcript
  };

  // Ruling
  ruling?: {
    issuedAt: string;
    decision: string;
    reasoning: string;               // Artifact ID of full reasoning
    binding: boolean;
    enforcementMechanism?: string;
  };
};
```

---

## B.3) Collective Authority

### B.3.1 Councils

Multi-node governance bodies:

```ts
export type Council = {
  id: string;
  realmId: string;
  name: string;

  // Membership
  members: CouncilMember[];
  membershipCriteria?: {
    minReputation?: number;
    minTenure?: number;
    minTerritorySize?: number;
    electionRequired?: boolean;
  };

  // Seats
  seats: {
    total: number;
    filled: number;
    vacancies: number;
    termLength?: number;            // Days
  };

  // Powers
  powers: CouncilPowers;

  // Process
  meetingSchedule?: string;         // e.g., "weekly", "monthly", "as_needed"
  votingRules: VotingRules;
};

export type CouncilPowers = {
  canAmendConstitution: boolean;
  canAppointGovernor: boolean;
  canArbitrateDisputes: boolean;
  canSetRealmPolicies: boolean;
  canAdmitMembers: boolean;
  canExpelMembers: boolean;
  canCreateSubCouncils: boolean;
};

export type VotingRules = {
  quorum: number;                   // Minimum participation
  threshold: number;                // % to pass (0.5, 0.67, etc.)
  votingPeriod: number;             // Hours or days
  tieBreaker?: "chair" | "status_quo" | "random";
  proxyAllowed: boolean;
  abstentionCounts: boolean;        // Abstain affects quorum?
};
```

### B.3.2 Proposals

Council actions require proposals:

```ts
export type Proposal = {
  id: string;
  councilId: string;

  // Content
  title: string;
  description: string;              // Or artifact ID for long proposals
  proposedBy: string;
  sponsors: string[];               // Co-sponsors

  // Type
  type: "policy" | "appointment" | "expulsion" | "amendment" | "dispute_resolution" | "other";

  // Timeline
  submittedAt: string;
  discussionEnds: string;
  votingEnds: string;

  // Voting
  votes: {
    for: VoteRecord[];
    against: VoteRecord[];
    abstain: VoteRecord[];
  };

  // Outcome
  status: "draft" | "discussion" | "voting" | "passed" | "failed" | "withdrawn";
  outcome?: {
    passed: boolean;
    finalTally: { for: number; against: number; abstain: number };
    effectiveAt: string;
  };
};

export type VoteRecord = {
  nodeId: string;
  votedAt: string;
  weight: number;
  note?: string;                    // Public explanation of vote
  proxy?: string;                   // If voted by proxy
};
```

### B.3.3 Elections

For positions requiring election:

```ts
export type Election = {
  id: string;
  councilId?: string;
  realmId: string;

  // Position
  position: string;                 // e.g., "Governor", "Council Seat 3"
  term: {
    starts: string;
    ends: string;
  };

  // Candidates
  candidates: Array<{
    nodeId: string;
    nominatedBy: string;
    nominatedAt: string;
    acceptedNomination: boolean;
    platform?: string;              // Artifact ID
  }>;

  // Eligibility
  voterEligibility: {
    minTenure?: number;
    minReputation?: number;
    mustHaveTerritory?: boolean;
  };

  // Timeline
  nominationOpens: string;
  nominationCloses: string;
  votingOpens: string;
  votingCloses: string;

  // Method
  votingMethod: "plurality" | "majority" | "ranked_choice" | "approval";

  // Results
  results?: {
    winner: string;
    tally: Record<string, number>;
    turnout: number;                // % of eligible who voted
    certifiedBy: string;
    certifiedAt: string;
  };
};
```

---

## B.4) Realm Policies

### B.4.1 Realm-Level Policies

Governance can set policies that apply realm-wide:

```ts
export type RealmPolicy = {
  id: string;
  realmId: string;

  // Scope
  scope: "realm_wide" | "unclaimed_only" | "public_spaces" | "borders";

  // Policy content
  policy: {
    // Movement
    entryRequirements?: {
      minReputation?: number;
      sponsorRequired?: boolean;
      applicationProcess?: boolean;
    };

    // Territory
    claimLimits?: {
      maxTerritoriesPerNode?: number;
      maxTotalArea?: number;
      minTimeBetweenClaims?: number;
    };

    // Behavior
    behaviorRules?: Array<{
      rule: string;
      enforcement: "warning" | "penalty" | "expulsion";
    }>;

    // Commitments
    commitmentRules?: {
      publicCommitmentsRequired?: boolean;
      minWitnessesForPublic?: number;
    };
  };

  // Metadata
  enactedAt: string;
  enactedBy: string;                // Node, council, or governor
  expiresAt?: string;
};
```

### B.4.2 Policy Enforcement

How realm policies are enforced:

```ts
export type PolicyEnforcement = {
  policyId: string;

  // Monitoring
  monitoring: "automated" | "reported" | "audited";

  // Violations
  violationProcess: {
    noticePeriod?: number;          // Days warning before penalty
    appealable: boolean;
    appealTo?: string;              // "governor", "council", etc.
  };

  // Penalties
  penalties: Array<{
    severity: "minor" | "moderate" | "severe";
    action: "warning" | "capacity_penalty" | "territory_restriction" | "expulsion";
    duration?: number;              // Days for temporary penalties
  }>;
};
```

**Principle:** Enforcement is transparent. Violations are logged. Penalties can be appealed. Expulsion is rare and requires due process.

---

## B.5) Succession and Inheritance

### B.5.1 Territory Succession

What happens when a node leaves or becomes inactive:

```ts
export type SuccessionPlan = {
  nodeId: string;

  // Designated successors
  successors: Array<{
    nodeId: string;
    priority: number;               // 1 = first choice
    scope: "all" | "specific";
    territories?: string[];         // If specific
    acceptedAt?: string;            // Successor must accept designation
  }>;

  // Fallback
  fallback: "abandon" | "realm_reclaim" | "auction" | "neighbor_priority";

  // Conditions
  triggerConditions: {
    inactivityDays?: number;
    explicitDeparture?: boolean;
  };

  // Lineage preservation
  lineageHandling: "preserve" | "transfer_to_successor" | "archive";
};
```

### B.5.2 Node Departure

When a node leaves a realm:

```ts
export type DepartureProcess = {
  nodeId: string;
  realmId: string;

  type: "voluntary" | "expulsion" | "abandonment";

  // Territorial disposition
  territories: Array<{
    territoryId: string;
    disposition: "released" | "transferred" | "retained_remote";
    transferTo?: string;
  }>;

  // Artifact handling
  artifacts: "remain_in_place" | "relocate_with_node" | "archive";

  // Commitment handling
  activeCommitments: Array<{
    commitmentId: string;
    handling: "release" | "transfer" | "break";
  }>;

  // Notice
  noticePeriod: number;
  effectiveAt: string;
};
```

---

# Part C: Map Visualization

How the inhabited landscape is rendered — making space, value, and governance visible.

---

## C.1) Visualization Philosophy

### C.1.1 Core Principles

**The map is alive.** Not a static diagram but a breathing representation of system state. Activity pulses. Health glows. Dormancy dims.

**Layers reveal meaning.** The base map shows geography. Overlays show lineage, reputation, commitments, metabolism. Users toggle what they see.

**The Daemon inhabits the map.** Its presence is felt spatially — suggestions appear in context, not in sidebars.

**Projection Law applies.** The map visualizes canon; it introduces no new state. What you see is derivable from what exists.

### C.1.2 Visual Language

Building on §16.2 of main spec (Alive & Alien aesthetic):

| Element | Representation |
|---------|----------------|
| Territory | Soft-bordered region, terrain-colored |
| Node presence | Pulsing glyph at home territory |
| Lineage | Luminous threads between artifacts |
| Reputation | Heat gradient (warm = trusted, cool = unknown) |
| Commitment | Tethering line to location (if place-bound) |
| Capacity | Personal aura size/brightness |
| Metabolism | Ambient particle flow (in/out) |
| Governance | Subtle boundary styling for realm/district |

---

## C.2) Base Layer: Geography

### C.2.1 Realm Rendering

```ts
export type RealmVisualization = {
  realmId: string;

  // Bounds
  bounds: {
    min: Coordinates;
    max: Coordinates;
  };

  // Background
  background: {
    type: "void" | "gradient" | "texture" | "procedural";
    parameters: unknown;
  };

  // Grid (optional)
  grid?: {
    visible: boolean;
    spacing: number;
    style: "lines" | "dots" | "subtle";
  };

  // Atmosphere
  atmosphere?: {
    ambientColor: string;
    fogDistance?: number;
    particleDensity?: number;
  };
};
```

### C.2.2 Territory Rendering

```ts
export type TerritoryVisualization = {
  territoryId: string;

  // Shape rendering
  boundary: {
    style: "solid" | "dashed" | "glow" | "organic";
    color: string;                  // Derived from terrain or owner
    opacity: number;
    pulseRate?: number;             // For active territories
  };

  // Fill
  fill: {
    color: string;
    opacity: number;
    pattern?: "none" | "hatch" | "dots" | "terrain_texture";
  };

  // Terrain indicator
  terrainMarker?: {
    icon: string;
    position: "center" | "corner";
    size: number;
  };

  // Owner indicator
  ownerMarker?: {
    visible: boolean;
    position: Coordinates;
    style: "glyph" | "avatar" | "initials";
  };

  // Metabolism indicator
  metabolismIndicator?: {
    health: TerritoryMetabolism["health"];
    particleFlow: "inward" | "outward" | "balanced" | "still";
    luminosity: number;             // 0-1, brighter = more active
  };
};
```

### C.2.3 Terrain Styling

Each terrain has a visual signature:

```ts
export type TerrainStyle = {
  terrain: string;

  // Colors
  baseColor: string;
  accentColor: string;
  glowColor?: string;

  // Texture
  texture?: {
    pattern: string;
    scale: number;
    opacity: number;
  };

  // Ambient effects
  ambientEffects?: {
    particles?: ParticleConfig;
    glow?: GlowConfig;
    animation?: AnimationConfig;
  };
};

// Example terrain styles
const TERRAIN_STYLES: Record<string, TerrainStyle> = {
  plaza: {
    baseColor: "rgba(251, 191, 36, 0.1)",    // Warm amber
    accentColor: "rgba(251, 191, 36, 0.6)",
    glowColor: "rgba(251, 191, 36, 0.3)",
    ambientEffects: {
      particles: { type: "crowd", density: "high" }
    }
  },
  garden: {
    baseColor: "rgba(45, 212, 191, 0.1)",     // Teal
    accentColor: "rgba(45, 212, 191, 0.5)",
    texture: { pattern: "organic", scale: 0.5, opacity: 0.2 }
  },
  sanctuary: {
    baseColor: "rgba(139, 92, 246, 0.1)",     // Soft purple
    accentColor: "rgba(139, 92, 246, 0.4)",
    ambientEffects: {
      glow: { intensity: 0.3, pulse: "slow" }
    }
  },
  archive: {
    baseColor: "rgba(148, 163, 184, 0.1)",    // Cool gray
    accentColor: "rgba(148, 163, 184, 0.5)",
    texture: { pattern: "grid", scale: 0.3, opacity: 0.15 }
  },
  wilderness: {
    baseColor: "rgba(30, 30, 30, 0.3)",       // Dark
    accentColor: "rgba(100, 100, 100, 0.4)",
    ambientEffects: {
      particles: { type: "drift", density: "sparse" }
    }
  }
};
```

---

## C.3) Value Layers

### C.3.1 Lineage Visualization

```ts
export type LineageLayer = {
  enabled: boolean;

  // Thread rendering
  threads: {
    style: "straight" | "curved" | "organic";
    baseWidth: number;
    widthByWeight: boolean;         // Thicker = stronger influence
    color: {
      mode: "relationship" | "age" | "owner";
      palette: string[];
    };
    opacity: number;
    glow: boolean;
    pulseOnRecent: boolean;
    pulseDuration: number;          // Days to pulse after new link
  };

  // Filtering
  filters: {
    minWeight?: number;
    relationships?: LineageRelationship[];
    maxAge?: number;                // Days
    involvingNodes?: string[];
  };

  // Clustering
  schoolVisualization?: {
    enabled: boolean;
    minSize: number;                // Min artifacts to show school
    style: "hull" | "glow" | "density";
  };
};
```

**Lineage threads in practice:**
- Faint silver threads connect artifacts across the landscape
- Hover on an artifact: its ancestor threads brighten, descendants glow
- Schools appear as dense clusters of interconnected threads
- Recent links pulse gently, older ones are steady
- Long threads crossing the realm show ideas traveling far

### C.3.2 Reputation Visualization

```ts
export type ReputationLayer = {
  enabled: boolean;
  subjectNode: string;              // Whose reputation to show

  // Heatmap
  heatmap: {
    style: "continuous" | "territorial" | "points";
    colorScale: {
      low: string;                  // Unknown/untrusted
      mid: string;                  // Neutral
      high: string;                 // Trusted
    };
    opacity: number;
  };

  // Trust centers
  trustCenters: {
    showMarkers: boolean;
    markerStyle: "glow" | "ring" | "icon";
  };

  // Reputation frontier
  frontier: {
    show: boolean;                  // Areas with potential
    style: "dashed" | "gradient";
  };
};
```

**Reputation heatmap in practice:**
- Warm glow in areas where you're trusted
- Cool tones in unknown territory
- Your home territory blazes bright
- Areas you've never visited are dim neutral
- The frontier (where you have some activity but not yet reputation) shimmers

### C.3.3 Commitment Visualization

```ts
export type CommitmentLayer = {
  enabled: boolean;
  scope: "own" | "witnessed" | "local" | "all_visible";

  // Commitment markers
  markers: {
    style: "tether" | "beacon" | "ring";
    colorByStatus: {
      active: string;
      approaching_deadline: string;
      at_risk: string;
      fulfilled: string;
      broken: string;
    };
    sizeByStakes: boolean;          // Bigger = higher stakes
  };

  // Place-bound visualization
  placeBound: {
    showBoundary: boolean;          // Show territorial/local scope
    tether: boolean;                // Line from commitment to location
    tetherstyle: "solid" | "dashed" | "pulse";
  };

  // Witness visualization
  witnesses: {
    showConnections: boolean;       // Lines to witnesses
    connectionStyle: "subtle" | "prominent";
  };
};
```

**Commitments on the map:**
- Active commitments appear as glowing markers at their bound location
- Tethers connect you to place-bound commitments when you travel away
- Witness connections show the accountability network
- Approaching deadlines pulse amber; at-risk pulses red
- Fulfilled commitments leave a fading afterglow

### C.3.4 Capacity/Metabolism Visualization

```ts
export type MetabolismLayer = {
  enabled: boolean;

  // Personal aura
  personalAura: {
    show: boolean;
    sizeByCapacity: boolean;        // Bigger = more capacity
    colorByHealth: boolean;         // Color shifts with metabolic health
    breathingAnimation: boolean;
  };

  // Flow particles
  flowParticles: {
    show: boolean;
    inflow: {
      color: string;
      direction: "toward_center";
    };
    outflow: {
      color: string;
      direction: "from_center";
    };
    balanceIndicator: boolean;      // Show net flow direction
  };

  // Territory metabolism
  territoryMetabolism: {
    show: boolean;
    style: "ambient" | "explicit";
    healthIndicator: boolean;
  };
};
```

**Metabolism on the map:**
- Your presence has an aura — larger when capacity is full, smaller when depleted
- Particles flow toward you (attention received) and away (attention given)
- Thriving territories have visible energy; dormant ones are still
- Moving through the landscape, you can *see* the metabolic differences

---

## C.4) Governance Layers

### C.4.1 Governance Visualization

```ts
export type GovernanceLayer = {
  enabled: boolean;

  // Realm boundaries
  realmBoundaries: {
    show: boolean;
    style: "line" | "gradient" | "force_field";
    labelPosition: "corner" | "center" | "along_border";
  };

  // Governance indicators
  governanceMarkers: {
    showGovernor: boolean;
    showCouncil: boolean;
    showDisputedAreas: boolean;
  };

  // Districts (sub-realm regions)
  districts: {
    show: boolean;
    style: "subtle_border" | "color_tint" | "label_only";
  };

  // Active governance
  activeGovernance: {
    showElections: boolean;
    showProposals: boolean;
    showDisputes: boolean;
    markerStyle: "flag" | "banner" | "glow";
  };
};
```

### C.4.2 Dispute Visualization

```ts
export type DisputeVisualization = {
  disputeId: string;

  // Contested area
  contestedArea: {
    shape: TerritoryShape;
    style: "hatched" | "pulse" | "split_color";
    colors: [string, string];       // Claimant, respondent
  };

  // Process indicators
  processIndicator: {
    status: DisputeStatus;
    arbitratorLocation?: Coordinates;
    hearingLocation?: Coordinates;
  };
};
```

---

## C.5) Daemon Presence on Map

### C.5.1 Daemon Spatial Manifestation

The Daemon isn't just in a sidebar — it inhabits the map:

```ts
export type DaemonMapPresence = {
  // Core manifestation
  manifestation: {
    style: "glyph" | "shimmer" | "companion" | "ambient";
    position: "near_cursor" | "near_focus" | "fixed" | "following";
    opacity: number;
    reactsToContext: boolean;
  };

  // Contextual appearances
  contextualAppearances: {
    atDiscoverable: boolean;        // Appears near discoverable packs
    atAncestors: boolean;           // Appears near your lineage ancestors
    atCommitmentLocations: boolean;
    nearStrangers: boolean;         // Appears when approaching unknown territory
  };

  // Suggestion rendering
  suggestions: {
    style: "speech_bubble" | "overlay" | "inline" | "ambient_text";
    position: "contextual" | "fixed_corner";
    fadeAfter: number;              // Seconds
  };
};
```

### C.5.2 Daemon Map Interactions

```ts
export type DaemonMapInteractions = {
  // Navigation assistance
  showRouteSuggestions: boolean;
  highlightRecommendedDestinations: boolean;

  // Discovery assistance
  indicateDiscoverables: boolean;
  highlightLineageOpportunities: boolean;

  // Commitment awareness
  showCommitmentTethers: boolean;
  warnOnOverextension: boolean;     // "You're far from your commitments"

  // Local context
  briefOnEntry: boolean;            // Brief when entering new territory
  introduceNeighbors: boolean;
  surfaceLocalHistory: boolean;
};
```

**Daemon on the map in practice:**

*Approaching unfamiliar territory:*
```
[Daemon glyph appears at territory border]

◇ You're about to enter the Archive District.
  [Expands on hover: local customs, your reputation here, notable artifacts]
```

*Near a discoverable pack:*
```
[Faint shimmer in a corner of the territory]

◇ Something here...
  [Click reveals: "Discoverable pack nearby. Meet requirements?"]
```

*Far from home with active commitments:*
```
[Tether lines visible stretching back to home]

◇ You're 1200 units from your Garden commitment.
  3 days remaining. Consider heading back?
```

*At a lineage cluster:*
```
[Threads brighten around a cluster of artifacts]

◇ A school is forming here around themes you've explored.
  Your work isn't yet part of it. Interested?
```

---

## C.6) Interactive Elements

### C.6.1 Selection and Focus

```ts
export type MapInteraction = {
  // Selection
  selection: {
    mode: "single" | "multi" | "area";
    highlightStyle: "glow" | "ring" | "lift";
    infoPanel: "sidebar" | "tooltip" | "modal";
  };

  // Focus
  focus: {
    zoomToFocus: boolean;
    dimmNonFocused: boolean;
    showRelated: boolean;           // Show related elements when focused
  };

  // Navigation
  navigation: {
    panMethod: "drag" | "edge_scroll" | "minimap";
    zoomMethod: "scroll" | "pinch" | "buttons";
    doubleClickZoom: boolean;
    homeButton: boolean;
  };
};
```

### C.6.2 Layer Controls

```ts
export type LayerControls = {
  position: "top_right" | "bottom_left" | "sidebar";

  layers: Array<{
    id: string;
    name: string;
    icon: string;
    defaultEnabled: boolean;
    mutuallyExclusive?: string[];   // Can't be on with these
  }>;

  presets: Array<{
    name: string;
    layers: string[];               // Which layers enabled
    description: string;
  }>;
};

// Example presets
const MAP_PRESETS = [
  {
    name: "Geography",
    layers: ["base", "territories", "terrain"],
    description: "Just the landscape"
  },
  {
    name: "Lineage",
    layers: ["base", "territories", "lineage", "schools"],
    description: "Influence and intellectual heritage"
  },
  {
    name: "Social",
    layers: ["base", "territories", "reputation", "commitments", "witnesses"],
    description: "Trust networks and accountability"
  },
  {
    name: "Metabolic",
    layers: ["base", "territories", "metabolism", "flow"],
    description: "Energy and activity patterns"
  },
  {
    name: "Governance",
    layers: ["base", "territories", "governance", "disputes"],
    description: "Authority and administration"
  },
  {
    name: "Everything",
    layers: ["all"],
    description: "Full complexity (may be overwhelming)"
  }
];
```

### C.6.3 Contextual Actions

Right-click or long-press reveals contextual actions:

```ts
export type MapContextMenu = {
  // On empty space
  emptySpace: [
    { action: "create_waypoint", label: "Mark this location" },
    { action: "check_claimability", label: "Can I claim here?" },
    { action: "measure_distance", label: "Measure from here" }
  ];

  // On territory
  territory: [
    { action: "view_details", label: "Territory details" },
    { action: "view_owner", label: "View owner" },
    { action: "view_artifacts", label: "Artifacts here" },
    { action: "view_commitments", label: "Commitments here" },
    { action: "start_journey", label: "Travel here" }
  ];

  // On own territory
  ownTerritory: [
    { action: "edit_terrain", label: "Change terrain" },
    { action: "resize", label: "Resize territory" },
    { action: "create_artifact", label: "Create artifact here" },
    { action: "invite_visitor", label: "Invite someone" }
  ];

  // On artifact
  artifact: [
    { action: "view_artifact", label: "View" },
    { action: "view_lineage", label: "Show lineage" },
    { action: "respond_to", label: "Respond to this" }
  ];

  // On node
  node: [
    { action: "view_profile", label: "View profile" },
    { action: "view_reputation", label: "Reputation with me" },
    { action: "view_commitments", label: "Their commitments" },
    { action: "request_witness", label: "Request as witness" }
  ];
};
```

---

## C.7) Journey Visualization

### C.7.1 Path Rendering

When traveling:

```ts
export type JourneyVisualization = {
  // Planned route
  plannedRoute: {
    style: "line" | "dots" | "arrow";
    color: string;
    showWaypoints: boolean;
    showCapacityCost: boolean;
    showTerritoriesCrossed: boolean;
  };

  // Active journey
  activeJourney: {
    showProgress: boolean;
    trailBehind: boolean;           // Leave fading trail
    trailLength: number;
    animateMovement: boolean;
  };

  // Journey history
  history: {
    showRecentPaths: boolean;
    recentDays: number;
    pathStyle: "faded" | "dotted";
  };
};
```

### C.7.2 Journey Animation

```ts
export type JourneyAnimation = {
  // Movement style
  movement: {
    speed: "instant" | "fast" | "measured" | "slow";
    easing: "linear" | "ease_out" | "organic";
    cameraFollow: boolean;
  };

  // Transitions
  transitions: {
    territoryEntry: "subtle" | "announced" | "dramatic";
    terrainChange: "color_shift" | "particle_burst" | "subtle";
    realmBorder: "barrier_effect" | "fade_through" | "gate";
  };

  // Environmental response
  environmental: {
    showLocalReaction: boolean;     // Territories react to your passage
    showEncounters: boolean;        // Other nodes you pass near
  };
};
```

---

## C.8) Minimap

### C.8.1 Minimap Design

```ts
export type Minimap = {
  position: "bottom_right" | "bottom_left" | "top_right";
  size: { width: number; height: number };

  // Display
  display: {
    showAllTerritories: boolean;
    showCurrentPosition: boolean;
    showDestination: boolean;
    showCommitmentTethers: boolean;
    showGovernanceBorders: boolean;
  };

  // Interaction
  interaction: {
    clickToNavigate: boolean;
    dragViewport: boolean;
    zoomOnHover: boolean;
  };

  // Simplification
  simplification: {
    mergeSmallTerritories: boolean;
    hideLabels: boolean;
    reducedLayerDetail: boolean;
  };
};
```

---

## C.9) Example: Seeing It All Together

**User opens map with "Social" preset:**

The landscape appears:
- Territories rendered with soft boundaries, colored by terrain
- Reputation heatmap overlay — their home glows warm, unknown areas are cool neutral
- Active commitments appear as beacons with tethers
- Witness connections form a subtle web between nodes

**User hovers over a distant territory:**

The Daemon appears at the edge:
```
◇ The Southern Archives

  Terrain: archive
  Owner: [Node X] (you've never interacted)
  Your reputation here: unknown

  3 artifacts here cite works you've cited (shared lineage).
  Potential connection point?

  [Show shared lineage] [Plan journey]
```

**User clicks "Show shared lineage":**

Lineage layer activates:
- Threads brighten connecting their artifacts to this territory
- A cluster appears — both they and Node X cite some common ancestors
- The Daemon notes: "You're both influenced by the Eastern School"

**User clicks "Plan journey":**

Route appears:
- Dotted line from current position to Southern Archives
- Passes through three territories (one unknown, two with mild reputation)
- Capacity cost displayed: 45 units
- Journey time: meaningful (not instant)

**User begins journey:**

Camera follows as they move:
- Trail fades behind them
- Entering new territory triggers brief Daemon context
- Commitment tethers stretch as they travel away from home
- Passing near another node, a brief moment of awareness (their aura visible)

**Arriving at Southern Archives:**

Daemon briefs:
```
◇ You've arrived at the Southern Archives.

  First visit. You're a stranger here.

  Local customs: heavy citation practice, slow responses, deep reading valued.

  [Node X] is present (aura visible in territory).
  Their recent work aligns with your interest in attention.

  Approach: read before speaking. If you respond to something, cite it.

  [Browse local artifacts] [View Node X's work] [Just observe]
```

**The map has shown:**
- Geography (where things are)
- Reputation (where you're trusted)
- Lineage (intellectual connections)
- Social structure (commitment/witness networks)
- Governance (whose space this is)
- Metabolism (activity, energy)
- The Daemon (contextual guidance)

All derived from canon. All layered. All alive.

---

## C.10) Implementation Notes

### C.10.1 Performance Considerations

With many layers, performance matters:

```ts
export type MapPerformance = {
  // Level of detail
  lod: {
    enabled: boolean;
    zoomThresholds: number[];       // When to switch detail levels
    simplifyDistantElements: boolean;
  };

  // Culling
  culling: {
    frustumCulling: boolean;        // Don't render off-screen
    occlusionCulling: boolean;      // Don't render hidden
    distanceCulling: number;        // Max render distance
  };

  // Caching
  caching: {
    tileCaching: boolean;
    lineageThreadCaching: boolean;
    reputationHeatmapCaching: boolean;
    cacheInvalidationStrategy: string;
  };

  // Animation budgets
  animationBudget: {
    maxParticles: number;
    maxAnimatedThreads: number;
    targetFPS: number;
  };
};
```

### C.10.2 Accessibility

```ts
export type MapAccessibility = {
  // Alternative representations
  alternatives: {
    textDescription: boolean;       // Describe map state in text
    audioDescription: boolean;      // Speak location changes
    hapticFeedback: boolean;        // Vibrate on territory changes
  };

  // Visual adjustments
  visual: {
    highContrastMode: boolean;
    colorBlindModes: ("protanopia" | "deuteranopia" | "tritanopia")[];
    reduceMotion: boolean;
    increaseBorderWidth: boolean;
  };

  // Navigation
  navigation: {
    keyboardNavigation: boolean;
    screenReaderAnnouncements: boolean;
    focusIndicators: boolean;
  };
};
```

---

*End of Advanced Integration*
