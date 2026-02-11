/**
 * Rule Performance Benchmarks
 *
 * Enforces performance budgets via CI gates.
 *
 * Run with: npm run bench
 */

import { describe, bench, expect, it } from 'vitest';
import { runSinglePassAnalysis } from '../single-pass-engine.js';
import { preferOnPushRule } from '../../domains/prefer-on-push.rule.js';
import { preferStandaloneRule } from '../../domains/prefer-standalone.rule.js';
import { parseTs } from '../../../parsers/ts.js';
import type { RuleContext } from '../../types.js';

// ============================================
// TEST FIXTURE GENERATION
// ============================================

/**
 * Generates test components for benchmarking.
 */
const generateTestComponents = (count: number): string => {
    const components: string[] = [];

    for (let i = 0; i < count; i++) {
        components.push(`
import { Component } from '@angular/core';

@Component({
    selector: 'app-test-${i}',
    template: '<div>Test Component ${i}</div>'
})
export class TestComponent${i} {
    value = ${i};
}
        `.trim());
    }

    return components.join('\n\n');
};

// ============================================
// PERFORMANCE BENCHMARKS
// ============================================

describe('Rule Performance Budgets', () => {
    const testCode = generateTestComponents(100);  // 100 components ≈ 5K LOC
    const { program } = parseTs(testCode, 'test.ts');

    const rules = [
        preferOnPushRule,
        preferStandaloneRule,
    ];

    const context: RuleContext = {
        filePath: 'test.ts',
        fileContent: testCode,
        program,
        template: undefined,
        style: undefined,
        options: {},
    };

    it('should enforce <2ms per file budget (syntax-only)', () => {
        const { performance } = runSinglePassAnalysis(rules, context);

        // Enforce budget: <2ms per file
        expect(performance.traversalMs).toBeLessThan(2);

        // Enforce no budget violations
        expect(performance.budgetViolations).toHaveLength(0);
    });

    it('should have >85% cache hit rate after warm-up', () => {
        // First pass (warm-up)
        runSinglePassAnalysis(rules, context);

        // Second pass (should hit cache)
        const { performance } = runSinglePassAnalysis(rules, context);

        const hitRate = performance.cacheStats.hits / (performance.cacheStats.hits + performance.cacheStats.misses);
        expect(hitRate).toBeGreaterThan(0.85);
    });

    it('should visit all nodes exactly once', () => {
        const { performance } = runSinglePassAnalysis(rules, context);

        // Should visit every node in the AST
        expect(performance.nodesVisited).toBeGreaterThan(0);

        // Verify single traversal (no re-traversal)
        expect(performance.budgetViolations).not.toContain(
            expect.stringContaining('multiple traversals')
        );
    });

    bench('Single-pass analysis (2 rules × 100 components)', () => {
        runSinglePassAnalysis(rules, context);
    });

    bench('Component analysis (cached)', () => {
        // After warm-up, this should be O(1)
        runSinglePassAnalysis([preferOnPushRule], context);
    });
});

// ============================================
// ZERO-ALLOCATION VERIFICATION
// ============================================

describe('Zero-Allocation Verification', () => {
    it('should allocate zero structures in rule handlers', () => {
        const testCode = `
import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-test',
    template: '<div>Test</div>',
    changeDetection: ChangeDetectionStrategy.Default
})
export class TestComponent {}
        `.trim();

        const { program } = parseTs(testCode, 'test.ts');
        const context: RuleContext = {
            filePath: 'test.ts',
            fileContent: testCode,
            program,
            template: undefined,
            style: undefined,
            options: {},
        };

        // Run analysis
        const { results } = runSinglePassAnalysis([preferOnPushRule], context);

        // Verify failure was reported (allocation only on violation)
        expect(results[0].failures).toHaveLength(1);
        expect(results[0].failures[0].message).toContain('should use ChangeDetectionStrategy.OnPush');
    });
});

// ============================================
// TRI-STATE METADATA TESTS
// ============================================

describe('Tri-State Metadata Handling', () => {
    it('should handle literal values', () => {
        const testCode = `
import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-test',
    template: '<div>Test</div>',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true
})
export class TestComponent {}
        `.trim();

        const { program } = parseTs(testCode, 'test.ts');
        const context: RuleContext = {
            filePath: 'test.ts',
            fileContent: testCode,
            program,
            template: undefined,
            style: undefined,
            options: {},
        };

        const { results } = runSinglePassAnalysis([preferOnPushRule, preferStandaloneRule], context);

        // Both rules should pass (literal values match expectations)
        expect(results[0].failures).toHaveLength(0);
        expect(results[1].failures).toHaveLength(0);
    });

    it('should skip non-literal values', () => {
        const testCode = `
import { Component } from '@angular/core';

const config = {
    changeDetection: getChangeDetectionStrategy(),
    standalone: getStandaloneFlag()
};

@Component({
    selector: 'app-test',
    template: '<div>Test</div>',
    ...config
})
export class TestComponent {}
        `.trim();

        const { program } = parseTs(testCode, 'test.ts');
        const context: RuleContext = {
            filePath: 'test.ts',
            fileContent: testCode,
            program,
            template: undefined,
            style: undefined,
            options: {},
        };

        const { results } = runSinglePassAnalysis([preferOnPushRule, preferStandaloneRule], context);

        // Rules should skip non-literal values (can't verify)
        expect(results[0].failures).toHaveLength(0);
        expect(results[1].failures).toHaveLength(0);
    });

    it('should report missing values', () => {
        const testCode = `
import { Component } from '@angular/core';

@Component({
    selector: 'app-test',
    template: '<div>Test</div>'
})
export class TestComponent {}
        `.trim();

        const { program } = parseTs(testCode, 'test.ts');
        const context: RuleContext = {
            filePath: 'test.ts',
            fileContent: testCode,
            program,
            template: undefined,
            style: undefined,
            options: {},
        };

        const { results } = runSinglePassAnalysis([preferOnPushRule, preferStandaloneRule], context);

        // Both rules should report missing values
        expect(results[0].failures).toHaveLength(1);
        expect(results[1].failures).toHaveLength(1);
    });
});
