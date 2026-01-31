# CLAUDE.md — Omnilith Protocol

This is a **protocol for intentional state**, not a SaaS product. The web app, database, and runtime are interpreters of the protocol — not the source of truth.

## Core Invariants (Never Violate)

**Projection Law:** Surfaces, Layouts, and Views must be derivable entirely from canon. They cannot introduce new state. If you're tempted to store something in a Surface, stop — it belongs in canon or it's derived.

**Canon is the minimum lossless state.** If you can't reconstruct the system from canon + replay, something is wrong.

**Policies are pure.** No storage access, no network calls, no side effects. They return declarative Effects. Purity is convention-enforced, not language-enforced — respect the contract.

**Prism is the only commit boundary.** All canon mutations flow through Prism. No exceptions.

## Mental Model

```
Observations → Policies → Effects → ActionRuns → Canon changes
      ↑                                              |
      └──────────────────────────────────────────────┘
```

**Nodes** are cybernetic boundaries (not users or projects). They scope observations, policies, and authority.

**Variables** are regulated quantities with viable ranges. **Proxies** define how to estimate them from observations. Estimates are derived, not stored.

**Episodes** coordinate interventions:

- _Regulatory_: return to viable range
- _Exploratory_: probe boundaries, expand capacity

Regulation enables growth — it's not the goal.

## Key Types

| Type             | Canon?    | Purpose                               |
| ---------------- | --------- | ------------------------------------- |
| Observation      | Yes (log) | Sensory input, append-only            |
| Variable         | Yes       | What's being regulated                |
| VariableEstimate | No        | Derived from observations via Proxy   |
| Episode          | Yes       | Time-bounded intervention             |
| Artifact         | Yes       | Revisioned content                    |
| Surface          | Yes       | Read-only projection config           |
| Policy           | Yes       | Pure function returning Effects       |
| ActionRun        | Yes (log) | Auditable action execution            |
| Entity           | Yes       | Durable referent with stable identity |

## Agent Rules

Agents (Agent-Nodes) operate with delegated authority from a Subject-Node.

- Agents CANNOT approve their own high-risk actions
- Agents CANNOT grant authority to other agents
- All agent-created content has `provenance.method: "agent_inference"` (or similar)
- Risk levels: `low` (auto-approve) → `medium` → `high` → `critical` (human required)

## Project Structure

```
/packages
  /protocol        # Type definitions, schemas
  /interpreter     # Runtime implementation
  /web             # Next.js UI (surfaces, prism)
  /policies        # Policy definitions
/spec
  SPEC.md          # Protocol specification (source of truth)
```

## Commands

```bash
npm run check      # lint + build + test (always run after changes)
npm run dev        # start dev server
npm run test       # run tests
```

## Conventions

- **Derived state is never canon.** Caches, materialized views, estimates — all must be reconstructable.
- **Effects are namespaced.** Pack effects use `pack:name:action` format.
- **Risk is declared, not inferred.** Actions declare their risk level; policies can escalate but not reduce.
- **Provenance is mandatory.** Every observation must have provenance (sourceId, method, confidence).

## When Working on This Codebase

1. **Read the spec first** if touching protocol-level code (`/spec/SPEC.md`)
2. **Check the Projection Law** before adding any state to Surfaces
3. **Keep policies pure** — if you need side effects, that's an ActionRun
4. **Run `npm run check`** after any non-trivial change
5. **Respect the regulatory framing** — Variables, viable ranges, Episodes. Don't optimize; regulate.
6. **Consider tests for every change** — Ask what tests would verify the change works and prevent regressions.
7. **Prioritize clean code** — Readable, well-structured code over clever solutions.

## Philosophy

This isn't productivity software. It's infrastructure for someone figuring out how to live well. The system observes, estimates, and acts to keep Variables in viable range — freeing attention for what matters.

Regulation serves growth. A system that only maintains homeostasis cannot expand.
