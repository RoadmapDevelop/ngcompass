/**
 * Task Builder Tests
 */

import { describe, it, expect } from 'vitest';
import {
    shouldApplyRule,
    buildRuleTask,
    generateCacheKey,
    filterRulesByAstRequirement,
    groupRulesByDependencyType,
} from '../../src/planner/task-builder.js';
import type { ResolvedRule, RuleSeverity } from '../../src/rules/types.js';

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

describe('buildRuleTask', () => {
    it('returns null for rules that do not apply', () => {
        const rule = createMockRule('template-check', 'component');
        const task = buildRuleTask('src/app/auth.service.ts', 'service', rule, 'key123');

        expect(task).toBeNull();
    });

    it('returns null for disabled rules', () => {
        const rule = createMockRule('no-console', 'standalone', {}, 'off');

        const task = buildRuleTask('src/app/utils.ts', 'logic', rule, 'key123');
        expect(task).toBeNull();
    });

    it('builds task for applicable rule', () => {
        const rule = createMockRule('no-console', 'standalone', { tsAst: true });
        const task = buildRuleTask('src/app/utils.ts', 'logic', rule, 'key123');

        expect(task).not.toBeNull();
        expect(task?.ruleName).toBe('no-console');
        expect(task?.severity).toBe('moderate');
        expect(task?.cacheKey).toBe('key123');
        expect(task?.inputs.typescript.needsAst).toBe(true);
    });

    it('includes options in task', () => {
        const rule = createMockRule('no-console', 'standalone', {}, 'moderate', { allowWarnings: true });

        const task = buildRuleTask('src/app/utils.ts', 'logic', rule, 'key123');

        expect(task?.options).toEqual({ allowWarnings: true });
    });
});

describe('generateCacheKey', () => {
    it('generates consistent cache keys', () => {
        const key1 = generateCacheKey('file.ts', 'no-console');
        const key2 = generateCacheKey('file.ts', 'no-console');

        expect(key1).toBe(key2);
    });

    it('generates different keys for different inputs', () => {
        const key1 = generateCacheKey('file1.ts', 'no-console');
        const key2 = generateCacheKey('file2.ts', 'no-console');
        const key3 = generateCacheKey('file1.ts', 'no-debugger');

        expect(key1).not.toBe(key2);
        expect(key1).not.toBe(key3);
    });

    it('generates base64 encoded keys', () => {
        const key = generateCacheKey('file.ts', 'no-console');

        // Should be valid base64
        expect(() => Buffer.from(key, 'base64')).not.toThrow();
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

        expect(grouped.standalone).toHaveLength(2);
        expect(grouped.component).toHaveLength(1);
        expect(grouped.styles).toHaveLength(1);
        expect(grouped.imports).toHaveLength(0);
    });

    it('returns empty arrays for unused types', () => {
        const rules = new Map<string, ResolvedRule>([
            ['rule1', createMockRule('rule1', 'standalone')],
        ]);

        const grouped = groupRulesByDependencyType(rules);

        expect(grouped.component).toEqual([]);
        expect(grouped.styles).toEqual([]);
        expect(grouped.imports).toEqual([]);
    });
});
