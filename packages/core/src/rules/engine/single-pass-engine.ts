/**
 * Single-Pass Engine (Performance-Critical)
 *
 * RESPONSIBILITIES:
 * 1. Traverse AST exactly once
 * 2. Dispatch nodes to analyzers (cached)
 * 3. Dispatch pre-filtered nodes to rules
 * 4. Track per-rule timing
 * 5. Enforce performance budgets
 *
 * PERFORMANCE GUARANTEE:
 * - O(N) traversal where N = AST nodes
 * - O(1) stream dispatch per node
 * - <2ms/file p95 (syntax-only rules)
 * - <5ms/file p95 (type-aware rules)
 */

import type { RuleContext, RuleResult, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { toAngularComponentStream, toDecoratedPropertyStream } from './node-streams.js';
import type { RuleHandler } from './rule-handler.js';
import { resetComponentCacheStats, getComponentCacheStats } from '../analyzers/component-analyzer.js';
import { analyzeTemplate } from '../analyzers/template-analyzer.js';

// ============================================
// PERFORMANCE BUDGETS (Enforced by CI)
// ============================================

const BUDGET_MS_PER_FILE_WITHOUT_TYPES = 2;  // p95
const BUDGET_MS_PER_FILE_WITH_TYPES = 5;     // p95

// ============================================
// RULE REGISTRY (By Stream Type)
// ============================================

interface RuleRegistry {
    angularComponentHandlers: RuleHandler<any>[];
    decoratedPropertyHandlers: RuleHandler<any>[];
    templateExpressionHandlers: RuleHandler<any>[];
    templateAttributeHandlers: RuleHandler<any>[];
    // Add more stream types as needed
}

const createRegistry = (rules: ReadonlyArray<RuleHandler<any>>): RuleRegistry => {
    const registry: RuleRegistry = {
        angularComponentHandlers: [],
        decoratedPropertyHandlers: [],
        templateExpressionHandlers: [],
        templateAttributeHandlers: [],
    };

    for (const rule of rules) {
        switch (rule.streamType) {
            case 'AngularComponent':
                registry.angularComponentHandlers.push(rule);
                break;
            case 'DecoratedProperty':
                registry.decoratedPropertyHandlers.push(rule);
                break;
            case 'TemplateExpression':
                registry.templateExpressionHandlers.push(rule);
                break;
            case 'TemplateAttribute':
                registry.templateAttributeHandlers.push(rule);
                break;
        }
    }

    return registry;
};

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
}

// ============================================
// MAIN ENGINE
// ============================================

/**
 * Executes all rules in a single AST traversal.
 *
 * COMPLEXITY: O(N + R) where N = nodes, R = rule registration
 *
 * @returns Results + performance report
 */
export const runSinglePassAnalysis = (
    rules: ReadonlyArray<RuleHandler<any>>,
    context: RuleContext
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
            },
        };
    }

    const startTime = performance.now();

    // Phase 1: Build registry (O(R))
    const registry = createRegistry(rules);

    // Phase 2: Initialize tracking
    const failuresByRule = new Map<string, RuleFailure[]>();
    const ruleTimings = new Map<string, RuleTiming>();
    let nodesVisited = 0;

    for (const rule of rules) {
        ruleTimings.set(rule.name, { ruleName: rule.name, totalMs: 0, invocations: 0 });
    }

    resetComponentCacheStats();

    // Phase 3: Single traversal (O(N))
    walkProgram(program, (node) => {
        if (!node || !node.type) return;

        nodesVisited++;

        // Dispatch to Angular component stream
        if (node.type === 'ClassDeclaration') {
            const componentNode = toAngularComponentStream(node);
            if (componentNode) {
                for (const handler of registry.angularComponentHandlers) {
                    const ruleStartTime = performance.now();

                    try {
                        const failure = handler.handle(componentNode, context);
                        if (failure) {
                            const existing = failuresByRule.get(handler.name) ?? [];
                            existing.push(failure);
                            failuresByRule.set(handler.name, existing);
                        }
                    } catch (error) {
                        console.error(`Rule ${handler.name} failed:`, error);
                    }

                    const ruleEndTime = performance.now();
                    const timing = ruleTimings.get(handler.name)!;
                    timing.totalMs += (ruleEndTime - ruleStartTime);
                    timing.invocations++;
                }
            }
        }

        // Dispatch to decorated property stream
        if (node.type === 'PropertyDefinition') {
            const decoratedNode = toDecoratedPropertyStream(node);
            if (decoratedNode) {
                for (const handler of registry.decoratedPropertyHandlers) {
                    const ruleStartTime = performance.now();

                    try {
                        const failure = handler.handle(decoratedNode, context);
                        if (failure) {
                            const existing = failuresByRule.get(handler.name) ?? [];
                            existing.push(failure);
                            failuresByRule.set(handler.name, existing);
                        }
                    } catch (error) {
                        console.error(`Rule ${handler.name} failed:`, error);
                    }

                    const ruleEndTime = performance.now();
                    const timing = ruleTimings.get(handler.name)!;
                    timing.totalMs += (ruleEndTime - ruleStartTime);
                    timing.invocations++;
                }
            }
        }

        // Add more stream dispatches as needed
    });

    // Dispatch to template streams (Expressions and Attributes)
    if (context.template && (registry.templateExpressionHandlers.length > 0 || registry.templateAttributeHandlers.length > 0)) {
        const templateAnalysis = analyzeTemplate(context.template);
        const expressions = templateAnalysis.expressions;
        const attributes = templateAnalysis.attributes;

        // Dispatch Expressions
        for (const templateNode of expressions) {
            for (const handler of registry.templateExpressionHandlers) {
                const ruleStartTime = performance.now();

                try {
                    const failure = handler.handle(templateNode, context);
                    if (failure) {
                        const existing = failuresByRule.get(handler.name) ?? [];
                        existing.push(failure);
                        failuresByRule.set(handler.name, existing);
                    }
                } catch (error) {
                    console.error(`Rule ${handler.name} failed:`, error);
                }

                const ruleEndTime = performance.now();
                const timing = ruleTimings.get(handler.name)!;
                timing.totalMs += (ruleEndTime - ruleStartTime);
                timing.invocations++;
            }
        }

        // Dispatch Attributes
        for (const attributeNode of attributes) {
            for (const handler of registry.templateAttributeHandlers) {
                const ruleStartTime = performance.now();

                try {
                    const failure = handler.handle(attributeNode, context);
                    if (failure) {
                        const existing = failuresByRule.get(handler.name) ?? [];
                        existing.push(failure);
                        failuresByRule.set(handler.name, existing);
                    }
                } catch (error) {
                    console.error(`Rule ${handler.name} failed:`, error);
                }

                const ruleEndTime = performance.now();
                const timing = ruleTimings.get(handler.name)!;
                timing.totalMs += (ruleEndTime - ruleStartTime);
                timing.invocations++;
            }
        }
    }

    // Phase 4: Collect results
    const results: RuleResult[] = [];
    for (const rule of rules) {
        results.push({
            ruleName: rule.name,
            failures: failuresByRule.get(rule.name) ?? [],
        });
    }

    const traversalMs = performance.now() - startTime;

    // Phase 5: Check budgets
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
        },
    };
};
