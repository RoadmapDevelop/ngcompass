/**
 * Task Builder
 *
 * Pure functions for building rule tasks based on file type and rule metadata.
 * Matches rules to files and creates executable tasks.
 */

import type { ResolvedRule } from '../rules/types.js';
import type { FileType, RuleTask, Task, TaskInputs } from './types.js';
import { discoverResources } from './resources.js';
import { hashFileInput, calculateTaskId } from './hashing.js';
import { debug } from '@ngcompass/common';

/**
 * Context for task building to enable memoization/caching.
 */
export interface TaskBuilderContext {
    hashCache?: Map<string, string>;
    resourceCache?: Map<string, TaskInputs>;
}

/**
 * Checks if a rule should be applied to a file type.
 *
 * Rule application logic:
 * - standalone rules: all file types
 * - component rules: only component/directive files
 * - styles rules: only files with styles (components)
 * - imports rules: all TypeScript files
 *
 * @param rule - Resolved rule
 * @param fileType - File type
 * @returns true if rule applies to this file type
 */
export const shouldApplyRule = (rule: ResolvedRule, fileType: FileType): boolean => {
    const { dependencyType } = rule.metadata;

    switch (dependencyType) {
        case 'standalone':
            // Applies to all TypeScript files (not template/style/config)
            return fileType !== 'template' && fileType !== 'style' && fileType !== 'config';

        case 'component':
            // Only components and directives
            return fileType === 'component' || fileType === 'directive';

        case 'styles':
            // Only components (files that can have styles)
            return fileType === 'component';

        case 'imports':
            // All TypeScript files
            return fileType !== 'template' && fileType !== 'style' && fileType !== 'config';

        default:
            return false;
    }
};

/**
 * Builds a single rule task for a file.
 *
 * @param filePath - File path
 * @param fileType - File type
 * @param rule - Resolved rule
 * @param cacheKey - Cache key for this task
 * @param context - Optional builder context
 * @returns RuleTask or null if rule doesn't apply
 */
export const buildRuleTask = (
    filePath: string,
    fileType: FileType,
    rule: ResolvedRule,
    cacheKey: string,
    context?: TaskBuilderContext
): RuleTask | null => {
    // Check if rule applies to this file type
    if (!shouldApplyRule(rule, fileType)) {
        debug('planner', `      - Rule ${rule.name} skipped: does not apply to ${fileType}`);
        return null;
    }

    // Skip disabled rules
    if (rule.severity === 'off') {
        debug('planner', `      - Rule ${rule.name} skipped: disabled ('off')`);
        return null;
    }

    // Determine AST requirements from rule metadata
    const { requires, dependencyType } = rule.metadata;

    // Determine which resources are needed
    const needsTsAst = requires.tsAst ?? false;
    const needsHtmlAst = requires.htmlAst ?? false;
    const needsCssAst = requires.cssAst ?? false;
    const needsSpecAst = requires.specAst ?? false;

    // Discover resources (memoize discovery to avoid redundant existsSync calls)
    let inputs: TaskInputs;
    if (context?.resourceCache?.has(filePath)) {
        inputs = context.resourceCache.get(filePath)!;
    } else {
        inputs = discoverResources(
            filePath,
            true, // Always discover if it exists for the cache
            true,
            true,
            true
        );
        if (context?.resourceCache) {
            context.resourceCache.set(filePath, inputs);
        }
    }

    // Adjust needsAst purely for this task (RuleTask)
    const taskInputs: TaskInputs = {
        typescript: { ...inputs.typescript, needsAst: needsTsAst },
    };

    if (inputs.template) {
        taskInputs.template = {
            ...inputs.template,
            needsAst: needsHtmlAst && (dependencyType === 'component' || dependencyType === 'styles'),
        };
    }

    if (inputs.styles) {
        taskInputs.styles = inputs.styles.map((s) => ({
            ...s,
            needsAst: needsCssAst && dependencyType === 'styles',
        }));
    }

    if (inputs.spec) {
        taskInputs.spec = { ...inputs.spec, needsAst: needsSpecAst };
    }

    return {
        ruleName: rule.name,
        severity: rule.severity,
        options: rule.options,
        cacheKey,
        inputs: taskInputs,
    };
}

/**
 * Builds all applicable tasks for a file.
 *
 * @param filePath - File path
 * @param fileType - File type
 * @param rules - All resolved rules
 * @param context - Optional builder context
 * @returns Array of tasks
 */
export const buildTasksForFile = (
    filePath: string,
    fileType: FileType,
    rules: ReadonlyMap<string, ResolvedRule>,
    context?: TaskBuilderContext
): ReadonlyArray<RuleTask> => {
    const tasks: RuleTask[] = [];

    for (const [ruleName, rule] of rules) {
        // Generate cache key: file path + rule name
        const cacheKey = generateCacheKey(filePath, ruleName);

        const task = buildRuleTask(filePath, fileType, rule, cacheKey, context);
        if (task) {
            tasks.push(task);
        }
    }

    return tasks;
};

/**
 * Generates a cache key for a task.
 * Format: base64(filePath::ruleName)
 *
 * @param filePath - File path
 * @param ruleName - Rule name
 * @returns Cache key
 */
export const generateCacheKey = (filePath: string, ruleName: string): string => {
    const combined = `${filePath}::${ruleName}`;
    return Buffer.from(combined).toString('base64');
};

/**
 * Filters rules that need a specific AST type.
 *
 * @param rules - All resolved rules
 * @param astType - AST type to filter by
 * @returns Filtered rules
 */
export const filterRulesByAstRequirement = (
    rules: ReadonlyMap<string, ResolvedRule>,
    astType: 'tsAst' | 'htmlAst' | 'cssAst' | 'typeChecker'
): ReadonlyArray<ResolvedRule> => {
    const filtered: ResolvedRule[] = [];

    for (const rule of rules.values()) {
        if (rule.metadata.requires[astType]) {
            filtered.push(rule);
        }
    }

    return filtered;
};

/**
 * Groups rules by the file types they can match.
 * Optimized for P3: Skip checking irrelevant rules for specific file types.
 */
export interface RuleGroups {
    allTs: ResolvedRule[]; // standalone + imports
    component: ResolvedRule[]; // component + styles
    directive: ResolvedRule[]; // component only
}

/**
 * Pre-calculates rule groups for faster lookup.
 *
 * @param rules - All enabled rules
 * @returns Grouped rules
 */
export const getRulesByFileType = (rules: ReadonlyMap<string, ResolvedRule>): RuleGroups => {
    const groups: RuleGroups = {
        allTs: [],
        component: [],
        directive: [],
    };

    for (const rule of rules.values()) {
        const { dependencyType } = rule.metadata;

        if (dependencyType === 'standalone' || dependencyType === 'imports') {
            groups.allTs.push(rule);
        } else if (dependencyType === 'component') {
            groups.component.push(rule);
            groups.directive.push(rule);
        } else if (dependencyType === 'styles') {
            groups.component.push(rule);
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
    };

    for (const rule of rules.values()) {
        const type = rule.metadata.dependencyType;
        groups[type].push(rule);
    }

    return groups;
};

// ==============================================================================
// TASK-CENTRIC BUILDERS (Phase 1.75)
// ==============================================================================

/**
 * Builds task inputs with content hashes for each file.
 *
 * @param filePath - Main file path
 * @param rule - Resolved rule with metadata
 * @param context - Optional builder context for caching
 * @returns TaskInputs with hashed files
 */
const buildTaskInputsWithHashes = (
    filePath: string,
    rule: ResolvedRule,
    context?: TaskBuilderContext
): TaskInputs => {
    const { requires, dependencyType } = rule.metadata;

    // Determine AST requirements
    const needsTsAst = requires.tsAst ?? false;
    const needsHtmlAst = requires.htmlAst ?? false;
    const needsCssAst = requires.cssAst ?? false;
    const needsSpecAst = requires.specAst ?? false;

    // Discover resources (memoize discovery to avoid redundant existsSync calls)
    let discoveredInputs: TaskInputs;
    if (context?.resourceCache?.has(filePath)) {
        discoveredInputs = context.resourceCache.get(filePath)!;
    } else {
        discoveredInputs = discoverResources(
            filePath,
            true, // Always discover if it exists for the cache
            true,
            true,
            true
        );
        if (context?.resourceCache) {
            context.resourceCache.set(filePath, discoveredInputs);
        }
    }

    // Build inputs with content hashes (memoize hashing to avoid redundant SHA-256)
    const inputs: TaskInputs = {
        typescript: {
            path: discoveredInputs.typescript.path,
            hash: hashFileInput(discoveredInputs.typescript.path, context?.hashCache),
            needsAst: needsTsAst,
        },
    };

    // Add template with hash if present
    if (discoveredInputs.template) {
        inputs.template = {
            path: discoveredInputs.template.path,
            hash: hashFileInput(discoveredInputs.template.path, context?.hashCache),
            needsAst: needsHtmlAst && (dependencyType === 'component' || dependencyType === 'styles'),
        };
    }

    // Add styles with hashes if present
    if (discoveredInputs.styles) {
        inputs.styles = discoveredInputs.styles.map((style) => ({
            path: style.path,
            hash: hashFileInput(style.path, context?.hashCache),
            needsAst: needsCssAst && dependencyType === 'styles',
        }));
    }

    // Add spec with hash if present
    if (discoveredInputs.spec) {
        inputs.spec = {
            path: discoveredInputs.spec.path,
            hash: hashFileInput(discoveredInputs.spec.path, context?.hashCache),
            needsAst: needsSpecAst,
        };
    }

    return inputs;
};

/**
 * Builds a single task (task-centric architecture).
 *
 * Creates a Task with content-based taskId that survives file renames
 * and enables precise cache invalidation.
 *
 * @param filePath - File path
 * @param fileType - File type
 * @param rule - Resolved rule
 * @param context - Optional builder context
 * @returns Task or null if rule doesn't apply
 */
export const buildTask = (
    filePath: string,
    fileType: FileType,
    rule: ResolvedRule,
    context?: TaskBuilderContext
): Task | null => {
    // Check if rule applies to this file type
    if (!shouldApplyRule(rule, fileType)) {
        debug('planner', `      - Rule ${rule.name} skipped: does not apply to ${fileType}`);
        return null;
    }

    // Skip disabled rules
    if (rule.severity === 'off') {
        debug('planner', `      - Rule ${rule.name} skipped: disabled ('off')`);
        return null;
    }

    // Build inputs with content hashes
    const inputs = buildTaskInputsWithHashes(filePath, rule, context);

    // Calculate content-based task ID
    const taskId = calculateTaskId(rule.name, inputs, rule.options);

    return {
        taskId,
        ruleName: rule.name,
        filePath,
        severity: rule.severity,
        options: rule.options,
        inputs,
    };
};

/**
 * Builds all applicable tasks for a file (task-centric).
 *
 * @param filePath - File path
 * @param fileType - File type
 * @param rules - All resolved rules
 * @param context - Optional context
 * @returns Array of tasks
 */
export const buildTasksForFileTaskCentric = (
    filePath: string,
    fileType: FileType,
    rules: ReadonlyMap<string, ResolvedRule>,
    context?: TaskBuilderContext
): ReadonlyArray<Task> => {
    const tasks: Task[] = [];

    for (const rule of rules.values()) {
        const task = buildTask(filePath, fileType, rule, context);
        if (task) {
            tasks.push(task);
        }
    }

    return tasks;
};
