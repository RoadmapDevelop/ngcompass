/**
 * Analysis Orchestrator
 *
 * Implements the core analysis loop using functional programming principles.
 * Handles lazy loading of parsers, rule execution, and result aggregation.
 */

import { Task } from '../planner/index.js';
import { RuleResult, RuleContext, Result, Ok, Err, RuleFailure } from '../rules/types.js';
import { parseTs, parseHtml } from '../parsers/index.js';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { getRuleExecutor } from '../rules/registry.js';
import pLimit from 'p-limit';
import type { Program } from 'oxc-parser';
import type { HtmlParserResult } from '../parsers/html.js';
import type { CssResult } from '../parsers/css.js';

// ==============================================================================
// TYPES
// ==============================================================================

function isRuleResult(result: any): result is RuleResult {
    return result && typeof result === 'object' && 'failures' in result;
}

export interface AnalysisResult {
    readonly results: ReadonlyArray<RuleResult>;
    readonly stats: {
        readonly totalFiles: number;
        readonly totalErrors: number;
        readonly totalWarnings: number;
        readonly duration: number;
    };
}

export interface AnalysisContext {
    readonly rootDir: string;
    readonly readFile: (path: string) => Promise<string>;
    readonly getProgram: (path: string) => Promise<Program>;
    readonly getTemplate: (path: string) => Promise<HtmlParserResult | undefined>;
    readonly getStyle: (path: string) => Promise<CssResult | undefined>;
}

// ==============================================================================
// CONTEXT CREATION
// ==============================================================================

export const createAnalysisContext = (rootDir: string): AnalysisContext => {
    // Mutable cache for memoization of Promises
    const fileCache = new Map<string, Promise<string>>();
    const programCache = new Map<string, Promise<Program>>();
    const templateCache = new Map<string, Promise<HtmlParserResult | undefined>>();
    const styleCache = new Map<string, Promise<CssResult | undefined>>();

    const readFileCached = (filePath: string): Promise<string> => {
        if (fileCache.has(filePath)) {
            return fileCache.get(filePath)!;
        }

        const promise = (async () => {
            try {
                return await readFile(path.resolve(rootDir, filePath), 'utf-8');
            } catch (e: any) {
                console.warn(`Failed to read file: ${filePath}. ${e.message}`);
                return '';
            }
        })();

        fileCache.set(filePath, promise);
        return promise;
    };

    const getProgram = (filePath: string): Promise<Program> => {
        if (programCache.has(filePath)) {
            return programCache.get(filePath)!;
        }

        const promise = (async () => {
            const content = await readFileCached(filePath);
            const parsed = parseTs(content, filePath);
            return parsed.program;
        })();

        programCache.set(filePath, promise);
        return promise;
    };

    const getTemplate = (filePath: string): Promise<HtmlParserResult | undefined> => {
        if (templateCache.has(filePath)) {
            return templateCache.get(filePath)!;
        }

        const promise = (async () => {
            let templateContent = '';
            const ext = path.extname(filePath);

            if (ext === '.html') {
                templateContent = await readFileCached(filePath);
            } else if (ext === '.ts') {
                const program = await getProgram(filePath);
                templateContent = extractInlineTemplate(program);
            }

            if (templateContent) {
                return parseHtml(templateContent);
            }

            return undefined;
        })();

        templateCache.set(filePath, promise);
        return promise;
    };

    const getStyle = (filePath: string): Promise<CssResult | undefined> => {
        if (styleCache.has(filePath)) {
            return styleCache.get(filePath)!;
        }

        const promise = Promise.resolve(undefined);
        styleCache.set(filePath, promise);
        return promise;
    };

    return {
        rootDir,
        readFile: readFileCached,
        getProgram,
        getTemplate,
        getStyle,
    };
};

/**
 * Helper to extract inline template string from Oxc AST
 */
function extractInlineTemplate(program: any): string {
    let template = '';

    const visit = (node: any) => {
        if (template) return;

        if (node.type === 'ClassDeclaration' && node.decorators) {
            for (const decorator of node.decorators) {
                if (decorator.expression.type === 'CallExpression' &&
                    decorator.expression.callee.name === 'Component') {
                    const args = decorator.expression.arguments;
                    if (args.length > 0 && args[0].type === 'ObjectExpression') {
                        for (const prop of args[0].properties) {
                            const key = prop.key.name || prop.key.value;
                            if (key === 'template') {
                                if (prop.value.type === 'StringLiteral') {
                                    template = prop.value.value;
                                } else if (prop.value.type === 'TemplateLiteral') {
                                    template = prop.value.quasis.map((q: any) => q.value.raw).join('');
                                }
                            }
                        }
                    }
                }
            }
        }

        for (const key of Object.keys(node)) {
            const val = node[key];
            if (Array.isArray(val)) val.forEach(visit);
            else if (val && typeof val === 'object' && val.type) visit(val);
        }
    };

    visit(program);
    return template;
}

// ==============================================================================
// RULE EXECUTION
// ==============================================================================

export const executeTask = async (
    task: Task,
    context: AnalysisContext
): Promise<Result<RuleResult>> => {
    try {
        const executor = getRuleExecutor(task.ruleName);

        if (!executor) {
            return Ok({
                ruleName: task.ruleName,
                failures: [],
                taskId: task.taskId,
            });
        }

        const fileContent = await context.readFile(task.filePath);

        const program = task.inputs.typescript.needsAst
            ? await context.getProgram(task.filePath)
            : undefined;

        const templatePath = task.inputs.template?.path || task.filePath;
        const template = task.inputs.template?.needsAst
            ? await context.getTemplate(templatePath)
            : undefined;

        const ruleContext: RuleContext = {
            filePath: task.filePath,
            fileContent,
            program,
            template,
            options: task.options,
        };

        const result = executor(ruleContext);
        const failures = isRuleResult(result) ? result.failures : Array.from(result);

        return Ok({
            ruleName: task.ruleName,
            failures: failures as ReadonlyArray<RuleFailure>,
            taskId: task.taskId,
        });

    } catch (error) {
        return Err(error instanceof Error ? error : new Error(String(error)));
    }
};

// ==============================================================================
// ORCHESTRATOR
// ==============================================================================

const calculateStats = (results: ReadonlyArray<RuleResult>, startTime: number): AnalysisResult['stats'] => {
    const duration = performance.now() - startTime;
    const allFailures = results.flatMap(r => r.failures);

    const uniqueFiles = new Set<string>(allFailures.map((f: { filePath: string }) => f.filePath));

    return {
        totalFiles: uniqueFiles.size,
        totalErrors: allFailures.filter((f: { severity: string }) =>
            f.severity === 'critical' || f.severity === 'high' || f.severity === 'error'
        ).length,
        totalWarnings: allFailures.filter((f: { severity: string }) =>
            f.severity === 'moderate' || f.severity === 'low' || f.severity === 'warn'
        ).length,
        duration,
    };
};

export const runAnalysis = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string
): Promise<Result<AnalysisResult>> => {
    try {
        const startTime = performance.now();
        const context = createAnalysisContext(rootDir);

        // Use p-limit for concurrency control
        const limit = pLimit(16);

        const promises = tasks.map(task => limit(async () => {
            const result = await executeTask(task, context);
            if (result.ok) {
                return result.data;
            } else {
                console.error(`Failed to execute task ${task.ruleName} on ${task.filePath}:`, result.error);
                return null;
            }
        }));

        const rawResults = await Promise.all(promises);
        const results = rawResults.filter((r): r is RuleResult => r !== null);

        return Ok({
            results,
            stats: calculateStats(results, startTime),
        });

    } catch (error: any) {
        return Err(error instanceof Error ? error : new Error(String(error)));
    }
};
