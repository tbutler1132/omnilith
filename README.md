# Omnilith

A protocol for intentional state. The web app, database, and runtime are interpreters of the protocol — not the source of truth.

## Prerequisites

- Node.js >= 20
- pnpm >= 9

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
/packages
  /protocol      # Type definitions, schemas
  /runtime       # Runtime implementation
  /web           # Next.js UI
  /repositories  # Data access layer
/spec
  SPEC.md        # Protocol specification
```

## Commands

```bash
pnpm dev       # Start dev server
pnpm build     # Build all packages
pnpm test      # Run tests
pnpm check     # Lint + build + test
pnpm format    # Format code with Prettier
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for architecture guidelines and [spec/SPEC.md](./spec/SPEC.md) for the protocol specification.
