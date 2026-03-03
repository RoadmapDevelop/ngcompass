import { describe, it, expect } from 'vitest';
import {
    buildIndexes,
    getFilesForRules,
    getTotalTasks,
    getTasksCountBySeverity,
} from '../src/indexes.js';
import type { ExecutionPlan, Task } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTask = (id: string, filePath: string, ruleName: string, opts: Partial<Task> = {}): Task => ({
    taskId: id,
    ruleName,
    filePath,
    severity: 'moderate',
    options: {},
    inputs: {
        typescript: { path: filePath, hash: `hash-${id}`, needsAst: false },
    },
    ...opts,
});

const makePlan = (tasks: Task[]): ExecutionPlan => {
    const plan: Record<string, any> = {};
    for (const task of tasks) {
        if (!plan[task.filePath]) {
            plan[task.filePath] = {
                file: { path: task.filePath, type: 'component', hash: 'file-hash' },
                tasks: [],
            };
        }
        plan[task.filePath].tasks.push({
            ruleName: task.ruleName,
            severity: task.severity,
            options: task.options,
            cacheKey: task.taskId,
            inputs: task.inputs,
            needsTypeChecker: task.needsTypeChecker,
        });
    }
    return plan;
};

// ---------------------------------------------------------------------------
// buildIndexes
// ---------------------------------------------------------------------------

describe('buildIndexes', () => {
    it('builds filesNeedingTsAst correctly', () => {
        const task = makeTask('t1', '/app.component.ts', 'rule-ts', {
            inputs: {
                typescript: { path: '/app.component.ts', hash: 'h', needsAst: true },
            },
        });
        const plan = makePlan([task]);
        const indexes = buildIndexes(plan, [task]);
        expect(indexes.filesNeedingTsAst).toContain('/app.component.ts');
    });

    it('builds filesNeedingHtmlAst correctly', () => {
        const task = makeTask('t1', '/app.component.ts', 'rule-html', {
            inputs: {
                typescript: { path: '/app.component.ts', hash: 'h', needsAst: false },
                template: { path: '/app.component.html', hash: 'tmpl', needsAst: true },
            },
        });
        const plan = makePlan([task]);
        const indexes = buildIndexes(plan, [task]);
        expect(indexes.filesNeedingHtmlAst).toContain('/app.component.ts');
    });

    it('builds filesNeedingCssAst correctly', () => {
        const task = makeTask('t1', '/app.component.ts', 'rule-css', {
            inputs: {
                typescript: { path: '/app.component.ts', hash: 'h', needsAst: false },
                styles: [{ path: '/app.component.scss', hash: 'scss', needsAst: true }],
            },
        });
        const plan = makePlan([task]);
        const indexes = buildIndexes(plan, [task]);
        expect(indexes.filesNeedingCssAst).toContain('/app.component.ts');
    });

    it('builds filesNeedingTypeChecker correctly', () => {
        const task = makeTask('t1', '/app.component.ts', 'rule-tc', {
            needsTypeChecker: true,
        });
        const plan = makePlan([task]);
        const indexes = buildIndexes(plan, [task]);
        expect(indexes.filesNeedingTypeChecker).toContain('/app.component.ts');
    });

    it('does NOT include file in filesNeedingTypeChecker when needsTypeChecker is false', () => {
        const task = makeTask('t1', '/app.component.ts', 'rule-no-tc', {
            needsTypeChecker: false,
        });
        const plan = makePlan([task]);
        const indexes = buildIndexes(plan, [task]);
        expect(indexes.filesNeedingTypeChecker).not.toContain('/app.component.ts');
    });

    it('does NOT include file in filesNeedingTypeChecker when needsTypeChecker is undefined', () => {
        const task = makeTask('t1', '/app.component.ts', 'rule-no-tc');
        const plan = makePlan([task]);
        const indexes = buildIndexes(plan, [task]);
        expect(indexes.filesNeedingTypeChecker).toHaveLength(0);
    });

    it('returns sorted filesNeedingTypeChecker', () => {
        const t1 = makeTask('t1', '/z-file.ts', 'rule-tc', { needsTypeChecker: true });
        const t2 = makeTask('t2', '/a-file.ts', 'rule-tc', { needsTypeChecker: true });
        const plan = makePlan([t1, t2]);
        const indexes = buildIndexes(plan, [t1, t2]);
        expect(indexes.filesNeedingTypeChecker).toEqual(['/a-file.ts', '/z-file.ts']);
    });

    it('builds tasksByRule index', () => {
        const t1 = makeTask('t1', '/a.ts', 'rule-a');
        const t2 = makeTask('t2', '/b.ts', 'rule-a');
        const t3 = makeTask('t3', '/c.ts', 'rule-b');
        const plan = makePlan([t1, t2, t3]);
        const indexes = buildIndexes(plan, [t1, t2, t3]);
        expect(indexes.tasksByRule['rule-a']).toHaveLength(2);
        expect(indexes.tasksByRule['rule-b']).toHaveLength(1);
    });

    it('builds tasksByFile index', () => {
        const t1 = makeTask('t1', '/a.ts', 'rule-a');
        const t2 = makeTask('t2', '/a.ts', 'rule-b');
        const plan = makePlan([t1, t2]);
        const indexes = buildIndexes(plan, [t1, t2]);
        expect(indexes.tasksByFile['/a.ts']).toHaveLength(2);
    });

    it('computes correct stats', () => {
        const t1 = makeTask('t1', '/a.ts', 'rule-a');
        const t2 = makeTask('t2', '/a.ts', 'rule-b');
        const t3 = makeTask('t3', '/b.ts', 'rule-a');
        const plan = makePlan([t1, t2, t3]);
        const indexes = buildIndexes(plan, [t1, t2, t3]);

        expect(indexes.stats.totalFiles).toBe(2);
        expect(indexes.stats.totalTasks).toBe(3);
        expect(indexes.stats.avgTasksPerFile).toBeCloseTo(1.5);
    });

    it('works without tasks argument (backward compat overload)', () => {
        const t1 = makeTask('t1', '/a.ts', 'rule-a');
        const plan = makePlan([t1]);
        // Call without tasks — should not throw
        const indexes = buildIndexes(plan);
        expect(indexes.stats.totalFiles).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// getFilesForRules
// ---------------------------------------------------------------------------

describe('getFilesForRules', () => {
    it('returns files for matching rules', () => {
        const index = {
            'rule-a': ['/a.ts', '/b.ts'],
            'rule-b': ['/c.ts'],
        };
        const files = getFilesForRules(index, ['rule-a', 'rule-b']);
        expect(files).toContain('/a.ts');
        expect(files).toContain('/b.ts');
        expect(files).toContain('/c.ts');
    });

    it('deduplicates files appearing in multiple rules', () => {
        const index = {
            'rule-a': ['/shared.ts'],
            'rule-b': ['/shared.ts'],
        };
        const files = getFilesForRules(index, ['rule-a', 'rule-b']);
        expect(files).toHaveLength(1);
        expect(files[0]).toBe('/shared.ts');
    });

    it('returns empty for unknown rules', () => {
        const index = { 'rule-a': ['/a.ts'] };
        const files = getFilesForRules(index, ['unknown-rule']);
        expect(files).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// getTotalTasks / getTasksCountBySeverity
// ---------------------------------------------------------------------------

describe('getTotalTasks', () => {
    it('returns total task count from indexes', () => {
        const tasks = [makeTask('t1', '/a.ts', 'r'), makeTask('t2', '/b.ts', 'r')];
        const plan = makePlan(tasks);
        const indexes = buildIndexes(plan, tasks);
        expect(getTotalTasks(indexes)).toBe(2);
    });
});

describe('getTasksCountBySeverity', () => {
    it('returns count for a given severity level', () => {
        const t1 = makeTask('t1', '/a.ts', 'r', { severity: 'high' });
        const t2 = makeTask('t2', '/b.ts', 'r', { severity: 'moderate' });
        const plan = makePlan([t1, t2]);
        const indexes = buildIndexes(plan, [t1, t2]);
        expect(getTasksCountBySeverity(indexes, 'high')).toBe(1);
        expect(getTasksCountBySeverity(indexes, 'moderate')).toBe(1);
        expect(getTasksCountBySeverity(indexes, 'low')).toBe(0);
    });
});
