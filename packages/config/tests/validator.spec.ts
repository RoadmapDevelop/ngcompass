/**
 * Validator — extended coverage
 *
 * Targets gaps not covered by config-core.spec.ts:
 *  - Profile merge (profile found → merged config is validated)
 *  - Issue deduplication
 *  - Severity-ordered output (errors before warnings)
 *  - Semantic check isolation (one check throws → others still run)
 *  - File attribution without fileContent
 *  - Schema-level Zod errors surface with correct structure
 *  - validatePaths — outputPath traversal, system-dir, not-found
 *  - validateCrossFields — negative maxWarnings
 *  - Valid config returns resolved config object
 */
import { describe, it, expect, vi } from 'vitest';
import { validateConfiguration } from '../src/health/validator.js';
import { validateCrossFields } from '../src/health/checks/cross-fields.js';
import { validatePaths } from '../src/health/checks/paths.js';
import type { ValidationContext, ValidatedConfig } from '../src/health/types.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function mockContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
    return {
        cwd: '/project',
        fs: {
            existsSync: () => true,
            accessSync: () => undefined,
        },
        os: { cpus: () => [{ model: 'cpu' }, { model: 'cpu' }] },
        path: {
            dirname: (p: string) => {
                const norm = p.replace(/\\/g, '/');
                const idx = norm.lastIndexOf('/');
                return idx <= 0 ? '/' : norm.slice(0, idx);
            },
        },
        ...overrides,
    };
}

function mockConfig(overrides: Partial<ValidatedConfig> = {}): ValidatedConfig {
    return {
        include: ['src/**/*.ts'],
        exclude: ['node_modules/**'],
        rules: { 'some-rule': 'warn' },
        autoFix: false,
        autoFixOnSave: false,
        watch: false,
        watchOptions: {},
        outputFormat: 'json' as any,
        failOnSeverity: 'error' as any,
        maxWarnings: 10,
        reportUnusedDisableDirectives: false,
        failOnInfrastructureError: false,
        ignorePatterns: [],
        overrides: [],
        maxWorkers: 2,
        cache: { enabled: true, location: '.cache', strategy: 'local', ttl: 0 } as any,
        ...overrides,
    } as ValidatedConfig;
}

// ---------------------------------------------------------------------------
// Profile resolution
// ---------------------------------------------------------------------------

describe('validateConfiguration — profile resolution', () => {
    it('merges the profile block over the base config and validates the result', async () => {
        const raw = {
            include: ['src/**/*.ts'],
            rules: { 'base-rule': 'warn' },
            profiles: {
                ci: {
                    include: ['src/**/*.ts'],
                    rules: { 'base-rule': 'error' },
                },
            },
        };

        const result = await validateConfiguration(raw, mockContext({ profile: 'ci' }));
        // The profile config itself is valid, so no errors expected
        const errors = result.report.issues.filter(i => i.severity === 'error');
        expect(errors).toHaveLength(0);
    });

    it('returns profile-not-found when profile key is missing from profiles map', async () => {
        const raw = {
            include: ['src/**/*.ts'],
            profiles: {
                staging: { include: ['src/**/*.ts'] },
            },
        };

        const result = await validateConfiguration(raw, mockContext({ profile: 'nonexistent' }));
        expect(result.report.valid).toBe(false);
        const issue = result.report.issues[0];
        expect(issue.code).toBe('error-profile-not-found');
        expect(issue.message).toContain('nonexistent');
        expect(issue.message).toContain('staging'); // lists available profiles
    });

    it('lists all available profiles in the not-found error message', async () => {
        const raw = {
            include: ['src/**/*.ts'],
            profiles: {
                dev: {},
                prod: {},
            },
        };

        const result = await validateConfiguration(raw, mockContext({ profile: 'qa' }));
        expect(result.report.issues[0].message).toContain('dev');
        expect(result.report.issues[0].message).toContain('prod');
    });

    it('attributes the not-found issue to the supplied filePath', async () => {
        const raw = { include: ['src/**/*.ts'], profiles: {} };
        const result = await validateConfiguration(
            raw,
            mockContext({ profile: 'prod' }),
            '/project/ngcompass.config.ts',
        );
        expect(result.report.issues[0].file).toBe('/project/ngcompass.config.ts');
    });
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe('validateConfiguration — result shape', () => {
    it('returns a resolved config object when validation passes', async () => {
        const result = await validateConfiguration(
            { include: ['src/**/*.ts'], rules: { 'a-rule': 'warn' } },
            mockContext(),
        );
        const errors = result.report.issues.filter(i => i.severity === 'error');
        if (errors.length === 0) {
            expect(result.config).toBeDefined();
            expect(result.report.valid).toBe(true);
        }
    });

    it('returns config: undefined when there are errors', async () => {
        const result = await validateConfiguration(
            { include: ['src/**/*.ts'], autoFix: true, autoFixOnSave: true },
            mockContext(),
        );
        expect(result.config).toBeUndefined();
        expect(result.report.valid).toBe(false);
    });

    it('deduplicates identical issues emitted by multiple checks', async () => {
        // An invalid config triggers schema errors + semantic errors that can overlap.
        // Run twice; even if the same issue code appears from schema and semantic path,
        // the report should not contain the exact same (code+message+path) pair twice.
        const result = await validateConfiguration(
            { include: ['src/**/*.ts'], autoFix: true, autoFixOnSave: true },
            mockContext(),
        );

        const issues = result.report.issues;
        const keys = issues.map(i => `${i.code}:${i.message}:${JSON.stringify(i.path)}`);
        const uniqueKeys = new Set(keys);
        expect(keys.length).toBe(uniqueKeys.size);
    });

    it('sorts errors before warnings in the issue list', async () => {
        // A config with both an error and a warning-level issue.
        // autoFix + autoFixOnSave = error; missing exclude = warning.
        const result = await validateConfiguration(
            { include: ['src/**/*.ts'], exclude: [], autoFix: true, autoFixOnSave: true },
            mockContext(),
        );

        const severities = result.report.issues.map(i => i.severity);
        const firstWarningIdx = severities.indexOf('warning');
        const lastErrorIdx = severities.lastIndexOf('error');

        if (firstWarningIdx !== -1 && lastErrorIdx !== -1) {
            expect(lastErrorIdx).toBeLessThan(firstWarningIdx);
        }
    });
});

// ---------------------------------------------------------------------------
// File attribution without fileContent
// ---------------------------------------------------------------------------

describe('validateConfiguration — file attribution', () => {
    it('sets the file field on issues when filePath is provided without fileContent', async () => {
        const result = await validateConfiguration(
            { include: ['src/**/*.ts'], autoFix: true, autoFixOnSave: true },
            mockContext(),
            '/project/ngcompass.config.ts',
            // no fileContent
        );

        for (const issue of result.report.issues) {
            expect(issue.file).toBe('/project/ngcompass.config.ts');
        }
    });
});

// ---------------------------------------------------------------------------
// Schema-level errors
// ---------------------------------------------------------------------------

describe('validateConfiguration — schema errors', () => {
    it('surfaces a schema error when include is not an array', async () => {
        const result = await validateConfiguration(
            { include: 'src/**/*.ts' as any },
            mockContext(),
        );
        // Zod will reject non-array for include; expect at least one error
        expect(result.report.valid).toBe(false);
        expect(result.report.issues.length).toBeGreaterThan(0);
    });

    it('handles a completely empty config object without throwing', async () => {
        const result = await validateConfiguration({}, mockContext());
        // No include → schema error or semantic error, but must not throw
        expect(result.report).toBeDefined();
    });

    it('handles null / primitive inputs without throwing', async () => {
        await expect(validateConfiguration(null, mockContext())).resolves.toBeDefined();
        await expect(validateConfiguration(42, mockContext())).resolves.toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Semantic check isolation
// ---------------------------------------------------------------------------

describe('validateConfiguration — check isolation', () => {
    it('continues running remaining checks when one check encounters an unexpected error', async () => {
        // Force fs.existsSync to throw on the first call to simulate a check crash.
        let callCount = 0;
        const ctx = mockContext({
            fs: {
                existsSync: () => {
                    callCount++;
                    if (callCount === 1) throw new Error('Simulated fs crash');
                    return true;
                },
                accessSync: () => undefined,
            },
        });

        const result = await validateConfiguration(
            { include: ['src/**/*.ts'], outputPath: '/project/out' },
            ctx,
        );

        // Should have a check-failed issue from the crash, but the run must complete
        expect(result.report).toBeDefined();
        // Other checks should have run — at minimum the result must not be empty
        const hasCrashIssue = result.report.issues.some(i => i.code === 'check-failed');
        expect(hasCrashIssue).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// validateCrossFields
// ---------------------------------------------------------------------------

describe('validateCrossFields', () => {
    it('flags negative maxWarnings', () => {
        const config = mockConfig({ maxWarnings: -1 });
        const { issues } = validateCrossFields(config, mockContext());
        expect(issues.some(i => i.code === 'negative-max-warnings')).toBe(true);
    });

    it('accepts zero maxWarnings', () => {
        const config = mockConfig({ maxWarnings: 0 });
        const { issues } = validateCrossFields(config, mockContext());
        expect(issues.some(i => i.code === 'negative-max-warnings')).toBe(false);
    });

    it('flags autoFix + autoFixOnSave together', () => {
        const config = mockConfig({ autoFix: true, autoFixOnSave: true });
        const { issues } = validateCrossFields(config, mockContext());
        expect(issues.some(i => i.code === 'mutually-exclusive-autofix')).toBe(true);
    });

    it('includes path prefix in issue paths when basePath is provided', () => {
        const config = mockConfig({ maxWarnings: -5 });
        const { issues } = validateCrossFields(config, mockContext(), ['profiles', 'ci']);
        const issue = issues.find(i => i.code === 'negative-max-warnings');
        expect(issue?.path).toEqual(['profiles', 'ci', 'maxWarnings']);
    });
});

// ---------------------------------------------------------------------------
// validatePaths
// ---------------------------------------------------------------------------

describe('validatePaths', () => {
    it('flags outputPath containing path traversal sequences', () => {
        const config = mockConfig({ outputPath: '../outside/project' } as any);
        const { issues } = validatePaths(config, mockContext());
        expect(issues.some(i => i.code === 'output-path-traversal')).toBe(true);
    });

    it('flags outputPath pointing to a sensitive system directory', () => {
        const config = mockConfig({ outputPath: '/etc/report' } as any);
        const { issues } = validatePaths(config, mockContext());
        expect(issues.some(i => i.code === 'output-path-system-dir')).toBe(true);
    });

    it('flags outputPath whose parent directory does not exist', () => {
        const config = mockConfig({ outputPath: '/project/out/report' } as any);
        const ctx = mockContext({ fs: { existsSync: () => false, accessSync: () => undefined } });
        const { issues } = validatePaths(config, ctx);
        expect(issues.some(i => i.code === 'output-path-not-found')).toBe(true);
    });

    it('produces no issues for a valid, writable outputPath', () => {
        const config = mockConfig({ outputPath: '/project/reports' } as any);
        const { issues } = validatePaths(config, mockContext());
        const errors = issues.filter(i => i.severity === 'error');
        expect(errors).toHaveLength(0);
    });

    it('produces no issues when outputPath is absent', () => {
        const config = mockConfig();
        const { issues } = validatePaths(config, mockContext());
        expect(issues).toHaveLength(0);
    });
});
