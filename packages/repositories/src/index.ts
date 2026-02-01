// @omnilith/repositories
// Repository interfaces and implementations for substrate-independent data access.
//
// This package defines the "contract" for data operations. The actual implementations
// (Postgres, SQLite, in-memory, etc.) fulfill these contracts, allowing the runtime
// to work with any storage backend.
//
// Key concepts:
// - Interfaces define WHAT operations are available, not HOW they're implemented
// - RepositoryContext bundles all repositories for dependency injection
// - Code against interfaces to maintain substrate independence

export * from './interfaces/index.js';
export * as postgres from './postgres/index.js';
export * as bundle from './bundle/index.js';
