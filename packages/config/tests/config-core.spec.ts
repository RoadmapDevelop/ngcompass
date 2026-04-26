/**
 * Configuration Integration & Unit Test Suite
 *
 * This suite verifies the integrity of the ngcompass configuration pipeline,
 * from raw input validation to complex cross-field constraints and profile merging.
 */
import { describe, it, expect } from 'vitest';
import { validateConfiguration } from '../src/health/validator.js';
import { validateGlobPatterns } from '../src/health/checks/globs.js';
import { validateRules } from '../src/health/checks/rules.js';
import { validateExtendsChain } from '../src/health/checks/extends.js';
import { validateDeprecatedFields } from '../src/health/checks/deprecated.js';
import type { ValidationContext, ValidatedConfig } from '../src/health/types.js';

// ============================================================
// TEST FACTORIES
// ============================================================

/**
 * Creates a mock validation context with controlled environmental variables.
 */
function createMockContext(overrides?: Partial<ValidationContext>): ValidationContext {
    return {
        cwd: '/mock/project',
        fs: {
            existsSync: () => true,
            accessSync: () => { /* Assume all paths are writable */ },
        },
        os: {
            cpus: () => [{ model: 'cpu-0' }, { model: 'cpu-1' }], // 2 Cores
        },
        path: {
            dirname: (p: string) => {
                const normalized = p.replace(/\\/g, '/');
                const lastIndex = normalized.lastIndexOf('/');
                return lastIndex <= 0 ? '/' : normalized.slice(0, lastIndex);
            },
            resolve: (...parts: string[]) => parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/'),
            isAbsolute: (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p),
        },
        ...overrides,
    };
}

/**
 * Generates a valid, minimal configuration object for testing individual checks.
 */
function createMockConfig(overrides: Partial<ValidatedConfig> = {}): ValidatedConfig {
    return {
        include: ['src/**/*.ts'],
        exclude: ['node_modules/**', 'dist/**'],
        rules: {},
        outputFormat: 'json' as any,
        failOnSeverity: 'error' as any,
        maxWarnings: 10,
        ignorePatterns: [],
        overrides: [],
        maxWorkers: 2,
        cache: { enabled: true, location: '.cache', strategy: 'local', ttl: 0 } as any,
        ...overrides,
    } as ValidatedConfig;
}

// ============================================================
// PIPELINE INTEGRATION TESTS
// ============================================================

describe('Validator: Full Pipeline', () => {
    it('should approve a minimal valid configuration', async () => {
        const result = await validateConfiguration(
            { include: ['src/**/*.ts'] },
            createMockContext()
        );
        const errors = result.report.issues.filter(i => i.severity === 'error');
        expect(errors).toHaveLength(0);
    });

    it('should fail validation when maxWarnings is negative', async () => {
        const result = await validateConfiguration(
            { include: ['src/**/*.ts'], maxWarnings: -1 },
            createMockContext()
        );
        expect(result.report.valid).toBe(false);
        expect(result.config).toBeUndefined();
    });

    it('should correctly attribute issues to the source file path', async () => {
        const filePath = '/project/ngcompass.config.ts';
        const result = await validateConfiguration(
            { include: ['src/**/*.ts'], maxWarnings: -1 },
            createMockContext(),
            filePath
        );
        const issue = result.report.issues.find(i => i.code === 'negative-max-warnings');
        expect(issue?.file).toBe(filePath);
    });

    /**
     * Profile Merging Logic
     */
    describe('Profile Resolution', () => {


        it('should report a missing-profile error for invalid specifiers', async () => {
            const result = await validateConfiguration(
                { include: ['src/**/*.ts'] },
                createMockContext({ profile: 'prod' })
            );
            expect(result.report.valid).toBe(false);
            expect(result.report.issues[0].code).toBe('error-profile-not-found');
        });
    });
});

// ============================================================
// INDIVIDUAL CHECK MODULES
// ============================================================

describe('Check: Glob Patterns', () => {
    it('should detect invalid syntax (unclosed brackets)', () => {
        const config = createMockConfig({ include: ['src/[*.ts'] });
        const { issues } = validateGlobPatterns(config);
        expect(issues.some(i => i.code === 'invalid-glob-pattern')).toBe(true);
    });

    it('should warn on redundant/duplicate include patterns', () => {
        const config = createMockConfig({
            include: ['src/**/*.ts', 'src/**/*.ts'],
        });
        const { issues } = validateGlobPatterns(config);
        expect(issues.some(i => i.code === 'warn-duplicate-patterns')).toBe(true);
    });

    it('should enforce mandatory include fields', () => {
        const config = createMockConfig({ include: [] });
        const { issues } = validateGlobPatterns(config);
        expect(issues.some(i => i.code === 'empty-include')).toBe(true);
    });
});

describe('Check: Rule Integrity', () => {
    it('should warn if no rules are configured without a preset', () => {
        const config = createMockConfig({ rules: {}, extends: undefined });
        const { issues } = validateRules(config);
        expect(issues.some(i => i.code === 'warn-no-rules-configured')).toBe(true);
    });

    it('should accept empty rules if an inheritance preset is defined', () => {
        const config = createMockConfig({ rules: {}, extends: 'some-preset' as any });
        const { issues } = validateRules(config);
        expect(issues.some(i => i.code === 'warn-no-rules-configured')).toBe(false);
    });
});

describe('Check: Deprecated Fields', () => {
    it('should trigger warnings for legacy "cacheLocation"', () => {
        const raw = { cacheLocation: '.ngcache' };
        const { issues } = validateDeprecatedFields(raw);
        expect(issues.some(i => i.code === 'warn-deprecated-cache-location')).toBe(true);
    });

    it('should trigger warnings for legacy "concurrency" alias', () => {
        const raw = { concurrency: 4 };
        const { issues } = validateDeprecatedFields(raw);
        expect(issues.some(i => i.code === 'warn-deprecated-concurrency')).toBe(true);
    });
});

describe('Check: Extends Chain', () => {
    it('should validate package presence via Node resolution', () => {
        const config = createMockConfig({ extends: ['@missing/preset'] as any });
        const { issues } = validateExtendsChain(config, [], process.cwd());
        expect(issues.some(i => i.code === 'extends-not-found')).toBe(true);
    });

    it('should ignore relative paths during package resolution', () => {
        const config = createMockConfig({ extends: ['./local-preset'] as any });
        const { issues } = validateExtendsChain(config, [], process.cwd());
        expect(issues).toHaveLength(0);
    });
});
