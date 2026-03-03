import { describe, it, expect } from 'vitest';
import { serializePlan, deserializePlan } from '../src/serialize.js';
import type { ExecutionPlanOutput, Task, RuleTask, FileAnalysisUnit } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRuleTask = (ruleName: string, overrides: Partial<RuleTask> = {}): RuleTask => ({
    ruleName,
    severity: 'moderate',
    options: { maxDepth: 3 },
    cacheKey: `cache-${ruleName}`,
    inputs: {
        typescript: { path: '/src/app.component.ts', hash: 'ts-hash', needsAst: true },
        template: { path: '/src/app.component.html', hash: 'tmpl-hash', needsAst: false },
    },
    ...overrides,
});

const makeTask = (ruleName: string, overrides: Partial<Task> = {}): Task => ({
    taskId: `cache-${ruleName}`,
    ruleName,
    filePath: '/src/app.component.ts',
    severity: 'moderate',
    options: { maxDepth: 3 },
    inputs: {
        typescript: { path: '/src/app.component.ts', hash: 'ts-hash', needsAst: true },
        template: { path: '/src/app.component.html', hash: 'tmpl-hash', needsAst: false },
    },
    ...overrides,
});

const makeOutput = (tasks: Task[], units: Record<string, FileAnalysisUnit>): ExecutionPlanOutput => ({
    tasks,
    plan: units,
    indexes: {
        filesNeedingTsAst: [],
        filesNeedingHtmlAst: [],
        filesNeedingCssAst: [],
        filesNeedingTypeChecker: [],
        tasksByFile: {},
        tasksByRule: {},
        tasksBySeverityLevel: { off: [], low: [], moderate: [], high: [], critical: [], info: [], warning: [], error: [], hint: [] },
        filesByType: { component: [], directive: [], pipe: [], service: [], module: [], guard: [], logic: [], template: [], style: [], config: [] },
        tasksBySeverity: { off: 0, low: 0, moderate: 0, high: 0, critical: 0, info: 0, warning: 0, error: 0, hint: 0 },
        stats: { totalFiles: 1, totalTasks: 1, avgTasksPerFile: 1, filesWithTemplates: 0, filesWithStyles: 0, filesWithSpecs: 0 },
    },
    skippedTasks: [],
});

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe('serializePlan / deserializePlan (round-trip)', () => {
    it('round-trips a basic plan with one rule', () => {
        const ruleTask = makeRuleTask('rule-a');
        const task = makeTask('rule-a');
        const unit: FileAnalysisUnit = {
            file: { path: '/src/app.component.ts', type: 'component', hash: 'file-hash' },
            tasks: [ruleTask],
        };
        const output = makeOutput([task], { '/src/app.component.ts': unit });

        const compact = serializePlan(output);
        const restored = deserializePlan(compact);

        expect(Object.keys(restored.plan)).toContain('/src/app.component.ts');
        const restoredUnit = restored.plan['/src/app.component.ts'];
        expect(restoredUnit.tasks[0].ruleName).toBe('rule-a');
        expect(restoredUnit.tasks[0].cacheKey).toBe('cache-rule-a');
        expect(restoredUnit.tasks[0].inputs.typescript.path).toBe('/src/app.component.ts');
        expect(restoredUnit.tasks[0].inputs.template?.path).toBe('/src/app.component.html');
    });

    it('round-trips needsTypeChecker flag correctly', () => {
        const ruleTask = makeRuleTask('tc-rule', { needsTypeChecker: true });
        const task = makeTask('tc-rule', { needsTypeChecker: true });
        const unit: FileAnalysisUnit = {
            file: { path: '/src/app.component.ts', type: 'component', hash: 'h' },
            tasks: [ruleTask],
        };
        const output = makeOutput([task], { '/src/app.component.ts': unit });

        const compact = serializePlan(output);
        const restored = deserializePlan(compact);

        expect(restored.plan['/src/app.component.ts'].tasks[0].needsTypeChecker).toBe(true);
    });

    it('defaults needsTypeChecker to undefined when not set', () => {
        const ruleTask = makeRuleTask('no-tc-rule');
        const task = makeTask('no-tc-rule');
        const unit: FileAnalysisUnit = {
            file: { path: '/src/app.component.ts', type: 'component', hash: 'h' },
            tasks: [ruleTask],
        };
        const output = makeOutput([task], { '/src/app.component.ts': unit });

        const compact = serializePlan(output);
        const restored = deserializePlan(compact);

        expect(restored.plan['/src/app.component.ts'].tasks[0].needsTypeChecker).toBeUndefined();
    });

    it('round-trips style inputs', () => {
        const ruleTask = makeRuleTask('styles-rule', {
            inputs: {
                typescript: { path: '/src/app.component.ts', hash: 'ts-hash', needsAst: false },
                styles: [
                    { path: '/src/app.component.scss', hash: 'scss-hash', needsAst: true },
                    { path: '/src/app.component.css', hash: 'css-hash', needsAst: false },
                ],
            },
        });
        const task = makeTask('styles-rule', {
            inputs: {
                typescript: { path: '/src/app.component.ts', hash: 'ts-hash', needsAst: false },
                styles: [
                    { path: '/src/app.component.scss', hash: 'scss-hash', needsAst: true },
                    { path: '/src/app.component.css', hash: 'css-hash', needsAst: false },
                ],
            },
        });
        const unit: FileAnalysisUnit = {
            file: { path: '/src/app.component.ts', type: 'component', hash: 'h' },
            tasks: [ruleTask],
        };
        const output = makeOutput([task], { '/src/app.component.ts': unit });

        const compact = serializePlan(output);
        const restored = deserializePlan(compact);
        const restoredTask = restored.plan['/src/app.component.ts'].tasks[0];

        expect(restoredTask.inputs.styles).toHaveLength(2);
        expect(restoredTask.inputs.styles![0].path).toBe('/src/app.component.scss');
        expect(restoredTask.inputs.styles![1].path).toBe('/src/app.component.css');
    });

    it('round-trips spec input', () => {
        const ruleTask = makeRuleTask('spec-rule', {
            inputs: {
                typescript: { path: '/src/app.component.ts', hash: 'ts-hash', needsAst: false },
                spec: { path: '/src/app.component.spec.ts', hash: 'spec-hash', needsAst: true },
            },
        });
        const task = makeTask('spec-rule', {
            inputs: {
                typescript: { path: '/src/app.component.ts', hash: 'ts-hash', needsAst: false },
                spec: { path: '/src/app.component.spec.ts', hash: 'spec-hash', needsAst: true },
            },
        });
        const unit: FileAnalysisUnit = {
            file: { path: '/src/app.component.ts', type: 'component', hash: 'h' },
            tasks: [ruleTask],
        };
        const output = makeOutput([task], { '/src/app.component.ts': unit });

        const compact = serializePlan(output);
        const restored = deserializePlan(compact);

        expect(restored.plan['/src/app.component.ts'].tasks[0].inputs.spec?.path)
            .toBe('/src/app.component.spec.ts');
    });

    it('interns repeated strings — compact plan has fewer strings than tasks', () => {
        const sharedPath = '/src/app.component.ts';
        const makeUnit = (suffix: string): [string, FileAnalysisUnit] => [
            `${sharedPath}-${suffix}`,
            {
                file: { path: `${sharedPath}-${suffix}`, type: 'component', hash: 'h' },
                tasks: [makeRuleTask('rule-shared')],
            },
        ];
        const units = Object.fromEntries([makeUnit('a'), makeUnit('b'), makeUnit('c')]);
        const output = makeOutput([], units);

        const compact = serializePlan(output);
        // The rule name "rule-shared" appears 3 times in tasks but only once in the rules intern table
        expect(compact.r.filter((r) => r === 'rule-shared')).toHaveLength(1);
    });

    it('compact format has version = 1', () => {
        const unit: FileAnalysisUnit = {
            file: { path: '/src/app.component.ts', type: 'component', hash: 'h' },
            tasks: [makeRuleTask('r')],
        };
        const output = makeOutput([], { '/src/app.component.ts': unit });
        const compact = serializePlan(output);
        expect(compact.v).toBe(1);
    });

    it('round-trips an empty plan', () => {
        const output = makeOutput([], {});
        const compact = serializePlan(output);
        const restored = deserializePlan(compact);
        expect(Object.keys(restored.plan)).toHaveLength(0);
        expect(restored.tasks).toHaveLength(0);
    });

    it('restored tasks array has correct length', () => {
        const unit: FileAnalysisUnit = {
            file: { path: '/src/app.component.ts', type: 'component', hash: 'h' },
            tasks: [makeRuleTask('rule-a'), makeRuleTask('rule-b')],
        };
        const output = makeOutput([], { '/src/app.component.ts': unit });
        const compact = serializePlan(output);
        const restored = deserializePlan(compact);
        expect(restored.tasks).toHaveLength(2);
    });
});
