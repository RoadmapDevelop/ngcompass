/**
 * Task Builder
 *
 * Pure functions for building executable tasks by matching rules to files.
 */

import type { ResolvedRule } from "@ngcompass/common";
import type { CacheKeyContext } from "@ngcompass/cache";
import type { FileInput, FileType, Task, TaskInputs } from "./types.js";
import { discoverResources } from "./resources.js";
import { hashFile, calculateTaskId } from "./hashing.js";
import { debug } from "@ngcompass/common";
import { ComponentDependencyGraph } from "./component-graph.js";

export interface GraphStats {
    hits: number;
    misses: number;
    fallbacks: number;
}

/**
 * Context for task building to enable memoization and shared caches.
 */
export interface TaskBuilderContext {
    hashCache?: Map<string, string>;
    resourceCache?: Map<string, TaskInputs>;
    directoryCache?: Map<string, string[]>;
    globalHash?: string;
    componentGraph?: ComponentDependencyGraph;
    graphStats?: GraphStats;
    /**
     * Version context forwarded to calculateTaskId.
     * When provided, toolVersion and ruleRegistryHash are mixed into every
     * taskId so that upgrading the tool or a plugin invalidates per-task
     * result-cache entries automatically.
     */
    cacheKeyCtx?: CacheKeyContext;
}

/**
 * Checks if a rule should be applied to a file type.
 *
 * @param rule - Resolved rule
 * @param fileType - File type
 * @returns true if rule applies to this file type
 */
export const shouldApplyRule = (rule: ResolvedRule, fileType: FileType): boolean => {
    const { dependencyType } = rule.metadata;

    if (dependencyType === "standalone" || dependencyType === "imports") {
        return isTypescriptLike(fileType);
    }

    if (dependencyType === "component") {
        return fileType === "component" || fileType === "directive" || fileType === "angular-class";
    }

    if (dependencyType === "styles") {
        return fileType === "component";
    }

    if (dependencyType === "spec") {
        return fileType === "spec";
    }

    return false;
};

/**
 * Filters rules that require a specific analysis capability.
 *
 * @param rules - All resolved rules
 * @param astType - Capability to filter by
 * @returns Filtered rules
 */
export const filterRulesByAstRequirement = (
    rules: ReadonlyMap<string, ResolvedRule>,
    astType: "tsAst" | "htmlAst" | "cssAst" | "typeChecker" | "projectContext"
): ReadonlyArray<ResolvedRule> => {
    const filtered: ResolvedRule[] = [];

    for (const rule of rules.values()) {
        if (rule.metadata.requires[astType]) filtered.push(rule);
    }

    return filtered;
};

/**
 * Groups rules by the file types they can match.
 */
export interface RuleGroups {
    allTs: ResolvedRule[];
    component: ResolvedRule[];
    directive: ResolvedRule[];
    spec: ResolvedRule[];
}

/**
 * Pre-calculates rule groups for faster lookup.
 *
 * @param rules - All enabled rules
 * @returns Grouped rules
 */
export const getRulesByFileType = (rules: ReadonlyMap<string, ResolvedRule>): RuleGroups => {
    const groups: RuleGroups = { allTs: [], component: [], directive: [], spec: [] };

    for (const rule of rules.values()) {
        const { dependencyType } = rule.metadata;

        if (dependencyType === "standalone" || dependencyType === "imports") {
            groups.allTs.push(rule);
            continue;
        }

        if (dependencyType === "component") {
            groups.component.push(rule);
            groups.directive.push(rule);
            continue;
        }

        if (dependencyType === "styles") {
            groups.component.push(rule);
            continue;
        }

        if (dependencyType === "spec") {
            groups.spec.push(rule);
        }
    }

    return groups;
};

/**
 * Groups rules by dependency type.
 *
 * @param rules - All resolved rules
 * @returns Rules grouped by dependency type
 */
export const groupRulesByDependencyType = (
    rules: ReadonlyMap<string, ResolvedRule>
): Readonly<Record<string, ReadonlyArray<ResolvedRule>>> => {
    const groups: Record<string, ResolvedRule[]> = {
        standalone: [],
        component: [],
        styles: [],
        imports: [],
        spec: [],
    };

    for (const rule of rules.values()) {
        groups[rule.metadata.dependencyType].push(rule);
    }

    return groups;
};

/**
 * Builds a single task with content-based taskId.
 *
 * @param filePath - File path
 * @param fileType - File type
 * @param rule - Resolved rule
 * @param context - Optional builder context
 * @returns Task or null if rule does not apply
 */
export const buildTask = async (
    filePath: string,
    fileType: FileType,
    rule: ResolvedRule,
    context?: TaskBuilderContext
): Promise<Task | null> => {
    const applicability = evaluateRuleApplicability(rule, fileType);
    if (!applicability.apply) {
        debug("planner", `      - Rule ${rule.name} skipped: ${applicability.reason}`);
        return null;
    }

    const requirements = resolveAstRequirements(rule);
    const inputs = await buildTaskInputsWithHashes(filePath, rule, context);

    // Pass cacheKeyCtx so the taskId is scoped to the current tool + rule-set
    // version. Without this, upgrading the tool can produce stale cache hits.
    const taskId = calculateTaskId(rule.name, inputs, rule.options, context?.cacheKeyCtx);

    return {
        taskId,
        ruleName: rule.name,
        filePath,
        severity: rule.severity,
        options: rule.options,
        inputs,
        needsTypeChecker: requirements.needsTypeChecker,
        needsProjectContext: requirements.needsProjectContext || undefined,
    };
};

/**
 * Builds all applicable tasks for a file.
 *
 * @param filePath - File path
 * @param fileType - File type
 * @param rules - All resolved rules
 * @param context - Optional context
 * @returns Array of tasks
 */
export const buildTasksForFileTaskCentric = async (
    filePath: string,
    fileType: FileType,
    rules: ReadonlyMap<string, ResolvedRule>,
    context?: TaskBuilderContext
): Promise<ReadonlyArray<Task>> => {
    const tasks: Task[] = [];

    for (const rule of rules.values()) {
        const task = await buildTask(filePath, fileType, rule, context);
        if (task) tasks.push(task);
    }

    return tasks;
};

/**
 * Builds task inputs and computes content hashes for all discovered resources.
 *
 * @param filePath - Primary TypeScript file path
 * @param rule - Resolved rule
 * @param context - Optional builder context
 * @returns TaskInputs with hashed resources
 */
const buildTaskInputsWithHashes = async (
    filePath: string,
    rule: ResolvedRule,
    context?: TaskBuilderContext
): Promise<TaskInputs> => {
    const requirements = resolveAstRequirements(rule);
    const discovered = await getOrDiscoverResources(filePath, context);

    const inputs: TaskInputs = {
        typescript: await buildHashedInput(discovered.typescript.path, requirements.needsTsAst, context),
    };

    const template = buildTemplateInput(filePath, discovered, rule, requirements, inputs, context);
    if (template) inputs.template = template;

    const styles = await buildStyleInputs(discovered, rule, requirements, context);
    if (styles) inputs.styles = styles;

    const spec = await buildSpecInput(discovered, requirements, context);
    if (spec) inputs.spec = spec;

    return inputs;
};

/**
 * Determines whether a file type represents a TypeScript-bearing unit.
 *
 * `'unknown'` files are explicitly excluded — they don't match any recognised
 * Angular pattern and should never have rules applied to them.
 *
 * @param fileType - File type
 * @returns true if it is a TS-bearing file type
 */
const isTypescriptLike = (fileType: FileType): boolean => {
    return (
        fileType !== "template" &&
        fileType !== "style" &&
        fileType !== "config" &&
        fileType !== "unknown"
    );
};

/**
 * Evaluates whether a rule should produce a task for a file.
 *
 * @param rule - Resolved rule
 * @param fileType - File type
 * @returns Applicability decision and reason
 */
const evaluateRuleApplicability = (
    rule: ResolvedRule,
    fileType: FileType
): { apply: boolean; reason: string } => {
    if (!shouldApplyRule(rule, fileType)) {
        return { apply: false, reason: `does not apply to ${fileType}` };
    }

    if (rule.severity === "off") {
        return { apply: false, reason: "disabled ('off')" };
    }

    return { apply: true, reason: "applicable" };
};

/**
 * Resolves AST requirements for a rule with defaults.
 *
 * `rule.metadata.requires` is typed as `RuleAstRequirements` (never undefined)
 * so no fallback is needed. All individual flags are optional booleans, so
 * we guard each with Boolean() to normalise undefined → false.
 *
 * @param rule - Resolved rule
 * @returns AST requirement flags
 */
const resolveAstRequirements = (rule: ResolvedRule) => {
    const requires = rule.metadata.requires;

    return {
        needsTsAst: Boolean(requires.tsAst),
        needsHtmlAst: Boolean(requires.htmlAst),
        needsCssAst: Boolean(requires.cssAst),
        needsSpecAst: Boolean(requires.specAst),
        /** True when the rule needs full semantic type information. */
        needsTypeChecker: Boolean(requires.typeChecker),
        /**
         * True when the rule needs the project-wide `ProjectContext`.
         * Routes the task to the type-aware execution path on the main thread.
         */
        needsProjectContext: Boolean(requires.projectContext),
    };
};

/**
 * Returns cached resources for a file or discovers and caches them.
 *
 * @param filePath - Primary TypeScript file path
 * @param context - Optional context
 * @returns Discovered TaskInputs (hashes may be empty)
 */
const getOrDiscoverResources = async (filePath: string, context?: TaskBuilderContext): Promise<TaskInputs> => {
    const cached = context?.resourceCache?.get(filePath);
    if (cached) return cached;

    // Fast path: use graph if available
    if (context?.componentGraph) {
        const node = context.componentGraph.getResources(filePath);
        if (node) {
            if (context.graphStats) context.graphStats.hits++;
            const inputs: TaskInputs = {
                typescript: { path: filePath, hash: "", needsAst: false }, // Hashes computed later
                styles: node.stylePaths.map(p => ({ path: p, hash: "", needsAst: false })),
            };

            if (node.templatePath) {
                inputs.template = { path: node.templatePath, hash: "", needsAst: false };
            }

            if (node.specPath) {
                inputs.spec = { path: node.specPath, hash: "", needsAst: false };
            }

            context?.resourceCache?.set(filePath, inputs);
            return inputs;
        } else {
            if (context.graphStats) context.graphStats.misses++;
        }
    }

    // Slow path: directory scan
    if (context?.graphStats) context.graphStats.fallbacks++;

    const discovered = await discoverResources(
        filePath,
        true,
        true,
        true,
        true,
        context?.directoryCache
    );

    context?.resourceCache?.set(filePath, discovered);
    return discovered;
};

/**
 * Builds a FileInput by hashing a file path and applying needsAst flag.
 *
 * @param filePath - File path
 * @param needsAst - Whether AST is required
 * @param context - Optional context for hash memoization
 * @returns Hashed FileInput
 */
const buildHashedInput = async (
    filePath: string,
    needsAst: boolean,
    context?: TaskBuilderContext
): Promise<FileInput> => {
    return {
        path: filePath,
        hash: await hashFile(filePath, context?.hashCache),
        needsAst,
    };
};

/**
 * Builds template input.
 *
 * @param filePath - Primary TypeScript file path
 * @param discovered - Discovered resources
 * @param rule - Rule
 * @param requirements - AST requirements
 * @param inputs - Current inputs (for fallback hash reuse)
 * @param context - Optional context
 * @returns Template input or undefined
 */
const buildTemplateInput = (
    filePath: string,
    discovered: TaskInputs,
    rule: ResolvedRule,
    requirements: { needsHtmlAst: boolean },
    inputs: TaskInputs,
    context?: TaskBuilderContext
): FileInput | undefined => {
    const { dependencyType } = rule.metadata;
    const needsAst = requirements.needsHtmlAst && (dependencyType === "component" || dependencyType === "styles");

    if (discovered.template) {
        return {
            path: discovered.template.path,
            hash: context?.hashCache?.get(discovered.template.path) ?? discovered.template.hash ?? "",
            needsAst,
        };
    }

    if (dependencyType === "component" && requirements.needsHtmlAst) {
        return {
            path: filePath,
            hash: inputs.typescript.hash,
            needsAst: true,
        };
    }

    return undefined;
};

/**
 * Builds style inputs.
 *
 * @param discovered - Discovered resources
 * @param rule - Rule
 * @param requirements - AST requirements
 * @param context - Optional context
 * @returns Style inputs or undefined
 */
const buildStyleInputs = async (
    discovered: TaskInputs,
    rule: ResolvedRule,
    requirements: { needsCssAst: boolean },
    context?: TaskBuilderContext
): Promise<FileInput[] | undefined> => {
    if (!discovered.styles || discovered.styles.length === 0) return undefined;

    const needsAst = requirements.needsCssAst && rule.metadata.dependencyType === "styles";

    return Promise.all(discovered.styles.map((s) => buildHashedInput(s.path, needsAst, context)));
};

/**
 * Builds spec input.
 *
 * @param discovered - Discovered resources
 * @param requirements - AST requirements
 * @param context - Optional context
 * @returns Spec input or undefined
 */
const buildSpecInput = async (
    discovered: TaskInputs,
    requirements: { needsSpecAst: boolean },
    context?: TaskBuilderContext
): Promise<FileInput | undefined> => {
    if (!discovered.spec) return undefined;
    return buildHashedInput(discovered.spec.path, requirements.needsSpecAst, context);
};

