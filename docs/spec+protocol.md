# SPEC.md — Omnilith Protocol (Web Interpreter v1)

> **Canonical Identity Statement (Non‑Negotiable)**
>
> This document defines a **protocol for intentional state**. It is not a SaaS product specification.
>
> The web application, database, and server runtime described here are **interpreters of the protocol**, not its source of truth. Any system that can ingest the protocol format, replay its logs, evaluate its policies, and respect the invariants defined herein is a valid implementation.

---

## 0) Protocol Guarantees (Normative)

This section governs the entire specification below. All subsequent sections MUST comply with these guarantees.

### 0.1 Projection Law

**Projection Law:**
> Any Surface, Layout, Template, or View must be derivable entirely from canon and context, and must not introduce new state.

Implications:
- Surfaces are read‑only projections.
- Layouts are presentation‑only.
- Templates contain no data.
- UI state is never canon.

Violation of the Projection Law is a protocol breach.

---

### 0.2 Canon Definition

Canon is the **minimum lossless state** required to reconstruct the system.

Canon consists of:
1. **Append‑only logs**
   - Observations
   - Entity events
   - ActionRun audits
2. **Revisioned content objects**
   - Artifacts
   - Surfaces
   - SurfaceLayouts
   - Entity type definitions
   - Variables
   - Episodes
3. **Relationships and authority**
   - Nodes and edges
   - Grants

Canon is:
- Exportable
- Replayable
- Inspectable outside the app

Canon is NOT:
- UI state
- Derived views
- Caches

---

### 0.3 Canonical Wire Format — Omnilith Bundle

The protocol’s canonical interchange format is a **Omnilith Bundle**.

```
/omnilith-bundle
  /nodes
    /<nodeId>
      node.json
      /artifacts
        /<artifactId>
          about.md
          notes.md
          page.json
          revisions.ndjson
      /surfaces
        <surfaceId>.json
      /layouts
        <layoutId>.json
      /entities
        <entityId>.json
      /entity-types
        <typeId>.json
      /variables
        <variableId>.json
      /episodes
        <episodeId>.json
      /policies
        <policyId>.json | .ts
      /grants
        grants.json
  /log
    observations.ndjson
    action_runs.ndjson
```

Rules:
- `ndjson` files are append‑only logs.
- JSON files are authoritative snapshots.
- Markdown files are first‑class canon.
- The bundle MUST be sufficient to fully reconstruct state.

---

### 0.4 Substrate Independence

The protocol assumes **no specific storage or runtime**.

Valid substrates include:
- Postgres (online‑first interpreter)
- IndexedDB (local‑first interpreter)
- Filesystem (folder‑backed interpreter)
- Git (filesystem + history)
- Hybrid sync systems

All substrates MUST implement identical repository interfaces.

---

### 0.5 Determinism & Replay

Any compliant interpreter MUST be able to:
1. Load canon from a Omnilith Bundle
2. Replay event logs in order
3. Rebuild derived state
4. Produce deterministic results

**Replay Semantics (Critical Clarification):**
- Replay re-evaluates **decisions**, not the external world.
- Policies are re-run deterministically against historical context.
- Effects are re-derived.
- **External ActionRuns are NOT re-executed during replay.**
- The recorded inputs, outputs, and audits of ActionRuns are treated as historical facts.

This guarantees auditability and determinism even when actions interact with non-deterministic or external systems.

Policies MUST be pure, deterministic, and side‑effect free.

---

### 0.6 Performance Invariants

To prevent unbounded I/O and ensure predictable policy evaluation, the protocol enforces query limits.

**Observation Query Limits:**
- All observation queries MUST include a `limit` parameter
- Maximum limit: 1000 observations per query
- Default limit (if not specified): 100 observations
- Default time window (if not specified): 24 hours

**Rationale:** Observation logs grow unboundedly. Without limits, a naive policy could scan the entire history on every evaluation, causing O(n) I/O growth. Limits force policy authors to think about recency and relevance.

**Implementation:** Repository implementations MUST:
1. Enforce a maximum limit of 1000, even if a higher value is requested
2. Apply a default limit of 100 if none is specified
3. Apply a default 24-hour window if no time constraint is specified

Policies that need historical analysis beyond these limits should use pre-computed aggregations or materialized views (which are non-canonical caches).

---

## 1) Product Shape (Interpreter Description)

The v1 web interpreter renders a world of **Nodes** through **Surfaces** and enables authoring and regulation through a persistent overlay called **Prism**.

- Surfaces render read‑only projections of artifacts and system state.
- Prism is the **only commit boundary** for canon mutation.
- A server‑side runtime evaluates policies, proposes actions, and executes approved effects.

---

## 2) Nodes (Cybernetic Boundaries)

### 2.1 Definition

A **Node** is a cybernetic membrane that scopes observations, policies, authority, and meaning.

Nodes are not users or projects. They are boundaries.

### 2.2 Node Kinds

- **Subject‑Node** — anchors identity, authority, and execution rights (1:1 with a user).
- **Object‑Node** — any other context (project, world, album, concept).
- **Agent‑Node** — anchors an autonomous agent's identity and delegated authority.

### 2.2.1 Agent Identity Model

Agents are first-class participants in the protocol with their own Node identity.

**Agent‑Node Characteristics:**
- Has a stable identity (`agentId`) and its own Node
- Operates with **delegated authority** from a sponsoring Subject‑Node
- All agent actions are attributed to both the agent and its sponsor
- Grants to an Agent‑Node are scoped and revocable by the sponsor

**Delegation:**
```ts
export type AgentDelegation = {
  agentNodeId: string;
  sponsorNodeId: string;
  grantedAt: string;
  scopes: string[];           // e.g., ["observe", "propose_action", "create_artifact"]
  constraints?: {
    maxRiskLevel?: RiskLevel;
    allowedEffects?: EffectType[];
    expiresAt?: string;
  };
};
```

Agents CANNOT:
- Approve their own ActionRuns above `low` risk
- Grant authority to other agents
- Modify their own delegation

Agents CAN:
- Emit observations (marked with agent provenance)
- Propose actions (subject to risk gating)
- Create/modify artifacts (if delegated)
- Evaluate policies (as the runtime, not as authors)

### 2.3 Node Edges

Typed edges define permeability:
- `follows`
- `member_of`
- `maintains`
- `feeds`
- `shares_with`

**Edges have no intrinsic behavior.**

Edges do not automatically propagate data, grant access, or trigger effects.
They are **semantic facts** recorded in canon.

All operational meaning of edges emerges exclusively through policy evaluation.

#### Example

A policy MAY route observations across a `feeds` edge:

```ts
evaluate(ctx) {
  const feedTargets = ctx.node.edges
    .filter(e => e.type === "feeds")
    .map(e => e.toNodeId);

  return feedTargets.map(nodeId => ({
    effect: "route_observation",
    toNodeId: nodeId,
  }));
}
```

---

## 3) Artifacts (Durable Content Objects)

Artifacts are revisioned content objects rendered by Surfaces.

### 3.1 Artifact Model

```ts
export type Artifact = {
  id: string;
  nodeId: string;
  title: string;
  about: string;        // Markdown, required
  notes?: string;       // Markdown, optional
  page: PageDoc;        // Block document
  status: "draft" | "active" | "published" | "archived";
  trunkVersion: number;
  createdAt: string;
  updatedAt: string;
};
```

### 3.2 Revisions (v1 Scope)

- Every save creates an immutable revision.
- Revisions are append‑only.
- The artifact record represents the current trunk state.

**Concurrency Clarification:**
- Multiple revision streams MAY exist in canon concurrently.
- A given interpreter MAY expose only a single active stream (trunk-only UX).
- Branches in v2 are a higher-level interpretation of revision streams with base pointers and merge semantics.

This preserves creative forking at the protocol level without requiring early UI or merge complexity.

---

## 4) PageDoc (Block Content)

```ts
export type PageDoc = {
  version: 1;
  blocks: Block[];
};
```

Blocks are structural, portable, and renderer‑agnostic.

---

## 5) Surfaces (Read‑Only Projections)

Surfaces are pure projections governed by the Projection Law.

```ts
export type Surface = {
  id: string;
  nodeId: string;
  kind: "page" | "gallery" | "timeline" | "workshop" | "custom";
  title: string;
  visibility: "public" | "node_members" | "granted" | "private";
  entry: { artifactId?: string; query?: QuerySpec };
  layoutId?: string;
};
```

Surfaces NEVER mutate canon.

---

## 6) Surface Layout System (Scoped v1)

Layouts are presentation‑only and read‑only.

### 6.1 Layout Modes

```ts
layout.mode = "sections" | "canvas";
```

- **v1:** `sections` only (vertical stack: header, body, repeater, footer)
- **v1.5+:** `canvas` (free positioning, layers)

The underlying layout data model is shared.

### 6.2 Shared vs Inline Layouts

Surfaces can reference layouts in two ways:

1. **Shared Layout** (`layoutId`): Reference a reusable SurfaceLayout by ID. Use for layouts shared across multiple surfaces.

2. **Inline Layout** (`inlineLayout`): Embed layout configuration directly in the Surface. Use for simple, one-off layouts that don't need to be shared.

```ts
Surface = {
  // ... other fields
  layoutId?: string;           // Reference shared layout
  inlineLayout?: LayoutSpec;   // OR define inline (mutually exclusive)
};

LayoutSpec = {
  mode: "sections" | "canvas";
  sections?: LayoutSection[];
  canvas?: { width: number; height: number; elements: unknown[] };
};
```

**Constraint:** `layoutId` and `inlineLayout` are mutually exclusive. A Surface MUST NOT have both set.

**Recommendation:** Prefer `inlineLayout` for surfaces with simple, unique layouts. Use `layoutId` when multiple surfaces share the same layout structure.

---

## 7) Prism (Commit Boundary)

Prism is a persistent overlay that provides:
- Editing
- Revision history
- Policy configuration
- Action approval

Prism is the **only interface that mutates canon**.

---

## 8) Observations (Event Log)

```ts
export type Observation = {
  id: string;
  nodeId: string;
  type: string;
  timestamp: string;
  payload: unknown;
  provenance: Provenance;
};

export type Provenance = {
  sourceId: string;              // Subject‑Node or Agent‑Node ID
  sponsorId?: string;            // For agents: the delegating Subject‑Node
  method?: string;               // e.g., "manual_entry", "sensor_ingest", "agent_inference"
  confidence?: number;           // 0-1, for agent-generated observations
};
```

**Provenance Rules:**
- All observations MUST have provenance.
- `method` describes how the observation was created (e.g., "manual_entry", "sensor_ingest", "agent_inference").
- `confidence` indicates reliability for agent-generated observations.
- Provenance is immutable once recorded.
- Policies MAY filter or weight observations by provenance.

Observations are append‑only and replayable.

---

## 8.1 Variables, Proxies, and Viable Ranges (Active Inference Core)

The protocol is compatible with Active Inference and cybernetic regulation. To make that explicit, Omnilith treats **Variables** as first-class canon objects whose values can be inferred from observations and stabilized through policies and actions.

### 8.1.1 Variable

A **Variable** represents a regulated quantity the system cares about (e.g., sleep quality, social embeddedness, creative output). Variables exist per Node and can be personal or collective.

Variables are canon and MUST be:
- Inspectable
- Replayable from logs + revisions
- Interpretable by policies

```ts
export type Variable = {
  id: string;
  nodeId: string;
  key: string;                // stable identifier, e.g. "sleep_quality"
  title: string;
  description?: string;

  kind: "continuous" | "ordinal" | "categorical" | "boolean";
  unit?: string;              // e.g. "hours", "%", "score"

  viableRange?: ViableRange;
  preferredRange?: ViableRange;

  computeSpecs: ComputeSpec[];

  // optional priors / targets used by policies (not required in v1)
  prior?: unknown;
  target?: unknown;

  createdAt: string;
  updatedAt: string;
};

export type ViableRange = {
  min?: number;
  max?: number;
  // optional soft bounds
  softMin?: number;
  softMax?: number;
  note?: string;
};
```

### 8.1.2 ComputeSpec

A **ComputeSpec** defines how a Variable is estimated from observations. ComputeSpecs do not store derived state in canon; they define *how to derive it*.

v1 simplifies the original ProxySpec design to support common aggregation patterns without requiring custom transform logic.

```ts
export type ComputeSpec = {
  id: string;

  // Observation types to include (exact match or prefix with "*")
  observationTypes: string[];   // e.g. ["health.sleep", "health.exercise"]

  // How to aggregate matching observations
  aggregation: "latest" | "sum" | "avg" | "count" | "min" | "max";

  // Optional window to limit scope
  window?: {
    hours?: number;             // Only consider last N hours
    count?: number;             // Only consider last N observations
  };

  // Confidence / reliability hint for policies
  confidence?: number;          // 0..1
};
```

**Aggregation Methods:**
- `latest`: Most recent observation's payload value
- `sum`: Sum of numeric payload values
- `avg`: Average of numeric payload values
- `count`: Number of matching observations
- `min`/`max`: Minimum/maximum of numeric payload values

**Window Semantics:** When both `hours` and `count` are specified, the time filter is applied first, then the count limit.

**Invariant:** Variable values shown in Surfaces are projections, derived at render-time or via cached materializations. Any cache is non-canonical and must be reconstructable.

### 8.1.3 Variable Estimates (Derived)

Interpreters MAY maintain a materialized view of Variable estimates for performance. This view is not canon and must be reproducible from:

- Observations
- Variable definitions
- Proxy specs
- Policies and ActionRun facts

```ts
export type VariableEstimate = {
  variableId: string;
  value: number | string | boolean;
  confidence: number;           // 0..1
  computedAt: string;
  inViableRange: boolean;
  inPreferredRange: boolean;
  trend?: "improving" | "stable" | "degrading";
  deviation: number;            // 0..1, distance from preferred center (normalized)
};
```

**Deviation** provides a scalar for how far from the preferred state the Variable currently sits:
- `0` = at preferred center
- `0.5` = at viable boundary
- `1` = outside viable range

Policies MAY use estimates to trigger regulatory effects (e.g., propose an Episode when a Variable exits viable range).

---

## 8.2 Episodes (Regulatory Interventions)

An **Episode** is a structured, time-bounded intervention. Episodes are canon objects that coordinate observations, actions, and review.

Episodes serve two purposes:
- **Regulatory**: restore Variables to viable range when they drift
- **Exploratory**: probe boundaries, build capacity, discover new viable states

Regulation is not the goal — it's what enables growth. A system that only maintains homeostasis cannot expand. Exploratory episodes are how the system learns what new states are viable before committing to them.

```ts
export type Episode = {
  id: string;
  nodeId: string;
  title: string;
  description?: string;

  kind: "regulatory" | "exploratory";

  // intent per variable
  variables: Array<{
    variableId: string;
    intent: EpisodeIntent;
  }>;

  // temporal scope
  startsAt?: string;
  endsAt?: string;

  // operational links
  relatedArtifactIds?: string[];
  status: "planned" | "active" | "completed" | "abandoned";

  createdAt: string;
  updatedAt: string;
};

export type EpisodeIntent =
  // Regulatory intents
  | "stabilize"      // return to viable range
  | "increase"       // move toward upper preferred
  | "decrease"       // move toward lower preferred
  | "maintain"       // hold current position
  // Exploratory intents
  | "probe"          // test a boundary without committing
  | "expand"         // grow capacity (widen viable range)
  | "discover";      // explore unknown territory
```

**Regulatory episodes** target known ranges. Success = Variable returns to viability.

**Exploratory episodes** may temporarily increase deviation. Success = learning something about what's possible, potentially updating the Variable's viable or preferred range afterward.

Episodes are authored and mutated only through Prism.

---

## 9) Policies and Effects

Policies are pure functions:

```ts
evaluate(ctx) => Effect[];
```

They:
- Access no storage
- Call no network
- Produce declarative effects

**Policy Composition:**
- Multiple policies MAY be active within a node.
- Policies have explicit **priority** (integer, lower = higher priority).
- Evaluation is **ordered**: policies evaluate in priority order against the same context.
- Effects accumulate across policies; later policies see prior effects in context.
- If two policies produce conflicting effects, the higher-priority policy wins.

**Purity Enforcement:**
Policies MUST be pure, but this is **convention-enforced**, not language-enforced. TypeScript/JavaScript cannot guarantee purity at the language level. Interpreters MAY add runtime guards, but compliance ultimately depends on policy authors respecting the contract.

**Policy Representation:**
- Policies MAY be represented as TypeScript/JavaScript (v1 interpreter choice)
- Policies MAY be represented as JSON, WASM, or other portable formats in future interpreters

The protocol constrains policy behavior, not policy language.

### 9.1 Policy Context Schema

The `ctx` object passed to policy evaluation has a defined shape:

```ts
export type PolicyContext = {
  // Trigger
  observation: Observation;

  // Node state
  node: {
    id: string;
    kind: "subject" | "object" | "agent";
    edges: Edge[];
    grants: Grant[];
  };

  // Accumulated effects from higher-priority policies
  priorEffects: Effect[];

  // Read-only access to canon (with I/O limits enforced)
  canon: {
    getArtifact(id: string): Artifact | null;
    getEntity(id: string): Entity | null;
    getVariable(id: string): Variable | null;
    getActiveEpisodes(): Episode[];

    /**
     * Query observations with enforced limits.
     * See §0.6 Performance Invariants for limit details.
     */
    queryObservations(filter: ObservationFilter): Observation[];
  };

  // Derived variable estimates (non-canon, computed)
  estimates: {
    getVariableEstimate(variableId: string): VariableEstimate | null;
  };

  // Metadata
  evaluatedAt: string;
  policyId: string;
  priority: number;
};
```

**Constraints:**
- `canon` accessors are read-only snapshots; mutations have no effect.
- `priorEffects` enables policy coordination without shared mutable state.
- Context is reconstructed identically during replay.

**ObservationFilter (with required limits):**

```ts
export type ObservationFilter = {
  nodeId?: string;
  type?: string;                // Exact type match
  typePrefix?: string;          // Type prefix match

  // Time window (prefer over legacy timeRange)
  window?: {
    hours?: number;             // Last N hours
    since?: string;             // After this timestamp
  };

  // Legacy time range (for backwards compatibility)
  timeRange?: {
    start?: string;
    end?: string;
  };

  // REQUIRED: Maximum results (max 1000, default 100)
  limit: number;
  offset?: number;
};
```

See §0.6 for enforcement details.

### 9.2 Effect Vocabulary (v1)

Effects are declarative instructions returned by policies. The v1 effect vocabulary:

```ts
export type Effect =
  | { effect: "route_observation"; toNodeId: string }
  | { effect: "create_entity_event"; entityId: string; event: EntityEvent }
  | { effect: "propose_action"; action: ActionProposal }
  | { effect: "tag_observation"; tags: string[] }
  | { effect: "suppress"; reason: string }       // Prevents further policy evaluation
  | { effect: "log"; level: "debug" | "info" | "warn"; message: string };
```

**Extension:**
- Packs MAY define additional effect types.
- Unknown effects MUST be logged and ignored by the interpreter (forward compatibility).
- Custom effects SHOULD be namespaced: `{ effect: "pack:finance:categorize", ... }`.

---

## 10) ActionRuns

ActionRuns are auditable proposals and executions.

- Proposed by policies (via `propose_action` effect)
- Gated by risk level
- Approved in Prism (or auto-approved if low risk)
- Executed by the runtime
- Recorded with full audit trail

### 10.1 ActionRun Model

```ts
export type ActionRun = {
  id: string;
  nodeId: string;
  proposedBy: {
    policyId: string;
    observationId: string;     // Triggering observation
  };
  action: ActionProposal;
  riskLevel: RiskLevel;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  approval?: {
    approvedBy: string;        // Subject‑Node ID
    approvedAt: string;
    method: "manual" | "auto";
  };
  execution?: {
    startedAt: string;
    completedAt: string;
    result: unknown;
    error?: string;
  };
};

export type RiskLevel = "low" | "medium" | "high" | "critical";
```

### 10.2 Risk Levels and Approval Semantics

| Risk Level | Description | Approval Required |
|------------|-------------|-------------------|
| `low` | Reversible, internal, no external effects | Auto-approved |
| `medium` | External read, or internal write with audit | Agent-approvable (if delegated) |
| `high` | External write, financial, or identity-affecting | Subject‑Node approval required |
| `critical` | Irreversible, high-value, or security-sensitive | Subject‑Node approval + confirmation |

**Risk Classification:**
- Risk level is declared by the action definition, not inferred.
- Policies MAY escalate risk level but CANNOT reduce it.
- Agents are bound by `maxRiskLevel` in their delegation.

**Auto-Approval Rules:**
- `low` risk actions auto-approve unless the node has a policy that gates them.
- Agents MAY auto-approve `medium` risk if explicitly delegated.
- `high` and `critical` ALWAYS require human Subject‑Node approval.

**Audit:**
All ActionRuns are recorded in canon regardless of outcome. Rejected and failed runs are preserved for audit.

---

## 11) Runtime (Interpreter Loop)

The runtime:
1. Ingests observations
2. Evaluates policies
3. Applies effects
4. Executes approved actions

The runtime is an interpreter of the protocol, not the protocol itself.

---

## 12) Entities

Entities are durable referents with event‑sourced mutation and materialized registry views.

They provide **semantic identity across time**, independent of any single artifact or surface.

Entities are NOT UI objects and MUST NOT violate the Projection Law.

### Entity Characteristics
- Stable identity
- Typed fields
- Event-sourced updates
- Referenceable from artifacts, policies, and other entities

### Example
A `song` entity MAY be referenced by:
- A lyrics artifact
- A production notes artifact
- A release surface

Artifacts reference the entity by ID; the entity itself is never mutated via surfaces.

This allows meaning to persist even as representations change.

---

## 13) Access & Grants

Access is explicit, inspectable, and protocol‑level.

Grants apply to Subject‑Nodes and resources.

---

## 14) Packs

Packs bundle sensors, policies, actions, and entity definitions.

They are protocol‑compliant extensions.

---

## 15) Storage & Repositories

All storage access is mediated by repository interfaces.

This preserves substrate independence and replayability.

---

## 16) Web Interpreter (v1 Implementation Choice)

The v1 interpreter uses:
- Next.js (UI)
- Postgres (canon store)
- Server runtime (policy evaluation)

These are implementation choices, not protocol requirements.

---

## 17) Compatibility Statement

Any future system that:
- Reads the Omnilith Bundle
- Replays logs
- Evaluates policies
- Respects the Projection Law

…is a valid continuation of this system.

No rewrite is required.

---

## 18) Future Considerations

The following concepts are intentionally deferred from v1 to reduce cognitive load. They may be introduced in future versions as the protocol matures.

### 18.1 Urgency Scoring

Policies may benefit from a pre-computed `urgency` field on `VariableEstimate` that combines deviation, trend, and confidence into a single prioritization signal:

```ts
urgency: "low" | "moderate" | "high" | "critical";
```

For v1, policies can derive urgency themselves from the available fields.

### 18.2 Attention / Precision Weighting

Active Inference systems allocate attention based on precision — how reliable and relevant a signal is. A future version may formalize **attention weights** as derived context:

```ts
export type AttentionWeight = {
  variableId: string;
  weight: number;               // 0..1, current salience
  reasons: string[];            // e.g., ["episode_active", "near_boundary"]
};
```

This would allow interpreters to expose `getAttentionWeights()` in PolicyContext, enabling policies to prioritize which Variables to monitor or act upon.

### 18.3 Belief Updating / Model Revision

Active Inference distinguishes between acting on the world and updating beliefs about the world. The current spec focuses on action (Episodes, ActionRuns). A future version may formalize how Variables, Proxies, or ViableRanges themselves are revised in response to persistent prediction error — closing the full inference loop.

