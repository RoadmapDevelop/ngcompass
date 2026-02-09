/**
 * Analysis Orchestrator
 *
 * Executes tasks against rule executors with memoized parsing and I/O.
 * Produces aggregated RuleResult outputs and summary statistics.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import pLimit from "p-limit";

import { Task } from "../planner/index.js";
import { RuleResult, RuleContext, Result, Ok, Err, RuleFailure } from "../rules/types.js";
import { parseTs, parseHtml } from "../parsers/index.js";
import { getRuleExecutor } from "../rules/registry.js";
import { warn, error } from "@ngcompass/common";

import type { Program } from "oxc-parser";
import type { HtmlParserResult } from "../parsers/html.js";
import type { CssResult } from "../parsers/css.js";

/**
 * Analysis aggregate output.
 */
export interface AnalysisResult {
    readonly results: ReadonlyArray<RuleResult>;
    readonly stats: {
        readonly totalFiles: number;
        readonly totalErrors: number;
        readonly totalWarnings: number;
        readonly duration: number;
    };
}

/**
 * Memoized, deterministic accessors for file and parser artifacts.
 */
export interface AnalysisContext {
    readonly rootDir: string;
    readonly readFile: (filePath: string) => Promise<string>;
    readonly getProgram: (filePath: string) => Promise<Program>;
    readonly getTemplate: (filePath: string) => Promise<HtmlParserResult | undefined>;
    readonly getStyle: (filePath: string) => Promise<CssResult | undefined>;
}

/**
 * Creates an analysis context with memoized file reads and parsing.
 *
 * @param rootDir - Root directory for resolving file paths
 * @returns AnalysisContext
 */
export const createAnalysisContext = (rootDir: string): AnalysisContext => {
    const fileCache = new Map<string, Promise<string>>();
    const programCache = new Map<string, Promise<Program>>();
    const templateCache = new Map<string, Promise<HtmlParserResult | undefined>>();
    const styleCache = new Map<string, Promise<CssResult | undefined>>();

    const readFileCached = (filePath: string): Promise<string> => {
        const cached = fileCache.get(filePath);
        if (cached) return cached;

        const promise = readFileSafe(rootDir, filePath);
        fileCache.set(filePath, promise);
        return promise;
    };

    const getProgram = (filePath: string): Promise<Program> => {
        const cached = programCache.get(filePath);
        if (cached) return cached;

        const promise = (async () => {
            const content = await readFileCached(filePath);
            return parseTs(content, filePath).program;
        })();

        programCache.set(filePath, promise);
        return promise;
    };

    const getTemplate = (filePath: string): Promise<HtmlParserResult | undefined> => {
        const cached = templateCache.get(filePath);
        if (cached) return cached;

        const promise = (async () => {
            const content = await resolveTemplateContent(filePath, readFileCached, getProgram);
            if (!content) return undefined;
            return parseHtml(content);
        })();

        templateCache.set(filePath, promise);
        return promise;
    };

    const getStyle = (filePath: string): Promise<CssResult | undefined> => {
        const cached = styleCache.get(filePath);
        if (cached) return cached;

        const promise = Promise.resolve(undefined);
        styleCache.set(filePath, promise);
        return promise;
    };

    return { rootDir, readFile: readFileCached, getProgram, getTemplate, getStyle };
};

/**
 * Executes a single task by running its rule executor.
 *
 * @param task - Task to execute
 * @param context - Analysis context
 * @returns Result of rule execution
 */
export const executeTask = async (task: Task, context: AnalysisContext): Promise<Result<RuleResult>> => {
    try {
        const executor = getRuleExecutor(task.ruleName);
        if (!executor) {
            return Err(new Error(`No executor found for rule: ${task.ruleName}`));
        }

        const fileContent = await context.readFile(task.filePath);
        const program = task.inputs.typescript.needsAst ? await context.getProgram(task.filePath) : undefined;

        const templatePath = task.inputs.template?.path ?? task.filePath;
        const template = task.inputs.template?.needsAst ? await context.getTemplate(templatePath) : undefined;

        const ruleContext: RuleContext = {
            filePath: task.filePath,
            fileContent,
            program,
            template,
            options: task.options,
        };

        const raw = executor(ruleContext);
        const normalized = normalizeRuleResult(raw, task.ruleName, task.taskId);

        return Ok(normalized);
    } catch (e) {
        return Err(e instanceof Error ? e : new Error(String(e)));
    }
};

/**
 * Runs analysis across all tasks with bounded concurrency.
 *
 * @param tasks - Tasks to execute
 * @param rootDir - Root directory for resolving paths
 * @returns Aggregated analysis result
 */
export const runAnalysis = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string
): Promise<Result<AnalysisResult>> => {
    try {
        const startTime = performance.now();
        const context = createAnalysisContext(rootDir);

        const limit = pLimit(16);
        const results = await Promise.all(tasks.map((t) => limit(() => executeTaskOrLog(t, context))));

        const successful = results.filter((r): r is RuleResult => r !== null);

        return Ok({
            results: successful,
            stats: calculateStats(successful, startTime),
        });
    } catch (e) {
        return Err(e instanceof Error ? e : new Error(String(e)));
    }
};

/**
 * Reads a file relative to rootDir with error handling.
 *
 * @param rootDir - Root directory
 * @param filePath - File path (relative or absolute)
 * @returns File contents or empty string on failure
 */
const readFileSafe = async (rootDir: string, filePath: string): Promise<string> => {
    try {
        return await readFile(path.resolve(rootDir, filePath), "utf-8");
    } catch (e) {
        warn("workers", `Failed to read file: ${filePath}. ${e instanceof Error ? e.message : String(e)}`);
        return "";
    }
};

/**
 * Resolves template content from either an HTML file or inline template in TS.
 *
 * @param filePath - Template path or TS path
 * @param readFileCached - Memoized file read
 * @param getProgram - Memoized program parse
 * @returns Template content or empty string
 */
const resolveTemplateContent = async (
    filePath: string,
    readFileCached: (p: string) => Promise<string>,
    getProgram: (p: string) => Promise<Program>
): Promise<string> => {
    const ext = path.extname(filePath);

    if (ext === ".html") {
        return readFileCached(filePath);
    }

    if (ext === ".ts") {
        const program = await getProgram(filePath);
        return extractInlineTemplate(program);
    }

    return "";
};

/**
 * Extracts an inline template string from an Oxc program.
 *
 * @param program - Oxc program
 * @returns Template string or empty
 */
const extractInlineTemplate = (program: any): string => {
    let template = "";

    const visit = (node: any): void => {
        if (!node || template) return;

        if (node.type === "ClassDeclaration" && Array.isArray(node.decorators)) {
            for (const decorator of node.decorators) {
                const call = decorator?.expression;
                if (!call || call.type !== "CallExpression") continue;
                if (call.callee?.type !== "Identifier" || call.callee.name !== "Component") continue;

                const objectArg = call.arguments?.[0];
                if (!objectArg || objectArg.type !== "ObjectExpression") continue;

                const value = findObjectPropertyValue(objectArg.properties, "template");
                const extracted = value ? extractTemplateLiteralValue(value) : "";
                if (extracted) template = extracted;
            }
        }

        for (const key of Object.keys(node)) {
            const val = node[key];
            if (Array.isArray(val)) val.forEach(visit);
            else if (val && typeof val === "object" && "type" in val) visit(val);
        }
    };

    visit(program);
    return template;
};

/**
 * Finds an ObjectExpression property value by key name.
 *
 * @param properties - ObjectExpression properties
 * @param keyName - Key name
 * @returns Value node or null
 */
const findObjectPropertyValue = (properties: any[] | undefined, keyName: string): any | null => {
    if (!Array.isArray(properties)) return null;

    for (const prop of properties) {
        const key = prop?.key;
        const value = prop?.value;
        if (!key || !value) continue;

        const name = key?.name ?? key?.value;
        if (name === keyName) return value;
    }

    return null;
};

/**
 * Extracts a string value from a StringLiteral or TemplateLiteral node.
 *
 * @param node - Expression node
 * @returns Extracted string or empty
 */
const extractTemplateLiteralValue = (node: any): string => {
    if (!node) return "";

    if (node.type === "StringLiteral") return node.value ?? "";

    if (node.type === "TemplateLiteral") {
        const quasis = node.quasis ?? [];
        return Array.isArray(quasis) ? quasis.map((q: any) => q.value?.raw ?? "").join("") : "";
    }

    return "";
};

/**
 * Validates and normalizes a rule result to the system's expected shape.
 *
 * @param raw - Raw executor return value
 * @param ruleName - Rule name
 * @param taskId - Task identifier
 * @returns Normalized RuleResult
 */
const normalizeRuleResult = (raw: unknown, ruleName: string, taskId: string): RuleResult => {
    const safe = isRuleResult(raw) ? (raw as RuleResult) : { ruleName, failures: [] };

    return {
        ruleName,
        failures: (safe.failures ?? []) as ReadonlyArray<RuleFailure>,
        taskId,
    };
};

/**
 * Structural check for RuleResult objects.
 *
 * @param value - Unknown value
 * @returns true if value matches RuleResult shape
 */
const isRuleResult = (value: unknown): value is RuleResult => {
    return Boolean(value) && typeof value === "object" && "failures" in (value as any);
};

/**
 * Executes a task and logs failures without failing the whole analysis run.
 *
 * @param task - Task to execute
 * @param context - Analysis context
 * @returns RuleResult or null on failure
 */
const executeTaskOrLog = async (task: Task, context: AnalysisContext): Promise<RuleResult | null> => {
    const result = await executeTask(task, context);

    if (result.ok) return result.data;

    error("workers", `Failed to execute task ${task.ruleName} on ${task.filePath}:`, result.error);
    return null;
};

/**
 * Calculates aggregate statistics for analysis.
 *
 * @param results - Rule results
 * @param startTime - Start timestamp
 * @returns Stats object
 */
const calculateStats = (results: ReadonlyArray<RuleResult>, startTime: number): AnalysisResult["stats"] => {
    const duration = performance.now() - startTime;
    const failures = results.flatMap((r) => r.failures);

    const uniqueFiles = new Set<string>(failures.map((f: any) => f.filePath));

    const totalErrors = failures.filter((f: any) => isErrorSeverity(f?.severity)).length;
    const totalWarnings = failures.filter((f: any) => isWarningSeverity(f?.severity)).length;

    return {
        totalFiles: uniqueFiles.size,
        totalErrors,
        totalWarnings,
        duration,
    };
};

/**
 * Determines whether a severity represents an error.
 *
 * @param severity - Severity value
 * @returns true if severity counts as error
 */
const isErrorSeverity = (severity: unknown): boolean => {
    return severity === "critical" || severity === "high" || severity === "error";
};

/**
 * Determines whether a severity represents a warning.
 *
 * @param severity - Severity value
 * @returns true if severity counts as warning
 */
const isWarningSeverity = (severity: unknown): boolean => {
    return severity === "moderate" || severity === "low" || severity === "warn";
};
