/**
 * @fileoverview
 * Per-file task builder.
 *
 * Maps a single TypeScript file plus the resolved rule set to a list of
 * executable tasks. Each task carries content-addressed inputs (file paths +
 * SHA hashes) plus the rule's options and metadata flags. Shared state
 * (hash cache, directory cache, component graph) is supplied via
 * {@link TaskBuilderContext} so multiple files can amortize discovery costs.
 */

import { debug, type ResolvedRule } from '@ngcompass/common';
import { type CacheKeyContext } from '@ngcompass/cache';
import type { ComponentDependencyGraph } from './component-graph.js';
import { calculateTaskId, hashFile } from './hashing.js';
import { discoverResources } from './resources.js';
import type { FileInput, FileType, Task, TaskInputs } from './types.js';

/** Hit/miss counters for the component-graph fast path. */
export interface GraphStats {
    hits: number;
    misses: number;
    fallbacks: number;
}

/** Shared state passed across `buildTask` invocations within a plan build. */
export interface TaskBuilderContext {
    hashCache?: Map<string, string>;
    resourceCache?: Map<string, TaskInputs>;
    directoryCache?: Map<string, string[]>;
    globalHash?: string;
    componentGraph?: ComponentDependencyGraph;
    graphStats?: GraphStats;
    /**
     * Version context forwarded to {@link calculateTaskId}. When present,
     * `toolVersion` and `ruleRegistryHash` are mixed into every taskId so
     * an upgrade of the tool or any plugin invalidates per-task cache
     * entries automatically.
     */
    cacheKeyCtx?: CacheKeyContext;
}

// ── Rule applicability ────────────────────────────────────────────────────

/** Returns `true` when `rule` should produce a task for a file of `fileType`. */
export const shouldApplyRule = (rule: ResolvedRule, fileType: FileType): boolean => {
    const { dependencyType } = rule.metadata;

    if (dependencyType === 'standalone' || dependencyType === 'imports') {
        return isTypescriptLike(fileType);
    }
    if (dependencyType === 'component') {
        return fileType === 'component' || fileType === 'directive' || fileType === 'angular-class';
    }
    if (dependencyType === 'styles') return fileType === 'component';
    if (dependencyType === 'spec') return fileType === 'spec';
    return false;
};

/** Filters rules that require a specific analysis capability. */
export const filterRulesByAstRequirement = (
    rules: ReadonlyMap<string, ResolvedRule>,
    astType: 'tsAst' | 'htmlAst' | 'cssAst' | 'typeChecker' | 'projectContext',
): ReadonlyArray<ResolvedRule> => {
    const filtered: ResolvedRule[] = [];
    for (const rule of rules.values()) {
        if (rule.metadata.requires[astType]) filtered.push(rule);
    }
    return filtered;
};

/**
 * Groups rules by their dependency-type bucket. Used by the engine to choose
 * which rule families to dispatch on which streams.
 */
export const groupRulesByDependencyType = (
    rules: ReadonlyMap<string, ResolvedRule>,
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

// ── Task construction ────────────────────────────────────────────────────

/**
 * Builds a single task for one (file, rule) pair, or `null` when the rule
 * is not applicable / is disabled.
 */
export const buildTask = async (
    filePath: string,
    fileType: FileType,
    rule: ResolvedRule,
    context?: TaskBuilderContext,
): Promise<Task | null> => {
    const applicability = evaluateRuleApplicability(rule, fileType);
    if (!applicability.apply) {
        debug('planner', `      - Rule ${rule.name} skipped: ${applicability.reason}`);
        return null;
    }

    const requirements = resolveAstRequirements(rule);
    const inputs = await buildTaskInputsWithHashes(filePath, rule, context);
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

/** Builds every applicable task for a file. */
export const buildTasksForFileTaskCentric = async (
    filePath: string,
    fileType: FileType,
    rules: ReadonlyMap<string, ResolvedRule>,
    context?: TaskBuilderContext,
): Promise<ReadonlyArray<Task>> => {
    const tasks: Task[] = [];
    for (const rule of rules.values()) {
        const task = await buildTask(filePath, fileType, rule, context);
        if (task) tasks.push(task);
    }
    return tasks;
};

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * `'unknown'`, `'template'`, `'style'`, and `'config'` are explicitly excluded —
 * they either don't match an Angular pattern or aren't TypeScript-bearing.
 */
const isTypescriptLike = (fileType: FileType): boolean =>
    fileType !== 'template'
    && fileType !== 'style'
    && fileType !== 'config'
    && fileType !== 'unknown';

const evaluateRuleApplicability = (
    rule: ResolvedRule,
    fileType: FileType,
): { apply: boolean; reason: string } => {
    if (!shouldApplyRule(rule, fileType)) {
        return { apply: false, reason: `does not apply to ${fileType}` };
    }
    if (rule.severity === 'off') {
        return { apply: false, reason: "disabled ('off')" };
    }
    return { apply: true, reason: 'applicable' };
};

const resolveAstRequirements = (rule: ResolvedRule) => {
    const requires = rule.metadata.requires;
    return {
        needsTsAst: Boolean(requires.tsAst),
        needsHtmlAst: Boolean(requires.htmlAst),
        needsCssAst: Boolean(requires.cssAst),
        needsSpecAst: Boolean(requires.specAst),
        needsTypeChecker: Boolean(requires.typeChecker),
        needsProjectContext: Boolean(requires.projectContext),
    };
};

const buildTaskInputsWithHashes = async (
    filePath: string,
    rule: ResolvedRule,
    context?: TaskBuilderContext,
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
 * Returns cached resource discovery for `filePath`, or runs discovery now.
 *
 * Uses the component graph as a fast path when available; falls back to a
 * directory scan for files outside the graph (libraries, plain logic, etc.).
 */
const getOrDiscoverResources = async (
    filePath: string,
    context?: TaskBuilderContext,
): Promise<TaskInputs> => {
    const cached = context?.resourceCache?.get(filePath);
    if (cached) return cached;

    if (context?.componentGraph) {
        const node = context.componentGraph.getResources(filePath);
        if (node) {
            if (context.graphStats) context.graphStats.hits++;
            const inputs: TaskInputs = {
                typescript: { path: filePath, hash: '', needsAst: false },
                styles: node.stylePaths.map((p) => ({ path: p, hash: '', needsAst: false })),
            };
            if (node.templatePath) inputs.template = { path: node.templatePath, hash: '', needsAst: false };
            if (node.specPath) inputs.spec = { path: node.specPath, hash: '', needsAst: false };
            context.resourceCache?.set(filePath, inputs);
            return inputs;
        }
        if (context.graphStats) context.graphStats.misses++;
    }

    if (context?.graphStats) context.graphStats.fallbacks++;

    const discovered = await discoverResources(filePath, true, true, true, true, context?.directoryCache);
    context?.resourceCache?.set(filePath, discovered);
    return discovered;
};

const buildHashedInput = async (
    filePath: string,
    needsAst: boolean,
    context?: TaskBuilderContext,
): Promise<FileInput> => ({
    path: filePath,
    hash: await hashFile(filePath, context?.hashCache),
    needsAst,
});

const buildTemplateInput = (
    filePath: string,
    discovered: TaskInputs,
    rule: ResolvedRule,
    requirements: { needsHtmlAst: boolean },
    inputs: TaskInputs,
    context?: TaskBuilderContext,
): FileInput | undefined => {
    const { dependencyType } = rule.metadata;
    const needsAst = requirements.needsHtmlAst
        && (dependencyType === 'component' || dependencyType === 'styles');

    if (discovered.template) {
        return {
            path: discovered.template.path,
            hash: context?.hashCache?.get(discovered.template.path) ?? discovered.template.hash ?? '',
            needsAst,
        };
    }

    // Inline-template fallback: rules that need an HTML AST on a `@Component`
    // without an external template treat the TS file itself as the template.
    if (dependencyType === 'component' && requirements.needsHtmlAst) {
        return { path: filePath, hash: inputs.typescript.hash, needsAst: true };
    }

    return undefined;
};

const buildStyleInputs = async (
    discovered: TaskInputs,
    rule: ResolvedRule,
    requirements: { needsCssAst: boolean },
    context?: TaskBuilderContext,
): Promise<FileInput[] | undefined> => {
    if (!discovered.styles || discovered.styles.length === 0) return undefined;
    const needsAst = requirements.needsCssAst && rule.metadata.dependencyType === 'styles';
    return Promise.all(discovered.styles.map((s) => buildHashedInput(s.path, needsAst, context)));
};

const buildSpecInput = async (
    discovered: TaskInputs,
    requirements: { needsSpecAst: boolean },
    context?: TaskBuilderContext,
): Promise<FileInput | undefined> => {
    if (!discovered.spec) return undefined;
    return buildHashedInput(discovered.spec.path, requirements.needsSpecAst, context);
};
