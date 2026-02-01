import { ConfigIssue } from "@ngcompass/common";

type IssueTemplate = Omit<ConfigIssue, 'path'>;

export const MESSAGES = {
    // Cross-field
    MUTUALLY_EXCLUSIVE_AUTOFIX: (): IssueTemplate => ({
        code: "mutually-exclusive-autofix",
        message: "autoFix and autoFixOnSave cannot both be true; use one or the other",
        severity: "error"
    }),
    NEGATIVE_MAX_WARNINGS: (val: number): IssueTemplate => ({
        code: "negative-max-warnings",
        message: `maxWarnings must be >= 0; received ${val}`,
        severity: "error"
    }),

    // Performance
    WORKERS_BELOW_MINIMUM: (): IssueTemplate => ({
        code: "workers-below-minimum",
        message: "maxWorkers must be at least 1",
        severity: "error"
    }),
    NEGATIVE_DEBOUNCE: (val: number): IssueTemplate => ({
        code: "negative-debounce",
        message: `watchOptions.debounce must be >= 0ms; received ${val}ms; negative values cause runtime errors`,
        severity: "error"
    }),
    NEGATIVE_CACHE_TTL: (val: number): IssueTemplate => ({
        code: "negative-cache-ttl",
        message: `cache.ttl must be >= 0; received ${val}ms`,
        severity: "error"
    }),
    WORKERS_EXCESSIVE: (workers: number, limit: number): IssueTemplate => ({
        code: "warn-workers-excessive",
        message: `maxWorkers (${workers}) exceeds recommended limit (${limit} = 2x CPU cores); consider reducing for better resource usage`,
        severity: "warning"
    }),
    DEBOUNCE_EXCESSIVE: (val: number): IssueTemplate => ({
        code: "warn-debounce-excessive",
        message: `watchOptions.debounce (${val}ms) is very high; values > 5000ms may cause excessive delays`,
        severity: "warning"
    }),
    CACHE_TTL_ZERO: (): IssueTemplate => ({
        code: "warn-cache-ttl-zero",
        message: "cache.ttl is 0; this will cause immediate expiration and disable caching effectively",
        severity: "warning"
    }),

    // Globs
    INVALID_GLOB_PATTERN: (pattern: string, error: string): IssueTemplate => ({
        code: "invalid-glob-pattern",
        message: `invalid glob pattern "${pattern}": ${error}`,
        severity: "error"
    }),
    EMPTY_INCLUDE: (): IssueTemplate => ({
        code: "empty-include",
        message: "include patterns is empty; no files will be analyzed",
        severity: "error"
    }),
    EMPTY_EXCLUDE: (): IssueTemplate => ({
        code: "warn-empty-exclude",
        message: "exclude patterns is empty; analyzer will scan unnecessary directories (node_modules, .git, etc)",
        severity: "warning"
    }),
    DUPLICATE_PATTERNS: (field: string, patterns: string[]): IssueTemplate => ({
        code: "warn-duplicate-patterns",
        message: `Configuration contains duplicate patterns in "${field}". Remove duplicates: ${patterns.map(p => `"${p}"`).join(", ")}`,
        severity: "warning"
    }),
    EMPTY_GLOB_PATTERN: (field: string): IssueTemplate => ({
        code: "empty-glob-pattern",
        message: `Configuration contains an empty glob pattern in "${field}". Remove empty strings from the array.`,
        severity: "error"
    }),

    // Paths
    TSCONFIG_ROOT_NOT_FOUND: (p: string): IssueTemplate => ({
        code: "tsconfig-root-not-found",
        message: `parserOptions.tsconfigRootDir does not exist: "${p}"`,
        severity: "error"
    }),
    TSCONFIG_PROJECT_NOT_FOUND: (p: string): IssueTemplate => ({
        code: "tsconfig-project-not-found",
        message: `TypeScript configuration file not found at parserOptions.project: "${p}". Ensure the path is correct.`,
        severity: "error"
    }),
    OUTPUT_PATH_TRAVERSAL: (p: string): IssueTemplate => ({
        code: "output-path-traversal",
        message: `outputPath contains path traversal (..): "${p}"; use safe relative paths only`,
        severity: "error"
    }),
    OUTPUT_PATH_SYSTEM_DIR: (p: string): IssueTemplate => ({
        code: "output-path-system-dir",
        message: `outputPath points to system directory: "${p}"; use a project-local output directory`,
        severity: "error"
    }),
    OUTPUT_PATH_NOT_FOUND: (dir: string): IssueTemplate => ({
        code: "output-path-not-found",
        message: `outputPath directory does not exist: "${dir}"`,
        severity: "error"
    }),
    OUTPUT_PATH_NOT_WRITABLE: (dir: string): IssueTemplate => ({
        code: "output-path-not-writable",
        message: `outputPath directory is not writable: "${dir}"`,
        severity: "error"
    }),
    CACHE_IN_NODE_MODULES: (location: string): IssueTemplate => ({
        code: "cache-in-node-modules",
        message: `cache.location includes node_modules: "${location}"; this will corrupt package dependencies`,
        severity: "error"
    }),
    CACHE_PARENT_NOT_FOUND: (dir: string): IssueTemplate => ({
        code: "warn-cache-parent-not-found",
        message: `cache parent directory does not exist: "${dir}"; it will be created automatically`,
        severity: "warning"
    }),

    // Rules
    INVALID_RULE_SEVERITY: (ruleName: string, severity: string): IssueTemplate => ({
        code: "invalid-rule-severity",
        message: `rule "${ruleName}" has invalid severity: "${severity}"`,
        severity: "error"
    }),
    NO_RULES_CONFIGURED: (): IssueTemplate => ({
        code: "warn-no-rules-configured",
        message: "no rules configured; analyzer will have no checks to perform",
        severity: "warning"
    }),
    EMPTY_RULE_NAME: (): IssueTemplate => ({
        code: "empty-rule-name",
        message: "Configuration contains an empty rule name. Ensure all rule keys are non-empty strings.",
        severity: "error"
    }),

    // Profiles
    PROFILE_MUTUALLY_EXCLUSIVE_AUTOFIX: (profile: string): IssueTemplate => ({
        code: "profile-mutually-exclusive-autofix",
        message: `profile "${profile}" has conflicting options: autoFix and autoFixOnSave cannot both be true`,
        severity: "error"
    }),
    PROFILE_NEGATIVE_DEBOUNCE: (profile: string, val: number): IssueTemplate => ({
        code: "profile-negative-debounce",
        message: `profile "${profile}" has invalid watchOptions.debounce (${val}ms); must be >= 0`,
        severity: "error"
    }),
    PROFILE_CIRCULAR_INHERITANCE: (chain: string[]): IssueTemplate => ({
        code: "profile-circular-inheritance",
        message: `circular profile inheritance detected: ${chain.join(" → ")}`,
        severity: "error"
    }),
    PROFILE_EMPTY: (): IssueTemplate => ({
        code: "warn-profile-empty",
        message: "profiles object is defined but empty; consider removing it",
        severity: "warning"
    }),
    PROFILE_HTML_OUTPUT_CI: (profile: string): IssueTemplate => ({
        code: "warn-profile-html-output-ci",
        message: `profile "${profile}" uses HTML output with autoFix/autoFixOnSave; this may be incompatible with CI/headless environments`,
        severity: "warning"
    }),

    // Deprecated
    DEPRECATED_CACHE_LOCATION: (): IssueTemplate => ({
        code: "warn-deprecated-cache-location",
        message: "cacheLocation is deprecated; use cache.location instead",
        severity: "warning"
    }),
    DEPRECATED_CONCURRENCY: (): IssueTemplate => ({
        code: "warn-deprecated-concurrency",
        message: "concurrency is deprecated; use maxWorkers instead",
        severity: "warning"
    }),
};
