# Omnilith Protocol — Implementation Plan

> **Goal:** Build a working v1 web interpreter of the Omnilith Protocol, prioritizing clean boundaries, substrate flexibility, and logical dependency order. UI comes last.

---

## How to Read This Plan

Each **Phase** is a major milestone. Each phase contains **Sub-Plans** — small, self-contained pieces you can tackle one at a time.

**Plain English translations** are included for technical concepts.

**Dependencies** are explicit — you'll know what needs to exist before starting each piece.

---

## Phase 0: Project Foundation

_Set up the scaffolding so everything has a home._

### 0.1 — Monorepo Structure

**What this is:** Organize the codebase into separate packages that can evolve independently.

**Why it matters:** Clean boundaries now prevent tangled code later. Each package has one job.

```
/packages
  /protocol        → Type definitions, schemas (the "what")
  /runtime         → Policy evaluation, effect execution (the "engine")
  /repositories    → Data access layer (the "how we store")
  /web             → Next.js app (the "how it looks")
```

**Sub-tasks:**

- [ ] Set up npm/pnpm workspaces
- [ ] Configure TypeScript project references (each package compiles independently)
- [ ] Add shared ESLint/Prettier config at root
- [ ] Create `npm run check` script (lint → build → test)

**Plain English:** We're creating four separate "mini-projects" inside one repo. They can import from each other, but each has clear responsibilities. This means you can swap out storage (repositories) without touching the UI (web), or change how policies run (runtime) without touching the type definitions (protocol).

---

### 0.2 — Protocol Package: Core Types

**What this is:** TypeScript definitions for everything in the spec — the vocabulary of the system.

**Why it matters:** Types are documentation that the compiler checks. Define them once, use them everywhere.

**Depends on:** 0.1

**Sub-tasks:**

- [ ] Define `Node`, `NodeKind`, `Edge` types
- [ ] Define `Observation`, `Provenance` types
- [ ] Define `Artifact`, `PageDoc`, `Block` types
- [ ] Define `Variable`, `ViableRange`, `ProxySpec` types
- [ ] Define `Episode`, `EpisodeIntent` types
- [ ] Define `Policy`, `PolicyContext`, `Effect` types
- [ ] Define `ActionRun`, `ActionProposal`, `RiskLevel` types
- [ ] Define `Surface`, `SurfaceLayout` types
- [ ] Define `Entity`, `EntityEvent` types
- [ ] Define `Grant` types

**Plain English:** Before we build anything, we need to agree on the shape of every object in the system. This package is like a dictionary — it defines what an "Observation" looks like, what fields an "Episode" has, etc. No logic here, just shapes.

---

### 0.3 — Protocol Package: Omnilith Bundle Schema

**What this is:** Define the canonical file/folder format for exporting and importing protocol state.

**Why it matters:** This is the "save file" format. Any future interpreter can read it.

**Depends on:** 0.2

**Sub-tasks:**

- [ ] Define bundle folder structure as constants
- [ ] Create JSON schemas for each file type (for validation)
- [ ] Define NDJSON log format helpers (parse/stringify line-by-line)
- [ ] Write bundle validation function (does this folder have everything it needs?)

**Plain English:** If you wanted to back up your entire system to a folder, or move it to a different app, this is the format. Think of it like a standard "zip file structure" that any Omnilith-compatible tool can understand.

---

## Phase 1: Repository Layer (Substrate Independence)

_Build the data access layer so we can swap storage backends later._

### 1.1 — Repository Interfaces ✓

**What this is:** Abstract interfaces that define _what_ operations are available, not _how_ they're implemented.

**Why it matters:** This is the key to substrate independence. Code against interfaces, not Postgres directly.

**Depends on:** 0.2

**Sub-tasks:**

- [x] Define `NodeRepository` interface (create, get, list, update, addEdge, removeEdge)
- [x] Define `ObservationRepository` interface (append, query by time/type/node)
- [x] Define `ArtifactRepository` interface (create, get, update, list, appendRevision)
- [x] Define `VariableRepository` interface (create, get, update, list)
- [x] Define `EpisodeRepository` interface (create, get, update, list active)
- [x] Define `PolicyRepository` interface (create, get, update, list by node)
- [x] Define `ActionRunRepository` interface (create, get, update status, query pending)
- [x] Define `SurfaceRepository` interface (create, get, update, list by node)
- [x] Define `EntityRepository` interface (create, get, appendEvent, query)
- [x] Define `GrantRepository` interface (create, revoke, query)
- [x] Define `RepositoryContext` (bundles all repositories together)

**Plain English:** We're defining a "contract" for each type of data. The contract says "you can do these operations" but doesn't say how. Later, we'll write a Postgres version of each contract. If we ever want IndexedDB or filesystem storage, we just write new versions that fulfill the same contracts.

---

### 1.2 — Postgres Implementations ✓

**What this is:** Concrete implementations of each repository interface using Postgres.

**Why it matters:** This is where the actual storage happens for v1.

**Depends on:** 1.1

**Sub-tasks:**

- [x] Set up Drizzle ORM (or similar — type-safe, migration-friendly)
- [x] Design schema: `nodes` table
- [x] Design schema: `node_edges` table
- [x] Design schema: `observations` table (append-only, partitioned by time if needed)
- [x] Design schema: `artifacts` table + `artifact_revisions` table
- [x] Design schema: `variables` table
- [x] Design schema: `episodes` table
- [x] Design schema: `policies` table (stores code as text or reference)
- [x] Design schema: `action_runs` table
- [x] Design schema: `surfaces` table + `surface_layouts` table
- [x] Design schema: `entities` table + `entity_events` table
- [x] Design schema: `grants` table
- [x] Implement each repository interface
- [ ] Write integration tests (spin up test DB, run operations, verify)

**Plain English:** Now we're writing the actual code that talks to Postgres. Each "contract" from 1.1 gets a concrete implementation. The rest of the app will never know it's Postgres — it just calls the interface methods.

**Design note:** Keep the schema close to the protocol types. Don't over-normalize. The goal is that the bundle export/import is straightforward — each table maps roughly to a folder in the bundle.

---

### 1.3 — Bundle Import/Export ✓

**What this is:** Functions to export the entire database to a Omnilith Bundle folder, and import from one.

**Why it matters:** Proves the system is portable. Also useful for backups and migrations.

**Depends on:** 0.3, 1.2

**Sub-tasks:**

- [x] Implement `exportBundle(repos: RepositoryContext, outputPath: string)`
- [x] Implement `importBundle(repos: RepositoryContext, bundlePath: string)`
- [x] Handle NDJSON streaming for large observation logs
- [x] Write tests: export → wipe DB → import → verify identical state

**Plain English:** This is the "save" and "load" feature for the entire system. If it works, you've proven that nothing is trapped in Postgres — you could take the bundle and load it into a completely different implementation.

---

## Phase 2: The Observation → Policy → Effect Loop

_Build the core regulatory engine._

### 2.1 — Observation Ingestion ✓

**What this is:** The entry point for all signals into the system.

**Why it matters:** Observations are the sensory input — everything starts here.

**Depends on:** 1.2

**Sub-tasks:**

- [x] Create `ingestObservation(obs: Observation)` function
- [x] Validate observation shape and required fields
- [x] Enforce provenance requirements (origin, sourceId)
- [x] Append to observation log via repository
- [x] Return observation ID for downstream use
- [x] Write tests for valid/invalid observations

**Plain English:** When something happens (user logs sleep, sensor reports data, agent notices something), it becomes an Observation. This function is the front door — it validates the observation and saves it to the log.

---

### 2.2 — Policy Evaluation Engine ✓

**What this is:** A pure function that runs policies against observations and returns effects.

**Why it matters:** This is the "brain" — policies decide what should happen in response to observations.

**Depends on:** 0.2, 2.1

**Sub-tasks:**

- [x] Create `PolicyContext` builder (assembles read-only context for policy)
- [x] Implement `evaluatePolicy(policy: Policy, ctx: PolicyContext): Effect[]`
- [x] Implement `evaluatePolicies(policies: Policy[], ctx: PolicyContext): Effect[]` with priority ordering
- [x] Handle `priorEffects` accumulation (later policies see earlier effects)
- [x] Handle `suppress` effect (stops further evaluation)
- [x] Sandbox policy execution (catch errors, timeout protection)
- [x] Write tests for policy priority, effect accumulation, suppression

**Plain English:** When an observation arrives, we need to ask "what should happen now?" Policies are the rules that answer this question. Each policy is a pure function — you give it context (the observation, the node's state, etc.) and it returns a list of effects (things that should happen). Policies run in priority order, and each one can see what the previous ones decided.

**Key insight:** Policies don't _do_ anything — they just _decide_ what should be done. The actual doing happens in the next step.

---

### 2.3 — Effect Execution ✓

**What this is:** Takes the effects returned by policies and makes them real.

**Why it matters:** Separates decision (pure) from execution (side-effectful).

**Depends on:** 2.2

**Sub-tasks:**

- [x] Create effect executor registry (maps effect type to handler)
- [x] Implement `route_observation` handler (copy observation to another node)
- [x] Implement `create_entity_event` handler (append event to entity)
- [x] Implement `propose_action` handler (create pending ActionRun)
- [x] Implement `tag_observation` handler (add tags to observation)
- [x] Implement `suppress` handler (already handled in evaluation, but log it)
- [x] Implement `log` handler (write to structured log)
- [x] Make registry extensible for pack effects
- [x] Write tests for each effect type

**Plain English:** Effects are like instructions: "route this observation to Node X" or "propose an action to send an email." The effect executor reads each instruction and carries it out. This is where side effects happen — writing to the database, queuing actions, etc.

---

### 2.4 — The Runtime Loop ✓

**What this is:** Ties ingestion → evaluation → execution into a single flow.

**Why it matters:** This is the heartbeat of the system.

**Depends on:** 2.1, 2.2, 2.3

**Sub-tasks:**

- [x] Create `processObservation(obs: Observation)` that orchestrates the full loop
- [x] Load relevant policies for the observation's node
- [x] Build policy context
- [x] Evaluate policies
- [x] Execute effects
- [x] Return summary of what happened (for logging/debugging)
- [x] Write integration tests for end-to-end observation processing

**Plain English:** This is the main loop: observation comes in → policies evaluate it → effects execute. One function that does the whole thing. Call it whenever a new observation arrives.

---

## Phase 3: ActionRuns (Auditable Execution)

_Build the gated action system._

### 3.1 — ActionRun Lifecycle

**What this is:** The state machine for actions — from proposal to execution.

**Why it matters:** Actions are how the system affects the world. They need approval and audit trails.

**Depends on:** 2.3

**Sub-tasks:**

- [ ] Implement `createActionRun(proposal: ActionProposal, policyId: string, observationId: string)`
- [ ] Implement risk level assignment (from action definition)
- [ ] Implement `approveActionRun(runId: string, approverNodeId: string, method: "manual" | "auto")`
- [ ] Implement `rejectActionRun(runId: string, reason: string)`
- [ ] Implement `executeActionRun(runId: string)` with result/error capture
- [ ] Implement auto-approval for `low` risk actions
- [ ] Write tests for each state transition

**Plain English:** When a policy says "we should do X," it doesn't just happen. It creates an ActionRun — a record that says "someone proposed X." Then, depending on how risky X is, it either auto-approves or waits for a human. Once approved, it executes and records the result. Every step is logged so you can audit later.

---

### 3.2 — Action Registry

**What this is:** A registry of available actions and their definitions.

**Why it matters:** Actions need to be defined before they can be proposed.

**Depends on:** 0.2

**Sub-tasks:**

- [ ] Define `ActionDefinition` type (name, risk level, parameters, handler)
- [ ] Create action registry (register, lookup)
- [ ] Implement core actions: `create_artifact`, `update_artifact`, `create_episode`, etc.
- [ ] Make registry extensible for pack actions
- [ ] Write tests for action registration and lookup

**Plain English:** Before you can propose "send an email," the system needs to know what "send an email" means — what parameters it needs, how risky it is, and what code to run. The action registry is where all these definitions live.

---

### 3.3 — Delegation and Agent Constraints

**What this is:** Enforce what agents can and cannot do.

**Why it matters:** Agents operate with borrowed authority — constraints are safety rails.

**Depends on:** 3.1

**Sub-tasks:**

- [ ] Implement `AgentDelegation` storage and lookup
- [ ] Implement `canAgentApprove(agentNodeId: string, actionRun: ActionRun): boolean`
- [ ] Enforce `maxRiskLevel` constraint
- [ ] Enforce `allowedEffects` constraint
- [ ] Enforce `expiresAt` constraint
- [ ] Write tests for delegation scenarios

**Plain English:** Agents (automated actors) can only do what they've been given permission to do. If an agent tries to approve a high-risk action but it's only allowed up to medium, the system blocks it. These rules are checked automatically.

---

## Phase 4: Variables and Estimation

_Build the Active Inference foundation._

### 4.1 — Variable Storage

**What this is:** CRUD operations for Variables and their Proxy definitions.

**Why it matters:** Variables are what the system regulates.

**Depends on:** 1.2

**Sub-tasks:**

- [ ] Implement variable creation with viable/preferred ranges
- [ ] Implement proxy attachment (link proxy specs to variables)
- [ ] Implement variable queries (by node, by key)
- [ ] Write tests for variable lifecycle

**Plain English:** A Variable is something you care about tracking — like "sleep quality" or "creative output." Each variable has ranges that define what's good (preferred) and what's acceptable (viable). You create variables and attach rules for how to estimate them.

---

### 4.2 — Proxy Evaluation

**What this is:** Derive Variable estimates from observations using Proxy specs.

**Why it matters:** Estimates are how the system "perceives" current state.

**Depends on:** 4.1, 2.1

**Sub-tasks:**

- [ ] Implement `evaluateProxy(proxy: ProxySpec, observations: Observation[]): number | string | boolean`
- [ ] Support `rule` transform (simple conditionals)
- [ ] Support `formula` transform (mathematical expressions)
- [ ] Stub `model` transform (for future ML-based estimation)
- [ ] Handle confidence scoring
- [ ] Write tests for each transform type

**Plain English:** A Proxy is a recipe for turning raw observations into an estimate. For example: "look at all sleep observations from the past week, average the hours, that's the sleep quality estimate." The proxy evaluator runs these recipes.

---

### 4.3 — Variable Estimate Derivation

**What this is:** Compute full `VariableEstimate` objects from Variables and their Proxies.

**Why it matters:** Estimates feed into policies — they're the "sensors" policies read.

**Depends on:** 4.2

**Sub-tasks:**

- [ ] Implement `deriveEstimate(variable: Variable, observations: Observation[]): VariableEstimate`
- [ ] Calculate `inViableRange` and `inPreferredRange`
- [ ] Calculate `deviation` (0 = preferred center, 1 = outside viable)
- [ ] Calculate `trend` (comparing recent estimates)
- [ ] Implement caching layer (non-canon, reconstructable)
- [ ] Write tests for edge cases (no observations, out of range, etc.)

**Plain English:** An estimate is the system's current belief about a variable. "Right now, I estimate your sleep quality is 6/10, which is inside your viable range but below your preferred range, and it's been trending down." This gets computed fresh whenever needed.

---

### 4.4 — Wire Estimates into Policy Context

**What this is:** Make estimates available to policies via `ctx.estimates`.

**Why it matters:** Policies need to see estimates to make decisions about regulation.

**Depends on:** 4.3, 2.2

**Sub-tasks:**

- [ ] Add `getVariableEstimate(variableId)` to policy context
- [ ] Lazy-load estimates (don't compute until asked)
- [ ] Cache within a single evaluation cycle
- [ ] Write tests for policies that use estimates

**Plain English:** Now policies can ask "what's the current estimate for sleep quality?" and use that to decide whether to propose an intervention.

---

## Phase 5: Episodes (Structured Interventions)

_Build the intervention coordination system._

### 5.1 — Episode Lifecycle

**What this is:** CRUD and state transitions for Episodes.

**Why it matters:** Episodes are how the system coordinates responses to drift.

**Depends on:** 1.2

**Sub-tasks:**

- [ ] Implement episode creation with variable/intent bindings
- [ ] Implement status transitions (planned → active → completed/abandoned)
- [ ] Implement episode queries (active by node, by variable)
- [ ] Enforce: episodes mutated only through Prism (API-level guard)
- [ ] Write tests for episode lifecycle

**Plain English:** An Episode is a focused effort: "For the next week, I'm going to stabilize my sleep." It has a start, an end, and a goal (the intent). Episodes can be regulatory (fixing a problem) or exploratory (trying something new).

---

### 5.2 — Wire Episodes into Policy Context

**What this is:** Make active episodes visible to policies.

**Why it matters:** Policies may behave differently during an active episode.

**Depends on:** 5.1, 2.2

**Sub-tasks:**

- [ ] Add `getActiveEpisodes()` to policy context
- [ ] Add episode-aware policy examples
- [ ] Write tests for policies that check active episodes

**Plain English:** Policies can now ask "is there an active episode targeting sleep quality?" and adjust their recommendations accordingly — maybe being more aggressive about reminders, or relaxing other constraints.

---

## Phase 6: Entities (Durable Referents)

_Build the semantic identity layer._

### 6.1 — Entity Storage and Events

**What this is:** Event-sourced entities with stable identity.

**Why it matters:** Entities let you refer to the same "thing" across multiple artifacts and over time.

**Depends on:** 1.2

**Sub-tasks:**

- [ ] Implement entity type definitions (schema for each entity kind)
- [ ] Implement entity creation
- [ ] Implement `appendEntityEvent(entityId, event)` (event-sourced mutation)
- [ ] Implement entity state materialization (replay events to get current state)
- [ ] Implement entity queries (by type, by node)
- [ ] Write tests for entity lifecycle and event replay

**Plain English:** An Entity is a thing with an identity that persists — like a "song" or a "project." Instead of directly editing the entity, you append events: "title changed," "status updated." The current state is computed by replaying all events. This gives you full history and auditability.

---

### 6.2 — Entity References in Artifacts

**What this is:** Link artifacts to entities by ID.

**Why it matters:** Multiple artifacts can reference the same entity.

**Depends on:** 6.1

**Sub-tasks:**

- [ ] Add `entityRefs: string[]` field to Artifact type
- [ ] Implement entity reference resolution (artifact → entity lookup)
- [ ] Write tests for artifact-entity relationships

**Plain English:** An artifact (like a document) can say "this is about Song X" by referencing the song entity's ID. Now any artifact about that song can be found, and the song's identity is stable even if documents change.

---

## Phase 7: Access Control (Grants)

_Build the authority layer._

### 7.1 — Grant Storage

**What this is:** CRUD for grants — explicit permissions.

**Why it matters:** Access is explicit and inspectable, not implicit.

**Depends on:** 1.2

**Sub-tasks:**

- [ ] Define grant scopes (read, write, admin, specific capabilities)
- [ ] Implement grant creation (nodeId → resourceId → scopes)
- [ ] Implement grant revocation
- [ ] Implement grant queries (what can node X access? who can access resource Y?)
- [ ] Write tests for grant lifecycle

**Plain English:** A Grant says "Node A has permission to do X with resource Y." All access control is done through grants — there's no hidden logic. You can inspect exactly who has access to what.

---

### 7.2 — Access Checking

**What this is:** Utility functions to check permissions before operations.

**Why it matters:** Consistent access control across the system.

**Depends on:** 7.1

**Sub-tasks:**

- [ ] Implement `checkAccess(nodeId, resourceId, scope): boolean`
- [ ] Implement access guards for repositories (refuse unauthorized operations)
- [ ] Integrate with node edges (policies may interpret edges as implicit grants)
- [ ] Write tests for access scenarios

**Plain English:** Before any sensitive operation, the system asks "does this node have permission?" This function answers that question by checking grants.

---

## Phase 8: Artifacts and Revisions

_Build the content authoring layer._

### 8.1 — Artifact CRUD

**What this is:** Create, read, update artifacts.

**Why it matters:** Artifacts are the content objects users create and edit.

**Depends on:** 1.2

**Sub-tasks:**

- [ ] Implement artifact creation with required fields (about, page)
- [ ] Implement artifact retrieval (by ID, by node)
- [ ] Implement artifact update (creates new revision, bumps trunk version)
- [ ] Implement artifact status transitions (draft → active → published → archived)
- [ ] Write tests for artifact lifecycle

**Plain English:** An Artifact is a piece of content — a note, a page, a document. Every time you save, it creates a new revision (like version history). You can always go back to previous versions.

---

### 8.2 — Revision History

**What this is:** Access and navigate revision history.

**Why it matters:** Revisions are how the system remembers what changed.

**Depends on:** 8.1

**Sub-tasks:**

- [ ] Implement `getRevisions(artifactId): Revision[]`
- [ ] Implement `getRevision(artifactId, version): Revision`
- [ ] Implement revision diffing (what changed between versions)
- [ ] Write tests for revision queries

**Plain English:** Every artifact remembers its history. You can see all previous versions, compare them, and understand how the content evolved.

---

### 8.3 — PageDoc Block System

**What this is:** The structured content format inside artifacts.

**Why it matters:** Blocks are portable and renderer-agnostic.

**Depends on:** 0.2

**Sub-tasks:**

- [ ] Define core block types (paragraph, heading, list, code, image, etc.)
- [ ] Implement block validation
- [ ] Implement block serialization/deserialization
- [ ] Make block types extensible (for pack-defined blocks)
- [ ] Write tests for block operations

**Plain English:** Inside an artifact, content is stored as "blocks" — paragraphs, headings, lists, etc. This structure is standard so different renderers (web, mobile, export) can all understand it.

---

## Phase 9: Surfaces and Layouts

_Build the projection layer._

### 9.1 — Surface Storage

**What this is:** CRUD for surface configurations.

**Why it matters:** Surfaces define how content is viewed (but never store content themselves).

**Depends on:** 1.2

**Sub-tasks:**

- [ ] Implement surface creation
- [ ] Implement surface retrieval (by ID, by node, by visibility)
- [ ] Implement surface update
- [ ] Enforce Projection Law at storage level (surfaces reference artifacts, never embed content)
- [ ] Write tests for surface lifecycle

**Plain English:** A Surface is a view configuration — "show this artifact as a page" or "show all artifacts tagged 'journal' as a timeline." The surface says _what_ to show and _how_, but the content comes from elsewhere (artifacts, entities, etc.).

---

### 9.2 — Layout System

**What this is:** Layout configurations for surfaces.

**Why it matters:** Layouts control presentation without affecting data.

**Depends on:** 9.1

**Sub-tasks:**

- [ ] Implement `sections` mode layouts (header, body, repeater, footer)
- [ ] Define layout schema (positions, slots, styles)
- [ ] Implement layout storage and retrieval
- [ ] Stub `canvas` mode for future (free positioning)
- [ ] Write tests for layout application

**Plain English:** A Layout controls how content is arranged on screen — where the title goes, how items are spaced, etc. For v1, we support "sections" (vertical stacking). Canvas mode (free positioning) comes later.

---

## Phase 10: Prism (The Commit Boundary)

_Build the mutation gateway._

### 10.1 — Prism API Layer

**What this is:** The single interface through which all canon mutations happen.

**Why it matters:** This is the core constraint — Prism is the only commit boundary.

**Depends on:** All repository implementations

**Sub-tasks:**

- [ ] Define Prism operation types (createArtifact, updateArtifact, createEpisode, approveAction, etc.)
- [ ] Implement operation handlers
- [ ] Implement transaction wrapping (all-or-nothing commits)
- [ ] Implement audit logging (who changed what, when)
- [ ] Reject any mutation that tries to bypass Prism
- [ ] Write tests for mutation operations

**Plain English:** Prism is the gatekeeper. Any change to canon (artifacts, episodes, variables, etc.) must go through Prism. This ensures everything is audited, validated, and transactional.

---

### 10.2 — Prism Context for Policies

**What this is:** Read-only access to canon state for policies.

**Why it matters:** Policies can read but never write directly.

**Depends on:** 10.1, 2.2

**Sub-tasks:**

- [ ] Implement `canon.getArtifact()`, `canon.getEntity()`, etc. in policy context
- [ ] Ensure all accessors return frozen/immutable objects
- [ ] Write tests verifying policies cannot mutate state

**Plain English:** Policies need to see the current state to make decisions, but they're not allowed to change anything directly. They can only return effects, which Prism then executes.

---

## Phase 11: Packs (Extension System)

_Build the plugin architecture._

### 11.1 — Pack Definition Format

**What this is:** The structure of a pack — a bundle of extensions.

**Why it matters:** Packs let you add new capabilities without modifying core code.

**Depends on:** 0.2

**Sub-tasks:**

- [ ] Define `Pack` manifest schema (name, version, dependencies)
- [ ] Define pack contents: sensors, policies, actions, entity types, block types
- [ ] Implement pack validation
- [ ] Write tests for pack structure

**Plain English:** A Pack is a plugin that adds new stuff — new types of actions, new policies, new entity types. It's packaged in a standard way so the system knows how to load it.

---

### 11.2 — Pack Loading and Registration

**What this is:** Load packs into the runtime.

**Why it matters:** Makes the extension system actually work.

**Depends on:** 11.1

**Sub-tasks:**

- [ ] Implement pack discovery (scan a directory, read manifests)
- [ ] Implement pack registration (register actions, policies, etc. with their registries)
- [ ] Handle pack dependencies (load in correct order)
- [ ] Implement pack namespacing (pack effects use `pack:name:effect` format)
- [ ] Write tests for pack loading

**Plain English:** When the system starts, it finds all packs, loads them in the right order, and registers their extensions. Now you can use the new actions and policies they provide.

---

## Phase 12: Replay and Determinism

_Prove the system is reconstructable._

### 12.1 — Log Replay

**What this is:** Rebuild derived state by replaying event logs.

**Why it matters:** Proves canon is sufficient — no hidden state.

**Depends on:** 2.4, 6.1

**Sub-tasks:**

- [ ] Implement `replayObservationLog(observations: Observation[])` (re-evaluate policies, re-derive effects)
- [ ] Implement `replayEntityEvents(entityId, events: EntityEvent[])` (rebuild entity state)
- [ ] Handle ActionRun replay (don't re-execute, just use recorded results)
- [ ] Write tests: replay from bundle should produce identical derived state

**Plain English:** If you export everything to a bundle and then replay the logs in a fresh system, you should get the exact same state. This test proves nothing is hidden or lost.

---

### 12.2 — Determinism Tests

**What this is:** Verify policies produce identical results given identical inputs.

**Why it matters:** Non-deterministic policies break replay.

**Depends on:** 12.1

**Sub-tasks:**

- [ ] Create determinism test harness
- [ ] Run same observation through same policy multiple times, verify identical effects
- [ ] Flag policies that use non-deterministic operations (random, current time, etc.)
- [ ] Write tests for determinism invariants

**Plain English:** Policies must be predictable — same input, same output, every time. These tests catch policies that accidentally break this rule.

---

## Phase 13: Web API Layer

_Build the interface between frontend and backend._

### 13.1 — API Routes

**What this is:** HTTP/tRPC endpoints for frontend operations.

**Why it matters:** The UI needs a way to talk to the backend.

**Depends on:** 10.1

**Sub-tasks:**

- [ ] Set up tRPC (or similar type-safe API layer)
- [ ] Implement read routes: getSurface, getArtifact, getVariable, etc.
- [ ] Implement Prism mutation routes: createArtifact, updateArtifact, etc.
- [ ] Implement observation ingestion route
- [ ] Implement ActionRun approval routes
- [ ] Add authentication middleware (node identity)
- [ ] Write API tests

**Plain English:** The frontend needs to fetch data and send changes. These routes handle that, using the Prism layer for mutations and repositories for reads.

---

### 13.2 — Real-time Subscriptions

**What this is:** Push updates to the frontend when state changes.

**Why it matters:** UI should reflect changes without manual refresh.

**Depends on:** 13.1

**Sub-tasks:**

- [ ] Implement subscription mechanism (WebSocket or SSE)
- [ ] Publish events when observations arrive
- [ ] Publish events when ActionRuns change status
- [ ] Publish events when artifacts/surfaces update
- [ ] Write tests for subscription delivery

**Plain English:** Instead of the frontend constantly asking "did anything change?", the backend pushes updates when something happens. This keeps the UI in sync.

---

## Phase 14: Web UI (Finally!)

_Build the visual interface._

### 14.1 — Surface Renderer

**What this is:** Render surfaces and their layouts.

**Why it matters:** This is how users see content.

**Depends on:** 9.1, 9.2, 13.1

**Sub-tasks:**

- [ ] Implement surface fetching and caching
- [ ] Implement layout renderer (sections mode)
- [ ] Implement block renderers for each block type
- [ ] Handle surface visibility (public, node_members, granted, private)
- [ ] Write component tests

**Plain English:** Given a surface configuration, render it on screen. Fetch the referenced artifacts, apply the layout, render each block.

---

### 14.2 — Prism UI (Editing Overlay)

**What this is:** The interface for editing and committing changes.

**Why it matters:** Prism is the only way to mutate canon — it needs a UI.

**Depends on:** 14.1, 10.1

**Sub-tasks:**

- [ ] Implement artifact editor (block-based editing)
- [ ] Implement revision history browser
- [ ] Implement episode creator and editor
- [ ] Implement variable and proxy configuration
- [ ] Implement ActionRun approval interface
- [ ] Implement policy configuration (for advanced users)
- [ ] Write component tests

**Plain English:** Prism is the editing mode. Click to edit an artifact, create an episode, approve an action, configure policies. All changes go through Prism.

---

### 14.3 — Node Navigation

**What this is:** Switch between nodes, view relationships.

**Why it matters:** Users need to navigate the node structure.

**Depends on:** 14.1

**Sub-tasks:**

- [ ] Implement node switcher
- [ ] Implement edge visualization
- [ ] Implement grant management UI
- [ ] Write component tests

**Plain English:** If you have multiple nodes (personal, project, etc.), you need a way to switch between them and see how they're connected.

---

### 14.4 — Dashboard / Overview

**What this is:** High-level view of system state.

**Why it matters:** Users need a home screen.

**Depends on:** 14.1

**Sub-tasks:**

- [ ] Implement variable estimate summary (what's in range, what's drifting)
- [ ] Implement active episode list
- [ ] Implement pending ActionRun queue
- [ ] Implement recent observation feed
- [ ] Write component tests

**Plain English:** When you open the app, you see a summary: how are your variables doing, what episodes are active, what actions need approval, what happened recently.

---

## Phase 15: Polish and Integration

_Tie everything together._

### 15.1 — End-to-End Testing

**What this is:** Tests that simulate real usage.

**Why it matters:** Catches integration bugs.

**Depends on:** All previous phases

**Sub-tasks:**

- [ ] Write E2E tests for core flows (create artifact, edit, view)
- [ ] Write E2E tests for observation → policy → action flow
- [ ] Write E2E tests for episode lifecycle
- [ ] Write E2E tests for bundle export/import

**Plain English:** Tests that act like a real user — clicking buttons, filling forms, verifying results. These catch bugs that unit tests miss.

---

### 15.2 — Error Handling and Observability

**What this is:** Graceful error handling and logging.

**Why it matters:** When things break, you need to know what happened.

**Depends on:** All previous phases

**Sub-tasks:**

- [ ] Implement structured error types
- [ ] Add error boundaries in UI
- [ ] Implement structured logging throughout
- [ ] Add health checks
- [ ] Add basic metrics (observation rate, policy eval time, etc.)

**Plain English:** Make errors helpful instead of cryptic. Log important events. Add monitoring so you can see if something's wrong.

---

### 15.3 — Documentation

**What this is:** Usage docs and API reference.

**Why it matters:** Future you (and others) need to understand the system.

**Depends on:** All previous phases

**Sub-tasks:**

- [ ] Document API routes
- [ ] Document pack development
- [ ] Document policy authoring
- [ ] Add inline code comments for complex logic
- [ ] Create getting-started guide

**Plain English:** Write down how to use the thing you built.

---

## Appendix: Suggested Implementation Order

For solo development, consider this sequence:

1. **Phase 0** — Get the structure right first
2. **Phase 1.1** — Repository interfaces (defines the contract)
3. **Phase 2.1-2.4** — The core loop (observation → policy → effect)
4. **Phase 1.2** — Postgres implementations (now you have something to run)
5. **Phase 3** — ActionRuns (complete the regulatory cycle)
6. **Phase 4** — Variables and estimation (Active Inference core)
7. **Phase 5** — Episodes (intervention coordination)
8. **Phase 8** — Artifacts (content authoring)
9. **Phase 6** — Entities (semantic identity)
10. **Phase 7** — Grants (access control)
11. **Phase 9** — Surfaces and layouts (projection layer)
12. **Phase 10** — Prism (mutation gateway)
13. **Phase 1.3** — Bundle import/export (prove portability)
14. **Phase 12** — Replay and determinism (prove correctness)
15. **Phase 11** — Packs (extension system)
16. **Phase 13** — Web API
17. **Phase 14** — Web UI
18. **Phase 15** — Polish

This order prioritizes the "engine" over the "interface" — you can test the core loop with scripts before building any UI.

---

## Key Principles to Remember

1. **Repository interfaces first, implementations second.** This keeps you substrate-independent.

2. **Types are documentation.** If you change behavior, update the types first.

3. **Policies are pure.** If you're tempted to add a side effect to a policy, you're doing it wrong — that's an effect.

4. **Prism is the only door.** If something mutates canon without going through Prism, it's a bug.

5. **Derived state is cheap.** Don't store what you can compute. Caches are fine, but they're not canon.

6. **Test the loop early.** Observation → policy → effect → action is the heartbeat. Get it working fast, even with stubs.

7. **Bundle export/import is your proof.** If you can round-trip through a bundle, your abstractions are working.

---

_This plan is a living document. Update it as you learn._

---

## Appendix B: UX Concepts from Previous Implementation

_These ideas from `/temp/projection` are worth carrying forward._

### The Prism Overlay (Navigation + Editing)

The previous implementation had a "Prism" overlay that served as a game-like navigation interface. In the spec, Prism is the **commit boundary** for mutations. We can unify these:

**Prism is the overlay that handles both navigation AND editing.**

When viewing, Prism shows you where you are and where you can go. When editing, Prism is where you make changes. One interface, two modes.

```
┌─────────────────────────────────────────────────┐
│  Prism Overlay                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  [Map Tab]  [Edit Tab]  [Actions Tab]     │  │
│  ├───────────────────────────────────────────┤  │
│  │                                           │  │
│  │  Map Mode: Navigate between surfaces      │  │
│  │  Edit Mode: Modify artifacts, episodes    │  │
│  │  Actions Mode: Review pending ActionRuns  │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

### HUD (Heads-Up Display)

Fixed, always-visible elements that provide context without obscuring content.

**Components:**

| Element           | Position     | Purpose                                            |
| ----------------- | ------------ | -------------------------------------------------- |
| Minimap           | Top-left     | Shows current location in the node's surface space |
| Menu trigger      | Top-right    | Opens Prism overlay                                |
| Status indicators | Bottom-left  | Variable estimates, episode status                 |
| Action queue      | Bottom-right | Pending approvals count                            |

**Minimap Behavior:**

- 68×68px grid showing available surfaces as dots
- Animated indicator tracking cursor (desktop) or scroll (mobile)
- Click to open full Prism overlay
- Shows current surface name

**Why this matters:** The HUD maintains spatial awareness without requiring explicit navigation. You always know where you are.

---

### Map: Spatial Navigation

The map is an **abstract spatial representation** of surfaces, not a geographic visualization.

**Two views:**

- **Local View**: Surfaces within current node, scattered in 2D space
- **World View**: All nodes, for cross-node navigation

**Interaction:**

- Ctrl/Cmd + scroll to zoom (0.5x to 3x)
- Drag to pan when zoomed
- Click surface to navigate
- Pinch-to-zoom on touch

**Visual language:**

- Surfaces positioned intentionally (not a grid — memorable spatial layout)
- Categories color-coded (exhibit, plaza, device)
- Locked surfaces show ⟠ icon
- External links in separate "exit zone"

**Implementation note:** Surface positions are stored as percentages (`{left: "10%", top: "14%"}`), not computed. This makes the map feel designed, not generated.

---

### Device Panels

Instead of separate pages, operational tools render **inside** the Prism overlay as tabs:

| Panel   | Purpose                                                         |
| ------- | --------------------------------------------------------------- |
| Sensors | Observation ingestion (drag-drop CSV, domain status, staleness) |
| Process | Document viewer (org docs, policies)                            |
| Audio   | Playback controls (if applicable)                               |

**Why this matters:** Keeps the user in context. Opening a tool doesn't break your sense of location.

**Protocol mapping:**

- Sensors panel → Observation ingestion
- Process panel → Artifact/policy viewing
- Could add: Variables panel, Episodes panel, ActionRuns panel

---

### Observation Ingestion UX (Sensors Panel)

The previous implementation had a sophisticated observation UI:

**Domain Status Cards:**

```
┌─────────────────────────────────────┐
│  Sleep                    ● Fresh   │
│  42 observations                    │
│  Jan 1 - Jan 28, 2026              │
│  Last: 2 hours ago                  │
└─────────────────────────────────────┘
```

**Staleness indicators:**

- Fresh (green): Recent observations within expected cadence
- Stale (yellow): Overdue for new observations
- Old (red): Significantly overdue

**Cadence configuration:** Each domain (sleep, exercise, mood, etc.) can have its own expected observation frequency.

**Protocol mapping:** This directly supports Variable estimation. If the proxy for "sleep quality" relies on observations of type "health.sleep", staleness tells you if the estimate is trustworthy.

---

### Access Control Visualization

Surfaces have visibility rules, visualized clearly:

```typescript
interface SurfaceAccess {
  requiredAccess: 'anonymous' | 'viewer' | 'supporter' | 'admin';
  ifLocked: 'hide' | 'show'; // hide entirely or show with lock icon
}
```

**Visual treatment:**

- Accessible surfaces: normal appearance
- Locked surfaces (ifLocked: "show"): dimmed with ⟠ icon
- Locked surfaces (ifLocked: "hide"): not rendered at all

**Protocol mapping:** This is the Grant system made visible. Users see what they can access and what requires elevation.

---

### Data-Driven Navigation

Surfaces are defined in JSON, generated at build time from canonical sources:

```
Canonical markdown (nodes/org/entities/surfaces.md)
        ↓
Build-time script (generateSurfaces.ts)
        ↓
JSON (public/data/surfaces.json)
        ↓
Runtime navigation
```

**Why this matters:**

- New surfaces appear automatically (no route hardcoding)
- Navigation reflects canonical state (Projection Law)
- Single source of truth

**Protocol mapping:** Surfaces are read-only projections. The JSON generation is a form of "projection" — deriving navigation from canon.

---

### Cross-Component Communication (PrismControls)

The previous implementation used a registration pattern for loose coupling:

```typescript
// Child component registers controls with Prism
const { registerControls } = usePrism();

useEffect(() => {
  registerControls('audio', {
    open: () => setOverlayOpen(true),
    close: () => setOverlayOpen(false),
  });
}, []);
```

**Why this matters:** Components can communicate without prop drilling or global state pollution. The audio player can open itself in Prism without knowing Prism's internals.

**Protocol mapping:** This pattern is useful for ActionRun approvals — a policy can trigger a notification that opens the Actions panel in Prism.

---

### Responsive Device Detection

The previous implementation adapted to device capabilities:

```typescript
const useDeviceCapabilities = () => {
  const isDesktop = useMediaQuery('(pointer: fine)');

  return {
    useCursorTracking: isDesktop,
    useScrollTracking: !isDesktop,
    enablePinchZoom: !isDesktop,
  };
};
```

**Why this matters:** The minimap indicator follows your cursor on desktop but follows scroll position on mobile. Same concept, different input.

---

### Visual Language

From the CSS patterns in the previous implementation:

**Color palette:**

- Background: pure black (#000)
- Text: low-contrast white (rgba(255,255,255, 0.6-0.9))
- Accents: subtle glows, not bright colors
- Status: green (fresh), yellow (stale), red (old)

**Typography:**

- Monospace for data
- Sans-serif for navigation
- Large, readable text with generous spacing

**Patterns:**

- Grid backgrounds (scanner aesthetic)
- Crosshair overlays in map view
- Staggered animation entrance (0.08s per item)
- Subtle hover states

**Why this matters:** The aesthetic is intentional — minimal, focused, almost clinical. It supports concentration rather than distraction.

---

### Mapping Previous Concepts to Protocol

| Previous Concept      | Protocol Equivalent     | Notes                                  |
| --------------------- | ----------------------- | -------------------------------------- |
| Prism overlay         | Prism (commit boundary) | Same name, expanded role               |
| Surfaces (navigation) | Surfaces                | Direct mapping                         |
| Nodes (org, personal) | Nodes                   | Direct mapping                         |
| Device panels         | Specialized Surfaces    | kind: "device" vs kind: "page"         |
| Sensor ingestion      | Observation ingestion   | Direct mapping                         |
| Domain status         | Variable + Proxy        | Staleness = estimate confidence        |
| Access levels         | Grants                  | Direct mapping                         |
| Hero's Journey        | Artifacts + Entities    | Stages as artifacts, songs as entities |
| Map positions         | Surface metadata        | Could be stored in Surface or Layout   |

---

### Recommended UI Phase Additions

Based on these concepts, consider adding to Phase 14:

**14.0 — HUD Framework**

- [ ] Implement fixed HUD container
- [ ] Implement Minimap component
- [ ] Implement Menu trigger
- [ ] Implement status indicator slots
- [ ] Implement action queue badge

**14.1.5 — Map Navigation**

- [ ] Implement local/world view toggle
- [ ] Implement zoom/pan mechanics
- [ ] Implement surface positioning (percentage-based)
- [ ] Implement category visualization
- [ ] Implement access visualization (locked surfaces)

**14.2.5 — Device Panels in Prism**

- [ ] Implement tab system for devices
- [ ] Implement Sensors panel (observation ingestion)
- [ ] Implement Variables panel (estimate dashboard)
- [ ] Implement Episodes panel (active interventions)
- [ ] Implement Actions panel (pending approvals)

---

### Open Questions

1. **Surface positions** — Should these be stored in the Surface record, the Layout, or separate metadata? The previous implementation used fixed positions in a separate config.

2. **Prism modes** — How do we transition between navigation and editing? Explicit tabs? Context-sensitive?

3. **Mobile-first or desktop-first?** — The previous implementation was desktop-first with mobile adaptations. Should we flip this?

4. **Audio/media** — Is this in scope for v1? The previous implementation had a sophisticated audio system.

5. **3D exploration** — The previous implementation had scaffolding for a Three.js world explorer. Defer to v2?

---

_These UX concepts provide a strong foundation. They're not mandatory — adapt as you build._
