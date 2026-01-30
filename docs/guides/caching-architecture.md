# Caching Architecture

The `ngcompass` core package implements a robust, multi-layered caching system designed to optimize performance for heavy Angular analysis tasks. It separates concerns between generic storage drivers (infra) and domain-specific services.

## Architecture Overview

The system is built on two main layers:

1.  **Infrastructure Layer (`drivers/`)**: Generic storage engines that handle *how* bytes are stored (Memory, Disk, Atomic File).
2.  **Domain Layer (`services/`)**: specialized services that handle *what* is stored (Source Code, ASTs, Analysis Results) and *how* it is identified (Hashing).

### Storage Strategies

| Cache Type | Storage Location | Strategy | Purpose |
| :--- | :--- | :--- | :--- |
| **Sources** | Memory (L1) | LRU Cache | Fast access to raw file content during a single run. |
| **ASTs** | Memory (L1) + Disk (L2) | Tiered / Multi-Level | Expensive parsing results. kept in memory for speed, persisted to disk for cross-run speedups. |
| **Results** | Disk | Atomic Files | Analysis results that should persist reliable across runs. |

---

## Components

### 1. Source Cache
* **Purpose**: Stores raw file content to avoid repeated file system reads during analysis.
* **Storage**: In-Memory only.
* **Key**: Simple Hash of the content.
* **Value**: `{ content: string; filePath: string }`.

### 2. AST Cache (Tiered)
* **Purpose**: Stores parsed Abstract Syntax Trees (ASTs), which are computationally expensive to generate.
* **Structure**:
    *   **L1 (Memory)**: Hot items, LRU eviction.
    *   **L2 (Disk)**: Cold storage, V8 Serialized for efficient binary storage.
* **Resilience**: If an L2 entry is corrupted (deserialization error), it is automatically deleted to self-heal.
* **Composite Hashing**: Keys are generated using `sha256(content + tool_version)` to ensuring strict cache invalidation if the analyzer version changes.

### 3. Result Cache
* **Purpose**: Stores the final output of analysis rules or heavy computations.
* **Storage**: Disk-based Key-Value store.
* **Implementation**: Uses `write-file-atomic` to ensure file integrity during concurrent writes or crashes.

---

## Usage Example

The system is exposed via a unified context:

```typescript
import { createCacheContext } from '@ngcompass/core/cache';

// Initialize with defaults
const cache = createCacheContext({
  memory: { maxItems: 500 },
  disk: { path: './.custom-cache' }
});

// 1. Compute a stable hash
const fileHash = cache.computeHash(fileContent);

// 2. Use caching services
// Store Source
cache.sources.set(fileHash, { content: fileContent, filePath: 'app.component.ts' });

// Store/Retrieve AST (Tries L1 -> L2)
const ast = await cache.asts.get(fileHash);

// 3. Maintenance
// Clean up old disk entries
await cache.prune();
```

## Maintenance & Pruning

Over time, the disk cache can grow. The system supports a `prune()` operation (delegated to `cacache`) that removes stale entries based on access time/size limits.

---

## Directory Structure

```
packages/core/src/cache/
├── drivers/          # Generic Storage Engines
│   ├── memory.ts     # LRU Memory Wrapper
│   ├── disk.ts       # Cacache Disk Wrapper
│   ├── atomic.ts     # Atomic File Writing
│   └── types.ts      # Driver Interfaces
├── services/         # Domain Logic
│   ├── hashing.ts    # Composite Hash Generation
│   ├── source-cache.ts
│   ├── ast-cache.ts
│   └── result-cache.ts
└── index.ts          # Public API & Factory
```
