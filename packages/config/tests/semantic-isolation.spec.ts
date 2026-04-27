/**
 * Resilience & Isolation Tests (Gap 2)
 *
 * Verifies that the configuration pipeline is robust against crashes, 
 * unexpected runtime types, and overlapping validation logic. 
 * * Key goals:
 * 1. Semantic checks must run even if the initial schema parse fails.
 * 2. Individual check failures must not halt the entire pipeline.
 * 3. Results must be sorted and deduplicated for a clean user report.
 */
import { describe, it, expect } from 'vitest';
import { validateConfiguration } from '../src/health/validator.js';
import { validateGlobPatterns } from '../src/health/checks/globs.js';
import type { ValidationContext, ValidatedConfig } from '../src/health/types.js';

// ============================================================
// TEST FACTORIES
// ============================================================

/**
 * Creates a stable ValidationContext to prevent environmental 
 * side effects from skewing resilience tests.
 */
function createMockContext(overrides?: Partial<ValidationContext>): ValidationContext {
    return {
        cwd: '/test/root',
        fs: {
            existsSync: () => true,
            accessSync: () => { /* No-op */ },
        },
        os: {
            cpus: () => [{ model: 'test-vcore-0' }, { model: 'test-vcore-1' }],
        },
        path: {
            dirname: (p: string) => {
                const normalized = p.replace(/\\/g, '/');
                const lastSlash = normalized.lastIndexOf('/');
                return lastSlash <= 0 ? '/' : normalized.slice(0, lastSlash);
            },
            resolve: (...parts: string[]) => parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/'),
            isAbsolute: (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p),
        },
        ...overrides,
    };
}

// ============================================================
// DEFENSIVE GUARD TESTS
// ============================================================

describe('Resilience: Glob Pattern Defensive Guards', () => {
    /**
     * These tests ensure that even if the Zod schema is bypassed 
     * (e.g., via type casting or runtime injection), the semantic 
     * check doesn't crash the engine.
     */
    it('should not throw when array-expected fields are bare strings', () => {
        const malformed = { include: 'src/**/*.ts' } as unknown as ValidatedConfig;
        expect(() => validateGlobPatterns(malformed)).not.toThrow();
    });

    it('should handle null or non-object values gracefully', () => {
        const malformed = { include: null, exclude: 42 } as unknown as ValidatedConfig;
        expect(() => validateGlobPatterns(malformed)).not.toThrow();
    });
});

// ============================================================
// PIPELINE ISOLATION TESTS
// ============================================================

describe('Resilience: Pipeline Fault Tolerance', () => {

    it('should report both schema and semantic errors in a single pass', async () => {
        /**
         * Test scenario: 
         * 1. 'maxWorkers' is the wrong type (Schema Error)
         * 2. 'maxWarnings' is negative (Semantic Error)
         */
        const result = await validateConfiguration(
            {
                maxWorkers: 'high',
                maxWarnings: -1,
            },
            createMockContext()
        );

        const codes = result.report.issues.map(i => i.code);

        // Ensure the semantic check was reached despite the schema failure
        expect(codes).toContain('negative-max-warnings');

        // Ensure the schema error was also captured
        const hasSchemaError = result.report.issues.some(i => i.severity === 'error');
        expect(hasSchemaError).toBe(true);
    });

    it('should aggregate issues from independent semantic check modules', async () => {
        const result = await validateConfiguration(
            {
                include: ['src/**/*.ts'],
                maxWarnings: -1, // cross-fields check
                rules: { '': 'error' }, // rules check
            },
            createMockContext()
        );

        const codes = result.report.issues.map(i => i.code);
        expect(codes).toContain('negative-max-warnings');
        expect(codes).toContain('empty-rule-name');
    });

    it('should deduplicate identical issues reported by multiple checks', async () => {
        const result = await validateConfiguration(
            {
                include: ['src/**/*.ts'],
                maxWarnings: -1,
            },
            createMockContext()
        );

        const matchingIssues = result.report.issues.filter(
            i => i.code === 'negative-max-warnings'
        );

        // Even if multiple logic paths detect the same issue, only one should be reported
        expect(matchingIssues).toHaveLength(1);
    });

    it('should prioritize errors over warnings in the final report output', async () => {
        const result = await validateConfiguration(
            {
                include: ['src/**/*.ts'],
                maxWarnings: -1, // error
                rules: {},           // warning (no-rules configured)
            },
            createMockContext()
        );

        const severities = result.report.issues.map(i => i.severity);
        const firstWarn = severities.indexOf('warning');
        const lastError = severities.lastIndexOf('error');

        if (firstWarn !== -1 && lastError !== -1) {
            expect(lastError).toBeLessThan(firstWarn);
        }
    });

    /**
     * Validity and Result Exposure
     */
    it('should block config exposure if any error-level issues exist', async () => {
        const result = await validateConfiguration(
            { maxWarnings: -1 },
            createMockContext()
        );

        expect(result.report.valid).toBe(false);
        expect(result.config).toBeUndefined();
    });

    it('should expose the normalized config if only warnings are present', async () => {
        const result = await validateConfiguration(
            { include: ['src/**/*.ts'], rules: {} },
            createMockContext()
        );

        expect(result.report.valid).toBe(true);
        expect(result.config).toBeDefined();
    });
});
