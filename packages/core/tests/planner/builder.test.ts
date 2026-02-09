/**
 * Execution Plan Builder Integration Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildExecutionPlan, validateExecutionPlan, getExecutionPlanSummary } from '../../src/planner/builder.js';
import type { ResolvedRule, RuleSeverity } from '../../src/rules/types.js';
import type { TaskInputs } from '../../src/planner/types.js';
import * as resources from '../../src/planner/resources.js';



vi.mock('../../src/planner/hashing.js', () => ({
    initHasher: vi.fn(),
    calculateGlobalHash: vi.fn().mockResolvedValue('global-hash'),
    hashFile: vi.fn().mockResolvedValue('file-hash'),
    calculateTaskId: vi.fn().mockReturnValue('task-id'),
    hashTaskInputs: vi.fn().mockResolvedValue('inputs-hash'),
    calculateFileHash: vi.fn().mockReturnValue('file-hash'),
}));



// Mock resolved rules
const createMockRule = (
    name: string,
    dependencyType: 'standalone' | 'component' | 'styles' | 'imports',
    requires: any = {},
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

describe('buildExecutionPlan', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(resources, 'discoverResources').mockResolvedValue({
            typescript: { path: 'src/app/utils.ts', hash: 'file-hash', needsAst: true },
        } as TaskInputs);
    });

    it('builds execution plan for single file', async () => {
        const files = ['src/app/utils.ts'];
        const rules = new Map<string, ResolvedRule>([
            ['no-console', createMockRule('no-console', 'standalone', { tsAst: true })],
        ]);

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(Object.keys(result.data.plan)).toHaveLength(1);
            expect(result.data.plan['src/app/utils.ts']).toBeDefined();
            expect(result.data.plan['src/app/utils.ts'].tasks).toHaveLength(1);
        }
    });

    it('builds execution plan for multiple files', async () => {
        const files = [
            'src/app/utils.ts',
            'src/app/user.component.ts',
            'src/app/auth.service.ts',
        ];
        const rules = new Map<string, ResolvedRule>([
            ['no-console', createMockRule('no-console', 'standalone', { tsAst: true })],
            ['template-check', createMockRule('template-check', 'component', { htmlAst: true })],
        ]);

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(Object.keys(result.data.plan)).toHaveLength(3);
        }
    });

    it('applies only applicable rules to each file', async () => {
        const files = [
            'src/app/utils.ts',
            'src/app/user.component.ts',
        ];
        const rules = new Map<string, ResolvedRule>([
            ['no-console', createMockRule('no-console', 'standalone')],
            ['template-check', createMockRule('template-check', 'component')],
        ]);

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            // utils.ts should only have no-console
            const utilsTasks = result.data.plan['src/app/utils.ts'].tasks;
            expect(utilsTasks).toHaveLength(1);
            expect(utilsTasks[0].ruleName).toBe('no-console');

            // user.component.ts should have both rules
            const componentTasks = result.data.plan['src/app/user.component.ts'].tasks;
            expect(componentTasks).toHaveLength(2);
            expect(componentTasks.map((t) => t.ruleName)).toContain('no-console');
            expect(componentTasks.map((t) => t.ruleName)).toContain('template-check');
        }
    });

    it('builds indexes correctly', async () => {
        const files = [
            'src/app/user.component.ts',
            'src/app/auth.service.ts',
        ];
        const rules = new Map<string, ResolvedRule>([
            ['no-console', createMockRule('no-console', 'standalone', { tsAst: true })],
        ]);

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            // Check stats
            expect(result.data.indexes.stats.totalFiles).toBe(2);
            expect(result.data.indexes.stats.totalTasks).toBeGreaterThan(0);

            // Check file type index
            expect(result.data.indexes.filesByType.component).toContain('src/app/user.component.ts');
            expect(result.data.indexes.filesByType.service).toContain('src/app/auth.service.ts');

            // Check tasks by rule
            expect(result.data.indexes.tasksByRule['no-console']).toHaveLength(2);
        }
    });

    it('returns error for empty file list', async () => {
        const files: string[] = [];
        const rules = new Map<string, ResolvedRule>([
            ['no-console', createMockRule('no-console', 'standalone')],
        ]);

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.message).toContain('No files');
        }
    });

    it('returns error for empty rules', async () => {
        const files = ['src/app/utils.ts'];
        const rules = new Map<string, ResolvedRule>();

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.message).toContain('No rules');
        }
    });

    it('skips disabled rules', async () => {
        const files = ['src/app/utils.ts'];
        const disabledRule = createMockRule('no-console', 'standalone', {}, 'off');

        const rules = new Map<string, ResolvedRule>([
            ['no-console', disabledRule],
        ]);

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            // No tasks should be created for disabled rules
            expect(Object.keys(result.data.plan)).toHaveLength(0);
        }
    });

    it('assigns unique cache keys to each task', async () => {
        const files = ['src/app/utils.ts'];
        const rules = new Map<string, ResolvedRule>([
            ['no-console', createMockRule('no-console', 'standalone')],
            ['no-debugger', createMockRule('no-debugger', 'standalone')],
        ]);

        // Mock calculateTaskId to return unique values
        const { calculateTaskId } = await import('../../src/planner/hashing.js');
        (calculateTaskId as any).mockReset();
        (calculateTaskId as any)
            .mockReturnValueOnce('task-id-1')
            .mockReturnValueOnce('task-id-2');

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });


        expect(result.ok).toBe(true);
        if (result.ok) {
            const tasks = result.data.plan['src/app/utils.ts'].tasks;
            const cacheKeys = tasks.map((t) => t.cacheKey);

            // All task IDs should be unique
            expect(new Set(cacheKeys).size).toBe(cacheKeys.length);
        }
    });
});

describe('validateExecutionPlan', () => {
    it('validates correct execution plan', async () => {
        const files = ['src/app/utils.ts'];
        const rules = new Map<string, ResolvedRule>([
            ['no-console', createMockRule('no-console', 'standalone')],
        ]);

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(validateExecutionPlan(result.data)).toBe(true);
        }
    });

    it('rejects empty plan', () => {
        const output = {
            plan: {},
            indexes: {
                filesNeedingTsAst: [],
                filesNeedingHtmlAst: [],
                filesNeedingCssAst: [],
                filesNeedingTypeChecker: [],
                tasksByRule: {},
                filesByType: {} as any,
                tasksBySeverity: {} as any,
                stats: {
                    totalFiles: 0,
                    totalTasks: 0,
                    avgTasksPerFile: 0,
                    filesWithTemplates: 0,
                    filesWithStyles: 0,
                    filesWithSpecs: 0,
                },
            },
        };

        expect(validateExecutionPlan(output as any)).toBe(false);
    });
});

describe('getExecutionPlanSummary', () => {
    it('generates summary string', async () => {
        const files = ['src/app/utils.ts', 'src/app/user.component.ts'];
        const rules = new Map<string, ResolvedRule>([
            ['no-console', createMockRule('no-console', 'standalone')],
        ]);

        const result = await buildExecutionPlan({ files, rules, rootDir: '/project' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            const summary = getExecutionPlanSummary(result.data);

            expect(summary).toContain('Total files:');
            expect(summary).toContain('Total tasks:');
            expect(summary).toContain('Tasks by severity:');
        }
    });
});
