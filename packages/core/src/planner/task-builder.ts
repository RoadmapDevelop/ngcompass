/**
 * Task Builder
 *
 * Pure functions for building rule tasks based on file type and rule metadata.
 * Matches rules to files and creates executable tasks.
 */

import type { ResolvedRule } from '../rules/types.js';
import type { FileType, Task, TaskInputs } from './types.js';
import { discoverResources } from './resources.js';
import { hashFile, calculateTaskId } from './hashing.js';
import { debug } from '@ngcompass/common';

/**
 * Context for task building to enable memoization/caching.
 */
export interface TaskBuilderContext {
    hashCache?: Map<string, string>;
    resourceCache?: Map<string, TaskInputs>;
    directoryCache?: Map<string, string[]>;
    globalHash?: string;
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
const buildTaskInputsWithHashes = async (
    filePath: string,
    rule: ResolvedRule,
    context?: TaskBuilderContext
): Promise<TaskInputs> => {
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
        discoveredInputs = await discoverResources(
            filePath,
            true, // Always discover if it exists for the cache
            true,
            true,
            true,
            context?.directoryCache
        );
        if (context?.resourceCache) {
            context.resourceCache.set(filePath, discoveredInputs);
        }
    }

    // Build inputs with content hashes (memoize hashing to avoid redundant SHA-256)
    const inputs: TaskInputs = {
        typescript: {
            path: discoveredInputs.typescript.path,
            hash: await hashFile(discoveredInputs.typescript.path, context?.hashCache),
            needsAst: needsTsAst,
        },
    };

    // Add template with hash if present
    if (discoveredInputs.template) {
        inputs.template = {
            path: discoveredInputs.template.path,
            hash: await hashFile(discoveredInputs.template.path, context?.hashCache),
            needsAst: needsHtmlAst && (dependencyType === 'component' || dependencyType === 'styles'),
        };
    } else if (dependencyType === 'component' && needsHtmlAst) {
        // Fallback for inline templates
        inputs.template = {
            path: filePath,
            hash: inputs.typescript?.hash || '',
            needsAst: true
        };
    }

    // Add styles with hashes if present
    if (discoveredInputs.styles) {
        inputs.styles = await Promise.all(discoveredInputs.styles.map(async (style) => ({
            path: style.path,
            hash: await hashFile(style.path, context?.hashCache),
            needsAst: needsCssAst && dependencyType === 'styles',
        })));
    }

    // Add spec with hash if present
    if (discoveredInputs.spec) {
        inputs.spec = {
            path: discoveredInputs.spec.path,
            hash: await hashFile(discoveredInputs.spec.path, context?.hashCache),
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
export const buildTask = async (
    filePath: string,
    fileType: FileType,
    rule: ResolvedRule,
    context?: TaskBuilderContext
): Promise<Task | null> => {
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
    const inputs = await buildTaskInputsWithHashes(filePath, rule, context);

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
export const buildTasksForFileTaskCentric = async (
    filePath: string,
    fileType: FileType,
    rules: ReadonlyMap<string, ResolvedRule>,
    context?: TaskBuilderContext
): Promise<ReadonlyArray<Task>> => {
    const tasks: Task[] = [];

    for (const rule of rules.values()) {
        const task = await buildTask(filePath, fileType, rule, context);
        if (task) {
            tasks.push(task);
        }
    }

    return tasks;
};
