/**
 * Task Builder Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    shouldApplyRule,
    buildTask,
    filterRulesByAstRequirement,
    groupRulesByDependencyType,
} from '../../src/planner/task-builder.js';
import type { ResolvedRule, RuleSeverity } from '../../src/rules/types.js';
import type { TaskInputs } from '../../src/planner/types.js';

// Mock resources and hashing
vi.mock('../../src/planner/resources.js', () => ({
    discoverResources: vi.fn(),
}));

vi.mock('../../src/planner/hashing.js', () => ({
    hashFile: vi.fn().mockReturnValue('mock-hash'),
    calculateTaskId: vi.fn().mockReturnValue('mock-task-id'),
}));

import { discoverResources } from '../../src/planner/resources.js';

// Mock resolved rules
const createMockRule = (
    name: string,
    dependencyType: 'standalone' | 'component' | 'styles' | 'imports',
    requires: {
        tsAst?: boolean;
        htmlAst?: boolean;
        cssAst?: boolean;
        typeChecker?: boolean;
    } = {},
    severity: RuleSeverity = 'moderate',
    options: Record<string, unknown> = {}
): ResolvedRule => ({
    name,
    severity,
    options,
    metadata: {
        name,
        description: `Test rule ${name}`,
        category: 'test',
        dependencyType,
        requires,
    },
});

describe('shouldApplyRule', () => {
    it('applies standalone rules to all TS file types', () => {
        const rule = createMockRule('no-console', 'standalone');

        expect(shouldApplyRule(rule, 'component')).toBe(true);
        expect(shouldApplyRule(rule, 'service')).toBe(true);
        expect(shouldApplyRule(rule, 'module')).toBe(true);
        expect(shouldApplyRule(rule, 'logic')).toBe(true);
    });

    it('does not apply standalone rules to non-TS files', () => {
        const rule = createMockRule('no-console', 'standalone');

        expect(shouldApplyRule(rule, 'template')).toBe(false);
        expect(shouldApplyRule(rule, 'style')).toBe(false);
        expect(shouldApplyRule(rule, 'config')).toBe(false);
    });

    it('applies component rules only to components and directives', () => {
        const rule = createMockRule('template-check', 'component');

        expect(shouldApplyRule(rule, 'component')).toBe(true);
        expect(shouldApplyRule(rule, 'directive')).toBe(true);
        expect(shouldApplyRule(rule, 'service')).toBe(false);
        expect(shouldApplyRule(rule, 'logic')).toBe(false);
    });

    it('applies styles rules only to components', () => {
        const rule = createMockRule('no-inline-styles', 'styles');

        expect(shouldApplyRule(rule, 'component')).toBe(true);
        expect(shouldApplyRule(rule, 'directive')).toBe(false);
        expect(shouldApplyRule(rule, 'service')).toBe(false);
    });

    it('applies imports rules to all TS file types', () => {
        const rule = createMockRule('no-circular-imports', 'imports');

        expect(shouldApplyRule(rule, 'component')).toBe(true);
        expect(shouldApplyRule(rule, 'service')).toBe(true);
        expect(shouldApplyRule(rule, 'module')).toBe(true);
        expect(shouldApplyRule(rule, 'logic')).toBe(true);
    });
});

describe('buildTask', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (discoverResources as any).mockResolvedValue({
            typescript: { path: 'src/app/utils.ts', hash: 'mock-hash', needsAst: true },
        } as TaskInputs);
    });

    it('returns null for rules that do not apply', async () => {
        const rule = createMockRule('template-check', 'component');
        const task = await buildTask('src/app/auth.service.ts', 'service', rule);

        expect(task).toBeNull();
    });

    it('returns null for disabled rules', async () => {
        const rule = createMockRule('no-console', 'standalone', {}, 'off');

        const task = await buildTask('src/app/utils.ts', 'logic', rule);
        expect(task).toBeNull();
    });

    it('builds task for applicable rule', async () => {
        const rule = createMockRule('no-console', 'standalone', { tsAst: true });
        const task = await buildTask('src/app/utils.ts', 'logic', rule);

        expect(task).not.toBeNull();
        expect(task?.ruleName).toBe('no-console');
        expect(task?.severity).toBe('moderate');
        expect(task?.taskId).toBe('mock-task-id');
        expect(task?.inputs.typescript.needsAst).toBe(true);
    });

    it('includes options in task', async () => {
        const rule = createMockRule('no-console', 'standalone', {}, 'moderate', { allowWarnings: true });

        const task = await buildTask('src/app/utils.ts', 'logic', rule);

        expect(task?.options).toEqual({ allowWarnings: true });
    });
});

describe('filterRulesByAstRequirement', () => {
    it('filters rules needing TypeScript AST', () => {
        const rules = new Map<string, ResolvedRule>([
            ['rule1', createMockRule('rule1', 'standalone', { tsAst: true })],
            ['rule2', createMockRule('rule2', 'standalone', { htmlAst: true })],
            ['rule3', createMockRule('rule3', 'standalone', { tsAst: true })],
        ]);

        const filtered = filterRulesByAstRequirement(rules, 'tsAst');

        expect(filtered).toHaveLength(2);
        expect(filtered.map((r) => r.name)).toEqual(['rule1', 'rule3']);
    });

    it('filters rules needing HTML AST', () => {
        const rules = new Map<string, ResolvedRule>([
            ['rule1', createMockRule('rule1', 'component', { htmlAst: true })],
            ['rule2', createMockRule('rule2', 'standalone', { tsAst: true })],
        ]);

        const filtered = filterRulesByAstRequirement(rules, 'htmlAst');

        expect(filtered).toHaveLength(1);
        expect(filtered[0].name).toBe('rule1');
    });

    it('filters rules needing TypeChecker', () => {
        const rules = new Map<string, ResolvedRule>([
            ['rule1', createMockRule('rule1', 'standalone', { typeChecker: true })],
            ['rule2', createMockRule('rule2', 'standalone', { tsAst: true })],
        ]);

        const filtered = filterRulesByAstRequirement(rules, 'typeChecker');

        expect(filtered).toHaveLength(1);
        expect(filtered[0].name).toBe('rule1');
    });

    it('returns empty array if no rules match', () => {
        const rules = new Map<string, ResolvedRule>([
            ['rule1', createMockRule('rule1', 'standalone', { tsAst: true })],
        ]);

        const filtered = filterRulesByAstRequirement(rules, 'cssAst');

        expect(filtered).toHaveLength(0);
    });
});

describe('groupRulesByDependencyType', () => {
    it('groups rules by dependency type', () => {
        const rules = new Map<string, ResolvedRule>([
            ['rule1', createMockRule('rule1', 'standalone')],
            ['rule2', createMockRule('rule2', 'component')],
            ['rule3', createMockRule('rule3', 'standalone')],
            ['rule4', createMockRule('rule4', 'styles')],
        ]);

        const grouped = groupRulesByDependencyType(rules);

        expect(grouped.allTs).toHaveLength(2);
        expect(grouped.component).toHaveLength(2); // component + styles
        expect(grouped.directive).toHaveLength(1); // component only
    });

    it('returns empty arrays for unused types', () => {
        const rules = new Map<string, ResolvedRule>([
            ['rule1', createMockRule('rule1', 'standalone')],
        ]);

        const grouped = groupRulesByDependencyType(rules);

        expect(grouped.component).toEqual([]);
        expect(grouped.directive).toEqual([]);
    });
});
