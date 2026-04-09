/**
 * @fileoverview
 * Implements the performance-optimized single-pass analytical engine.
 *
 * This component is designed for maximum throughput, performing exactly one
 * traversal of the Abstract Syntax Tree (AST) while dispatching nodes to
 * passive observers via an O(1) visitor infrastructure.
 *
 * Key Performance Characteristics:
 * - Linear Complexity: O(N) traversal in relation to the number of AST nodes.
 * - Optimized Dispatch: Leverages a high-speed visitor map for node-type routing.
 * - Resource Efficiency: Maintains strict execution budgets for individual rules.
 */

import type { RuleContext, RuleResult, RuleFailure } from './types.js';
import { walkProgram, toAngularClassStream, toAnyAngularClassStream, toDecoratedPropertyStream, toCallExpressionStream, toNewExpressionStream } from '@ngcompass/ast';
import type { RuleHandler } from './rule-handler.js';
import type { TemplateExpressionNode, TemplateAttributeNode, TemplateBlockNode } from '@ngcompass/ast';
import { resetComponentCacheStats, getComponentCacheStats } from '@ngcompass/ast';
import { analyzeTemplate } from '@ngcompass/ast';
import { buildVisitorMap } from './visitor-registry.js';
import { InfrastructureErrorCollector, createInfrastructureError } from '@ngcompass/common';
import { BUDGET_MS_PER_FILE_WITHOUT_TYPES, BUDGET_MS_PER_FILE_WITH_TYPES } from './constants.js';

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
 * Union of the node types that template-stream handlers receive.
 */
type AnyTemplateNode = TemplateExpressionNode | TemplateAttributeNode | TemplateBlockNode;

/**
 * Coordinates the distribution of template-specific nodes to registered handlers.
 *
 * Invoked post-AST traversal to process artifacts derived from the secondary
 * template parsing phase.
 */
const dispatchTemplateHandlers = (
    nodes: ReadonlyArray<AnyTemplateNode>,
    handlers: ReadonlyArray<RuleHandler<AnyTemplateNode>>,
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
 * Executes a comprehensive analytical pass over a provided AST program.
 *
 * @param rules A collection of rule handlers to evaluate during the pass.
 * @param context The analytical context containing the program and metadata.
 * @param options Operational configuration, including error collection.
 * @returns A consolidated result set and performance diagnostic report.
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

    const visitorMap = buildVisitorMap(rules, {
        AngularClass: toAngularClassStream,
        AnyAngularClass: toAnyAngularClassStream,
        DecoratedProperty: toDecoratedPropertyStream,
        CallExpression: toCallExpressionStream,
        NewExpression: toNewExpressionStream,
    });

    const templateExpressionHandlers = rules.filter(r => r.streamType === 'TemplateExpression');
    const templateAttributeHandlers = rules.filter(r => r.streamType === 'TemplateAttribute');
    const templateBlockHandlers = rules.filter(r => r.streamType === 'TemplateBlock');
    const templateHandlers = rules.filter(r => r.streamType === 'Template');

    const failuresByRule = new Map<string, RuleFailure[]>();
    const ruleTimings = new Map<string, RuleTiming>();
    let nodesVisited = 0;

    for (const rule of rules) {
        ruleTimings.set(rule.name, { ruleName: rule.name, totalMs: 0, invocations: 0 });
    }

    resetComponentCacheStats();

    walkProgram(program, (node) => {
        if (!node?.type) return;

        nodesVisited++;

        const visitors = visitorMap.get(node.type);
        if (visitors) {
            for (let i = 0; i < visitors.length; i++) {
                const entry = visitors[i];
                const ruleStart = performance.now();

                try {
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

    if (context.template && (templateExpressionHandlers.length > 0 || templateAttributeHandlers.length > 0 || templateBlockHandlers.length > 0 || templateHandlers.length > 0)) {
        const templateAnalysis = analyzeTemplate(context.template);
        dispatchTemplateHandlers(templateAnalysis.expressions, templateExpressionHandlers, context, failuresByRule, ruleTimings, options?.errorCollector);
        dispatchTemplateHandlers(templateAnalysis.attributes, templateAttributeHandlers, context, failuresByRule, ruleTimings, options?.errorCollector);
        dispatchTemplateHandlers(templateAnalysis.blocks, templateBlockHandlers as any, context, failuresByRule, ruleTimings, options?.errorCollector);
        dispatchTemplateHandlers([templateAnalysis as any], templateHandlers as any, context, failuresByRule, ruleTimings, options?.errorCollector);
    }

    const results: RuleResult[] = [];
    for (const rule of rules) {
        results.push({
            ruleName: rule.name,
            failures: failuresByRule.get(rule.name) ?? [],
        });
    }

    const traversalMs = performance.now() - startTime;

    const budgetViolations: string[] = [];
    const budget = context.typeChecker ? BUDGET_MS_PER_FILE_WITH_TYPES : BUDGET_MS_PER_FILE_WITHOUT_TYPES;

    if (traversalMs > budget) {
        budgetViolations.push(
            `Total traversal time ${traversalMs.toFixed(2)}ms exceeds budget ${budget}ms`
        );
    }

    for (const timing of ruleTimings.values()) {
        if (timing.invocations === 0) continue;
        const avgMs = timing.totalMs / timing.invocations;
        if (avgMs > 1) {
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

