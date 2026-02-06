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
  /packs
    /<packId>
      pack.json
      /policies
        <policyId>.json | .ts
      /actions
        <actionId>.json
      /entity-types
        <typeId>.json
      /observation-types
        <typeId>.json
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

### 7.1 Daemon (Embedded AI Assistant)

The **Daemon** is a personal Agent-Node embedded in each user's Prism. It observes, advises, and drafts — but never commits without the user.

#### 7.1.1 Core Principle

The Daemon is **always present, mostly quiet**. It watches the user's context, maintains working memory of recent activity, and surfaces when:
- The user invokes it
- Something warrants attention (deviation, pending actions, patterns)
- The user is authoring and could benefit from assistance

It never interrupts flow. It offers; the user accepts, modifies, or dismisses.

#### 7.1.2 Interaction Modes

**Invoked Mode (User-initiated)**

The user explicitly summons the Daemon via icon or hotkey for tasks like:
- "Draft an artifact about X"
- "Summarize recent observations for Variable Y"
- "What's driving the deviation in Z?"
- "Help me write a policy that does X when Y"
- "What actions are pending approval?"

Output appears in a **staging area** — not yet canon, clearly marked as Daemon-authored.

**Ambient Mode (Daemon-initiated, passive)**

The Daemon surfaces small indicators without interrupting:
- Subtle `◇` glyph indicates Daemon has context
- Hover or click expands the Daemon's observation
- Never modal, never blocking
- Frequency is tunable by user preference

**Authoring Mode (Co-presence during editing)**

When editing artifacts, the Daemon can offer inline assistance:
- Watches cursor position and recent typing
- Offers relevant context from observations/variables
- Can draft continuations, but user must accept
- Inserted text is marked with provenance until user edits it

**Review Mode (ActionRun approval assistance)**

When reviewing pending ActionRuns, the Daemon explains and contextualizes:
- Why the policy triggered
- What the action will do if approved
- Historical context (similar past actions and outcomes)
- Optional recommendation (user makes final call)

#### 7.1.3 Delegation Model

Each Daemon is an Agent-Node with constrained delegation:

```ts
export type DaemonDelegation = {
  agentNodeId: string;           // e.g., "daemon:user-123"
  sponsorNodeId: string;         // The user's Subject-Node
  grantedAt: string;
  scopes: [
    "observe",                   // Read observations
    "query_canon",               // Read artifacts, variables, episodes
    "draft_artifact",            // Propose content (not commit)
    "propose_action",            // Suggest actions for approval
    "explain",                   // Generate explanations
  ];
  constraints: {
    maxRiskLevel: "low";         // Can only auto-execute low-risk
    allowedEffects: ["log", "tag_observation"];  // Minimal autonomous effects
  };
};
```

**Key constraint:** The Daemon can *draft* and *propose*, but committing to canon requires user action through Prism's normal commit flow.

#### 7.1.4 Provenance

Everything the Daemon produces carries provenance:

```ts
// Daemon-drafted content
{
  provenance: {
    sourceId: "daemon:user-123",
    sponsorId: "user-123",
    method: "daemon_draft",
    confidence: number;          // 0-1, model's confidence
  }
}
```

Once the user edits or explicitly approves, provenance updates:

```ts
{
  provenance: {
    sourceId: "user-123",
    method: "manual_entry",
    assistedBy?: string;         // "daemon:user-123" if AI-assisted
  }
}
```

The `assistedBy` field tracks AI involvement in human-committed content.

#### 7.1.5 Presence Levels

Users control how present the Daemon is:

| Level | Behavior |
|-------|----------|
| **Quiet** | Only responds when invoked. No ambient indicators. |
| **Attentive** | Shows indicators when it has relevant context. Offers during authoring. |
| **Proactive** | Actively surfaces patterns, suggests drafts, nudges on deviations. |

Default: **Attentive**

#### 7.1.6 UI Components

| Component | Purpose |
|-----------|---------|
| **Daemon Icon** `◇` | Invoke conversational mode, shows activity state |
| **Daemon Chip** | Inline indicator that Daemon has relevant context |
| **Staging Area** | Holds Daemon drafts before user commits |
| **Provenance Badge** | Shows `◇ Daemon draft` until user edits/commits |
| **Daemon Drawer** | Slide-out panel for full conversational interface |

#### 7.1.7 Invariants

- Daemon CANNOT commit to canon directly — all mutations flow through Prism's normal commit boundary
- Daemon CANNOT approve its own proposed actions above `low` risk
- Daemon CANNOT modify its own delegation
- All Daemon output MUST have provenance
- Daemon respects the Projection Law — it reads canon, never introduces state

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
  method?: string;               // e.g., "manual_entry", "sensor_ingest", "agent_inference", "daemon_draft"
  confidence?: number;           // 0-1, for agent-generated observations
  assistedBy?: string;           // Agent-Node ID if AI-assisted (e.g., "daemon:user-123")
};
```

**Provenance Rules:**
- All observations MUST have provenance.
- `method` describes how the observation was created (e.g., "manual_entry", "sensor_ingest", "agent_inference", "daemon_draft").
- `confidence` indicates reliability for agent-generated observations.
- `assistedBy` tracks AI involvement when a human commits AI-assisted content.
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

Packs are **portable bundles of capability** that extend the protocol without modifying it.

A Pack may include:
- Policies
- Action definitions
- Entity type definitions
- Observation type definitions
- Custom effect types

### 14.1 Pack Model

```ts
export type Pack = {
  id: string;                        // e.g., "notion-sync"
  name: string;
  version: string;
  description?: string;

  // What the pack provides
  provides: {
    policies?: PolicyDefinition[];
    actions?: ActionDefinition[];
    entityTypes?: EntityTypeDefinition[];
    observationTypes?: ObservationTypeDefinition[];
    effects?: EffectTypeDefinition[];
  };

  // What the pack requires to function
  requires?: {
    scopes?: string[];               // e.g., ["observe", "propose_action"]
    grants?: GrantType[];
  };

  // Constraints when used by agents
  agentConstraints?: {
    maxRiskLevel?: RiskLevel;
    allowedEffects?: string[];
  };
};
```

### 14.2 Namespacing

All pack-provided definitions MUST be namespaced with the pack ID:

- Observation types: `pack:notion-sync:page_updated`
- Effects: `pack:notion-sync:sync_page`
- Entity types: `pack:notion-sync:notion_page`
- Actions: `pack:notion-sync:fetch_page`

Namespacing prevents collisions and makes provenance explicit.

### 14.3 Policy Priority

Pack-provided policies run at **lower priority** than node-defined policies.

- Node policies evaluate first and MAY suppress pack policy evaluation
- Pack policies see `priorEffects` from node policies
- If a node policy returns `{ effect: "suppress" }`, pack policies do not run

This ensures node owners retain ultimate control over behavior within their boundary.

### 14.4 Installation (Deferred)

Pack installation, versioning, updates, and dependency resolution are interpreter concerns, not protocol requirements. A valid interpreter MAY:

- Pre-bundle packs at build time
- Load packs dynamically
- Restrict available packs by configuration

The protocol requires only that installed packs conform to the Pack model and respect namespacing.

### 14.5 Example: Sleep Regulation Pack

A minimal pack that monitors sleep observations and proposes regulatory episodes.

**Bundle structure:**

```
/packs/sleep
  pack.json
  /observation-types
    sleep_logged.json
  /policies
    sleep-drift.ts
  /actions
    create_sleep_episode.json
```

**pack.json:**

```json
{
  "id": "sleep",
  "name": "Sleep Regulation",
  "version": "1.0.0",
  "description": "Monitor sleep patterns and propose regulatory interventions",
  "provides": {
    "observationTypes": ["pack:sleep:sleep_logged"],
    "policies": ["pack:sleep:sleep-drift"],
    "actions": ["pack:sleep:create_episode"]
  },
  "requires": {
    "scopes": ["observe", "propose_action"]
  },
  "agentConstraints": {
    "maxRiskLevel": "low"
  }
}
```

**observation-types/sleep_logged.json:**

```json
{
  "id": "pack:sleep:sleep_logged",
  "name": "Sleep Logged",
  "description": "Records a sleep session",
  "payloadSchema": {
    "type": "object",
    "properties": {
      "hours": { "type": "number" },
      "quality": { "type": "number", "minimum": 1, "maximum": 5 },
      "wakeTime": { "type": "string", "format": "date-time" }
    },
    "required": ["hours"]
  }
}
```

**policies/sleep-drift.ts:**

```ts
// Pure policy: no side effects, deterministic
export function evaluate(ctx: PolicyContext): Effect[] {
  if (ctx.observation.type !== "pack:sleep:sleep_logged") {
    return [];
  }

  const sleepVar = ctx.canon.getVariable("sleep_quality");
  if (!sleepVar) return [];

  const estimate = ctx.estimates.getVariableEstimate(sleepVar.id);
  if (!estimate || estimate.inViableRange) return [];

  // Sleep has drifted outside viable range — propose intervention
  return [{
    effect: "propose_action",
    action: {
      type: "pack:sleep:create_episode",
      riskLevel: "low",
      params: {
        variableId: sleepVar.id,
        intent: "stabilize",
        reason: `Sleep quality at ${estimate.value}, outside viable range`
      }
    }
  }];
}
```

**actions/create_sleep_episode.json:**

```json
{
  "id": "pack:sleep:create_episode",
  "name": "Create Sleep Episode",
  "description": "Creates a regulatory episode to stabilize sleep",
  "riskLevel": "low",
  "paramsSchema": {
    "type": "object",
    "properties": {
      "variableId": { "type": "string" },
      "intent": { "enum": ["stabilize", "increase", "decrease"] },
      "reason": { "type": "string" }
    },
    "required": ["variableId", "intent"]
  }
}
```

This pack demonstrates the full pattern:
1. **Observation type** defines the sensor interface
2. **Policy** evaluates observations against variable estimates
3. **Action** is proposed (not executed) with declared risk level
4. **Namespacing** makes all definitions traceable to the pack

The node owner's policies can suppress or modify this behavior. The pack runs subordinate to node authority.

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

### 16.1 Component Architecture

The web UI is organized around the Projection Law: **Surfaces are read-only projections; Prism is the commit boundary.**

**Layer Separation:**

```
┌─────────────────────────────────────────────────────┐
│  Prism (Commit Boundary)                            │
│  - Editing, revision history, policy config         │
│  - Action approval, canon mutation                  │
│  - Device panels (sensors, process, audio)          │
├─────────────────────────────────────────────────────┤
│  Surfaces (Read-Only Projections)                   │
│  - PageSurface, GallerySurface, TimelineSurface     │
│  - Derive entirely from canon + context             │
│  - No local state that isn't derivable              │
├─────────────────────────────────────────────────────┤
│  Primitives (Stateless UI Components)               │
│  - Button, Overlay, Card, etc.                      │
│  - Pure presentation, no business logic             │
└─────────────────────────────────────────────────────┘
```

**Prism Subcomponents:**

| Component | Responsibility |
|-----------|----------------|
| `PrismProvider` | State context (open, activePage, mapView) |
| `Prism` | Shell: overlay, keyboard handling |
| `Map` | Spatial navigation within/between nodes |
| `Minimap` | Compact location indicator, nav trigger |
| `Menu` | Tab navigation for Map + device panels |
| `DeviceRegistry` | Plugin system for device panel components |

**Surface Rendering:**

Surfaces are rendered by a factory based on `surface.kind`:

```ts
function SurfaceRenderer({ surface }: { surface: Surface }) {
  switch (surface.kind) {
    case "page": return <PageSurface surface={surface} />;
    case "gallery": return <GallerySurface surface={surface} />;
    case "timeline": return <TimelineSurface surface={surface} />;
    case "workshop": return <WorkshopSurface surface={surface} />;
    default: return <CustomSurface surface={surface} />;
  }
}
```

Each Surface component receives canon data and projects it. Surfaces NEVER mutate canon directly.

### 16.2 Design Philosophy: Alive & Alien

Prism should feel like a living system — aware, metabolic, unhurried. The visual language makes abstract protocol concepts legible through intuition, not just numbers.

#### 16.2.1 Core Aesthetic Principles

**Bioluminescent, not neon.** Light comes from within, not projected onto surfaces. Things glow because they're metabolically active, not because they're highlighted.

**Precise but organic.** Geometry that feels grown rather than designed. Perfect circles that breathe. Lines that know where they're going but take living paths.

**Aware, not reactive.** The UI doesn't just respond to input — it seems to *notice* you. Subtle shifts when you hover. Things that were waiting for your attention.

**Unhurried.** Nothing snaps or pops. Things emerge, settle, recede. The system has its own sense of time.

#### 16.2.2 Variables as Organisms

Variables are displayed as circles that exhibit living qualities:

**Breathing:** Circle size fluctuates with `VariableEstimate.deviation`. Variables at rest (near preferred center) are small; troubled ones loom larger. This creates a "breathing" quality where attention naturally flows to what needs it.

**Drift:** Circles are never perfectly still — micro-movements like cells under a microscope.

**Color encodes range status:**

| State | Color |
|-------|-------|
| In preferred range | Calm (teal/cyan) |
| In viable, not preferred | Neutral (dim white) |
| Approaching boundary | Warming (amber) |
| Outside viable range | Alert (coral/red) |

**Metabolism:** Variables with recent observations have visible activity inside them — particles circulating, inner luminescence.

**Filaments:** Related variables (same episode, correlated history, policy-derived relationships) connect via faint threads that pulse when data flows between them.

**Awareness:** When you focus on one variable, nearby variables subtly orient toward it (or away, if unrelated).

#### 16.2.3 Observations as Signal

New observations don't just appear in a list. They arrive:

- **Particles flowing inward** from the edges toward the relevant Variable
- **Absorption** — the Variable's circle briefly luminesces as it integrates the new data
- **Ripples** — if the observation causes deviation to change, a wave propagates outward

The system visibly *metabolizes* information, not just stores it.

#### 16.2.4 Daemon Presence

The Daemon is not a chat bubble or avatar. It's a **quality of attention** in the space:

| State | Manifestation |
|-------|---------------|
| **Quiescent** | Faint shimmer at the edge of perception. You know something's there. |
| **Attentive** | The `◇` glyph has an inner light that subtly tracks activity. Like an eye that doesn't blink but clearly sees. |
| **Speaking** | Text doesn't appear — it **crystallizes**. Characters resolve from noise, like a signal locking in. |
| **Thinking** | The space itself seems to hold its breath. A subtle contraction. |

The Daemon should feel like a presence you're sharing the space with, not a tool you're using.

#### 16.2.5 Episodes as Weather

Active Episodes create ambient atmospheric shifts rather than container UI:

- **Regulatory episode:** Subtle pressure, like the system is working. Background tone shifts cooler.
- **Exploratory episode:** Expansiveness. More space between elements. Things feel more possible.

The Episode isn't a box — it's a *condition* the whole Prism exists within.

#### 16.2.6 Map as Living Space

Nodes aren't static icons on a canvas:

- **Nodes pulse** with their own rhythm based on activity level
- **Edges breathe** — thickness fluctuates with recent traffic
- **The space between** has texture — not empty black, but a deep field with subtle depth
- **Your current node** has gravity — other nodes orient toward it slightly
- **Approaching a node** (zooming in) causes it to unfold, revealing its surfaces like petals

#### 16.2.7 State Transitions

Nothing teleports. Everything has a journey:

- **Opening Prism:** It doesn't slide in — it *emerges*. Opacity and blur resolve together. The system wakes up.
- **Switching views:** Content doesn't swap — it morphs. The old view recedes into abstraction while the new one crystallizes.
- **Committing changes:** A pulse of coherence. Everything briefly aligns, then relaxes into the new state.

#### 16.2.8 Intuitive Legibility

The visual language makes protocol concepts felt, not just read:

| Concept | Made Visible Through |
|---------|---------------------|
| Deviation from viability | Size, color, tension |
| Recent activity | Movement, luminescence |
| Variable relationships | Filaments, proximity |
| Daemon attention | Quality of presence |
| Episode context | Atmospheric condition |
| System health | Overall coherence/harmony |

The user shouldn't need to read numbers to know how they're doing. They should *feel* it.

#### 16.2.9 Reference Points

Visual influences (to triangulate, not copy):
- Organism visualizations in *Annihilation* (the shimmer)
- The heptapod language interface in *Arrival*
- Deep sea bioluminescence
- Electron microscopy footage
- Soft alien tech in *Blade Runner 2049*

### 16.3 Design Tokens

To maintain visual consistency and enable theming, the interpreter uses CSS custom properties as design tokens.

**Token Categories:**

```css
:root {
  /* Surface hierarchy */
  --color-surface-base: #000;
  --color-surface-raised: rgba(255, 255, 255, 0.02);
  --color-surface-overlay: rgba(0, 0, 0, 0.95);

  /* Text hierarchy */
  --color-text-primary: rgba(255, 255, 255, 0.85);
  --color-text-secondary: rgba(255, 255, 255, 0.5);
  --color-text-muted: rgba(255, 255, 255, 0.3);

  /* Interactive states */
  --color-interactive-default: rgba(255, 255, 255, 0.3);
  --color-interactive-hover: rgba(255, 255, 255, 0.6);
  --color-interactive-active: rgba(255, 255, 255, 0.9);

  /* Category glows (for map markers) */
  --color-category-exhibit: rgba(45, 212, 191, 0.6);
  --color-category-plaza: rgba(251, 191, 36, 0.6);

  /* Status indicators */
  --color-status-online: rgba(45, 212, 191, 0.8);
  --color-status-warning: rgba(251, 191, 36, 0.8);
  --color-status-error: rgba(239, 68, 68, 0.8);

  /* Spacing scale (4px base) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, monospace;
  --tracking-tight: 0.1em;
  --tracking-wide: 0.2em;
  --tracking-wider: 0.3em;
}
```

**CSS Module Pattern:**

Each component has a co-located `.module.css` file that imports tokens:

```
/components/prism/
  Prism.tsx
  Prism.module.css
  Map.tsx
  Map.module.css
```

### 16.4 Repository Interfaces

To preserve substrate independence (§0.4), all data access is mediated by repository interfaces. The web interpreter implements these for Postgres, but the same interfaces could back IndexedDB or filesystem implementations.

**Core Repositories:**

```ts
interface SurfaceRepository {
  getSurfaces(nodeId: string): Promise<Surface[]>;
  getSurface(id: string): Promise<Surface | null>;
}

interface ArtifactRepository {
  getArtifact(id: string): Promise<Artifact | null>;
  getArtifactRevisions(id: string): Promise<ArtifactRevision[]>;
  createRevision(artifactId: string, content: PageDoc): Promise<ArtifactRevision>;
}

interface ObservationRepository {
  query(filter: ObservationFilter): Promise<Observation[]>;
  append(observation: Omit<Observation, "id">): Promise<Observation>;
}

interface VariableRepository {
  getVariables(nodeId: string): Promise<Variable[]>;
  getEstimate(variableId: string): Promise<VariableEstimate | null>;
}
```

**Implementation Binding:**

```ts
// lib/repositories/index.ts
import { PostgresSurfaceRepository } from "./postgres/surface";
import { PostgresArtifactRepository } from "./postgres/artifact";

export const surfaceRepo: SurfaceRepository = new PostgresSurfaceRepository();
export const artifactRepo: ArtifactRepository = new PostgresArtifactRepository();
```

This allows swapping implementations without changing component code.

### 16.5 Module Structure

Recommended directory structure for the web interpreter:

```
src/
├── components/
│   ├── surfaces/              # Read-only projection components
│   │   ├── PageSurface.tsx
│   │   ├── GallerySurface.tsx
│   │   ├── SurfaceRenderer.tsx
│   │   └── index.ts
│   │
│   ├── prism/                 # Commit boundary UI
│   │   ├── Prism.tsx
│   │   ├── PrismProvider.tsx
│   │   ├── navigation/
│   │   │   ├── Map.tsx
│   │   │   ├── Minimap.tsx
│   │   │   └── hooks/
│   │   │       └── useZoomPan.ts
│   │   ├── devices/
│   │   │   ├── DevicePanel.tsx
│   │   │   └── registry.ts
│   │   └── index.ts
│   │
│   └── ui/                    # Stateless primitives
│       ├── Button.tsx
│       ├── Overlay.tsx
│       └── index.ts
│
├── contexts/
│   ├── NodeContext.tsx        # Current node, grants, edges
│   ├── AudioContext/
│   │   ├── AudioContext.tsx
│   │   ├── useAudioQueue.ts
│   │   └── useAudioPlayback.ts
│   └── WorldContext.tsx
│
├── lib/
│   ├── repositories/          # Substrate-agnostic data access
│   │   ├── interfaces.ts
│   │   ├── postgres/
│   │   └── index.ts
│   ├── types/                 # UI-specific type extensions
│   └── utils/
│
├── styles/
│   ├── tokens.css             # Design tokens
│   ├── globals.css            # Resets + token imports
│   └── animations.css         # Shared keyframes
│
└── app/                       # Next.js app router pages
    ├── layout.tsx
    ├── page.tsx
    └── [surface]/
        └── page.tsx
```

### 16.6 Hooks as Behavior Extraction

Complex interaction logic is extracted into hooks, keeping components focused on rendering:

| Hook | Purpose |
|------|---------|
| `useZoomPan` | Touch/wheel zoom and drag panning for Map |
| `useCrosshair` | Mouse-tracking crosshair overlay |
| `useCursor` | Minimap arrow that follows scroll/cursor |
| `useAuth` | Authentication state with server revalidation |
| `useAudioQueue` | Queue management for audio playback |
| `useAudioPlayback` | HTMLAudioElement wrapper with events |

**Pattern:**

```ts
// hooks/useZoomPan.ts
export function useZoomPan(options?: ZoomPanOptions) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Touch, wheel, and drag handling logic...

  return {
    zoom,
    pan,
    containerRef,
    handlers: { onMouseDown, onMouseMove, onMouseUp, onMouseLeave },
    zoomIn,
    zoomOut,
    resetView,
  };
}
```

Components consume hooks without knowing implementation details:

```tsx
function Map({ ... }) {
  const { zoom, pan, containerRef, handlers, zoomIn, zoomOut } = useZoomPan();

  return (
    <div ref={containerRef} {...handlers}>
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        {/* Map content */}
      </div>
    </div>
  );
}
```

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

---

## 19) Protocol Extensions

The core protocol is intentionally minimal. Extensions add capabilities without compromising the core guarantees.

### 19.1 Extension Architecture

Extensions follow these principles:

1. **Additive:** Extensions add new types and behaviors; they don't modify core semantics
2. **Optional:** Interpreters choose which extensions to implement
3. **Composable:** Extensions work together when both are present
4. **Graceful Degradation:** Systems without an extension ignore its data

All extensions MUST respect the Protocol Guarantees (§0):
- Projection Law remains inviolate
- Canon definition extends but doesn't contradict
- Determinism and replay must be preserved
- Policies remain pure

### 19.2 Available Extensions

| Extension | Document | Purpose |
|-----------|----------|---------|
| **Federation** | `federation-extension.md` | Local/global consensus, cryptographic identity, anchoring |
| **Spatial** | `spatial-extension.md` | Coordinates, territories, realms, terrain, proximity |
| **Value** | `value-extension.md` | Lineage, commitments, capacity, metabolism |
| **Spatial-Value Integration** | `integration-spatial-value.md` | How space and value interact |
| **Advanced Integration** | `advanced-integration.md` | Spatial packs, governance, visualization |

See `extensions-index.md` for complete documentation of all extensions.

### 19.3 Extension Dependency Graph

```
                      Core Protocol
                      (this document)
                            │
      ┌─────────────────────┼─────────────────────┐
      │             │             │               │
      ▼             ▼             ▼               ▼
  Federation    Spatial        Value          (Future)
  Extension    Extension     Extension       Extensions
      │             │             │
      │             └──────┬──────┘
      │                    │
      │                    ▼
      │             Spatial-Value
      │              Integration
      │                    │
      └────────────────────┤
                           ▼
                      Advanced
                      Integration
```

### 19.4 Extension Summary

**Federation Extension** adds consensus:
- **Local Canon:** Node-sovereign state (default for all data)
- **Global Consensus:** Shared truth requiring agreement across nodes
- **Cryptographic Identity:** Verifiable node identity via keypairs/DIDs
- **Anchoring:** Committing local canon to global consensus (optional, per-item)
- **Consensus Mechanisms:** Trusted interpreter, federated witnesses, or blockchain

Philosophy: Start local, add global consensus incrementally. The protocol semantics remain constant — only the enforcement mechanism changes. This enables migration from single-node operation to fully decentralized consensus without changing the underlying protocol.

**Spatial Extension** adds geography:
- **Realm:** Coordinate space with bounds and topology
- **Territory:** Node's claim to a region of space
- **Terrain:** Semantic property (plaza, garden, sanctuary, etc.)
- **Adjacency:** Spatial relationships between territories
- **Movement:** Travel between locations costs capacity

**Value Extension** adds relational value:
- **Lineage:** Influence chains between artifacts (you declare your ancestors)
- **Commitments:** Canonical promises with tracked outcomes
- **Capacity:** Regenerating resource that paces action
- **Metabolism:** System health derived from flows
- **Reputation:** Derived from commitment history (not tradeable)

Philosophy: Value is relational and temporal, not absolute and static. Flow over stock. Influence over ownership.

**Spatial-Value Integration** combines them:
- Artifacts have birthplaces (where they were created)
- Commitments can be place-bound (territorial scope, local witnesses)
- Reputation varies by location (trusted here, unknown there)
- Terrain affects metabolism (plazas energize, sanctuaries restore)
- The Daemon becomes a landscape guide

**Advanced Integration** adds governance and visualization:
- **Spatial Packs:** Packs with location constraints, terrain-specific effects
- **Governance:** Realm administration (governors, councils, constitutions)
- **Disputes:** Territorial conflict resolution
- **Map Visualization:** Layers for lineage, reputation, metabolism, governance

### 19.5 Canon Extensions

Extensions add to canon without contradicting it:

| Extension | New Canon | New Derived |
|-----------|-----------|-------------|
| Federation | Node identity, Anchor records, Signatures | Verification status, Trust relationships |
| Spatial | Realms, Territories, Coordinates | Distance, Adjacency |
| Value | Lineage declarations, Commitments, Capacity | Descendants, Reputation, Metabolism |
| Integration | Spatial context on artifacts | Schools, Paths, Territorial reputation |
| Advanced | Governance structures, Disputes | Visualizations |

### 19.6 Bundle Extensions

Extensions add directories to the Omnilith Bundle:

```
/omnilith-bundle
  # Core (this spec)
  /nodes/
  /packs/
  /log/

  # Federation Extension
  /nodes/<nodeId>/
    identity.json            # Cryptographic identity
    anchors.ndjson           # Anchor records log
  /federation/
    config.json              # Federation configuration
    trusted-keys.json        # Known public keys
    consensus-proofs.ndjson  # Proof log

  # Spatial Extension
  /realms/
    /<realmId>/
      realm.json
      /territories/

  # Value Extension (within nodes)
  /nodes/<nodeId>/
    capacity.json
    /commitments/
    /artifacts/<id>/lineage.json

  # Advanced Integration
  /realms/<realmId>/
    governance.json
    /disputes/
    /councils/
```

### 19.7 Daemon Extension Points

The Daemon (§7.1) gains capabilities through extensions:

| Extension | Daemon Capabilities |
|-----------|---------------------|
| Value | Lineage discovery, commitment drafting, capacity awareness, health interpretation |
| Spatial-Value | Navigation assistance, local context briefing, place-based recommendations |
| Advanced | Pack discovery guidance, governance awareness |

The Daemon's core constraints (§7.1.7) apply to all extensions:
- Cannot commit to canon directly
- Cannot approve its own high-risk actions
- All output has provenance

### 19.8 Implementation Guidance

Interpreters may implement extensions incrementally:

1. **Core Only:** Complete, functional protocol for observations, policies, variables, episodes
2. **+ Federation:** Adds cryptographic identity and optional global consensus — enables multi-node interaction
3. **+ Spatial:** Adds geography for location-aware systems (requires Federation for shared Realms)
4. **+ Value:** Adds lineage and commitments for creative/accountability systems
5. **+ Integration:** Combines space and value for inhabited landscapes
6. **+ Advanced:** Adds governance for communities, visualization for rich UI

Each phase is independently valuable. Stop where your use case is satisfied.

**Note on Federation:** Federation is optional for single-node systems but required for any multi-node interaction where trust cannot be assumed. For shared Spatial Realms, Federation provides the consensus mechanism for territory ownership.

See `docs/implementation-plan.md` for detailed implementation phases, including extension phases.

