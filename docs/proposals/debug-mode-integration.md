# Debug Mode Integration Plan

## Executive Summary

This document outlines a comprehensive plan to integrate debug/verbose mode into ngcompass, covering both **current implemented features** and **future planned features**. The implementation follows industry standards (ESLint, TypeScript, Webpack) and provides maximum value for troubleshooting, performance analysis, and user confidence.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Current Features Integration](#current-features-integration)
3. [Future Features Integration](#future-features-integration)
4. [Implementation Phases](#implementation-phases)
5. [Technical Specifications](#technical-specifications)
6. [Examples & Usage](#examples--usage)

---

## Architecture Overview

### Debug System Design

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Entry Point                       │
│  (packages/cli/src/bin/ngcompass.ts)                    │
│                                                          │
│  Handles:                                                │
│  - --debug flag parsing                                  │
│  - --verbose flag parsing                                │
│  - DEBUG env var detection                               │
│  - Logger initialization                                 │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              Global Logger Module                        │
│  (packages/common/src/logger.ts)                        │
│                                                          │
│  - Singleton logger instance                             │
│  - Level-based logging (debug, info, warn, error)       │
│  - Namespace support (loader, cache, validator)         │
│  - Performance timing utilities                          │
│  - Conditional output based on debug mode                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│          Instrumented Modules                            │
│                                                          │
│  - config/loaders/loader.ts                              │
│  - config/loaders/discovery.ts                           │
│  - config/health/validator.ts                            │
│  - cache/index.ts                                        │
│  - cache/drivers/*                                       │
│  - (future) analyzer, rules, parsers                     │
└──────────────────────────────────────────────────────────┘
```

### Multi-Level Debug Support

```typescript
// Level 0: Normal (no debug)
ngcompass analyze

// Level 1: Basic debug (--debug)
ngcompass analyze --debug
// Shows: Phase timing, cache hits/misses, file discovery

// Level 2: Verbose (--verbose)
ngcompass analyze --verbose
// Shows: Everything from Level 1 + detailed per-file info, rule execution

// Level 3: Trace (DEBUG=ngcompass:*)
DEBUG=ngcompass:* ngcompass analyze
// Shows: Everything from Level 2 + internal details, function calls

// Level 4: Granular namespace (DEBUG=ngcompass:cache,ngcompass:loader)
DEBUG=ngcompass:cache ngcompass analyze
// Shows: Only cache-related debug output
```

---

## Current Features Integration

### Phase 1: Configuration System (Implemented)

#### 1.1 Config Discovery (`packages/core/src/config/loaders/discovery.ts`)

**Debug Points:**
- Search paths attempted
- Config file found/not found
- File read time
- Content hash computation time
- Profile detection

**Example Output:**
```
[ngcompass:discovery] Searching for config in: /project
[ngcompass:discovery] Checking: .ngcompassrc.json ✗
[ngcompass:discovery] Checking: .ngcompassrc.js ✗
[ngcompass:discovery] Checking: ngcompass.config.ts ✓
[ngcompass:discovery] File read: 3.2ms
[ngcompass:discovery] Content hash: a3f2b1c4 (computed in 2.1ms)
[ngcompass:discovery] Discovery complete: 5.3ms
```

**Implementation:**
```typescript
// In discovery.ts
import { debug } from '@ngcompass/common/logger';

export async function findAndLoadConfig(cwd: string): Promise<ConfigDiscoveryResult | null> {
    const startTime = performance.now();
    debug('discovery', `Searching for config in: ${cwd}`);

    for (const filename of CONFIG_FILE_NAMES) {
        debug('discovery', `Checking: ${filename}`, '✗');
        const filepath = path.join(cwd, filename);
        // ... file loading
        debug('discovery', `Checking: ${filename}`, '✓');
    }

    debug('discovery', `Discovery complete: ${(performance.now() - startTime).toFixed(1)}ms`);
}
```

#### 1.2 Config Validation (`packages/core/src/config/health/validator.ts`)

**Debug Points:**
- Schema validation start/end
- Semantic validation phases
- Rule checks performed
- Issues discovered (count + severity)
- AST location enrichment time
- Total validation time

**Example Output:**
```
[ngcompass:validator] Starting validation
[ngcompass:validator] Schema validation: PASS (12.3ms)
[ngcompass:validator] Running semantic checks...
[ngcompass:validator]   ├─ Base checks: 0 issues (2.1ms)
[ngcompass:validator]   ├─ Cross-field checks: 0 issues (1.8ms)
[ngcompass:validator]   ├─ Path checks: 2 issues (5.4ms)
[ngcompass:validator]   └─ Rule checks: 1 issue (3.2ms)
[ngcompass:validator] AST enrichment: 3 locations mapped (45.6ms)
[ngcompass:validator] Validation complete: 3 issues, 70.4ms
```

#### 1.3 Config Loading & Caching (`packages/core/src/config/loaders/loader.ts`)

**Debug Points:**
- Cache lookup (key hash)
- Cache HIT/MISS with time saved
- Profile merging
- Cache write operations

**Example Output:**
```
[ngcompass:loader] Starting config resolution (cwd: /project, profile: undefined)
[ngcompass:loader] Cache lookup: key=a3f2b1c4
[ngcompass:loader] Cache HIT - returning cached result (saved 145ms)
[ngcompass:loader] Config resolution complete: 2.3ms

// OR on cache miss:
[ngcompass:loader] Cache MISS - running validation
[ngcompass:loader] Validation complete: 3 issues, 145.2ms
[ngcompass:loader] Cached result: key=a3f2b1c4
[ngcompass:loader] Config resolution complete: 147.5ms
```

#### 1.4 Cache Operations (`packages/core/src/cache/index.ts`)

**Debug Points:**
- Cache initialization
- Driver selection (memory/disk)
- Get/Set/Clear operations
- L1/L2 cache flow
- Eviction events
- Size calculations

**Example Output:**
```
[ngcompass:cache] Initializing cache system
[ngcompass:cache]   ├─ Memory (L1): max=200, maxSize=50MB
[ngcompass:cache]   ├─ Disk (L2): path=node_modules/.cache/ngcompass
[ngcompass:cache]   └─ Version: v1.0.0
[ngcompass:cache] AST cache GET: key=abc123 → L1 HIT (0.2ms)
[ngcompass:cache] Config cache GET: key=def456 → L2 HIT (8.3ms)
[ngcompass:cache] Result cache SET: key=ghi789 (size: 12KB)
[ngcompass:cache] L1 eviction: removed 5 entries (freed 2.3MB)
```

### Phase 2: CLI Commands (Implemented)

#### 2.1 `ngcompass init`

**Debug Points:**
- Existing config check
- Template selection
- File write operations

**Example Output:**
```
[ngcompass:init] Checking for existing config in /project
[ngcompass:init] No existing config found
[ngcompass:init] Writing template to: ngcompass.config.ts
[ngcompass:init] Init complete: 15.2ms
```

#### 2.2 `ngcompass config health`

**Debug Points:**
- Config resolution (reuses loader debug)
- Validation (reuses validator debug)
- Reporter selection

**Example Output:**
```
[ngcompass:config] Running health check (profile: undefined)
[ngcompass:loader] ... (nested loader debug output)
[ngcompass:validator] ... (nested validator debug output)
[ngcompass:config] Reporter: text
[ngcompass:config] Health check complete: valid=false, 3 issues
```

#### 2.3 `ngcompass cache [clear|info|path]`

**Debug Points:**
- Cache operations
- Statistics gathering
- Disk I/O

**Example Output:**
```
[ngcompass:cache:cmd] Clearing cache type: ast
[ngcompass:cache] Clearing AST L1 cache (200 entries)
[ngcompass:cache] Clearing AST L2 cache (1,543 files)
[ngcompass:cache] Clear complete: 45.3ms
```

---

## Future Features Integration

### Phase 3: Analysis Engine (Planned)

#### 3.1 File Scanner

**Debug Points:**
- Glob pattern expansion
- File discovery count
- Filter application (include/exclude)
- File queue size

**Example Output:**
```
[ngcompass:scanner] Expanding patterns: src/**/*.ts, src/**/*.html
[ngcompass:scanner] Discovered 1,247 files
[ngcompass:scanner] After filters: 856 files
[ngcompass:scanner] Queued for analysis: 856 files
[ngcompass:scanner] Scan complete: 123.4ms
```

#### 3.2 Parser & AST Generation

**Debug Points:**
- Per-file parsing time
- AST cache hits/misses
- Parser errors
- TypeScript compiler API calls

**Example Output:**
```
[ngcompass:parser] Parsing src/app/app.component.ts
[ngcompass:parser]   ├─ AST cache: MISS
[ngcompass:parser]   ├─ TSC parse: 23.4ms
[ngcompass:parser]   └─ Cached for next run
[ngcompass:parser] Parsing src/app/app.module.ts
[ngcompass:parser]   ├─ AST cache: HIT (saved 21.2ms)
[ngcompass:parser] Total parsed: 856 files, cache hit rate: 87.3%
```

#### 3.3 Rule Execution

**Debug Points:**
- Rule loading
- Per-file rule execution
- Rule timing (slowest rules)
- Violations found

**Example Output:**
```
[ngcompass:rules] Loading 47 rules
[ngcompass:rules] Analyzing src/app/app.component.ts
[ngcompass:rules]   ├─ component-selector: PASS (1.2ms)
[ngcompass:rules]   ├─ no-input-rename: PASS (0.8ms)
[ngcompass:rules]   ├─ prefer-on-push: FAIL - 1 violation (2.1ms)
[ngcompass:rules]
[ngcompass:rules] Rule Performance (slowest):
[ngcompass:rules]   1. template-complexity: avg 45.2ms
[ngcompass:rules]   2. unused-imports: avg 23.1ms
[ngcompass:rules]   3. cyclomatic-complexity: avg 12.4ms
```

#### 3.4 Worker Pool (Parallelization)

**Debug Points:**
- Worker spawn/termination
- Task distribution
- Worker utilization
- Queue depth

**Example Output:**
```
[ngcompass:workers] Spawning 7 workers (maxWorkers=7)
[ngcompass:workers] Worker pool ready: 234ms
[ngcompass:workers] Distributing 856 tasks across 7 workers
[ngcompass:workers] Worker #3: processing src/app/app.component.ts (queue: 122)
[ngcompass:workers] Worker #5: completed src/app/app.module.ts (12.3ms)
[ngcompass:workers] Average worker utilization: 94.2%
[ngcompass:workers] All tasks complete: 8.7s
```

#### 3.5 Results Collection & Reporting

**Debug Points:**
- Result aggregation
- Sorting/filtering
- Report generation
- Output file writing

**Example Output:**
```
[ngcompass:reporter] Collecting results from 856 files
[ngcompass:reporter] Total violations: 234 (critical: 12, high: 45, moderate: 89, low: 88)
[ngcompass:reporter] Generating report: format=json
[ngcompass:reporter] Writing to: ngcompass-report.json
[ngcompass:reporter] Report complete: 45.2ms
```

### Phase 4: Watch Mode (Planned)

**Debug Points:**
- File watcher initialization
- File change events
- Debouncing
- Incremental analysis

**Example Output:**
```
[ngcompass:watch] Initializing file watcher
[ngcompass:watch] Watching 856 files (debounce: 300ms)
[ngcompass:watch] Change detected: src/app/app.component.ts
[ngcompass:watch] Debounce timer started
[ngcompass:watch] Change detected: src/app/app.component.html
[ngcompass:watch] Debounce reset
[ngcompass:watch] Debounce complete - analyzing 2 files
[ngcompass:watch] Incremental analysis complete: 1.2s
```

### Phase 5: Auto-Fix (Planned)

**Debug Points:**
- Fixable violations detection
- Fix application
- File writing
- Verification

**Example Output:**
```
[ngcompass:autofix] Found 45 auto-fixable violations
[ngcompass:autofix] Applying fix: src/app/app.component.ts (no-input-rename)
[ngcompass:autofix]   ├─ Original: @Input('old') prop: string;
[ngcompass:autofix]   ├─ Fixed:    @Input() old: string;
[ngcompass:autofix]   └─ Written to disk
[ngcompass:autofix] Re-analyzing to verify fixes...
[ngcompass:autofix] Verification complete: 45/45 fixed successfully
```

---

## Implementation Phases

### **Phase 1: Foundation** (Week 1)
*Status: Ready to implement*

**Tasks:**
1. Create `packages/common/src/logger.ts` - Global logger module
2. Add `--debug` and `--verbose` flags to CLI entry point
3. Integrate logger into existing config system:
   - `discovery.ts`
   - `loader.ts`
   - `validator.ts`
   - `cache/index.ts`
4. Add debug output to CLI commands (init, config, cache)
5. Write tests for logger module

**Acceptance Criteria:**
- `ngcompass config health --debug` shows detailed timing and cache info
- `ngcompass init --debug` shows template writing process
- `ngcompass cache info --debug` shows internal statistics gathering
- `DEBUG=ngcompass:* ngcompass config health` works
- No debug output in normal mode (zero overhead)

### **Phase 2: Analysis Engine** (Week 2-3)
*Status: Pending Phase 1 completion + Analysis implementation*

**Tasks:**
1. Add debug to file scanner
2. Add debug to parser/AST generation
3. Add debug to rule execution engine
4. Add worker pool debugging
5. Add reporter debugging

**Acceptance Criteria:**
- `ngcompass analyze --debug` shows:
  - Files discovered count
  - Cache hit rate for AST
  - Per-rule timing
  - Worker utilization
  - Total analysis time

### **Phase 3: Advanced Features** (Week 4+)
*Status: Pending Phase 2*

**Tasks:**
1. Watch mode debugging
2. Auto-fix debugging
3. Performance profiling mode (`--profile` flag)
4. Debug log export (`--debug-output=file.log`)

---

## Technical Specifications

### Logger Module Design

**File:** `packages/common/src/logger.ts`

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Namespace = 'discovery' | 'loader' | 'validator' | 'cache' | 'scanner' | 'parser' | 'rules' | 'workers' | 'reporter' | 'watch' | 'autofix';

interface LoggerConfig {
    enabled: boolean;
    level: LogLevel;
    namespaces: Set<Namespace> | 'all';
    showTimestamps: boolean;
    showTimings: boolean;
}

class Logger {
    private config: LoggerConfig;
    private timers: Map<string, number>;

    constructor() {
        this.config = this.initializeFromEnv();
        this.timers = new Map();
    }

    private initializeFromEnv(): LoggerConfig {
        const debugEnv = process.env.DEBUG || '';
        const enabled = debugEnv.includes('ngcompass') || debugEnv === '*';

        // Parse namespaces from DEBUG=ngcompass:loader,ngcompass:cache
        const namespaces = this.parseNamespaces(debugEnv);

        return {
            enabled,
            level: 'debug',
            namespaces,
            showTimestamps: true,
            showTimings: true
        };
    }

    public enable(level: LogLevel = 'debug', namespaces: Namespace[] | 'all' = 'all') {
        this.config.enabled = true;
        this.config.level = level;
        this.config.namespaces = namespaces === 'all' ? 'all' : new Set(namespaces);
    }

    public debug(namespace: Namespace, message: string, ...args: any[]) {
        this.log('debug', namespace, message, ...args);
    }

    public info(namespace: Namespace, message: string, ...args: any[]) {
        this.log('info', namespace, message, ...args);
    }

    public time(label: string) {
        this.timers.set(label, performance.now());
    }

    public timeEnd(label: string): number {
        const start = this.timers.get(label);
        if (!start) return 0;

        const duration = performance.now() - start;
        this.timers.delete(label);
        return duration;
    }

    private log(level: LogLevel, namespace: Namespace, message: string, ...args: any[]) {
        if (!this.config.enabled) return;
        if (this.config.namespaces !== 'all' && !this.config.namespaces.has(namespace)) return;

        const prefix = `[ngcompass:${namespace}]`;
        const timestamp = this.config.showTimestamps ? `[${new Date().toISOString()}]` : '';

        console.error(`${timestamp}${prefix} ${message}`, ...args);
    }

    private parseNamespaces(debugEnv: string): Set<Namespace> | 'all' {
        if (debugEnv === '*' || debugEnv === 'ngcompass' || debugEnv === 'ngcompass:*') {
            return 'all';
        }

        const parts = debugEnv.split(',').map(s => s.trim());
        const namespaces = new Set<Namespace>();

        for (const part of parts) {
            if (part.startsWith('ngcompass:')) {
                const ns = part.replace('ngcompass:', '') as Namespace;
                namespaces.add(ns);
            }
        }

        return namespaces.size > 0 ? namespaces : 'all';
    }
}

// Singleton instance
const logger = new Logger();

// Convenience exports
export const debug = (namespace: Namespace, message: string, ...args: any[]) => logger.debug(namespace, message, ...args);
export const info = (namespace: Namespace, message: string, ...args: any[]) => logger.info(namespace, message, ...args);
export const time = (label: string) => logger.time(label);
export const timeEnd = (label: string) => logger.timeEnd(label);
export const enableDebug = (level?: LogLevel, namespaces?: Namespace[] | 'all') => logger.enable(level, namespaces);

export default logger;
```

### CLI Integration

**File:** `packages/cli/src/bin/ngcompass.ts`

```typescript
import { Command } from 'commander';
import { enableDebug } from '@ngcompass/common/logger';
import { registerCommands } from '../commands/index.js';
import { getGlobalCache } from '@ngcompass/core';

export async function run() {
    const program = new Command();

    program
        .name('ngcompass')
        .description('Angular project analyzer and linter')
        .version('0.0.0')
        .option('--debug', 'Enable debug output (all namespaces)')
        .option('--verbose', 'Enable verbose output (alias for --debug)')
        .hook('preAction', (thisCommand) => {
            const opts = thisCommand.opts();
            if (opts.debug || opts.verbose) {
                enableDebug('debug', 'all');
            }
        });

    const cache = getGlobalCache();
    registerCommands(program, cache);

    await program.parseAsync(process.argv);
}
```

### Performance Timing Pattern

**Standard pattern for all modules:**

```typescript
import { debug, time, timeEnd } from '@ngcompass/common/logger';

export async function someOperation() {
    const timerLabel = 'someOperation';
    time(timerLabel);

    debug('namespace', 'Starting operation with params: ...', params);

    // ... do work

    const duration = timeEnd(timerLabel);
    debug('namespace', `Operation complete: ${duration.toFixed(1)}ms`);
}
```

---

## Examples & Usage

### Basic Usage

```bash
# Normal mode (no debug)
ngcompass config health

# Debug mode (all namespaces)
ngcompass config health --debug

# Verbose mode (same as debug)
ngcompass config health --verbose

# Environment variable (all namespaces)
DEBUG=ngcompass:* ngcompass config health

# Specific namespace
DEBUG=ngcompass:cache ngcompass analyze

# Multiple namespaces
DEBUG=ngcompass:loader,ngcompass:validator ngcompass config health
```

### Sample Output Walkthrough

**Command:** `ngcompass config health --debug`

**Output:**
```
[ngcompass:loader] Starting config resolution (cwd: /my-project, profile: undefined)
[ngcompass:discovery] Searching for config in: /my-project
[ngcompass:discovery] Checking: .ngcompassrc.json ✗
[ngcompass:discovery] Checking: .ngcompassrc.js ✗
[ngcompass:discovery] Checking: .ngcompass.config.js ✗
[ngcompass:discovery] Checking: ngcompass.config.json ✗
[ngcompass:discovery] Checking: ngcompass.config.ts ✓
[ngcompass:discovery] File read: 3.2ms
[ngcompass:discovery] Content hash: a3f2b1c4e5f6 (computed in 2.1ms)
[ngcompass:discovery] Discovery complete: 5.3ms

[ngcompass:loader] Cache lookup: key=a3f2b1c4
[ngcompass:cache] Config cache GET: key=a3f2b1c4e5f6
[ngcompass:cache] L1 MISS, checking L2...
[ngcompass:cache] L2 HIT (8.3ms)
[ngcompass:loader] Cache HIT - returning cached result (saved 145ms)
[ngcompass:loader] Config resolution complete: 13.6ms

✓ Configuration is valid

[Summary]
Total time: 13.6ms
Cache hit: yes (saved ~145ms)
```

**Command:** `ngcompass analyze --debug` (future)

**Output:**
```
[ngcompass:loader] ... (config loading debug output)
[ngcompass:scanner] Expanding patterns: src/**/*.ts, src/**/*.html
[ngcompass:scanner] Discovered 1,247 files
[ngcompass:scanner] After filters: 856 files
[ngcompass:scanner] Scan complete: 123.4ms

[ngcompass:workers] Spawning 7 workers (maxWorkers=7)
[ngcompass:workers] Worker pool ready: 234ms

[ngcompass:parser] Parsing src/app/app.component.ts
[ngcompass:cache] AST cache GET: key=abc123
[ngcompass:cache] L1 HIT (0.2ms)
[ngcompass:parser] AST cache: HIT (saved 21.2ms)

[ngcompass:rules] Analyzing src/app/app.component.ts
[ngcompass:rules]   ├─ component-selector: PASS (1.2ms)
[ngcompass:rules]   ├─ no-input-rename: PASS (0.8ms)
[ngcompass:rules]   ├─ prefer-on-push: FAIL - 1 violation (2.1ms)

[ngcompass:workers] All tasks complete: 8.7s
[ngcompass:reporter] Collecting results from 856 files
[ngcompass:reporter] Total violations: 234
[ngcompass:reporter] Report complete: 45.2ms

✗ Found 234 violations

[Summary]
Files analyzed: 856
Total time: 9.1s
Cache hit rate: 87.3%
Average file time: 10.6ms
```

---

## Benefits Summary

### For Users
1. **Troubleshooting** - See exactly what's happening when things go wrong
2. **Performance insight** - Identify bottlenecks (slow rules, cache misses)
3. **Confidence** - Know the tool is working, not frozen
4. **Learning** - Understand how the tool works internally

### For Developers
1. **Reduced support burden** - Users can self-diagnose
2. **Better bug reports** - Include `--debug` output
3. **Profiling** - Identify optimization opportunities
4. **Development** - Debug new features easily

### For CI/CD
1. **Transparent builds** - See cache effectiveness
2. **Performance tracking** - Detect regressions
3. **Failure diagnosis** - Understand why builds fail

---

## Conclusion

Debug mode is a **high-value, low-cost feature** that:
- Takes ~1 week to implement for current features
- Follows industry best practices
- Provides significant user value
- Reduces support burden
- Enables performance optimization

**Recommendation:** Implement Phase 1 immediately, add Phases 2-3 as features are developed.
