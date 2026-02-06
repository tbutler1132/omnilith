# Federation Extension — Omnilith Protocol

> **Status:** Draft extension. Not yet part of the core protocol.
>
> This extension defines how nodes achieve consensus about shared state — from fully local operation to global verifiable truth.

---

## F.0) Design Principles

**Local-first by default.** Every node maintains its own canon. Federation is opt-in.

**Incremental globalization.** Start fully local, anchor specific items to shared consensus as needed.

**Semantic layer is stable.** The protocol semantics (what things mean) remain constant regardless of consensus mechanism.

**Consensus mechanism is swappable.** The interpreter layer (who enforces agreement) can change without changing protocol semantics.

---

## F.1) The Local/Global Split

The protocol operates at two levels:

### F.1.1 Local Canon (Node-Sovereign)

Each node maintains its own canon — observations, artifacts, variables, episodes, policies. This is the default state for all protocol data.

**Local canon characteristics:**
- Fully controlled by the node operator
- No external dependencies
- Fast (no consensus overhead)
- Private (unless explicitly shared)

**What typically stays local:**
- Internal observations
- Private artifacts
- Personal variables and episodes
- Node-specific policies
- Drafts and work-in-progress

### F.1.2 Global Consensus (Shared Truth)

Some state requires agreement across nodes. This includes:

1. **Node Identity** — Who exists, with what authority
2. **Node Location** — Where nodes are positioned in shared Realms (Spatial Extension)
3. **Territory Ownership** — Who owns what space
4. **Anchored Content** — Artifacts/observations explicitly registered for global verifiability

**Global consensus characteristics:**
- Requires coordination mechanism (see F.3)
- Provides verifiable proof
- Enables trustless interaction between strangers
- May have cost (gas, fees, storage)

---

## F.2) Cryptographic Identity

For federation to work, nodes need verifiable identity.

### F.2.1 Node Identity Model

```ts
export type FederatedNode = Node & {
  // Cryptographic identity
  identity?: {
    method: "keypair" | "did" | "ens" | "custom";

    // For keypair method
    publicKey?: string;          // Base64 or hex-encoded public key
    keyAlgorithm?: string;       // e.g., "ed25519", "secp256k1"

    // For DID method
    did?: string;                // e.g., "did:key:z6Mk..."

    // For ENS/domain method
    domain?: string;             // e.g., "alice.eth"

    // Verification
    verificationEndpoint?: string;  // Optional URL for key verification
  };

  // Federation status
  federation?: {
    anchored: boolean;           // Is this node registered globally?
    anchoredAt?: string;         // Timestamp of registration
    anchorProof?: string;        // Transaction hash or proof reference
    consensusNetwork?: string;   // Which network (if multiple)
  };
};
```

### F.2.2 Identity Derivation

Node IDs SHOULD be derivable from public keys for federated nodes:

```ts
// Recommended: derive nodeId from public key
nodeId = hash(publicKey)  // e.g., first 20 bytes of SHA-256

// This enables:
// - Anyone can verify a node owns its ID
// - No central registry needed for identity
// - Portable across interpreters
```

### F.2.3 Signing

Federated nodes sign their canonical data:

```ts
export type SignedObservation = Observation & {
  signature?: {
    signer: string;              // Node ID (derived from public key)
    signature: string;           // Base64-encoded signature
    algorithm: string;           // e.g., "ed25519"
  };
};

export type SignedArtifact = Artifact & {
  signature?: {
    signer: string;
    signature: string;
    algorithm: string;
    signedAt: string;
  };
};
```

Signatures enable:
- Proof of authorship
- Portable verification (anyone can verify without contacting the author)
- Tamper detection

---

## F.3) Consensus Mechanisms

The protocol doesn't mandate a specific consensus mechanism. Valid options include:

### F.3.1 Trusted Interpreter (Centralized)

A single authoritative server.

| Aspect | Description |
|--------|-------------|
| Trust model | Trust the operator |
| Speed | Fast |
| Cost | Low |
| Decentralization | None |
| Best for | Single-organization, prototyping, personal use |

```ts
// Configuration
consensusConfig: {
  type: "trusted_interpreter";
  endpoint: "https://omnilith.example.com";
  operatorNodeId: string;
}
```

### F.3.2 Federated Witnesses

Multiple interpreters that sync and attest.

| Aspect | Description |
|--------|-------------|
| Trust model | Trust a quorum of witnesses |
| Speed | Moderate |
| Cost | Low |
| Decentralization | Partial |
| Best for | Community networks, consortiums |

```ts
consensusConfig: {
  type: "federated_witnesses";
  witnesses: Array<{
    nodeId: string;
    endpoint: string;
  }>;
  quorum: number;  // Required attestations
}
```

### F.3.3 Blockchain (Decentralized)

On-chain state for trustless consensus.

| Aspect | Description |
|--------|-------------|
| Trust model | Trust the protocol/math |
| Speed | Slow (block time) |
| Cost | Gas fees |
| Decentralization | Full |
| Best for | Trustless interactions, high-value assets |

```ts
consensusConfig: {
  type: "blockchain";
  network: "ethereum" | "solana" | "cosmos" | string;
  chainId?: number;
  contractAddress?: string;
  rpcEndpoint?: string;
}
```

### F.3.4 Hybrid

Different consensus levels for different data.

```ts
consensusConfig: {
  type: "hybrid";

  // Node identity: blockchain
  identity: {
    type: "blockchain";
    network: "ethereum";
  };

  // Territory: federated witnesses
  spatial: {
    type: "federated_witnesses";
    witnesses: [...];
  };

  // Artifacts: local by default, optional anchoring
  artifacts: {
    type: "local_with_anchoring";
    anchorTarget: "ipfs_plus_blockchain";
  };
}
```

---

## F.4) Anchoring

**Anchoring** commits local canon to global consensus.

### F.4.1 What Gets Anchored

Not everything needs global consensus. The anchor decision is per-item:

| Item | Default | Anchor When... |
|------|---------|----------------|
| Node existence | Local | You want to interact with other federated nodes |
| Node location (Spatial) | N/A | Required for shared Realms |
| Territory ownership | N/A | Required if territories exist |
| Artifact content | Local | You want verifiable proof of existence/authorship |
| Artifact hash | Local | You want timestamp proof without revealing content |
| Observation | Local | Rarely — usually internal signals |
| Commitment (Value) | Local | You want witnesses, public accountability |

### F.4.2 Anchor Record

```ts
export type AnchorRecord = {
  // What is anchored
  localId: string;               // Local ID of the item
  itemType: "node" | "artifact" | "territory" | "commitment" | "observation";

  // Anchor details
  anchoredAt: string;            // Timestamp
  anchorMethod: "hash" | "full"; // Hash-only or full content

  // For hash anchoring
  contentHash?: string;          // SHA-256 of canonical serialization

  // Proof
  proof: {
    type: "transaction" | "attestation" | "certificate";
    reference: string;           // Transaction hash, attestation ID, etc.
    network?: string;            // Which network
    witnesses?: string[];        // Witness node IDs (for federated)
  };
};
```

### F.4.3 Anchor Actions

```ts
export type AnchorAction = {
  type: "federation:anchor";
  riskLevel: "medium";
  params: {
    itemType: "node" | "artifact" | "territory" | "commitment";
    itemId: string;
    method: "hash" | "full";
    targetNetwork?: string;
  };
};

export type VerifyAnchorAction = {
  type: "federation:verify_anchor";
  riskLevel: "low";
  params: {
    itemType: string;
    itemId: string;
    expectedHash?: string;
  };
};
```

### F.4.4 Anchoring Workflow

```
1. User decides to anchor an artifact
2. System computes canonical hash (deterministic serialization)
3. System submits to consensus network:
   - For blockchain: transaction with hash
   - For witnesses: attestation request
4. System receives proof (tx hash, attestation IDs)
5. System stores AnchorRecord locally
6. Artifact is now globally verifiable
```

---

## F.5) Spatial Federation

The Spatial Extension requires federation for shared Realms.

### F.5.1 Realm Consensus Requirements

```ts
export type FederatedRealm = Realm & {
  federation: {
    consensusType: "trusted_interpreter" | "federated_witnesses" | "blockchain";
    consensusConfig: ConsensusConfig;

    // For blockchain-based realms
    contractAddress?: string;
  };
};
```

### F.5.2 Territory Consensus

Territory ownership MUST be globally agreed:

```ts
export type FederatedTerritory = Territory & {
  // Proof of ownership
  ownershipProof: {
    type: "signature" | "transaction" | "attestation";
    proof: string;
    verifiedAt: string;
  };

  // Transfer requires on-chain transaction (if blockchain)
  transferHistory?: Array<{
    from: string;
    to: string;
    timestamp: string;
    proof: string;
  }>;
};
```

### F.5.3 Claim Validation

For a territory claim to be valid:

1. **Local validation:** Interpreter checks claim doesn't overlap
2. **Consensus validation:** Network confirms claimant's authority
3. **Proof generation:** Successful claim produces verifiable proof
4. **Local + global update:** Both local canon and global state update

---

## F.6) Interaction Without Federation

Nodes can interact without full federation through **trust relationships**:

### F.6.1 Direct Trust

Node A explicitly trusts Node B's claims:

```ts
export type TrustGrant = Grant & {
  trustType: "identity" | "observations" | "artifacts" | "claims";
  trustLevel: "verify" | "accept";  // Verify signatures vs. accept on faith
};
```

### F.6.2 Transitive Trust

Trust through intermediaries:

```
A trusts B (directly)
B trusts C (directly)
A trusts C (transitively, with decay)
```

### F.6.3 Local Verification

Even without global consensus, nodes can verify:
- Signatures (if they have the public key)
- Content hashes (if they have the content)
- Timestamps (relative to their own observations)

---

## F.7) Interpreters as Nodes

Servers and interpreters can themselves be Nodes in the protocol. This eliminates the need for a separate "server identity" system.

### F.7.1 The Pattern

```ts
// An interpreter/server as an Object-Node
{
  id: "server-xyz",
  kind: "object",

  identity: {
    method: "keypair",
    publicKey: "base64...",
    keyAlgorithm: "ed25519"
  },

  federation: {
    anchored: true,
    anchorProof: "0x...",
    consensusNetwork: "ethereum"
  },

  metadata: {
    nodeType: "interpreter",
    version: "1.0.0",
    operatorNodeId: "node-alice",   // Who runs this server
    endpoint: "https://omnilith.example.com"
  }
}
```

### F.7.2 Hosted Node Relationships

Nodes hosted on a server have an edge to the server-node:

```ts
// Alice's node, hosted on server-xyz
{
  id: "node-alice",
  kind: "subject",
  edges: [
    { type: "hosted_by", toNodeId: "server-xyz" }
  ]
}
```

### F.7.3 Server-to-Server Trust

Trust between servers becomes grants between server-nodes:

```ts
// Server A trusts Server B's attestations
{
  grantorNodeId: "server-a",
  granteeNodeId: "server-b",
  scopes: ["attest_hosted_nodes", "route_observations"],
  trust: {
    level: "verify",  // Verify signatures, don't just accept
  }
}
```

### F.7.4 Transitive Verification

When a server-node is globally anchored:

1. External parties can verify the server's identity
2. The server signs attestations for its hosted nodes
3. Verification chain: Global → Server → Hosted Node

```
Global Chain
    │
    │ verifies
    ▼
Server-Node (anchored)
    │
    │ attests (signed)
    ▼
Hosted Node (not individually anchored)
```

This allows hosted nodes to be "transitively verified" without each one needing individual global anchoring.

### F.7.5 Server-Governed Realms

Local Realms can use the server-node as governor:

```ts
{
  id: "server-local-realm",
  governorNodeId: "server-xyz",
  federation: {
    consensusType: "trusted_interpreter"
  }
}
```

The server-node's authority is limited to its local Realm. Global Realms use global consensus.

### F.7.6 Benefits

| Concept | Without Pattern | With Pattern |
|---------|-----------------|--------------|
| Server identity | New system needed | Reuse Node identity |
| Server trust | Custom mechanism | Grants between nodes |
| Server relationships | Custom edges | Standard edges |
| Server policies | Separate config | Node policies |
| Server in Realms | Special case | Just another node |

No new protocol concepts required — interpreters participate using the same primitives as everything else.

---

## F.8) Migration Path

### F.7.1 Start Local

```
Phase 1: Local-only operation
- All canon is local
- No cryptographic identity required
- No external dependencies
- Full functionality for single-node use
```

### F.7.2 Add Cryptographic Identity

```
Phase 2: Verifiable identity
- Generate keypair
- Derive node ID from public key
- Sign observations and artifacts
- Still local, but portable/verifiable
```

### F.7.3 Join Federation

```
Phase 3: Connect to consensus network
- Register node identity globally
- Anchor existing artifacts (optional)
- Participate in shared Realms
- Territory claims become global
```

### F.7.4 Upgrade Consensus

```
Phase 4: Change consensus mechanism
- Migrate from trusted interpreter to blockchain
- Or from witnesses to blockchain
- Historical proofs remain valid
- New operations use new mechanism
```

---

## F.9) Bundle Extension

Federation data extends the Omnilith Bundle:

```
/omnilith-bundle
  /nodes
    /<nodeId>
      node.json
      identity.json              # Cryptographic identity
      anchors.ndjson             # Anchor records log
      ...
  /federation
    config.json                  # Federation configuration
    trusted-keys.json            # Known public keys
    consensus-proofs.ndjson      # Proof log
```

**identity.json:**
```json
{
  "method": "keypair",
  "publicKey": "base64...",
  "keyAlgorithm": "ed25519",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

**anchors.ndjson:**
```json
{"localId": "artifact-123", "itemType": "artifact", "anchoredAt": "...", "proof": {...}}
{"localId": "terr-456", "itemType": "territory", "anchoredAt": "...", "proof": {...}}
```

---

## F.10) Interpreter Requirements

Interpreters implementing the Federation Extension MUST:

1. **Support cryptographic identity** — Generate, store, and use keypairs
2. **Sign on request** — Sign artifacts and observations when anchoring
3. **Verify signatures** — Validate signatures from other nodes
4. **Store anchor records** — Track what has been anchored and where
5. **Support at least one consensus mechanism** — May be trusted interpreter

Interpreters MAY:

- Support multiple consensus mechanisms
- Implement consensus switching
- Provide blockchain integration
- Cache verified proofs

---

## F.11) Security Considerations

### F.10.1 Key Management

- Private keys MUST be stored securely
- Key rotation SHOULD be supported
- Compromised keys require re-anchoring with new identity

### F.10.2 Proof Verification

- Always verify proofs, don't trust claims
- Check proof freshness (replay attacks)
- Validate proof source (which network/witnesses)

### F.10.3 Privacy

- Hash anchoring reveals existence, not content
- Full anchoring reveals content
- Consider what to anchor carefully
- Location data is particularly sensitive

---

## F.12) Example: Progression to Federation

### Stage 1: Local Journal

Alice runs Omnilith locally for personal journaling.

```json
{
  "nodeId": "local-alice",
  "kind": "subject",
  "identity": null,
  "federation": null
}
```

No federation. Everything is local.

### Stage 2: Verifiable Identity

Alice wants to share artifacts with friends. She generates a keypair.

```json
{
  "nodeId": "0x7a9f3b...",
  "kind": "subject",
  "identity": {
    "method": "keypair",
    "publicKey": "base64...",
    "keyAlgorithm": "ed25519"
  },
  "federation": null
}
```

Node ID is now derived from public key. Artifacts can be signed.

### Stage 3: Join Community Realm

Alice joins a creative community with shared space.

```json
{
  "nodeId": "0x7a9f3b...",
  "kind": "subject",
  "identity": {...},
  "federation": {
    "anchored": true,
    "anchoredAt": "2025-06-01T00:00:00Z",
    "anchorProof": "0xabc123...",
    "consensusNetwork": "community-witnesses"
  }
}
```

Her node identity is now registered with the community's federated witnesses. She can claim territory in shared Realms.

### Stage 4: Anchor Important Work

Alice anchors her published artifacts to a blockchain for permanent proof.

```json
{
  "localId": "artifact-masterwork",
  "itemType": "artifact",
  "anchoredAt": "2025-12-01T00:00:00Z",
  "anchorMethod": "hash",
  "contentHash": "sha256:...",
  "proof": {
    "type": "transaction",
    "reference": "0xdef456...",
    "network": "ethereum"
  }
}
```

The artifact's hash is now on Ethereum. Anyone can verify Alice created it before this date.

---

## F.13) Future Considerations

### F.12.1 Cross-Realm Federation

Multiple Realms with different consensus mechanisms interoperating:
- Bridge protocols for cross-realm territory transfers
- Reputation portability across consensus boundaries
- Unified identity across networks

### F.12.2 Sovereign Identity Standards

Integration with emerging standards:
- W3C DIDs
- Verifiable Credentials
- KERI (Key Event Receipt Infrastructure)

### F.12.3 Zero-Knowledge Proofs

Privacy-preserving verification:
- Prove territory ownership without revealing location
- Prove commitment fulfillment without revealing details
- Prove identity without revealing public key

### F.12.4 Economic Mechanisms

If/when needed (carefully):
- Staking for territory claims
- Economic dispute resolution
- Capacity as transferable token (with extreme caution)

---

*End of Federation Extension*
