/**
 * DELIBERATELY BROKEN CONFIG — triggers every validation error and warning.
 *
 * Run:  ngcompass config health
 *
 * Expected errors / warnings per section are listed inline.
 */

export default {

    // ── Glob patterns ──────────────────────────────────────────────────────────

    // [ERROR] empty-include — include array is empty, analysis will skip all files
    include: [],

    exclude: [
        // [ERROR] invalid-glob-pattern — unclosed bracket
        'src/**/*.ts[',
        // [ERROR] invalid-glob-pattern — trailing slash not allowed
        'dist/**/',
        // [ERROR] invalid-glob-pattern — unmatched braces
        'src/**/*.{ts',
        // [WARN]  warn-duplicate-patterns — same pattern appears twice
        'node_modules/**',
        'node_modules/**',
    ],

    ignorePatterns: [
        // [ERROR] empty-glob-pattern — empty string in pattern array
        '',
        // [ERROR] invalid-glob-pattern — triple slashes / multiple consecutive slashes
        'tmp///**',
    ],

    // ── Rules ──────────────────────────────────────────────────────────────────

    // No 'extends' and effectively no valid rules
    // [WARN]  warn-no-rules-configured — no rules will run

    rules: {
        // [ERROR] empty-rule-name — rule key is an empty string
        '': 'error',
        // [ERROR] invalid-rule-severity — 'nuclear' is not a recognised severity
        'prefer-on-push': 'nuclear',
    },

    // ── Extends / presets ──────────────────────────────────────────────────────

    // [ERROR] extends-not-found — package cannot be resolved (not installed)
    extends: ['nonexistent-npm-package-abc123'],

    // ── Output path ────────────────────────────────────────────────────────────

    // [ERROR] output-path-traversal — path contains '..'
    // [ERROR] output-path-not-found — parent directory does not exist
    outputPath: '../../../totally-nonexistent-dir/report.html',

    // Uncomment to also trigger output-path-system-dir:
    // outputPath: '/etc/ngcompass/report.html',

    // ── Numeric limits ─────────────────────────────────────────────────────────

    // [ERROR] negative-max-warnings — must be >= 0
    maxWarnings: -5,

    // [ERROR] workers-below-minimum — must be >= 1
    maxWorkers: 0,

    // Uncomment to trigger warn-workers-excessive instead (set > CPU count × 2):
    // maxWorkers: 9999,

    // ── Cache ──────────────────────────────────────────────────────────────────

    cache: {
        strategy: 'local',

        // [ERROR] cache-in-node-modules — node_modules is unsafe (except .cache)
        location: 'node_modules/my-bad-cache',

        // [ERROR] negative-cache-ttl — ttl must be >= 0
        ttl: -1000,

        // Uncomment to trigger warn-cache-ttl-zero instead:
        // ttl: 0,
    },

    // ── Parser options ─────────────────────────────────────────────────────────

    parserOptions: {
        // [ERROR] tsconfig-project-not-found — file does not exist on disk
        project: './this-tsconfig-does-not-exist.json',

        // [ERROR] tsconfig-root-not-found — directory does not exist on disk
        tsconfigRootDir: './this-directory-does-not-exist',
    },

    // ── Profiles ───────────────────────────────────────────────────────────────

    // [ERROR] profile-circular-inheritance — dev → staging → dev → …
    profiles: {
        dev:     { extends: 'staging' },
        staging: { extends: 'dev' },
    },

    // Uncomment to trigger warn-profile-empty instead:
    // profiles: {},

    // ── Deprecated fields ──────────────────────────────────────────────────────

    // [WARN]  warn-deprecated-cache-location — use cache.location instead
    // @ts-expect-error intentional deprecated field
    cacheLocation: '.cache',

    // [WARN]  warn-deprecated-concurrency — use maxWorkers instead
    // @ts-expect-error intentional deprecated field
    concurrency: 4,
};
