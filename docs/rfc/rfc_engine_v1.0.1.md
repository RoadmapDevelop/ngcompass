# RFC: Determinism, Performance, and Reliability Improvements for Angular Static Analysis Architecture

**Status:** Proposed  
**Author:** Architecture Review  
**Target Version:** Next minor release  
**Last Updated:** 2026-02-21  

---

# 1. Abstract

This RFC proposes structural improvements to the static analysis architecture across the Config, Planner, and Engine subsystems. The focus is on strengthening determinism, improving performance efficiency, and increasing reliability while preserving the existing pipeline structure.

The proposal introduces:

- Deterministic and versioned cache keys
- Unified concurrency control
- Adaptive execution scheduling
- Explicit failure semantics
- Hardened plugin contracts
- Structured observability and telemetry

These changes are designed to preserve backward compatibility while significantly improving reproducibility, throughput, and operational confidence.

---

# 2. Motivation

The current architecture is well‑structured and already includes:

- Content‑addressed task identities
- Multi‑level caching
- Incremental filtering
- Worker pool parallelism
- Deterministic ordering and immutable indexes

However, several implicit invariants and coordination gaps introduce potential risks:

- Cache correctness risks during version or rule changes
- Inconsistent worker concurrency semantics
- Non‑adaptive thresholds for parallelism
- Silent correctness degradation on infrastructure failure
- Limited plugin compatibility guarantees
- Insufficient telemetry to guide tuning

This RFC formalizes architectural invariants and introduces structural mechanisms to eliminate these risks.

---

# 3. Goals

## Primary Goals

1. Guarantee deterministic outputs for identical inputs
2. Ensure cache correctness across version changes
3. Improve execution efficiency and CPU utilization
4. Strengthen reliability without sacrificing resilience
5. Improve visibility into performance and failures

## Secondary Goals

- Improve scalability for large codebases
- Enable easier tuning based on telemetry
- Improve CI confidence and reproducibility

---

# 4. Non‑Goals

This RFC does NOT:

- Change rule semantics
- Require rule rewrites
- Introduce breaking configuration changes
- Replace the core pipeline structure

---

# 5. Current Architecture Summary

The system consists of three major phases:

## Phase 1: Config

Responsibilities:

- Config discovery and normalization
- Schema validation
- Semantic validation
- Plugin resolution
- Profile merging
- Config caching

Output:

NormalizedConfig (immutable)


## Phase 2: Planner

Responsibilities:

- File classification
- Task construction (Rule × File)
- Content‑addressed task hashing
- Incremental filtering
- Index construction
- Plan serialization

Output:

ExecutionPlan


## Phase 3: Engine

Responsibilities:

- Task batching
- Worker orchestration
- AST parsing and traversal
- Rule execution
- Result merging
- Result caching

Output:

AnalysisResult

---

# 6. Problems Identified

## Problem 1: Cache Keys Lack Version Context

Cache keys do not explicitly encode tool version, parser version, or rule registry version.

Risk:

- Stale cache reuse after upgrades
- Incorrect analysis results


## Problem 2: Option Hashing Inconsistency

Planner uses stable hashing, but Engine batching may use non‑stable serialization.

Risk:

- Reduced batching efficiency
- Cache fragmentation


## Problem 3: Concurrency Configuration Not Fully Unified

Concurrency decisions are split across:

- Config
- Planner
- Engine

Risk:

- CPU oversubscription
- Unexpected performance behavior


## Problem 4: Fixed Parallelism Thresholds

Current thresholds:

- Worker pool threshold
- Parallel planning threshold

Risk:

- Suboptimal execution depending on workload characteristics


## Problem 5: Silent Infrastructure Failures

Failures such as file read errors or parser errors do not always produce structured failure outputs.

Risk:

- Silent correctness degradation
- Difficult debugging


## Problem 6: Plugin Compatibility Not Explicitly Versioned

Plugins do not declare compatibility or required capabilities.

Risk:

- Runtime incompatibilities
- Undefined behavior


## Problem 7: Limited Observability

Insufficient structured telemetry for:

- Cache effectiveness
- Worker utilization
- Rule performance

Risk:

- Difficult performance tuning

---

# 7. Proposed Architecture Changes


# 7.1 Introduce CacheKeyContext

Create a shared cache context used across Config, Planner, and Engine.


```ts
interface CacheKeyContext {
  toolVersion: string
  schemaVersion: string
  ruleRegistryHash: string
  parserVersion: string
  platform?: string
}
```


This context MUST be included in:

- Config cache keys
- Plan cache keys
- Task cache keys
- Analysis cache keys


Benefits:

- Prevents stale cache reuse
- Guarantees correctness across upgrades


---

# 7.2 Enforce Stable Serialization Everywhere

Introduce shared utility:

```ts
stableSerialize(value): string
```

This MUST be used for:

- Task IDs
- Batch keys
- Cache keys


Benefits:

- Eliminates batch fragmentation
- Improves cache hit rates


---

# 7.3 Unified Worker Concurrency Model

Worker count MUST be:

```ts
workers = clamp(1, config.maxWorkers, systemCPUCount)
```

Config becomes the single source of truth.


Benefits:

- Prevents oversubscription
- Improves predictability


---

# 7.4 Adaptive Parallelism Strategy

Replace fixed thresholds with cost‑based strategy.


Example:

```ts
estimatedCost = sum(fileSizeWeight + ruleCostWeight + typeCheckWeight)

if (estimatedCost > PARALLEL_THRESHOLD)
  useWorkers()
else
  runSequential()
```


Benefits:

- Better performance across varied workloads


---

# 7.5 Explicit Failure Semantics

All infrastructure failures MUST produce structured errors:


```ts
interface InfrastructureError {
  type: 'ParseError' | 'IOError' | 'WorkerCrash'
  filePath?: string
  cause: string
}
```


Optional config:

```ts
failOnInfrastructureError: boolean
```


Benefits:

- Improves reliability
- Enables strict CI mode


---

# 7.6 Plugin Contract Versioning

Plugins MUST declare compatibility:


```ts
interface PluginManifest {
  name: string
  version: string
  apiVersion: string
  engineVersionRange: string
  capabilities?: {
    requiresTypeInfo?: boolean
    requiresTemplateAST?: boolean
  }
}
```


Benefits:

- Prevents runtime incompatibilities


---

# 7.7 Structured Telemetry

Introduce structured telemetry events:


```ts
interface TelemetryEvent {
  phase: 'config' | 'planner' | 'engine'
  operation: string
  durationMs: number
  cacheHit?: boolean
  workerId?: number
}
```


Benefits:

- Enables performance tuning
- Identifies slow rules


---

# 8. Migration Plan

Phase 1:

- Introduce CacheKeyContext
- Introduce stableSerialize utility

Phase 2:

- Update Engine batching
- Update Planner hashing

Phase 3:

- Introduce plugin manifests
- Introduce telemetry

Phase 4:

- Introduce adaptive scheduling


No breaking changes required.

---

# 9. Risks

## Risk: Increased cache invalidation after upgrade

Mitigation:

- Expected and correct behavior


## Risk: Slight overhead from telemetry

Mitigation:

- Make telemetry optional


---

# 10. Acceptance Criteria

The RFC is considered complete when:

- Cache correctness guaranteed across upgrades
- Deterministic results verified across repeated runs
- No regression in performance
- Improved cache hit rates
- Improved worker utilization


---

# 11. Architectural Invariants (Normative)

The following MUST always hold:

1. Identical inputs produce identical outputs
2. Cache keys uniquely represent all relevant inputs
3. Execution ordering is deterministic
4. Failures are observable
5. Plugins cannot silently break compatibility


---

# 12. Expected Impact

| Area | Impact |
|-----|--------|
| Determinism | High improvement |
| Performance | Medium‑High improvement |
| Reliability | High improvement |
| Maintainability | High improvement |


---

# 13. Conclusion

This RFC strengthens the architecture without altering its core design. It formalizes implicit guarantees, eliminates correctness risks, and improves scalability.

The system will become:

- Fully deterministic
- Safer across upgrades
- More efficient
- Easier to operate and debug


---

**End of RFC**

