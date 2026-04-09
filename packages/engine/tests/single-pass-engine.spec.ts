/**
 * Unit Tests — single-pass-engine.ts
 *
 * Verifies runSinglePassAnalysis:
 *  - Missing program → empty results + zero-perf report
 *  - Correct dispatch of CallExpression handlers
 *  - Failure collection (single + array return)
 *  - Error isolation per handler (via errorCollector)
 *  - PerformanceReport shape
 */

import { describe, it, expect } from 'vitest';
import { runSinglePassAnalysis } from '../src/single-pass-engine.js';
import { createCallExpressionRule } from '../src/rule-handler.js';
import type { RuleContext } from '../src/types.js';
import type { RuleFailure } from '../src/types.js';
import { parseTs } from '@ngcompass/ast';
import { Locator } from '@ngcompass/common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal RuleContext from TypeScript source text. */
function makeContext(source: string, filePath = '/src/test.ts'): RuleContext {
    const { program } = parseTs(source, filePath);
    return {
        filePath,
        fileContent: source,
        locator: new Locator(source),
        program,
    };
}

/** Builds a RuleContext with no program (simulating a failed parse). */
function makeContextNoProgram(): RuleContext {
    return {
        filePath: '/src/test.ts',
        fileContent: '',
        locator: new Locator(''),
        program: undefined,
    };
}

function makeFailure(overrides: Partial<RuleFailure> = {}): RuleFailure {
    return {
        filePath: '/src/test.ts',
        message: 'violation',
        line: 1,
        column: 1,
        severity: 'error',
        ruleName: 'test-rule',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// No-program path
// ---------------------------------------------------------------------------

describe('runSinglePassAnalysis — no program', () => {
    it('returns one empty RuleResult per rule', () => {
        const handler = createCallExpressionRule('rule-a', () => null);
        const { results } = runSinglePassAnalysis([handler], makeContextNoProgram());
        expect(results).toHaveLength(1);
        expect(results[0].ruleName).toBe('rule-a');
        expect(results[0].failures).toHaveLength(0);
    });

    it('returns a zeroed PerformanceReport', () => {
        const { performance } = runSinglePassAnalysis([], makeContextNoProgram());
        expect(performance.traversalMs).toBe(0);
        expect(performance.nodesVisited).toBe(0);
        expect(performance.ruleTimings).toHaveLength(0);
        expect(performance.budgetViolations).toHaveLength(0);
        expect(performance.hasBudgetViolations).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Normal dispatch — no failures
// ---------------------------------------------------------------------------

describe('runSinglePassAnalysis — dispatch, no failures', () => {
    it('returns empty failures when no rule matches any node', () => {
        const source = 'export const x = 1;';
        const ctx = makeContext(source);
        // CallExpression rule on code that has no call expressions
        const handler = createCallExpressionRule('no-match', () => null);
        const { results } = runSinglePassAnalysis([handler], ctx);
        expect(results[0].failures).toHaveLength(0);
    });

    it('returns one RuleResult per rule with correct ruleName', () => {
        const source = 'export const x = 1;';
        const ctx = makeContext(source);
        const handlerA = createCallExpressionRule('rule-a', () => null);
        const handlerB = createCallExpressionRule('rule-b', () => null);
        const { results } = runSinglePassAnalysis([handlerA, handlerB], ctx);
        expect(results).toHaveLength(2);
        expect(results.map(r => r.ruleName).sort()).toEqual(['rule-a', 'rule-b']);
    });
});

// ---------------------------------------------------------------------------
// Failure collection
// ---------------------------------------------------------------------------

describe('runSinglePassAnalysis — failure collection', () => {
    it('captures a single failure returned by a handler', () => {
        // foo() triggers our CallExpression rule
        const source = 'foo();';
        const ctx = makeContext(source);
        const failure = makeFailure({ message: 'single failure' });
        const handler = createCallExpressionRule('rule-single', () => failure);
        const { results } = runSinglePassAnalysis([handler], ctx);
        expect(results[0].failures).toContain(failure);
    });

    it('captures an array of failures returned by a handler', () => {
        const source = 'foo();';
        const ctx = makeContext(source);
        const f1 = makeFailure({ message: 'f1' });
        const f2 = makeFailure({ message: 'f2' });
        const handler = createCallExpressionRule('rule-array', () => [f1, f2]);
        const { results } = runSinglePassAnalysis([handler], ctx);
        expect(results[0].failures).toEqual(expect.arrayContaining([f1, f2]));
    });

    it('accumulates failures from multiple matching nodes', () => {
        // Two call expressions → handler fires twice
        const source = 'foo(); bar();';
        const ctx = makeContext(source);
        let count = 0;
        const handler = createCallExpressionRule('rule-count', () => {
            count++;
            return makeFailure({ message: `hit-${count}` });
        });
        const { results } = runSinglePassAnalysis([handler], ctx);
        // Both foo() and bar() are CallExpression nodes
        expect(results[0].failures.length).toBeGreaterThanOrEqual(2);
    });
});

// ---------------------------------------------------------------------------
// Error isolation
// ---------------------------------------------------------------------------

describe('runSinglePassAnalysis — error isolation', () => {
    it('does not throw when a rule handler throws', () => {
        const source = 'foo();';
        const ctx = makeContext(source);
        const badHandler = createCallExpressionRule('throwing-rule', () => {
            throw new Error('rule exploded');
        });
        expect(() => runSinglePassAnalysis([badHandler], ctx)).not.toThrow();
    });

    it('returns empty failures when the handler throws (error does not become a failure)', () => {
        const source = 'foo();';
        const ctx = makeContext(source);
        const badHandler = createCallExpressionRule('throwing-rule', () => {
            throw new Error('rule exploded');
        });
        const { results } = runSinglePassAnalysis([badHandler], ctx);
        expect(results[0].failures).toHaveLength(0);
    });

    it('continues to execute other rules after one throws', () => {
        const source = 'foo();';
        const ctx = makeContext(source);
        const badHandler = createCallExpressionRule('bad-rule', () => { throw new Error(); });
        const goodFailure = makeFailure({ message: 'good' });
        const goodHandler = createCallExpressionRule('good-rule', () => goodFailure);
        const { results } = runSinglePassAnalysis([badHandler, goodHandler], ctx);
        const goodResult = results.find(r => r.ruleName === 'good-rule')!;
        expect(goodResult.failures).toContain(goodFailure);
    });
});

// ---------------------------------------------------------------------------
// PerformanceReport
// ---------------------------------------------------------------------------

describe('runSinglePassAnalysis — PerformanceReport', () => {
    it('returns a traversalMs >= 0', () => {
        const { performance } = runSinglePassAnalysis([], makeContext(''));
        expect(performance.traversalMs).toBeGreaterThanOrEqual(0);
    });

    it('returns nodesVisited >= 0', () => {
        const { performance } = runSinglePassAnalysis([], makeContext('const x = 1;'));
        expect(performance.nodesVisited).toBeGreaterThanOrEqual(0);
    });

    it('returns one ruleTimings entry per rule', () => {
        const source = 'const x = 1;';
        const ctx = makeContext(source);
        const h1 = createCallExpressionRule('r1', () => null);
        const h2 = createCallExpressionRule('r2', () => null);
        const { performance } = runSinglePassAnalysis([h1, h2], ctx);
        expect(performance.ruleTimings).toHaveLength(2);
        expect(performance.ruleTimings.map(t => t.ruleName).sort()).toEqual(['r1', 'r2']);
    });

    it('every ruleTimings entry has totalMs and invocations', () => {
        const source = 'const x = 1;';
        const ctx = makeContext(source);
        const h = createCallExpressionRule('r', () => null);
        const { performance } = runSinglePassAnalysis([h], ctx);
        const timing = performance.ruleTimings[0];
        expect(timing).toHaveProperty('totalMs');
        expect(timing).toHaveProperty('invocations');
        expect(timing.totalMs).toBeGreaterThanOrEqual(0);
        expect(timing.invocations).toBeGreaterThanOrEqual(0);
    });

    it('hasBudgetViolations is a boolean', () => {
        const { performance } = runSinglePassAnalysis([], makeContext(''));
        expect(typeof performance.hasBudgetViolations).toBe('boolean');
    });

    it('budgetViolations is an array', () => {
        const { performance } = runSinglePassAnalysis([], makeContext(''));
        expect(Array.isArray(performance.budgetViolations)).toBe(true);
    });

    it('increments nodesVisited for code with multiple statements', () => {
        const source = 'const a = 1; const b = 2; const c = 3;';
        const ctx = makeContext(source);
        const { performance } = runSinglePassAnalysis([], ctx);
        // A file with three variable declarations has more than 0 nodes
        expect(performance.nodesVisited).toBeGreaterThan(0);
    });
});
