# Omnilith Protocol — Extensions Index

> This document provides an overview of all protocol extensions and their relationships to the core specification.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CORE PROTOCOL                                 │
│                         (spec.md)                                    │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │
│  │   Nodes     │  │  Artifacts  │  │   Policies  │  │   Prism    │  │
│  │   Edges     │  │  Surfaces   │  │   Effects   │  │   Daemon   │  │
│  │   Grants    │  │  PageDoc    │  │  ActionRuns │  │            │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │
│  │Observations │  │  Variables  │  │  Episodes   │  │   Packs    │  │
│  │ Provenance  │  │   Proxies   │  │  Intents    │  │            │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │
│                                                                      │
│  Protocol Guarantees: Projection Law, Canon, Determinism, Replay     │
└─────────────────────────────────────────────────────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ FEDERATION EXTENSION│  │  SPATIAL EXTENSION  │  │   VALUE EXTENSION   │
│(federation-ext.md)  │  │(spatial-extension.md│  │ (value-extension.md)│
│                     │  │                     │  │                     │
│ Identity, Anchoring │  │ Realms, Territories │  │ Lineage, Commitments│
│ Consensus, Proofs   │  │ Terrain, Adjacency  │  │ Capacity, Metabolism│
└─────────────────────┘  └──────────┬──────────┘  └──────────┬──────────┘
           │                        │                        │
           │                        └────────────┬───────────┘
           │                                     │
           │                                     ▼
           │             ┌─────────────────────────────────────────────┐
           │             │         SPATIAL-VALUE INTEGRATION           │
           │             │       (integration-spatial-value.md)        │
           │             │                                             │
           │             │  Artifacts in Place, Place-Bound Commits,   │
           │             │  Territorial Reputation, Spatial Metabolism │
           │             └────────────────────────┬────────────────────┘
           │                                      │
           └──────────────────────────────────────┤
                                                  ▼
                         ┌─────────────────────────────────────────────┐
                         │           ADVANCED INTEGRATION              │
                         │         (advanced-integration.md)           │
                         │                                             │
                         │  Part A: Spatial Packs                      │
                         │  Part B: Governance (Consensus-backed)      │
                         │  Part C: Map Visualization                  │
                         └─────────────────────────────────────────────┘
```

---

## Extension Dependency Graph

```
                    ┌──────────────┐
                    │  Core Spec   │
                    │   (spec.md)  │
                    └──────┬───────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     │               │               │           │
     ▼               ▼               ▼           ▼
┌──────────┐  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│Federation│  │   Spatial    │ │    Value     │ │   (Future)   │
│Extension │  │  Extension   │ │  Extension   │ │  Extensions  │
└────┬─────┘  └──────┬───────┘ └──────┬───────┘ └──────────────┘
     │               │               │
     │               └───────┬───────┘
     │                       │
     │                       ▼
     │               ┌──────────────┐
     │               │Spatial-Value │
     │               │ Integration  │
     │               └──────┬───────┘
     │                      │
     └──────────────────────┤
                            ▼
                     ┌──────────────┐
                     │   Advanced   │
                     │ Integration  │
                     └──────────────┘
```

**Dependency Rules:**
- Core Spec has no dependencies
- Federation Extension requires Core Spec (foundational for multi-node consensus)
- Spatial Extension requires Core Spec
- Value Extension requires Core Spec
- Spatial-Value Integration requires both Spatial and Value Extensions
- Advanced Integration requires Spatial-Value Integration and benefits from Federation Extension

---

## Document Inventory

| Document | Status | Dependencies | Summary |
|----------|--------|--------------|---------|
| `spec.md` | Core | None | The protocol specification |
| `federation-extension.md` | Draft | Core | Local/global consensus, cryptographic identity, anchoring |
| `spatial-extension.md` | Draft | Core | Coordinates, territories, realms, terrain |
| `value-extension.md` | Draft | Core | Lineage, commitments, capacity, metabolism |
| `integration-spatial-value.md` | Draft | Spatial, Value | How space and value interact |
| `advanced-integration.md` | Draft | Spatial-Value, Federation | Packs, governance, visualization |
| `extensions-index.md` | This file | All | Overview and navigation |

---

## Core Protocol Concepts

The main specification (`spec.md`) defines these foundational concepts:

### Protocol Guarantees (§0)
- **Projection Law:** Surfaces are read-only projections of canon
- **Canon Definition:** Minimum lossless state for reconstruction
- **Omnilith Bundle:** Canonical wire format
- **Substrate Independence:** No specific storage/runtime assumed
- **Determinism & Replay:** Any compliant interpreter can replay

### Primary Concepts

| Concept | Section | Purpose |
|---------|---------|---------|
| Node | §2 | Cybernetic boundary (Subject, Object, Agent) |
| Artifact | §3 | Revisioned content object |
| PageDoc | §4 | Block-based document format |
| Surface | §5 | Read-only projection configuration |
| Layout | §6 | Presentation-only rendering rules |
| Prism | §7 | Commit boundary for canon mutation |
| Daemon | §7.1 | Embedded AI assistant |
| Observation | §8 | Sensory input (append-only log) |
| Variable | §8.1 | Regulated quantity with viable range |
| Episode | §8.2 | Time-bounded intervention |
| Policy | §9 | Pure function returning effects |
| ActionRun | §10 | Auditable action execution |
| Entity | §12 | Durable referent with stable identity |
| Grant | §13 | Access control |
| Pack | §14 | Portable bundle of capability |

---

## Extension Concepts

### Federation Extension

Adds consensus and verifiable identity to the protocol.

| Concept | Section | Purpose |
|---------|---------|---------|
| Local Canon | F.1.1 | Node-sovereign state (default) |
| Global Consensus | F.1.2 | Shared truth requiring agreement |
| Cryptographic Identity | F.2 | Verifiable node identity via keypairs/DIDs |
| Anchoring | F.4 | Committing local canon to global consensus |
| Consensus Mechanisms | F.3 | Trusted interpreter, federated witnesses, blockchain |
| Spatial Federation | F.5 | How shared Realms achieve consensus |

**New Canon:**
- Node identity (public keys, DIDs)
- Anchor records (what has been globally registered)
- Signatures on artifacts/observations

**New Derived State:**
- Verification status
- Trust relationships
- Cross-node proof validity

**Key Insight:** The protocol semantics (what things mean) remain constant. Only the consensus mechanism (who enforces agreement) varies. This allows starting local and migrating to global consensus incrementally.

### Spatial Extension

Adds geography to the protocol.

| Concept | Section | Purpose |
|---------|---------|---------|
| Realm | S.1 | Coordinate space with bounds and topology |
| Territory | S.2 | Node's claim to a region of space |
| Terrain | S.4 | Semantic property of territory |
| Adjacency | S.3 | Spatial relationships (bordering, nearby) |
| Spatial Grants | S.6 | Access control with spatial constraints |
| Spatial Actions | S.5 | Claim, transfer, resize, abandon |

**New Canon:**
- Realm definitions
- Territory assignments
- Spatial coordinates on nodes

**New Derived State:**
- Distance calculations
- Adjacency relationships
- Spatial query results

### Value Extension

Adds relational value semantics.

| Concept | Section | Purpose |
|---------|---------|---------|
| Lineage | V.1 | Influence chains between artifacts |
| Commitment | V.2 | Canonical promise with tracked outcome |
| Capacity | V.3 | Regenerating resource for pacing |
| Metabolism | V.4 | System health derived from flows |
| Reputation | V.2.4 | Derived from commitment history |

**New Canon:**
- Lineage declarations (ancestors)
- Commitment records
- Capacity state

**New Derived State:**
- Descendant counts (inverse lineage query)
- Influence metrics
- Reputation metrics
- Metabolic health

**Daemon Extensions:**
- Lineage discovery and suggestion
- Commitment drafting and tracking
- Capacity awareness
- Health interpretation

### Spatial-Value Integration

Combines spatial and value semantics.

| Concept | Section | Purpose |
|---------|---------|---------|
| Artifact Birthplace | I.1 | Spatial context of creation |
| Place-Bound Commitment | I.2 | Commitments tied to location |
| Territorial Reputation | I.3 | Trust varies by location |
| Spatial Metabolism | I.4 | Terrain affects personal state |
| Pilgrimage | I.2.4 | Commitment to travel a path |
| Local School | I.6.1 | Lineage cluster in a territory |

**Daemon as Landscape Guide:**
- Spatial navigation assistance
- Local context briefing
- Place-based recommendations
- Spatial-value pattern recognition

### Advanced Integration

Extends integrated system with governance and visualization.

| Concept | Section | Purpose |
|---------|---------|---------|
| Spatial Pack | A.1-A.5 | Packs with location constraints |
| Governance Model | B.1 | Realm administration structures |
| Territorial Dispute | B.2 | Conflict resolution |
| Council | B.3 | Collective authority |
| Realm Policy | B.4 | Realm-wide rules |
| Succession | B.5 | Territory inheritance |
| Map Layers | C.2-C.4 | Visualization of all systems |
| Journey | C.7 | Travel visualization |

---

## Type Additions by Extension

### Federation Extension Adds:

```ts
// New primary types
FederatedNode
NodeIdentity
AnchorRecord
SignedObservation
SignedArtifact
ConsensusConfig
TrustGrant

// Extensions to existing types
Node.identity?
Node.federation?
Observation.signature?
Artifact.signature?

// New action types
federation:anchor
federation:verify_anchor

// Consensus mechanism types
TrustedInterpreterConfig
FederatedWitnessesConfig
BlockchainConfig
HybridConfig
```

### Spatial Extension Adds:

```ts
// New primary types
Realm
Territory
TerritoryShape
Coordinates
AdjacencyType

// Extensions to existing types
Node.coordinates?
Node.realmMemberships?

// New action types
spatial:claim_territory
spatial:transfer_territory
spatial:resize_territory
spatial:abandon_territory

// PolicyContext extensions
canon.getTerritoriesInRadius()
canon.getAdjacentTerritories()
canon.getDistance()
canon.getTerritoryAt()
```

### Value Extension Adds:

```ts
// New primary types
Lineage
AncestorLink
Commitment
CommitmentTarget
CommitmentResolution
Capacity
CapacityModifier

// New derived types (non-canon)
InfluenceMetrics
ReputationMetrics
MetabolicMetrics
VariableEstimate (extended)

// New action types
commitment:create
commitment:activate
commitment:resolve
commitment:attest

// PolicyContext extensions
canon.getActiveCommitments()
canon.getCommitment()
derived.getReputationMetrics()
derived.getInfluenceMetrics()
derived.getMetabolicMetrics()
```

### Spatial-Value Integration Adds:

```ts
// Extensions to existing types
Artifact.spatialContext?
Commitment.spatial?
Commitment.pilgrimage?

// New derived types
SpatialLineageView
SpatialReputationMetrics
TerritoryMetabolism
LocalSchool
PilgrimagePath

// Daemon context extensions
DaemonSpatialContext
```

### Advanced Integration Adds:

```ts
// Spatial Packs
SpatialPack
PackAcquisition
DiscoverablePack
TerrainPackInteraction

// Governance
RealmGovernance
GovernorPowers
RealmConstitution
Council
Proposal
Election
TerritorialDispute
DisputeResolution

// Visualization (interpreter-level, not canon)
RealmVisualization
TerritoryVisualization
LineageLayer
ReputationLayer
CommitmentLayer
MetabolismLayer
GovernanceLayer
DaemonMapPresence
```

---

## Bundle Extensions

Each extension adds to the Omnilith Bundle format:

### Core Bundle (spec.md §0.3)
```
/omnilith-bundle
  /nodes/<nodeId>/
  /packs/<packId>/
  /log/
```

### With Federation Extension
```
/omnilith-bundle
  /nodes/<nodeId>/
    identity.json              # Cryptographic identity
    anchors.ndjson             # Anchor records log
  /federation/
    config.json                # Federation configuration
    trusted-keys.json          # Known public keys
    consensus-proofs.ndjson    # Proof log
```

### With Spatial Extension
```
/omnilith-bundle
  /realms/<realmId>/
    realm.json
    /territories/<territoryId>.json
  /nodes/<nodeId>/
    spatial.json
```

### With Value Extension
```
/omnilith-bundle
  /nodes/<nodeId>/
    capacity.json
    /artifacts/<artifactId>/
      lineage.json
    /commitments/<commitmentId>.json
```

### With Spatial-Value Integration
```
/omnilith-bundle
  /nodes/<nodeId>/
    /artifacts/<artifactId>/
      spatial-context.json
    /reputation/
      spatial-reputation.json    # Derived
  /realms/<realmId>/
    /territories/<territoryId>/
      metabolism.json            # Derived
    /schools/<schoolId>.json     # Derived
    /paths/<pathId>.json         # Derived
```

### With Advanced Integration
```
/omnilith-bundle
  /realms/<realmId>/
    governance.json
    constitution.json
    /disputes/<disputeId>.json
    /councils/<councilId>.json
    /elections/<electionId>.json
    /policies/<policyId>.json
```

---

## Invariants Across Extensions

All extensions must respect core protocol invariants:

### Projection Law
- Spatial visualization is projection (coordinates are canon, rendering is not)
- Lineage descendants are derived (ancestors are canon)
- Reputation metrics are derived (commitments are canon)
- Map layers are projection (underlying data is canon or derived)

### Canon Definition
- Territories, realms, coordinates → canon
- Lineage declarations, commitments, capacity → canon
- Influence metrics, reputation, metabolism → derived
- Visualization styling → interpreter choice

### Determinism & Replay
- Spatial queries must be deterministic
- Lineage/commitment state must be replayable
- Metabolic calculations must be reproducible
- Governance decisions must be auditable

### Purity of Policies
- Spatial queries in policies are read-only
- Value queries in policies are read-only
- Policies cannot mutate territory, lineage, or commitments directly
- All mutations flow through ActionRuns

---

## Implementation Path

For interpreters implementing these extensions:

### Phase 1: Core Only
Implement spec.md. This is a complete, functional protocol for single-node operation.

### Phase 2: Add Federation (for multi-node)
- Add cryptographic identity to nodes
- Implement signature generation/verification
- Add anchoring infrastructure
- Choose initial consensus mechanism (trusted interpreter is simplest)
- Update bundle format

### Phase 3: Add Spatial
- Add Realm/Territory data models
- Implement spatial queries
- Add claim/transfer/resize actions
- For shared Realms, wire to Federation consensus
- Update bundle format

### Phase 4: Add Value
- Add Lineage/Commitment/Capacity models
- Implement derived metrics calculators
- Add commitment lifecycle actions
- Extend Daemon with value awareness

### Phase 5: Integrate Spatial-Value
- Connect artifacts to spatial context
- Implement place-bound commitments
- Add territorial reputation calculations
- Extend Daemon as landscape guide

### Phase 6: Advanced Features
- Add governance models (uses Federation for consensus)
- Implement dispute resolution
- Build map visualization layers
- Add spatial pack mechanics

Each phase is independently valuable. An interpreter can stop at any phase and have a coherent system.

**Note:** Federation can be added at any point, but is required before shared Realms can work. For single-node use, Federation is optional.

---

## Extension Philosophy

### Why Extensions, Not Core?

The core protocol is intentionally minimal:
- Observations, policies, effects, actions
- Variables, episodes, regulation
- Artifacts, surfaces, Prism

Extensions add richness without compromising the core:
- **Federation:** Not everyone needs multi-node consensus — single-node works fine locally
- **Spatial:** Not everyone needs geography
- **Value:** Not everyone needs lineage/commitments
- **Governance:** Not everyone needs formal administration

A personal journaling system might use Core only. A personal system that wants backup/sync might add Federation. A creative community might add Spatial and Value. A large organization might need Governance.

### Extension Compatibility

Extensions are designed to be:
- **Additive:** They add new capabilities, don't change existing ones
- **Optional:** Interpreters choose which to implement
- **Composable:** Extensions work together when both are present
- **Graceful:** Systems without an extension ignore its data

### Future Extensions

The architecture supports future extensions:
- **Financial:** Currency, exchange, contracts (carefully! — would require Federation for trustless exchange)
- **Temporal:** Time-based territories, seasonal effects
- **Social:** Formal relationships, organizations, roles
- **Creative:** Collaboration tools, version branching, merge

Each would follow the same pattern: define types, specify canon vs. derived, respect invariants, integrate with existing extensions.

**Note on Financial:** Any financial extension would almost certainly require Federation with blockchain consensus for trustless value transfer. The Federation extension provides the foundation but intentionally stops short of defining economic mechanisms.

---

## Quick Reference

### "Where do I find...?"

| Topic | Document | Section |
|-------|----------|---------|
| Core protocol guarantees | spec.md | §0 |
| Node types | spec.md | §2 |
| How policies work | spec.md | §9 |
| Daemon behavior | spec.md | §7.1 |
| Local vs global consensus | federation-extension.md | F.1 |
| Cryptographic identity | federation-extension.md | F.2 |
| Consensus mechanisms | federation-extension.md | F.3 |
| Anchoring artifacts | federation-extension.md | F.4 |
| Servers/interpreters as nodes | federation-extension.md | F.7 |
| Migration to federation | federation-extension.md | F.8 |
| Coordinates and territories | spatial-extension.md | S.1-S.2 |
| How to claim territory | spatial-extension.md | S.5.1 |
| Lineage and influence | value-extension.md | V.1 |
| How commitments work | value-extension.md | V.2 |
| Capacity regeneration | value-extension.md | V.3 |
| Daemon + lineage | value-extension.md | V.10.1 |
| Daemon + commitments | value-extension.md | V.10.2 |
| Place-bound commitments | integration-spatial-value.md | I.2 |
| Territorial reputation | integration-spatial-value.md | I.3 |
| Pilgrimage | integration-spatial-value.md | I.2.4 |
| Daemon as guide | integration-spatial-value.md | I.5 |
| Spatial packs | advanced-integration.md | Part A |
| Realm governance | advanced-integration.md | B.1 |
| Territorial disputes | advanced-integration.md | B.2 |
| Map visualization | advanced-integration.md | Part C |

---

*This index is the entry point to the Omnilith Protocol extension system.*
