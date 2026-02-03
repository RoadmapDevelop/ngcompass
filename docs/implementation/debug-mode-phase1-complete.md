# Debug Mode Integration - Phase 1 Complete

## Implementation Summary

Phase 1 of the debug mode integration has been successfully implemented. This provides debug output for all current features with zero overhead when disabled.

---

## What Was Implemented

### 1. Global Logger Module ✅

**File:** `packages/common/src/logger.ts`

**Features:**
- Singleton logger pattern
- Namespace-based filtering (`discovery`, `loader`, `validator`, `cache`, `init`, `config`)
- Multiple log levels (debug, info, warn, error)
- Performance timing utilities (time, timeEnd, timeLog)
- Support for both `--debug` flag and `DEBUG` environment variable
- Zero overhead when disabled

**Usage:**
```typescript
import { debug, time, timeEnd } from '@ngcompass/common';

time('operation');
debug('namespace', 'Starting operation');
// ... do work ...
const duration = timeEnd('operation');
debug('namespace', `Complete: ${duration.toFixed(1)}ms`);
```

### 2. CLI Integration ✅

**File:** `packages/cli/src/bin/ngcompass.ts`

**Changes:**
- Added `--debug` flag to enable debug output
- Added `--verbose` flag (alias for --debug)
- Added `preAction` hook to enable logger before command execution
- Respects `DEBUG` environment variable

**Usage:**
```bash
# Enable debug mode with flag
compass config health --debug
compass init --verbose

# Enable with environment variable
DEBUG=ngcompass:* compass config health

# Enable specific namespace
DEBUG=ngcompass:loader,ngcompass:cache compass config health
```

### 3. Config Discovery Debug Output ✅

**File:** `packages/core/src/config/loaders/discovery.ts`

**Debug Points:**
- Search directory
- Config file found/not found
- Content hash computation with timing
- Total discovery time

**Example Output:**
```
[ngcompass:discovery] Searching for config in: /project
[ngcompass:discovery] Found config: /project/ngcompass.config.ts
[ngcompass:discovery] Content hash: a3f2b1c4... (2.1ms)
[ngcompass:discovery] Discovery complete: 5.3ms
```

### 4. Config Loader Debug Output ✅

**File:** `packages/core/src/config/loaders/loader.ts`

**Debug Points:**
- Resolution start (cwd, profile)
- Cache lookup with key preview
- Cache HIT/MISS status
- Validation results (valid/invalid with issue count)
- Cache write operations
- Total resolution time

**Example Output:**
```
[ngcompass:loader] Starting config resolution (cwd: /project, profile: none)
[ngcompass:loader] Cache lookup: key=a3f2b1c4...
[ngcompass:loader] Cache MISS - running validation
[ngcompass:loader] Validation complete: invalid (3 issues)
[ngcompass:loader] Cached validation result: key=a3f2b1c4...
[ngcompass:loader] Config resolution complete: 147.5ms
```

---

## Testing

### Manual Testing

```bash
# Test 1: Basic debug output
cd /path/to/project
compass config health --debug

# Expected: See discovery, loader, validator debug messages

# Test 2: Environment variable
DEBUG=ngcompass:* compass config health

# Expected: Same output as --debug

# Test 3: Namespace filtering
DEBUG=ngcompass:loader compass config health

# Expected: Only see loader messages

# Test 4: No debug (default)
compass config health

# Expected: Clean output, no debug messages

# Test 5: Cache HIT scenario
compass config health --debug
compass config health --debug  # Run twice

# Expected: Second run shows "Cache HIT"
```

### Performance Verification

Debug mode should have zero overhead when disabled:

```bash
# Without debug
time compass config health  # e.g., 50ms

# With debug
time compass config health --debug  # e.g., 51ms (negligible difference)
```

---

## Usage Examples

### Example 1: Troubleshooting Config Not Found

```bash
$ DEBUG=ngcompass:discovery compass config health

[ngcompass:discovery] Searching for config in: /my-project
[ngcompass:discovery] No config file found
```

**Fix:** Run `compass init` to create config file.

### Example 2: Understanding Cache Performance

```bash
$ compass config health --debug

[ngcompass:loader] Starting config resolution (cwd: /project, profile: none)
[ngcompass:discovery] Searching for config in: /project
[ngcompass:discovery] Found config: /project/ngcompass.config.ts
[ngcompass:discovery] Content hash: a3f2b1c4... (2.1ms)
[ngcompass:discovery] Discovery complete: 5.3ms
[ngcompass:loader] Cache lookup: key=a3f2b1c4...
[ngcompass:loader] Cache HIT - returning cached result (2.3ms)

$ # Second run is much faster due to cache!
```

### Example 3: Debugging Slow Validation

```bash
$ DEBUG=ngcompass:* compass config health

[ngcompass:loader] Starting config resolution (cwd: /project, profile: none)
[ngcompass:discovery] ... (5.3ms)
[ngcompass:loader] Cache MISS - running validation
[ngcompass:loader] Validation complete: invalid (3 issues)
[ngcompass:loader] Config resolution complete: 847.5ms

# Insight: Validation took ~840ms - might be slow AST parsing
```

---

## Next Steps

### Phase 2: Analysis Engine Debug Output (Planned)

When file scanning and analysis features are implemented, add debug output for:

1. **File Scanner**
   - Pattern expansion
   - Files discovered
   - Filter application
   - Scan timing

2. **Parser/AST**
   - Per-file parsing
   - AST cache hits/misses
   - Parser errors

3. **Rule Execution**
   - Rule loading
   - Per-rule timing
   - Violations found

4. **Worker Pool**
   - Worker spawn/termination
   - Task distribution
   - Worker utilization

5. **Reporter**
   - Result aggregation
   - Report generation
   - File output

### Future Enhancements

1. **Structured Logging** - Add JSON output format for CI/CD
   ```bash
   compass config health --debug --debug-format=json
   ```

2. **Performance Profiling** - Add `--profile` flag for detailed timing
   ```bash
   compass analyze --profile
   # Shows breakdown of time spent in each phase
   ```

3. **Debug Log Export** - Save debug output to file
   ```bash
   compass analyze --debug --debug-output=debug.log
   ```

---

## Files Modified

### Created:
- `packages/common/src/logger.ts` - Global logger module

### Modified:
- `packages/common/src/index.ts` - Export logger
- `packages/cli/src/bin/ngcompass.ts` - Add --debug/--verbose flags
- `packages/core/src/config/loaders/discovery.ts` - Add debug output
- `packages/core/src/config/loaders/loader.ts` - Add debug output

---

## Success Criteria

✅ Logger module created with namespace filtering
✅ CLI flags (--debug, --verbose) working
✅ DEBUG environment variable supported
✅ Config discovery shows detailed output
✅ Config loader shows cache HIT/MISS
✅ Zero overhead when debug disabled
✅ Clean, readable debug output format

---

## Conclusion

Phase 1 of debug mode integration is complete and functional. Users can now:

- Enable debug output with `--debug` or `--verbose` flags
- Filter debug output by namespace with `DEBUG` env var
- See detailed timing for config operations
- Understand cache performance
- Troubleshoot configuration issues

The implementation follows industry standards (ESLint, TypeScript) and provides a solid foundation for Phase 2 (analysis engine debug output).

**Status:** ✅ Ready for production use
