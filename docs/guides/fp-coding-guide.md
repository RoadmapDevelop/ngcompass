# Functional Programming Best Practices & Coding Guidelines
## For Angular Static Analyzer Tool

> **Purpose:** This guide establishes coding standards for the Angular Static Analyzer project, emphasizing functional programming paradigms, immutability, pure functions, and composability.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Pure Functions](#pure-functions)
3. [Immutability](#immutability)
4. [Function Composition](#function-composition)
5. [Higher-Order Functions](#higher-order-functions)
6. [Error Handling](#error-handling)
7. [Data Structures](#data-structures)
8. [Testing Strategies](#testing-strategies)
9. [Tool-Specific Guidelines](#tool-specific-guidelines)
10. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Core Principles

### 1. **Predictability**
Every function should be predictable and deterministic.

```typescript
// ❌ BAD: Unpredictable, depends on external state
let violationCount = 0;

function analyzeFile(file: SourceFile): Violation[] {
  violationCount++;  // Side effect!
  const violations = checkRules(file);
  return violations;
}

// ✅ GOOD: Pure, deterministic
function analyzeFile(
  file: SourceFile,
  rules: RuleConfig[]
): Result<Violation[]> {
  return checkRules(file, rules);
}
```

### 2. **Composability**
Functions should be small, focused, and easily composed.

```typescript
// ❌ BAD: Does too much, hard to reuse
function analyzeAndReportAndFix(
  files: SourceFile[],
  rules: RuleConfig[]
): void {
  files.forEach(file => {
    const violations = checkRules(file, rules);
    const fixed = autoFix(violations);
    writeFile(file, fixed);
    console.log(`Processed ${file.path}`);
  });
}

// ✅ GOOD: Composable, reusable functions
const analyzeFile = (file: SourceFile, rules: RuleConfig[]): Violation[] =>
  checkRules(file, rules);

const fixViolations = (violations: Violation[], file: SourceFile): SourceFile =>
  autoFix(violations, file);

const logResult = (path: string, count: number): void =>
  console.log(`Processed ${path} (${count} violations)`);

// Compose them
const processFile = (file: SourceFile, rules: RuleConfig[]): void => {
  const violations = analyzeFile(file, rules);
  const fixed = fixViolations(violations, file);
  writeFile(file, fixed);
  logResult(file.path, violations.length);
};
```

### 3. **Immutability**
Never mutate input data. Return new values instead.

```typescript
// ❌ BAD: Mutates input
function applyRuleOverride(
  baseRules: RuleConfig[],
  overrideRules: RuleConfig[]
): RuleConfig[] {
  baseRules.push(...overrideRules);  // Mutation!
  return baseRules;
}

// ✅ GOOD: Returns new array
const applyRuleOverride = (
  baseRules: RuleConfig[],
  overrideRules: RuleConfig[]
): RuleConfig[] =>
  [...baseRules, ...overrideRules];

// Or with Object spread
const mergeConfigs = (base: AnalyzerConfig, override: Partial<AnalyzerConfig>): AnalyzerConfig =>
  ({ ...base, ...override });
```

### 4. **Testability**
Pure functions are inherently testable.

```typescript
// ✅ GOOD: Easy to test
const normalizeSeverity = (severity: string): Severity => {
  const severities: Record<string, Severity> = {
    error: 'high',
    warn: 'moderate',
    critical: 'critical',
  };
  return severities[severity] ?? 'moderate';
};

// Test:
test('normalizeSeverity maps error to high', () => {
  expect(normalizeSeverity('error')).toBe('high');
});
```

---

## Pure Functions

### Definition
A pure function:
1. Always returns the same output for the same input
2. Has no side effects (doesn't modify external state)
3. Doesn't depend on external state

### Guidelines

#### Rule 1: **No Side Effects**

```typescript
// ❌ BAD: Modifies global state
let loadedConfigs: AnalyzerConfig[] = [];

function loadConfig(path: string): AnalyzerConfig {
  const config = readFile(path);  // I/O side effect
  loadedConfigs.push(config);      // Mutation
  return config;
}

// ✅ GOOD: Pure, returns result
const loadConfig = (path: string): Result<AnalyzerConfig> => {
  try {
    const config = readFile(path);
    return { ok: true, data: config };
  } catch (err) {
    return { ok: false, error: err };
  }
};

// Caller handles caching/side effects
const configs = new Map<string, AnalyzerConfig>();
const getOrLoadConfig = async (path: string): Promise<AnalyzerConfig> => {
  if (configs.has(path)) return configs.get(path)!;
  const result = await loadConfig(path);
  if (result.ok) configs.set(path, result.data);
  return result.data;
};
```

#### Rule 2: **Explicit Dependencies**

```typescript
// ❌ BAD: Hidden dependencies
const fileSystem = require('fs');  // Global dependency

function saveViolations(violations: Violation[], path: string): void {
  fileSystem.writeFileSync(path, JSON.stringify(violations));
}

// ✅ GOOD: Inject dependencies
interface FileSystem {
  writeFile(path: string, content: string): Promise<void>;
}

const saveViolations = (
  violations: Violation[],
  path: string,
  fs: FileSystem
): Promise<void> =>
  fs.writeFile(path, JSON.stringify(violations));

// Usage
const violations = analyzeFile(file, rules);
await saveViolations(violations, 'report.json', nodeFileSystem);
```

#### Rule 3: **Deterministic Output**

```typescript
// ❌ BAD: Non-deterministic
const generateId = (): string => Math.random().toString(36);

const createViolation = (rule: Rule, line: number): Violation => ({
  id: generateId(),  // Random!
  rule,
  line,
});

// ✅ GOOD: Deterministic
const createViolation = (
  rule: Rule,
  line: number,
  id: string  // Provided by caller
): Violation => ({
  id,
  rule,
  line,
});

// Or use hash for determinism
const createViolation = (rule: Rule, line: number): Violation => {
  const id = hash(`${rule.name}:${line}`);
  return { id, rule, line };
};
```

---

## Immutability

### Principle
Never modify data in place. Always create new copies with changes.

### Data Structures

#### Arrays

```typescript
// ❌ BAD: Mutating
const addRule = (rules: RuleConfig[], newRule: RuleConfig): RuleConfig[] => {
  rules.push(newRule);
  return rules;
};

// ✅ GOOD: Immutable
const addRule = (rules: RuleConfig[], newRule: RuleConfig): RuleConfig[] =>
  [...rules, newRule];

// Filtering
// ❌ BAD
const removeDisabledRules = (rules: RuleConfig[]): RuleConfig[] => {
  rules = rules.filter(r => r.severity !== 'off');
  return rules;
};

// ✅ GOOD
const removeDisabledRules = (rules: RuleConfig[]): RuleConfig[] =>
  rules.filter(r => r.severity !== 'off');
```

#### Objects

```typescript
// ❌ BAD: Mutating
const mergeConfigs = (base: AnalyzerConfig, override: Partial<AnalyzerConfig>): void => {
  base.rules = { ...base.rules, ...override.rules };
  base.severity = override.severity ?? base.severity;
};

// ✅ GOOD: Immutable
const mergeConfigs = (
  base: AnalyzerConfig,
  override: Partial<AnalyzerConfig>
): AnalyzerConfig => ({
  ...base,
  ...override,
  rules: { ...base.rules, ...override.rules },
});
```

#### Nested Objects

```typescript
// ❌ BAD: Deep mutation
const updateRuleOption = (
  config: AnalyzerConfig,
  ruleName: string,
  option: string,
  value: unknown
): void => {
  config.rules[ruleName].options[option] = value;  // Mutation!
};

// ✅ GOOD: Immutable deep update
const updateRuleOption = (
  config: AnalyzerConfig,
  ruleName: string,
  option: string,
  value: unknown
): AnalyzerConfig => ({
  ...config,
  rules: {
    ...config.rules,
    [ruleName]: {
      ...config.rules[ruleName],
      options: {
        ...config.rules[ruleName].options,
        [option]: value,
      },
    },
  },
});

// Or use a helper
const setIn = <T extends object>(obj: T, path: string[], value: unknown): T => {
  if (path.length === 0) return obj;
  const [head, ...tail] = path;
  return {
    ...obj,
    [head]: tail.length === 0 ? value : setIn(obj[head] as object, tail, value),
  };
};

// Usage:
const updated = setIn(config, ['rules', 'component-selector', 'options', 'prefix'], 'app');
```

### Use Libraries for Immutable Updates

```typescript
// ✅ GOOD: Use immer for complex updates
import produce from 'immer';

const updateRuleOption = (
  config: AnalyzerConfig,
  ruleName: string,
  option: string,
  value: unknown
): AnalyzerConfig =>
  produce(config, draft => {
    draft.rules[ruleName].options[option] = value;
  });
```

---

## Function Composition

### Principle
Build complex operations by combining simple, focused functions.

### Basic Composition

```typescript
// Pure functions
const isEnabled = (rule: RuleConfig): boolean => rule.severity !== 'off';
const isCritical = (rule: RuleConfig): boolean => rule.severity === 'critical';
const hasOptions = (rule: RuleConfig): boolean => !!rule.options;

// Compose them
const getCriticalRulesWithOptions = (rules: RuleConfig[]): RuleConfig[] =>
  rules
    .filter(isEnabled)
    .filter(isCritical)
    .filter(hasOptions);
```

### Pipe Operator Pattern

```typescript
// Create a pipe utility
const pipe = <T>(...fns: Array<(x: T) => T>) =>
  (value: T): T =>
    fns.reduce((acc, fn) => fn(acc), value);

// Use it
const normalizeConfig = pipe<AnalyzerConfig>(
  config => ({ ...config, severity: config.severity ?? 'moderate' }),
  config => ({ ...config, maxWorkers: config.maxWorkers ?? 4 }),
  config => ({
    ...config,
    cache: typeof config.cache === 'boolean'
      ? { enabled: config.cache, location: 'node_modules/.cache/analyzer' }
      : config.cache,
  })
);

const normalized = normalizeConfig(rawConfig);
```

### Function Chaining

```typescript
// ✅ GOOD: Chainable interface
interface FileAnalyzer {
  withRules(rules: RuleConfig[]): FileAnalyzer;
  withOptions(options: Record<string, unknown>): FileAnalyzer;
  analyze(file: SourceFile): Violation[];
}

class FunctionalFileAnalyzer implements FileAnalyzer {
  constructor(
    private rules: RuleConfig[] = [],
    private options: Record<string, unknown> = {}
  ) {}

  withRules(rules: RuleConfig[]): FileAnalyzer {
    return new FunctionalFileAnalyzer(rules, this.options);
  }

  withOptions(options: Record<string, unknown>): FileAnalyzer {
    return new FunctionalFileAnalyzer(this.rules, options);
  }

  analyze(file: SourceFile): Violation[] {
    return checkRules(file, this.rules, this.options);
  }
}

// Usage
const violations = new FunctionalFileAnalyzer()
  .withRules(rules)
  .withOptions({ strict: true })
  .analyze(file);
```

---

## Higher-Order Functions

### Definition
Functions that take functions as arguments or return functions.

### Example 1: Rule Validators

```typescript
// HOF: Returns a validator function
const createRuleValidator = (severity: Severity) =>
  (rule: RuleConfig): boolean =>
    rule.severity === severity;

// Usage
const getCriticalRules = (rules: RuleConfig[]): RuleConfig[] =>
  rules.filter(createRuleValidator('critical'));

const getHighRules = (rules: RuleConfig[]): RuleConfig[] =>
  rules.filter(createRuleValidator('high'));
```

### Example 2: Middleware Pattern

```typescript
// HOF: Wraps a function with behavior
const withTiming = <T, R>(
  fn: (input: T) => R,
  name: string
): ((input: T) => R) =>
  (input: T): R => {
    const start = performance.now();
    const result = fn(input);
    const duration = performance.now() - start;
    console.log(`[${name}] took ${duration.toFixed(2)}ms`);
    return result;
  };

// Usage
const analyzeWithTiming = withTiming(analyzeFile, 'analyzeFile');
```

### Example 3: Error Handling

```typescript
// HOF: Adds error handling
const withErrorHandling = <T, R>(
  fn: (input: T) => R,
  handler: (error: Error) => R
): ((input: T) => R) =>
  (input: T): R => {
    try {
      return fn(input);
    } catch (error) {
      return handler(error as Error);
    }
  };

// Usage
const safeLloadConfig = withErrorHandling(
  loadConfig,
  (err) => ({ ...DEFAULT_CONFIG, error: err.message })
);
```

### Example 4: Caching/Memoization

```typescript
// HOF: Adds caching
const memoize = <T, R>(fn: (input: T) => R): ((input: T) => R) => {
  const cache = new Map<string, R>();
  return (input: T): R => {
    const key = JSON.stringify(input);
    if (cache.has(key)) return cache.get(key)!;
    const result = fn(input);
    cache.set(key, result);
    return result;
  };
};

// Usage
const cachedLoadConfig = memoize(loadConfig);
```

---

## Error Handling

### Principle
Errors are data, not exceptions. Use Result types or Option types.

### Result Type Pattern

```typescript
// Define Result type
type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };

// Helper constructors
const Ok = <T>(data: T): Result<T> => ({ ok: true, data });
const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Usage
const loadConfig = (path: string): Result<AnalyzerConfig> => {
  try {
    return Ok(JSON.parse(readFileSync(path, 'utf-8')));
  } catch (err) {
    return Err(new Error(`Failed to load config: ${err.message}`));
  }
};

// Chain results
const mapResult = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> =>
  result.ok ? Ok(fn(result.data)) : result;

// Usage
const config = loadConfig('analyzer.config.ts');
const normalized = mapResult(config, normalizeConfig);
const validated = mapResult(normalized, validateConfig);
```

### Option Type Pattern

```typescript
// Define Option type
type Option<T> = T | null | undefined;

// Helper functions
const isSome = <T>(value: Option<T>): value is T =>
  value !== null && value !== undefined;

const getOrElse = <T>(value: Option<T>, defaultValue: T): T =>
  isSome(value) ? value : defaultValue;

const mapOption = <T, U>(value: Option<T>, fn: (v: T) => U): Option<U> =>
  isSome(value) ? fn(value) : null;

// Usage
const getRule = (rules: RuleConfig[], name: string): Option<RuleConfig> =>
  rules.find(r => r.name === name);

const getSeverity = (rules: RuleConfig[], name: string): Severity =>
  getOrElse(
    mapOption(getRule(rules, name), r => r.severity),
    'moderate'
  );
```

### Either Type (Better than Result)

```typescript
// Define Either type
type Either<L, R> =
  | { type: 'left'; value: L }
  | { type: 'right'; value: R };

// Constructors
const Left = <L, R>(value: L): Either<L, R> => ({ type: 'left', value });
const Right = <L, R>(value: R): Either<L, R> => ({ type: 'right', value });

// Functions
const mapEither = <L, R, R2>(
  either: Either<L, R>,
  fn: (r: R) => R2
): Either<L, R2> =>
  either.type === 'right' ? Right(fn(either.value)) : either as Either<L, R2>;

const foldEither = <L, R, T>(
  either: Either<L, R>,
  onLeft: (l: L) => T,
  onRight: (r: R) => T
): T =>
  either.type === 'left' ? onLeft(either.value) : onRight(either.value);

// Usage
const loadConfig = (path: string): Either<string, AnalyzerConfig> => {
  try {
    return Right(JSON.parse(readFileSync(path, 'utf-8')));
  } catch (err) {
    return Left(`Failed to load config: ${err.message}`);
  }
};

// Handle result
const result = loadConfig('analyzer.config.ts');
foldEither(
  result,
  (error) => console.error(error),
  (config) => console.log('Loaded:', config)
);
```

---

## Data Structures

### Prefer Functional Data Structures

#### 1. **Arrays over Objects for Lists**

```typescript
// ❌ BAD: Using objects as lists
const violations = {
  0: violation1,
  1: violation2,
  length: 2,
};

// ✅ GOOD: Use arrays
const violations: Violation[] = [violation1, violation2];
```

#### 2. **Tuples for Fixed Collections**

```typescript
// ✅ GOOD: Use tuples for fixed-size collections
type FileAnalysisResult = [violations: Violation[], duration: number, timestamp: Date];

const analyzeAndMeasure = (file: SourceFile, rules: RuleConfig[]): FileAnalysisResult => {
  const start = performance.now();
  const violations = analyzeFile(file, rules);
  const duration = performance.now() - start;
  return [violations, duration, new Date()];
};

const [violations, duration, timestamp] = analyzeAndMeasure(file, rules);
```

#### 3. **Maps for Key-Value Pairs**

```typescript
// ✅ GOOD: Use Map for key-value pairs
const ruleCache = new Map<string, RuleConfig>();

const getOrLoadRule = (name: string, loader: () => RuleConfig): RuleConfig => {
  if (ruleCache.has(name)) {
    return ruleCache.get(name)!;
  }
  const rule = loader();
  ruleCache.set(name, rule);
  return rule;
};
```

#### 4. **Sets for Unique Items**

```typescript
// ✅ GOOD: Use Set for unique collections
const getUniqueSeverities = (rules: RuleConfig[]): Set<Severity> =>
  new Set(rules.map(r => r.severity));

const hasCriticalRules = (rules: RuleConfig[]): boolean =>
  getUniqueSeverities(rules).has('critical');
```

### Immutable Update Patterns

```typescript
// ✅ GOOD: Spread operator for shallow copies
const addViolation = (violations: Violation[], violation: Violation): Violation[] =>
  [...violations, violation];

// ✅ GOOD: Map for transformations
const updateSeverities = (rules: RuleConfig[], mapping: Record<Severity, Severity>): RuleConfig[] =>
  rules.map(rule => ({
    ...rule,
    severity: mapping[rule.severity] ?? rule.severity,
  }));

// ✅ GOOD: Filter for removing items
const removeDisabled = (rules: RuleConfig[]): RuleConfig[] =>
  rules.filter(r => r.severity !== 'off');

// ✅ GOOD: Reduce for accumulation
const mergeRules = (rules: RuleConfig[][]): RuleConfig[] =>
  rules.reduce((acc, r) => [...acc, ...r], []);
```

---

## Testing Strategies

### 1. **Test Pure Functions Directly**

```typescript
describe('normalizeSeverity', () => {
  it('maps legacy error to high', () => {
    expect(normalizeSeverity('error')).toBe('high');
  });

  it('returns input if already normalized', () => {
    expect(normalizeSeverity('critical')).toBe('critical');
  });

  it('returns default for unknown values', () => {
    expect(normalizeSeverity('unknown')).toBe('moderate');
  });
});
```

### 2. **Test Composition**

```typescript
describe('analyzeFile composition', () => {
  it('analyzes, filters, and reports violations', () => {
    const file = createMockSourceFile();
    const rules = [createMockRule()];

    const violations = pipe<SourceFile>(
      analyzeFile,
      filterCritical,
      sortByLine
    )(file);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('critical');
  });
});
```

### 3. **Test Error Handling**

```typescript
describe('loadConfig error handling', () => {
  it('returns Err for missing file', () => {
    const result = loadConfig('/nonexistent/path');
    expect(result.ok).toBe(false);
  });

  it('returns Err for invalid JSON', () => {
    const result = loadConfig('/invalid/config.json');
    expect(result.ok).toBe(false);
  });

  it('returns Ok for valid config', () => {
    const result = loadConfig('/valid/config.json');
    expect(result.ok).toBe(true);
  });
});
```

### 4. **Property-Based Testing**

```typescript
import fc from 'fast-check';

describe('mergeConfigs properties', () => {
  it('merge is associative', () => {
    fc.assert(
      fc.property(
        fc.object(),
        fc.object(),
        fc.object(),
        (a, b, c) => {
          const left = mergeConfigs(mergeConfigs(a, b), c);
          const right = mergeConfigs(a, mergeConfigs(b, c));
          return JSON.stringify(left) === JSON.stringify(right);
        }
      )
    );
  });

  it('merge is idempotent with empty object', () => {
    fc.assert(
      fc.property(fc.object(), (obj) => {
        return JSON.stringify(mergeConfigs(obj, {})) === JSON.stringify(obj);
      })
    );
  });
});
```

---

## Tool-Specific Guidelines

### For the Angular Static Analyzer

#### 1. **Analyzer Rule Implementation**

```typescript
// ✅ GOOD: Pure rule checker
interface RuleChecker {
  (
    sourceFile: SourceFile,
    context: RuleContext,
    options: RuleOptions
  ): Violation[];
}

const createComponentSelectorRule = (): RuleChecker =>
  (sourceFile, context, options) => {
    const violations: Violation[] = [];
    
    // Walk the AST
    visit(sourceFile, (node) => {
      if (isComponentDecorator(node)) {
        const selector = extractSelector(node);
        
        if (!selector) {
          violations.push({
            node,
            message: 'Component must have a selector',
            severity: 'critical',
          });
        } else if (!selector.startsWith(options.prefix)) {
          violations.push({
            node,
            message: `Selector must start with '${options.prefix}'`,
            severity: 'high',
          });
        }
      }
    });

    return violations;
  };
```

#### 2. **Config Loading Pipeline**

```typescript
// ✅ GOOD: Functional pipeline
type ConfigPipeline = [
  load: (path: string) => Promise<RawConfig>,
  validate: (raw: RawConfig) => Result<AnalyzerConfig>,
  resolvePresets: (config: AnalyzerConfig) => Promise<AnalyzerConfig>,
  normalize: (config: AnalyzerConfig) => NormalizedConfig,
];

const createConfigPipeline = (): ConfigPipeline => [
  (path) => loadRawConfig(path),
  (raw) => validateRawConfig(raw),
  async (config) => resolvePresetsRecursively(config),
  (config) => normalizeConfig(config),
];

// Usage
const pipeline = createConfigPipeline();
const config = await pipe(...pipeline)('analyzer.config.ts');
```

#### 3. **Profile Merging**

```typescript
// ✅ GOOD: Pure profile merging
const mergeProfile = (
  baseConfig: AnalyzerConfig,
  profileName: string
): Result<AnalyzerConfig> => {
  const profile = baseConfig.profiles?.[profileName];
  
  if (!profile) {
    return Err(new Error(`Profile '${profileName}' not found`));
  }

  return Ok(
    pipe(baseConfig)(
      (config) => deepMerge(config, profile),
      (merged) => normalizeConfig(merged)
    )
  );
};
```

#### 4. **Violation Processing**

```typescript
// ✅ GOOD: Functional violation pipeline
const processViolations = (violations: Violation[]): ProcessedResult => {
  const bySeverity = groupBySeverity(violations);
  const statistics = calculateStatistics(bySeverity);
  const sorted = sortBySeverityAndLine(violations);
  const formatted = formatForOutput(sorted);

  return { statistics, violations: formatted };
};

// Helper functions
const groupBySeverity = (violations: Violation[]): Map<Severity, Violation[]> =>
  violations.reduce((map, v) => {
    const existing = map.get(v.severity) ?? [];
    return map.set(v.severity, [...existing, v]);
  }, new Map());

const calculateStatistics = (bySeverity: Map<Severity, Violation[]>): Statistics => ({
  critical: bySeverity.get('critical')?.length ?? 0,
  high: bySeverity.get('high')?.length ?? 0,
  moderate: bySeverity.get('moderate')?.length ?? 0,
  low: bySeverity.get('low')?.length ?? 0,
  info: bySeverity.get('info')?.length ?? 0,
});

const sortBySeverityAndLine = (violations: Violation[]): Violation[] => {
  const severityOrder: Record<Severity, number> = {
    critical: 4,
    high: 3,
    moderate: 2,
    low: 1,
    info: 0,
  };

  return [...violations].sort((a, b) => {
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    return severityDiff !== 0 ? severityDiff : a.line - b.line;
  });
};
```

#### 5. **Rule Filtering & Application**

```typescript
// ✅ GOOD: Functional rule filtering
const getApplicableRules = (
  config: NormalizedConfig,
  file: SourceFile
): RuleConfig[] => {
  const baseRules = Object.entries(config.rules)
    .map(([name, rule]) => ({ name, ...rule }))
    .filter(isEnabled)
    .filter(doesNotExceedMaxSeverity(config.failOnSeverity));

  const overriddenRules = config.overrides
    .filter(override => matchesFile(override.files, file.path))
    .flatMap(override =>
      Object.entries(override.rules ?? {})
        .map(([name, rule]) => ({ name, ...rule }))
    );

  // Merge base and overridden (overridden takes precedence)
  const rulesByName = new Map<string, RuleConfig>();
  
  baseRules.forEach(rule => rulesByName.set(rule.name, rule));
  overriddenRules.forEach(rule => rulesByName.set(rule.name, rule));

  return Array.from(rulesByName.values());
};

const isEnabled = (rule: RuleConfig & { name: string }): boolean =>
  rule.severity !== 'off';

const doesNotExceedMaxSeverity = (max: Severity) =>
  (rule: RuleConfig & { name: string }): boolean => {
    const order: Record<Severity, number> = {
      critical: 4,
      high: 3,
      moderate: 2,
      low: 1,
      info: 0,
    };
    return order[rule.severity] >= order[max];
  };
```

---

## Anti-Patterns to Avoid

### 1. **Mutation**

```typescript
// ❌ AVOID
function addViolation(violations: Violation[], v: Violation): void {
  violations.push(v);  // Mutates input!
}

// ✅ PREFER
const addViolation = (violations: Violation[], v: Violation): Violation[] =>
  [...violations, v];
```

### 2. **Global State**

```typescript
// ❌ AVOID
let config: AnalyzerConfig;

function loadConfig(path: string): void {
  config = readFile(path);  // Global mutation!
}

function analyzeFile(file: SourceFile): Violation[] {
  return checkRules(file, config);  // Depends on global
}

// ✅ PREFER
const loadConfig = (path: string): Result<AnalyzerConfig> => {
  try {
    return Ok(readFile(path));
  } catch (err) {
    return Err(err);
  }
};

const analyzeFile = (file: SourceFile, config: AnalyzerConfig): Violation[] =>
  checkRules(file, config);
```

### 3. **Implicit Dependencies (No Injection)**

```typescript
// ❌ AVOID
import fs from 'fs';  // Implicit dependency

const loadConfig = (path: string): AnalyzerConfig =>
  JSON.parse(fs.readFileSync(path, 'utf-8'));

// ✅ PREFER
interface FileLoader {
  read(path: string): string;
}

const loadConfig = (path: string, loader: FileLoader): AnalyzerConfig =>
  JSON.parse(loader.read(path));
```

### 4. **Side Effects in Computations**

```typescript
// ❌ AVOID
const analyzeFiles = (files: SourceFile[], rules: RuleConfig[]): void => {
  let violationCount = 0;
  
  files.forEach(file => {
    const violations = analyzeFile(file, rules);
    violationCount += violations.length;  // Side effect!
    saveReport(violations);                // Side effect!
  });
};

// ✅ PREFER
const analyzeFiles = (files: SourceFile[], rules: RuleConfig[]): Violation[] =>
  files.flatMap(file => analyzeFile(file, rules));

const processResults = async (violations: Violation[]): Promise<void> => {
  const count = violations.length;
  console.log(`Found ${count} violations`);
  await saveReport(violations);
};

// Usage
const violations = analyzeFiles(files, rules);
await processResults(violations);
```

### 5. **Conditional Logic Instead of Composition**

```typescript
// ❌ AVOID
const getViolations = (files: SourceFile[], rules: RuleConfig[], strict: boolean): Violation[] => {
  let violations = files.flatMap(f => analyzeFile(f, rules));
  
  if (strict) {
    violations = violations.filter(v => v.severity !== 'info');
  }
  
  if (autoFix) {
    violations = violations.map(v => ({ ...v, fixed: true }));
  }
  
  return violations;
};

// ✅ PREFER
const getViolations = (
  files: SourceFile[],
  rules: RuleConfig[],
  filters: ((violations: Violation[]) => Violation[])[]
): Violation[] => {
  const violations = files.flatMap(f => analyzeFile(f, rules));
  return pipe(violations, ...filters);
};

// Usage
const violations = getViolations(
  files,
  rules,
  [
    (v) => v.filter(x => x.severity !== 'info'),  // strict filter
    (v) => v.map(x => ({ ...x, fixed: true })),    // mark as fixed
  ]
);
```

### 6. **Exception Throwing for Control Flow**

```typescript
// ❌ AVOID
const loadConfig = (path: string): AnalyzerConfig => {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to load config: ${err.message}`);
  }
};

// Call site must handle exception
try {
  const config = loadConfig(path);
} catch (err) {
  console.error(err);
}

// ✅ PREFER
const loadConfig = (path: string): Result<AnalyzerConfig> => {
  try {
    return Ok(JSON.parse(fs.readFileSync(path, 'utf-8')));
  } catch (err) {
    return Err(new Error(`Failed to load config: ${err.message}`));
  }
};

// Call site handles result
const result = loadConfig(path);
if (result.ok) {
  console.log('Config loaded:', result.data);
} else {
  console.error('Failed:', result.error);
}
```

---

## Conclusion

### Key Takeaways

1. **Prefer pure functions** — Easier to test, reason about, and compose
2. **Never mutate** — Always return new values
3. **Compose small functions** — Build complexity from simple pieces
4. **Use types for safety** — Result, Option, Either types prevent errors
5. **Inject dependencies** — Don't rely on globals or hidden state
6. **Handle errors as data** — Not exceptions
7. **Test pure functions directly** — No mocking needed

### Checklist Before Submitting Code

- [ ] All functions are pure (no mutations, no side effects)
- [ ] No global state accessed
- [ ] All dependencies are explicitly passed
- [ ] Errors are returned, not thrown
- [ ] Complex logic is composed from smaller functions
- [ ] Data is immutable
- [ ] Tests cover the happy path and edge cases
- [ ] Code explains its intent through function names and types

---

## References

- [Functional-Light JavaScript](https://github.com/getify/Functional-Light-JS)
- [Composing Software](https://www.youtube.com/watch?v=wfMkNGyrOok) by Eric Elliott
- [Railway-Oriented Programming](https://fsharpforfunandprofit.com/posts/recipe-part2/)
- [TypeScript Handbook: Advanced Types](https://www.typescriptlang.org/docs/handbook/advanced-types.html)
