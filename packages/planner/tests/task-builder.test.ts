import { describe, it, expect, beforeAll } from 'vitest';
import { initHasher } from '@ngcompass/cache';
import {
    shouldApplyRule,
    buildTask,
    buildTasksForFileTaskCentric,
    filterRulesByAstRequirement,
    groupRulesByDependencyType,
} from '../src/task-builder.js';
import type { ResolvedRule } from '@ngcompass/common';
import type { FileType } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRule = (
    name: string,
    dependencyType: 'standalone' | 'component' | 'styles' | 'imports' = 'standalone',
    requires: Record<string, boolean> = { tsAst: true },
    overrides: Partial<ResolvedRule> = {}
): ResolvedRule =>
    ({
        name,
        severity: 'moderate',
        options: {},
        metadata: { dependencyType, requires },
        ...overrides,
    } as ResolvedRule);

beforeAll(async () => {
    await initHasher();
});

// ---------------------------------------------------------------------------
// shouldApplyRule
// ---------------------------------------------------------------------------

describe('shouldApplyRule', () => {
    it('applies standalone rule to all TypeScript-like file types', () => {
        const rule = makeRule('r', 'standalone');
        const tsTypes: FileType[] = ['component', 'directive', 'pipe', 'service', 'module', 'guard', 'logic'];
        for (const t of tsTypes) {
            expect(shouldApplyRule(rule, t)).toBe(true);
        }
    });

    it('does NOT apply standalone rule to template/style/config', () => {
        const rule = makeRule('r', 'standalone');
        expect(shouldApplyRule(rule, 'template')).toBe(false);
        expect(shouldApplyRule(rule, 'style')).toBe(false);
        expect(shouldApplyRule(rule, 'config')).toBe(false);
    });

    it('applies component rule only to component and directive types', () => {
        const rule = makeRule('r', 'component');
        expect(shouldApplyRule(rule, 'component')).toBe(true);
        expect(shouldApplyRule(rule, 'directive')).toBe(true);
        expect(shouldApplyRule(rule, 'service')).toBe(false);
    });

    it('applies styles rule only to components', () => {
        const rule = makeRule('r', 'styles');
        expect(shouldApplyRule(rule, 'component')).toBe(true);
        expect(shouldApplyRule(rule, 'directive')).toBe(false);
        expect(shouldApplyRule(rule, 'service')).toBe(false);
    });

    it('applies imports rule to all TypeScript-like types', () => {
        const rule = makeRule('r', 'imports');
        expect(shouldApplyRule(rule, 'component')).toBe(true);
        expect(shouldApplyRule(rule, 'service')).toBe(true);
        expect(shouldApplyRule(rule, 'template')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// buildTask
// ---------------------------------------------------------------------------

describe('buildTask', () => {
    it('returns null for a disabled rule (severity="off")', async () => {
        const rule = makeRule('r', 'standalone', {}, { severity: 'off' });
        const task = await buildTask('/a.service.ts', 'service', rule);
        expect(task).toBeNull();
    });

    it('returns null when the rule does not apply to the file type', async () => {
        const rule = makeRule('r', 'component');
        const task = await buildTask('/a.service.ts', 'service', rule);
        expect(task).toBeNull();
    });

    it('returns a Task when the rule applies', async () => {
        const rule = makeRule('r', 'standalone');
        const task = await buildTask('/a.service.ts', 'service', rule);
        expect(task).not.toBeNull();
        expect(task!.ruleName).toBe('r');
        expect(task!.filePath).toBe('/a.service.ts');
        expect(task!.taskId).toBeTruthy();
    });

    it('sets needsTypeChecker when rule requires typeChecker', async () => {
        const rule = makeRule('r', 'standalone', { tsAst: true, typeChecker: true });
        const task = await buildTask('/a.service.ts', 'service', rule);
        expect(task!.needsTypeChecker).toBe(true);
    });

    it('does not set needsTypeChecker when rule does not require it', async () => {
        const rule = makeRule('r', 'standalone', { tsAst: true });
        const task = await buildTask('/a.service.ts', 'service', rule);
        expect(task!.needsTypeChecker).toBe(false);
    });

    it('uses cacheKeyCtx from context to scope the taskId', async () => {
        const rule = makeRule('r', 'standalone');
        const ctx1 = { cacheKeyCtx: { toolVersion: '1.0.0', ruleRegistryHash: 'h', schemaVersion: '1', parserVersion: 'p', platform: 'linux' } };
        const ctx2 = { cacheKeyCtx: { toolVersion: '2.0.0', ruleRegistryHash: 'h', schemaVersion: '1', parserVersion: 'p', platform: 'linux' } };
        const task1 = await buildTask('/a.service.ts', 'service', rule, ctx1);
        const task2 = await buildTask('/a.service.ts', 'service', rule, ctx2);
        // Different tool versions must produce different task IDs
        expect(task1!.taskId).not.toBe(task2!.taskId);
    });

    it('produces a deterministic taskId for the same inputs', async () => {
        const rule = makeRule('r', 'standalone');
        const t1 = await buildTask('/a.service.ts', 'service', rule);
        const t2 = await buildTask('/a.service.ts', 'service', rule);
        expect(t1!.taskId).toBe(t2!.taskId);
    });
});

// ---------------------------------------------------------------------------
// buildTasksForFileTaskCentric
// ---------------------------------------------------------------------------

describe('buildTasksForFileTaskCentric', () => {
    it('returns tasks only for applicable rules', async () => {
        const rules = new Map([
            ['component-rule', makeRule('component-rule', 'component')],
            ['standalone-rule', makeRule('standalone-rule', 'standalone')],
        ]);
        const tasks = await buildTasksForFileTaskCentric('/a.service.ts', 'service', rules);
        // component-rule should not apply to service; standalone-rule should
        expect(tasks).toHaveLength(1);
        expect(tasks[0].ruleName).toBe('standalone-rule');
    });

    it('returns empty array when no rules apply', async () => {
        const rules = new Map([['component-rule', makeRule('component-rule', 'component')]]);
        const tasks = await buildTasksForFileTaskCentric('/a.service.ts', 'service', rules);
        expect(tasks).toHaveLength(0);
    });

    it('returns empty array for an empty rule set', async () => {
        const tasks = await buildTasksForFileTaskCentric('/a.service.ts', 'service', new Map());
        expect(tasks).toHaveLength(0);
    });

    it('uses resourceCache to avoid duplicate discovery work', async () => {
        const rule = makeRule('r', 'standalone');
        const rules = new Map([['r', rule]]);
        const context = { resourceCache: new Map(), hashCache: new Map() };
        await buildTasksForFileTaskCentric('/a.service.ts', 'service', rules, context);
        // After first run the resource cache should contain the file
        expect(context.resourceCache.has('/a.service.ts')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// filterRulesByAstRequirement
// ---------------------------------------------------------------------------

describe('filterRulesByAstRequirement', () => {
    it('returns only rules that require the given AST type', () => {
        const rules = new Map([
            ['ts-rule', makeRule('ts-rule', 'standalone', { tsAst: true })],
            ['html-rule', makeRule('html-rule', 'component', { htmlAst: true })],
            ['tc-rule', makeRule('tc-rule', 'standalone', { typeChecker: true })],
        ]);
        const tsRules = filterRulesByAstRequirement(rules, 'tsAst');
        expect(tsRules.map((r) => r.name)).toContain('ts-rule');
        expect(tsRules.map((r) => r.name)).not.toContain('html-rule');

        const tcRules = filterRulesByAstRequirement(rules, 'typeChecker');
        expect(tcRules.map((r) => r.name)).toContain('tc-rule');
    });
});

// ---------------------------------------------------------------------------
// groupRulesByDependencyType
// ---------------------------------------------------------------------------

describe('groupRulesByDependencyType', () => {
    it('groups rules by their dependencyType', () => {
        const rules = new Map([
            ['r-standalone', makeRule('r-standalone', 'standalone')],
            ['r-component', makeRule('r-component', 'component')],
            ['r-styles', makeRule('r-styles', 'styles')],
            ['r-imports', makeRule('r-imports', 'imports')],
        ]);
        const groups = groupRulesByDependencyType(rules);
        expect(groups['standalone']).toHaveLength(1);
        expect(groups['component']).toHaveLength(1);
        expect(groups['styles']).toHaveLength(1);
        expect(groups['imports']).toHaveLength(1);
    });
});
