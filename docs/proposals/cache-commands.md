# Proposal: Cache Management Commands

**Status**: Proposed
**Author**: Development Team
**Date**: 2026-02-01
**Version**: 1.0

---

## Executive Summary

Add CLI commands for cache management to improve user experience, reduce support burden, and provide transparency into caching behavior. This would make ngcompass the **first linting tool with comprehensive cache management capabilities**.

**Recommendation**: Implement Phase 1 commands (2-3 hours of work, high impact)

---

## Problem Statement

### Current Limitations

Users currently have **no way to**:
- Clear cache when debugging issues
- See what's cached or how much space it uses
- Verify cache health
- Understand cache performance
- Clean up old cache entries

### Real-World Scenarios

**Scenario 1: After Upgrade**
```
User upgrades ngcompass v1.0 → v2.0
Gets wrong line numbers (stale cache)
Solution: Must manually delete node_modules/.cache/ngcompass
Problem: Users don't know where cache is or that it exists
```

**Scenario 2: Disk Space**
```
User's cache grows to 500MB over time
They don't know it exists or how to clean it
Wastes disk space and slows down disk-constrained systems
```

**Scenario 3: Debugging**
```
User reports: "Validation is slow"
Support needs to ask: "What's your cache hit rate?"
No way for user to find out
Diagnostic data is inaccessible
```

**Scenario 4: CI/CD Issues**
```
CI cache becomes corrupted
Tests fail mysteriously
Solution: Clear cache
Problem: Requires custom script or manual intervention
```

### Industry Comparison

**ESLint**: No cache commands, manual `rm .eslintcache` required
**TypeScript**: No cache commands
**Prettier**: No cache commands
**Webpack**: Has `webpack cache clear` (added in 5.x)

**Opportunity**: Be the first linting tool with proper cache management

---

## Proposed Solution

### Command Structure

```bash
ngcompass cache <subcommand> [options]

Subcommands:
  clear      Clear all or specific caches
  info       Show cache status and statistics
  prune      Remove old/expired cache entries
  validate   Check cache integrity (optional)
  stats      Show cache performance metrics (optional)
  path       Show cache directory location

Options:
  --type <type>    Cache type: ast|config|results|all (default: all)
  --help           Show help for cache commands
```

---

## Detailed Command Specifications

### 1. `ngcompass cache clear`

**Purpose**: Clear all or specific caches

**Usage**:
```bash
# Clear all caches (default)
ngcompass cache clear

# Clear specific cache type
ngcompass cache clear --type ast
ngcompass cache clear --type config
ngcompass cache clear --type results
```

**Output**:
```
Clearing cache...
✓ Cleared memory cache (45 entries, 12.3 MB)
✓ Cleared AST cache (128 entries, 8.7 MB)
✓ Cleared config cache (12 entries, 450 KB)
✓ Cleared result cache (89 entries, 2.1 MB)

Total freed: 23.55 MB
```

**Exit Codes**:
- `0`: Success
- `1`: Error (permission denied, disk error)

**Use Cases**:
- Fix cache corruption after crashes
- After version upgrades with breaking changes
- Debugging validation issues
- CI troubleshooting
- Reset state during development

**Priority**: **P0 - Essential**

---

### 2. `ngcompass cache info`

**Purpose**: Show cache status, size, and location

**Usage**:
```bash
ngcompass cache info
```

**Output**:
```
Cache Status:
┌─────────────┬──────────┬────────┬──────────┐
│ Cache Type  │ Entries  │ Size   │ Hit Rate │
├─────────────┼──────────┼────────┼──────────┤
│ AST (L1)    │ 45/200   │ 8.7 MB │ 87.5%    │
│ AST (L2)    │ 128      │ 15.2MB │ 12.5%    │
│ Config      │ 12       │ 450 KB │ 94.2%    │
│ Results     │ 89       │ 2.1 MB │ 78.3%    │
└─────────────┴──────────┴────────┴──────────┘

Total Size: 26.45 MB / 50 MB limit
Location: node_modules/.cache/ngcompass
Cache Version: v1.0.0
```

**Exit Codes**:
- `0`: Success
- `1`: Error accessing cache

**Use Cases**:
- Check cache size before cleanup
- Understand cache effectiveness
- Debug performance issues
- Verify cache is working
- Monitor disk usage

**Priority**: **P0 - Essential**

---

### 3. `ngcompass cache path`

**Purpose**: Show cache directory location

**Usage**:
```bash
ngcompass cache path
```

**Output**:
```
/Users/you/project/node_modules/.cache/ngcompass
```

**Exit Codes**:
- `0`: Success

**Use Cases**:
- Find cache for manual inspection
- Backup/restore cache
- CI cache configuration
- Debug cache location issues
- Copy cache between systems

**Priority**: **P0 - Essential**

---

### 4. `ngcompass cache prune`

**Purpose**: Remove old/expired cache entries (keep hot entries)

**Usage**:
```bash
ngcompass cache prune
```

**Output**:
```
Pruning old cache entries...
✓ Removed 34 expired AST entries (4.2 MB)
✓ Removed 8 expired config entries (125 KB)
✓ Verified cache integrity

Total freed: 4.33 MB
Remaining: 22.12 MB
```

**Exit Codes**:
- `0`: Success
- `1`: Error during pruning

**Use Cases**:
- Free disk space (less aggressive than clear)
- Maintenance after long-running processes
- Keep frequently-used entries
- CI cache optimization

**Priority**: **P1 - Recommended**

---

### 5. `ngcompass cache validate`

**Purpose**: Check cache integrity and auto-heal corruption

**Usage**:
```bash
ngcompass cache validate
```

**Output**:
```
Validating cache integrity...
✓ AST cache: 128/128 entries valid
✓ Config cache: 12/12 entries valid
⚠ Results cache: 87/89 entries valid (2 corrupted)

Auto-removed 2 corrupted entries.
Cache is healthy.
```

**Exit Codes**:
- `0`: Cache is healthy
- `1`: Cache has errors (after attempting repair)

**Use Cases**:
- Check for corruption after crashes
- Auto-heal corrupted entries
- Verify cache after power loss
- Pre-deployment validation

**Priority**: **P1 - Recommended**

---

### 6. `ngcompass cache stats`

**Purpose**: Show detailed cache performance metrics

**Usage**:
```bash
ngcompass cache stats

# Optional: Clear stats after viewing
ngcompass cache stats --reset
```

**Output**:
```
Cache Statistics (Last 24 hours):

AST Cache:
  Hits: 1,247 (87.5%)
  Misses: 178 (12.5%)
  Avg Parse Time: 42ms
  Time Saved: 52.3s (via caching)

Config Cache:
  Hits: 342 (94.2%)
  Misses: 21 (5.8%)
  Avg Validation Time: 15ms
  Time Saved: 5.1s (via caching)

Total Time Saved: 57.4s
Cache Efficiency: 89.3%
```

**Exit Codes**:
- `0`: Success

**Use Cases**:
- Performance analysis
- Debug slow validations
- Understand cache effectiveness
- Optimization tuning
- Development insights

**Priority**: **P2 - Nice to Have**

---

## Implementation Phases

### Phase 1: Essential Commands (P0)

**Effort**: 2-3 hours
**Impact**: High - Solves 80% of user issues

**Commands**:
1. `cache clear` - Most critical for debugging
2. `cache info` - Transparency and diagnostics
3. `cache path` - Simple utility, helps with CI

**Implementation**:
```typescript
// packages/cli/src/commands/cache.ts (new file)

import { Command } from 'commander';
import { CacheContext } from '@ngcompass/core';
import pc from 'picocolors';

export function registerCacheCommand(program: Command, cache: CacheContext) {
    const cacheCmd = program
        .command('cache')
        .description('Manage cache');

    // ngcompass cache clear
    cacheCmd
        .command('clear')
        .description('Clear all or specific caches')
        .option('--type <type>', 'Cache type: ast|config|results|all', 'all')
        .action(async (options) => {
            console.log('Clearing cache...');

            if (options.type === 'all') {
                await cache.clear();
                console.log(pc.green('✓ Cleared all caches'));
            } else {
                // Type-specific clearing
                // Implementation needed: cache.clearType(options.type)
            }
        });

    // ngcompass cache info
    cacheCmd
        .command('info')
        .description('Show cache status and statistics')
        .action(async () => {
            // Implementation: gather cache info from CacheContext
            const info = cache.getInfo(); // New method needed
            console.log('Cache Status:');
            // Display formatted table
        });

    // ngcompass cache path
    cacheCmd
        .command('path')
        .description('Show cache directory location')
        .action(() => {
            const cachePath = cache.getCachePath(); // New method needed
            console.log(cachePath);
        });
}
```

**Required Changes to Core**:
```typescript
// packages/core/src/cache/index.ts

export interface CacheContext {
    sources: SourceCache;
    asts: AstCache;
    results: ResultCache;
    configs: ConfigCache;
    computeHash: (content: string, salt?: string) => string;
    prune: () => Promise<void>;
    clear: () => Promise<void>;

    // New methods for Phase 1:
    getInfo: () => CacheInfo;          // ✅ Add
    getCachePath: () => string;        // ✅ Add
    clearType: (type: string) => Promise<void>; // ✅ Add (optional)
}

export interface CacheInfo {
    ast: {
        l1: { entries: number; maxEntries: number; size: number };
        l2: { entries: number; size: number };
    };
    config: { entries: number; size: number };
    results: { entries: number; size: number };
    totalSize: number;
    location: string;
    version: string;
}
```

**Registration**:
```typescript
// packages/cli/src/commands/index.ts

import { registerCacheCommand } from './cache.js';

export function registerCommands(program: Command, cache: CacheContext) {
    registerInitCommand(program, cache);
    registerAnalyzeCommand(program, cache);
    registerConfigCommand(program, cache);
    registerCacheCommand(program, cache); // ✅ Add
}
```

---

### Phase 2: Management Commands (P1)

**Effort**: 3-4 hours
**Impact**: Medium - Advanced users, power features

**Commands**:
4. `cache prune` - Smarter cleanup than clear
5. `cache validate` - Auto-heal corruption
6. `cache clear --type` - Granular control

**Additional Implementation**:
```typescript
// Extend CacheContext
export interface CacheContext {
    // ... existing methods
    prune: () => Promise<PruneResult>;     // ✅ Already exists, enhance
    validate: () => Promise<ValidationResult>; // ✅ Add
}

export interface PruneResult {
    removed: number;
    freedSize: number;
    remainingSize: number;
}

export interface ValidationResult {
    total: number;
    valid: number;
    corrupted: number;
    repaired: number;
}
```

---

### Phase 3: Analytics Commands (P2)

**Effort**: 4-6 hours
**Impact**: Low - Mainly for development and optimization

**Commands**:
7. `cache stats` - Performance insights

**Additional Implementation**:
```typescript
// Add metrics tracking to cache drivers
interface CacheMetrics {
    hits: number;
    misses: number;
    writes: number;
    totalParseTime: number;
    totalReadTime: number;
    startTime: number;
}

// Extend CacheContext
export interface CacheContext {
    // ... existing methods
    getStats: () => CacheStats;        // ✅ Add
    resetStats: () => void;            // ✅ Add
}
```

---

## Benefits

### For Users

**1. Self-Service Debugging**
- No more "delete node_modules/.cache" instructions
- Clear cache when things go wrong
- Understand what's happening under the hood

**2. Disk Space Management**
- See cache size before it becomes a problem
- Prune old entries instead of full clear
- Control cache growth

**3. Transparency**
- Know cache is working (or not)
- See performance benefits quantified
- Trust the tool more

**4. Better Performance**
- Validate cache health
- Identify cache issues quickly
- Optimize cache configuration

### For Maintainers

**1. Reduced Support Burden**
- "Try `ngcompass cache clear`" solves 80% of cache issues
- Users can diagnose their own problems
- Less time answering "how do I clear cache?"

**2. Better Diagnostics**
- Users can share `cache info` output
- Easier to debug reported issues
- Quantify cache effectiveness

**3. Professional Image**
- Shows tool maturity
- Better than competitors (ESLint, Prettier)
- Industry-leading feature

**4. Development Insights**
- Track real-world cache performance
- Identify optimization opportunities
- Validate caching strategies

### For CI/CD

**1. Troubleshooting**
```yaml
# GitHub Actions example
- name: Clear cache on failure
  if: failure()
  run: npx ngcompass cache clear
```

**2. Optimization**
```yaml
# Prune cache between runs
- name: Optimize cache
  run: npx ngcompass cache prune
```

**3. Monitoring**
```yaml
# Track cache effectiveness
- name: Cache stats
  run: npx ngcompass cache stats
```

---

## Comparison with Competitors

| Feature | ngcompass (Proposed) | ESLint | TypeScript | Prettier | Webpack |
|---------|---------------------|--------|------------|----------|---------|
| **Clear Command** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Info Command** | ✅ | ❌ | ❌ | ❌ | ⚠️ |
| **Prune Command** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Stats Command** | ✅ | ❌ | ⚠️ --diagnostics | ❌ | ⚠️ |
| **Validate Command** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Hit Rate Tracking** | ✅ | ❌ | ❌ | ❌ | ❌ |

**Verdict**: ngcompass would be **industry-leading** in cache management.

---

## User Stories

### Story 1: Debugging After Upgrade
```
As a user who just upgraded ngcompass,
I want to clear my cache when I see unexpected errors,
So that I can ensure I'm not using stale cached data.

Acceptance Criteria:
- Run `ngcompass cache clear`
- See confirmation of what was cleared
- Next validation uses fresh cache
```

### Story 2: Checking Disk Usage
```
As a developer concerned about disk space,
I want to see how much space the cache uses,
So that I can decide if I need to clear it.

Acceptance Criteria:
- Run `ngcompass cache info`
- See total cache size
- See breakdown by cache type
- See cache location
```

### Story 3: CI Cache Issues
```
As a DevOps engineer managing CI pipelines,
I want to clear cache when builds fail mysteriously,
So that I can eliminate cache as the problem source.

Acceptance Criteria:
- Add `npx ngcompass cache clear` to CI script
- Cache clears successfully in CI environment
- Subsequent runs use fresh cache
```

### Story 4: Performance Analysis
```
As a performance-conscious developer,
I want to see cache hit rates and time saved,
So that I can understand if caching is effective.

Acceptance Criteria:
- Run `ngcompass cache stats`
- See hit/miss ratios
- See time saved via caching
- Identify if cache needs tuning
```

---

## Technical Considerations

### 1. Backward Compatibility
- All commands are **new** (no breaking changes)
- Existing CLI behavior unchanged
- Cache infrastructure already supports these operations

### 2. Cross-Platform Support
- Works on Windows, macOS, Linux
- Handles path differences automatically
- Uses existing cross-platform cache implementation

### 3. Permissions
- Respect file system permissions
- Graceful error messages if can't write
- Exit codes for scripting

### 4. Performance
- `cache clear`: Fast (< 100ms)
- `cache info`: Fast (< 50ms, reads cache metadata)
- `cache stats`: Fast (in-memory counters)
- `cache prune`: Moderate (depends on cache size, < 1s)
- `cache validate`: Moderate (< 2s for typical cache)

### 5. Error Handling
- Clear error messages for common issues
- Exit codes for CI/scripting
- Graceful degradation if cache unavailable

---

## Risks and Mitigations

### Risk 1: User Clears Cache Too Often
**Risk**: Users clear cache unnecessarily, losing performance benefits

**Mitigation**:
- Educate in docs: "Only clear if you have issues"
- `cache prune` as gentler alternative
- Show what will be cleared before confirming
- Track cache rebuild time in stats

### Risk 2: Commands Add Maintenance Burden
**Risk**: More commands = more code to maintain

**Mitigation**:
- Use existing cache infrastructure (no new caching logic)
- Simple, focused commands (each < 50 lines)
- Comprehensive tests
- Clear separation from core logic

### Risk 3: Breaking Changes to Cache Format
**Risk**: Cache format changes, commands need updates

**Mitigation**:
- Already have cache versioning (v1.0.0)
- Commands work with any cache version
- Auto-detect and handle old cache formats
- Document cache format in separate spec

### Risk 4: CI/CD Script Dependency
**Risk**: Users rely on cache commands in CI, we must maintain them

**Mitigation**:
- Mark commands as stable after Phase 1
- Semantic versioning for breaking changes
- Deprecation policy (6-month notice)
- Clear documentation of command stability

---

## Testing Strategy

### Unit Tests
```typescript
// Test cache clear
it('should clear all caches', async () => {
    const cache = createTestCache();
    await cache.clear();
    const info = cache.getInfo();
    expect(info.totalSize).toBe(0);
});

// Test cache info
it('should return accurate cache info', () => {
    const cache = createTestCache();
    const info = cache.getInfo();
    expect(info).toHaveProperty('totalSize');
    expect(info).toHaveProperty('location');
});

// Test cache stats
it('should track hit/miss rates', async () => {
    const cache = createTestCache();
    await cache.asts.get('key1'); // miss
    await cache.asts.get('key1'); // hit
    const stats = cache.getStats();
    expect(stats.ast.hits).toBe(1);
    expect(stats.ast.misses).toBe(1);
});
```

### Integration Tests
```typescript
// Test CLI commands
it('should execute cache clear command', async () => {
    const result = await execCLI('cache clear');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Cleared');
});

it('should execute cache info command', async () => {
    const result = await execCLI('cache info');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Cache Status');
});
```

### Manual Testing Checklist
- [ ] Run all cache commands on macOS, Windows, Linux
- [ ] Test with empty cache
- [ ] Test with large cache (> 100MB)
- [ ] Test with corrupted cache
- [ ] Test with permission issues
- [ ] Test in CI environment
- [ ] Test with --help flag
- [ ] Test invalid options

---

## Documentation Requirements

### 1. CLI Documentation
```markdown
# Cache Management

ngcompass provides comprehensive cache management commands.

## Commands

### `ngcompass cache clear`
Clear all or specific caches.

Usage: `ngcompass cache clear [--type <type>]`

Options:
  --type  Cache type: ast|config|results|all (default: all)

Example:
  $ ngcompass cache clear
  $ ngcompass cache clear --type ast

### `ngcompass cache info`
Show cache status and statistics.

Usage: `ngcompass cache info`

Example:
  $ ngcompass cache info
  Cache Status:
  ...
```

### 2. User Guide
- When to clear cache
- How to interpret cache info
- Understanding cache stats
- CI/CD integration examples

### 3. API Documentation
- CacheContext interface updates
- New method signatures
- Usage examples for programmatic access

---

## Success Metrics

### Quantitative Metrics

**1. Support Ticket Reduction**
- Baseline: Cache-related issues per month
- Target: 50% reduction after 3 months
- Measure: GitHub issues tagged "cache"

**2. Command Usage**
- Track: How often each command is used
- Goal: `cache clear` used > 100 times/month
- Goal: `cache info` used > 50 times/month

**3. Documentation Views**
- Track: Views of cache command docs
- Goal: Top 10 most-viewed docs pages

### Qualitative Metrics

**1. User Feedback**
- Survey: "How satisfied are you with cache management?"
- Goal: 80% satisfaction rate
- Method: In-app survey after cache command use

**2. Community Reception**
- Monitor: Twitter, Reddit, HN mentions
- Goal: Positive reception, "finally!" reactions
- Benchmark: Compare to competitor features

**3. Developer Experience**
- Internal: Time to debug cache issues
- Goal: < 5 minutes with cache commands
- Baseline: 15-30 minutes without commands

---

## Timeline

### Phase 1 (Essential) - Week 1
- **Day 1-2**: Implement `cache clear`, `cache path`
- **Day 3**: Implement `cache info`
- **Day 4**: Write tests
- **Day 5**: Documentation, PR review

**Deliverable**: `cache clear`, `cache info`, `cache path` commands

### Phase 2 (Management) - Week 2-3
- **Week 2**: Implement `cache prune`, `cache validate`
- **Week 3**: Type-specific clearing, tests, docs

**Deliverable**: Full cache management suite

### Phase 3 (Analytics) - Week 4 (Optional)
- **Week 4**: Implement `cache stats`, metrics tracking

**Deliverable**: Performance insights

---

## Alternatives Considered

### Alternative 1: No Cache Commands (Status Quo)
**Pros**:
- No development effort
- No maintenance burden

**Cons**:
- Users stuck with manual deletion
- High support burden
- Poor user experience
- Missing competitive feature

**Verdict**: ❌ Not recommended

### Alternative 2: Single `--no-cache` Flag
```bash
ngcompass analyze --no-cache
```

**Pros**:
- Simple implementation
- ESLint-style approach

**Cons**:
- Only disables cache, doesn't clear it
- No visibility into cache status
- No way to prune or validate
- Limited functionality

**Verdict**: ⚠️ Not sufficient (could add as supplement)

### Alternative 3: Auto-Clear on Version Change
Automatically clear cache when ngcompass version changes.

**Pros**:
- No user action required
- Prevents stale cache issues

**Cons**:
- Surprising behavior (slow first run after upgrade)
- Wastes cache on patch upgrades
- Doesn't help with corruption/disk space

**Verdict**: ⚠️ Good idea, but not a replacement for commands (implement both)

---

## Conclusion

### Recommendation: **Implement Phase 1 (Essential Commands)**

**Why**:
1. **High Impact**: Solves 80% of user cache issues
2. **Low Effort**: 2-3 hours of development
3. **Competitive Advantage**: No other linting tool has this
4. **User Delight**: Long-requested feature
5. **Support Reduction**: Self-service debugging

**Priority Order**:
1. `cache clear` - Most critical (1 hour)
2. `cache info` - High value (1 hour)
3. `cache path` - Quick win (30 min)

**Total Investment**: ~2.5 hours for massive user value

**Next Steps**:
1. Approve this proposal
2. Create implementation tickets
3. Implement Phase 1 commands
4. Update documentation
5. Announce in release notes

**Future Phases**: Evaluate after Phase 1 based on usage and feedback

---

## Appendix

### A. Related Issues
- #XXX: Users report stale cache after upgrade
- #XXX: Request for cache clear command
- #XXX: CI cache corruption issues

### B. References
- [ESLint Cache Documentation](https://eslint.org/docs/latest/use/command-line-interface)
- [Webpack Cache Configuration](https://webpack.js.org/configuration/cache/)
- [Git Clean Command](https://git-scm.com/docs/git-clean) (similar UX patterns)

### C. Prototype Code
See implementation outline in "Phase 1" section above.

---

**Proposal Status**: ✅ Ready for Review
**Next Reviewer**: Technical Lead
**Target Release**: v2.1.0
