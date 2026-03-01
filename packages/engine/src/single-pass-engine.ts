/**
 * Single-Pass Engine (Performance-Critical)
 *
 * RESPONSIBILITIES:
 * 1. Traverse AST exactly once
 * 2. Dispatch nodes via O(1) VisitorMap (no if/else chain)
 * 3. Dispatch pre-filtered template nodes after main walk
 * 4. Track per-rule timing
 * 5. Enforce performance budgets
 *
 * PERFORMANCE GUARANTEE:
 * - O(N) traversal where N = AST nodes
 * - O(1) stream dispatch per node (Map lookup)
 * - <2ms/file p95 (syntax-only rules)
 * - <5ms/file p95 (type-aware rules)
 *
 * EXTENSIBILITY:
 * Adding a new StreamType requires only:
 *  1. A new entry in STREAM_TO_NODE_TYPE (visitor-registry.ts)
 *  2. A stream filter function passed to buildVisitorMap()
 * This file does NOT change when new stream types are added.
 */

import type { RuleContext, RuleResult, RuleFailure } from './types.js';
import { walkProgram, toAngularClassStream, toAnyAngularClassStream, toDecoratedPropertyStream, toCallExpressionStream, toNewExpressionStream } from '@ngcompass/ast';
import type { RuleHandler } from './rule-handler.js';
import { resetComponentCacheStats, getComponentCacheStats } from '@ngcompass/ast';
import { analyzeTemplate } from '@ngcompass/ast';
import { buildVisitorMap } from './visitor-registry.js';
import { InfrastructureErrorCollector, createInfrastructureError } from '@ngcompass/common';

// ============================================
// PERFORMANCE BUDGETS (Enforced by CI)
// ============================================

const BUDGET_MS_PER_FILE_WITHOUT_TYPES = 2;  // p95
const BUDGET_MS_PER_FILE_WITH_TYPES = 5;     // p95

// ============================================
// PERFORMANCE INSTRUMENTATION
// ============================================

interface RuleTiming {
    ruleName: string;
    totalMs: number;
    invocations: number;
}

export interface PerformanceReport {
    traversalMs: number;
    nodesVisited: number;
    ruleTimings: RuleTiming[];
    cacheStats: { hits: number; misses: number };
    budgetViolations: string[];
    hasBudgetViolations: boolean;
}

// ============================================
// TEMPLATE STREAM DISPATCH (post-walk)
// ============================================

/**
 * Dispatches pre-filtered template nodes to handlers that opted into a
 * template stream (TemplateExpression or TemplateAttribute).
 *
 * Called after the main AST walk because template nodes come from a
 * different parser (angular-html-parser) not the Oxc AST.
 */
const dispatchTemplateHandlers = (
    nodes: ReadonlyArray<any>,
    handlers: ReadonlyArray<RuleHandler<any>>,
    context: RuleContext,
    failuresByRule: Map<string, RuleFailure[]>,
    ruleTimings: Map<string, RuleTiming>,
    errorCollector?: InfrastructureErrorCollector
): void => {
    if (handlers.length === 0) return;
    for (const templateNode of nodes) {
        for (let i = 0; i < handlers.length; i++) {
            const handler = handlers[i];
            const ruleStart = performance.now();
            try {
                const failure = handler.handle(templateNode, context);
                if (failure) {
                    const existing = failuresByRule.get(handler.name) ?? [];
                    if (Array.isArray(failure)) {
                        existing.push(...failure);
                    } else {
                        existing.push(failure);
                    }
                    failuresByRule.set(handler.name, existing);
                }
            } catch (e) {
                errorCollector?.record(createInfrastructureError('RuleExecutionError', {
                    cause: `Rule ${handler.name} failed on template node: ${e instanceof Error ? e.message : String(e)}`,
                    recoverable: true,
                    phase: 'engine',
                    details: { ruleName: handler.name, errorName: e instanceof Error ? e.name : undefined }
                }));
            }
            const elapsed = performance.now() - ruleStart;
            const timing = ruleTimings.get(handler.name)!;
            if (timing) {
                timing.totalMs += elapsed;
                timing.invocations++;
            }
        }
    }
};

// ============================================
// MAIN ENGINE
// ============================================

/**
 * Executes all rules in a single AST traversal.
 *
 * COMPLEXITY: O(N + R) where N = nodes, R = rule registration
 * DISPATCH:   O(1) per node via VisitorMap (Map.get)
 *
 * @returns Results + performance report
 */
export const runSinglePassAnalysis = (
    rules: ReadonlyArray<RuleHandler<any>>,
    context: RuleContext,
    options?: { errorCollector?: InfrastructureErrorCollector }
): { results: RuleResult[]; performance: PerformanceReport } => {
    const { program } = context;

    if (!program) {
        return {
            results: rules.map(rule => ({ ruleName: rule.name, failures: [] })),
            performance: {
                traversalMs: 0,
                nodesVisited: 0,
                ruleTimings: [],
                cacheStats: { hits: 0, misses: 0 },
                budgetViolations: [],
                hasBudgetViolations: false,
            },
        };
    }

    const startTime = performance.now();

    // Phase 1: Build O(1) dispatch map and separate template handlers (O(R))
    const visitorMap = buildVisitorMap(rules, {
        AngularClass: toAngularClassStream,
        AnyAngularClass: toAnyAngularClassStream,
        DecoratedProperty: toDecoratedPropertyStream,
        CallExpression: toCallExpressionStream,
        NewExpression: toNewExpressionStream,
    });

    // Separate template-stream handlers (post-walk dispatch)
    const templateExpressionHandlers = rules.filter(r => r.streamType === 'TemplateExpression');
    const templateAttributeHandlers = rules.filter(r => r.streamType === 'TemplateAttribute');

    // Phase 2: Initialize tracking
    const failuresByRule = new Map<string, RuleFailure[]>();
    const ruleTimings = new Map<string, RuleTiming>();
    let nodesVisited = 0;

    for (const rule of rules) {
        ruleTimings.set(rule.name, { ruleName: rule.name, totalMs: 0, invocations: 0 });
    }

    resetComponentCacheStats();

    // Phase 3: Single traversal — O(N) with O(1) dispatch per node
    walkProgram(program, (node) => {
        if (!node?.type) return;

        nodesVisited++;

        // O(1) lookup — no if/else chain
        const visitors = visitorMap.get(node.type);
        if (visitors) {
            for (let i = 0; i < visitors.length; i++) {
                const entry = visitors[i];
                const ruleStart = performance.now();

                try {
                    // filter() converts raw Oxc node → typed stream node (or null)
                    const streamNode = entry.filter(node);
                    if (streamNode !== null) {
                        const failure = entry.handle(streamNode, context);
                        if (failure) {
                            const existing = failuresByRule.get(entry.ruleName) ?? [];
                            if (Array.isArray(failure)) {
                                existing.push(...failure);
                            } else {
                                existing.push(failure);
                            }
                            failuresByRule.set(entry.ruleName, existing);
                        }
                    }
                } catch (e) {
                    options?.errorCollector?.record(createInfrastructureError('RuleExecutionError', {
                        cause: `Rule ${entry.ruleName} failed: ${e instanceof Error ? e.message : String(e)}`,
                        recoverable: true,
                        phase: 'engine',
                        details: { ruleName: entry.ruleName, errorName: e instanceof Error ? e.name : undefined }
                    }));
                }

                const elapsed = performance.now() - ruleStart;
                const timing = ruleTimings.get(entry.ruleName)!;
                if (timing) {
                    timing.totalMs += elapsed;
                    timing.invocations++;
                }
            }
        }
    });

    // Phase 4: Dispatch to template streams (post-walk, different parser)
    if (context.template && (templateExpressionHandlers.length > 0 || templateAttributeHandlers.length > 0)) {
        const templateAnalysis = analyzeTemplate(context.template);
        dispatchTemplateHandlers(templateAnalysis.expressions, templateExpressionHandlers, context, failuresByRule, ruleTimings, options?.errorCollector);
        dispatchTemplateHandlers(templateAnalysis.attributes, templateAttributeHandlers, context, failuresByRule, ruleTimings, options?.errorCollector);
    }

    // Phase 5: Collect results
    const results: RuleResult[] = [];
    for (const rule of rules) {
        results.push({
            ruleName: rule.name,
            failures: failuresByRule.get(rule.name) ?? [],
        });
    }

    const traversalMs = performance.now() - startTime;

    // Phase 6: Check budgets
    const budgetViolations: string[] = [];
    const budget = context.options?.typeChecker ? BUDGET_MS_PER_FILE_WITH_TYPES : BUDGET_MS_PER_FILE_WITHOUT_TYPES;

    if (traversalMs > budget) {
        budgetViolations.push(
            `Total traversal time ${traversalMs.toFixed(2)}ms exceeds budget ${budget}ms`
        );
    }

    for (const timing of ruleTimings.values()) {
        if (timing.invocations === 0) continue;
        const avgMs = timing.totalMs / timing.invocations;
        if (avgMs > 1) {  // 1ms per invocation threshold
            budgetViolations.push(
                `Rule ${timing.ruleName} averages ${avgMs.toFixed(2)}ms per invocation (threshold: 1ms)`
            );
        }
    }

    return {
        results,
        performance: {
            traversalMs,
            nodesVisited,
            ruleTimings: Array.from(ruleTimings.values()),
            cacheStats: getComponentCacheStats(),
            budgetViolations,
            hasBudgetViolations: budgetViolations.length > 0,
        },
    };
};

