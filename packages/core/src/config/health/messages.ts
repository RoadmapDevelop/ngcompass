import { ConfigIssue } from "@ngcompass/common";

type IssueTemplate = Omit<ConfigIssue, 'path'>;

export const MESSAGES = {
    // Cross-field
    MUTUALLY_EXCLUSIVE_AUTOFIX: (): IssueTemplate => ({
        code: "mutually-exclusive-autofix",
        message: "Options 'autoFix' and 'autoFixOnSave' cannot be enabled simultaneously.",
        suggestion: "Choose one: 'autoFix' applies fixes immediately, 'autoFixOnSave' applies on file save.",
        severity: "error"
    }),
    NEGATIVE_MAX_WARNINGS: (val: number): IssueTemplate => ({
        code: "negative-max-warnings",
        message: `Value for 'maxWarnings' must be non-negative. Received: ${val}.`,
        suggestion: "Set 'maxWarnings' to 0 or higher, or remove it to use default (10).",
        severity: "error"
    }),

    // Performance
    WORKERS_BELOW_MINIMUM: (): IssueTemplate => ({
        code: "workers-below-minimum",
        message: "Value for 'maxWorkers' must be at least 1.",
        suggestion: "Set to 1 or higher, or remove to use default (CPU count - 1).",
        severity: "error"
    }),
    NEGATIVE_DEBOUNCE: (val: number): IssueTemplate => ({
        code: "negative-debounce",
        message: `Debounce duration must be non-negative. Received: ${val}ms.`,
        suggestion: "Set to 0 or higher. Typical values: 100-500ms for watch mode.",
        severity: "error"
    }),
    NEGATIVE_CACHE_TTL: (val: number): IssueTemplate => ({
        code: "negative-cache-ttl",
        message: `Cache TTL must be non-negative. Received: ${val}ms.`,
        suggestion: "Set to 0 (default TTL) or higher. Example: 86400000 for 24 hours.",
        severity: "error"
    }),
    WORKERS_EXCESSIVE: (workers: number, limit: number): IssueTemplate => ({
        code: "warn-workers-excessive",
        message: `Worker count (${workers}) exceeds CPU count (${limit}). May cause context switching overhead.`,
        suggestion: `Reduce to ${limit} or lower for optimal performance.`,
        severity: "warning"
    }),
    DEBOUNCE_EXCESSIVE: (val: number): IssueTemplate => ({
        code: "warn-debounce-excessive",
        message: `Debounce duration (${val}ms) is high. File changes won't be processed for ${(val / 1000).toFixed(1)}s.`,
        suggestion: "Consider reducing to 100-500ms for better responsiveness.",
        severity: "warning"
    }),
    CACHE_TTL_ZERO: (): IssueTemplate => ({
        code: "warn-cache-ttl-zero",
        message: "Cache TTL is set to 0. Using driver default TTL (typically 24 hours).",
        suggestion: "Set explicit TTL if you need different cache expiration behavior.",
        severity: "warning"
    }),

    // Globs
    INVALID_GLOB_PATTERN: (pattern: string, error: string): IssueTemplate => ({
        code: "invalid-glob-pattern",
        message: `Glob pattern "${pattern}" is invalid. Error: ${error}.`,
        suggestion: "Check pattern syntax. Valid examples: 'src/**/*.ts', '**/*.{ts,html}'.",
        severity: "error"
    }),
    EMPTY_INCLUDE: (): IssueTemplate => ({
        code: "empty-include",
        message: "No include patterns defined. Analysis will skip all files.",
        suggestion: "Add patterns like ['src/**/*.ts', 'src/**/*.html'] to enable analysis.",
        severity: "error"
    }),
    EMPTY_EXCLUDE: (): IssueTemplate => ({
        code: "warn-empty-exclude",
        message: "No exclude patterns defined. Performance may degrade.",
        suggestion: "Add common exclusions: ['node_modules/**', 'dist/**', '**/*.spec.ts'].",
        severity: "warning"
    }),
    DUPLICATE_PATTERNS: (field: string, patterns: string[]): IssueTemplate => ({
        code: "warn-duplicate-patterns",
        message: `Duplicate patterns found in "${field}": ${patterns.map(p => `"${p}"`).join(", ")}.`,
        suggestion: "Remove duplicate entries to simplify configuration.",
        severity: "warning"
    }),
    EMPTY_GLOB_PATTERN: (field: string): IssueTemplate => ({
        code: "empty-glob-pattern",
        message: `Empty string detected in "${field}" patterns.`,
        suggestion: "Remove empty strings from the pattern array.",
        severity: "error"
    }),

    // Paths
    TSCONFIG_ROOT_NOT_FOUND: (p: string): IssueTemplate => ({
        code: "tsconfig-root-not-found",
        message: `TSConfig root directory not found: "${p}".`,
        suggestion: "Verify the directory exists and the path is correct relative to the config file.",
        severity: "error"
    }),
    TSCONFIG_PROJECT_NOT_FOUND: (p: string): IssueTemplate => ({
        code: "tsconfig-project-not-found",
        message: `TSConfig file not found: "${p}".`,
        suggestion: "Verify the file exists and the path is relative to 'tsconfigRootDir' or config location.",
        severity: "error"
    }),
    OUTPUT_PATH_TRAVERSAL: (p: string): IssueTemplate => ({
        code: "output-path-traversal",
        message: `Output path contains unsafe traversal (..): "${p}".`,
        suggestion: "Use absolute paths or paths without '..' to prevent security issues.",
        severity: "error"
    }),
    OUTPUT_PATH_SYSTEM_DIR: (p: string): IssueTemplate => ({
        code: "output-path-system-dir",
        message: `Output path points to a system directory: "${p}".`,
        suggestion: "Choose a safe output location within your project directory.",
        severity: "error"
    }),
    OUTPUT_PATH_NOT_FOUND: (dir: string): IssueTemplate => ({
        code: "output-path-not-found",
        message: `Output directory does not exist: "${dir}".`,
        suggestion: "Create the directory or update 'outputPath' to an existing location.",
        severity: "error"
    }),
    OUTPUT_PATH_NOT_WRITABLE: (dir: string): IssueTemplate => ({
        code: "output-path-not-writable",
        message: `Output directory is not writable: "${dir}".`,
        suggestion: "Check directory permissions or choose a different output location.",
        severity: "error"
    }),
    CACHE_IN_NODE_MODULES: (location: string): IssueTemplate => ({
        code: "cache-in-node-modules",
        message: `Cache location inside 'node_modules' is unsafe: "${location}". node_modules can be deleted, causing cache loss.`,
        suggestion: "Use a different directory like '.cache' or 'node_modules/.cache/ngcompass'.",
        severity: "error"
    }),
    CACHE_PARENT_NOT_FOUND: (dir: string): IssueTemplate => ({
        code: "warn-cache-parent-not-found",
        message: `Cache parent directory missing: "${dir}". It will be created automatically.`,
        suggestion: "No action needed. Directory will be created on first cache write.",
        severity: "warning"
    }),

    // Rules
    INVALID_RULE_SEVERITY: (ruleName: string, severity: string): IssueTemplate => ({
        code: "invalid-rule-severity",
        message: `Rule "${ruleName}" has invalid severity: "${severity}".`,
        suggestion: "Use valid severities: 'off', 'info', 'low', 'moderate', 'high', or 'critical'.",
        severity: "error"
    }),
    NO_RULES_CONFIGURED: (): IssueTemplate => ({
        code: "warn-no-rules-configured",
        message: "No rules configured. Analysis effectively skips checks.",
        suggestion: "Add rules to enable analysis, or extend from a preset like 'recommended'.",
        severity: "warning"
    }),
    EMPTY_RULE_NAME: (): IssueTemplate => ({
        code: "empty-rule-name",
        message: "Empty rule name detected. Rule keys must be non-empty strings.",
        suggestion: "Remove empty keys from 'rules' configuration.",
        severity: "error"
    }),

    // Profiles
    PROFILE_MUTUALLY_EXCLUSIVE_AUTOFIX: (profile: string): IssueTemplate => ({
        code: "profile-mutually-exclusive-autofix",
        message: `Profile "${profile}" enables both 'autoFix' and 'autoFixOnSave'.`,
        suggestion: "Choose one auto-fix strategy per profile.",
        severity: "error"
    }),
    PROFILE_NEGATIVE_DEBOUNCE: (profile: string, val: number): IssueTemplate => ({
        code: "profile-negative-debounce",
        message: `Profile "${profile}" has invalid debounce: ${val}ms.`,
        suggestion: "Set to 0 or higher. Typical values: 100-500ms.",
        severity: "error"
    }),
    PROFILE_CIRCULAR_INHERITANCE: (chain: string[]): IssueTemplate => ({
        code: "profile-circular-inheritance",
        message: `Circular profile inheritance detected: ${chain.join(" → ")}.`,
        suggestion: "Break the circular dependency by removing one 'extends' reference.",
        severity: "error"
    }),
    PROFILE_EMPTY: (): IssueTemplate => ({
        code: "warn-profile-empty",
        message: "Profiles section is defined but empty. Consider removing it.",
        suggestion: "Remove 'profiles: {}' or add at least one profile like 'dev' or 'ci'.",
        severity: "warning"
    }),
    PROFILE_HTML_OUTPUT_CI: (profile: string): IssueTemplate => ({
        code: "warn-profile-html-output-ci",
        message: `Profile "${profile}" combines HTML output with auto-fix.`,
        suggestion: "Use JSON format for CI/CD, reserve HTML for local development review.",
        severity: "warning"
    }),

    // Deprecated
    DEPRECATED_CACHE_LOCATION: (): IssueTemplate => ({
        code: "warn-deprecated-cache-location",
        message: "'cacheLocation' is deprecated. Use 'cache.location' instead.",
        suggestion: "Replace 'cacheLocation: \"...\"' with 'cache: { location: \"...\" }'.",
        severity: "warning"
    }),
    DEPRECATED_CONCURRENCY: (): IssueTemplate => ({
        code: "warn-deprecated-concurrency",
        message: "'concurrency' is deprecated. Use 'maxWorkers' instead.",
        suggestion: "Replace 'concurrency: N' with 'maxWorkers: N'.",
        severity: "warning"
    }),
};
