import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerAnalyzeCommand } from '../../src/commands/analyze.js';

import * as configModule from '@ngcompass/config';
import * as rulesModule from '@ngcompass/rules';
import * as scannerModule from '@ngcompass/scanner';
import * as plannerModule from '@ngcompass/planner';
import * as engineModule from '@ngcompass/engine';
import * as reportersModule from '@ngcompass/reporters';

vi.mock('@ngcompass/config');
vi.mock('@ngcompass/rules');
vi.mock('@ngcompass/scanner');
vi.mock('@ngcompass/planner');
vi.mock('@ngcompass/engine');
vi.mock('@ngcompass/reporters');

describe('Analyze Command', () => {
    let program: Command;
    let mockExit: any;
    let mockReporter: any;

    beforeEach(() => {
        vi.resetAllMocks();
        program = new Command();
        
        mockReporter = {
            step: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
            parseErrors: vi.fn(),
            report: vi.fn(),
            summary: vi.fn()
        };
        
        vi.spyOn(reportersModule, 'getReporter').mockReturnValue(mockReporter);
        mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    });

    it('runs the full happy path analysis pipeline', async () => {
        // Step 1: Config
        vi.spyOn(configModule, 'resolveConfig').mockResolvedValue({
            report: { valid: true },
            config: { plugins: [] } as any
        } as any);

        // Step 2: files
        vi.spyOn(scannerModule, 'scan').mockResolvedValue({
            ok: true,
            data: { files: ['/test.ts'] }
        } as any);

        // Step 3: rules
        const rulesMap = new Map();
        rulesMap.set('test-rule', { id: 'test-rule' });
        vi.spyOn(rulesModule, 'resolveRules').mockResolvedValue({
            ok: true,
            data: { rules: {} }
        } as any);
        vi.spyOn(rulesModule, 'getEnabledRules').mockReturnValue(rulesMap);

        // Step 4: plan
        vi.spyOn(plannerModule, 'buildExecutionPlan').mockResolvedValue({
            ok: true,
            data: {
                tasks: [{ id: 'task1' }],
                precomputedAnalysis: false
            }
        } as any);

        // Step 5: run analysis
        const mockResults = [{ taskId: 'task1', level: 'error' }];
        vi.spyOn(engineModule, 'runAnalysis').mockResolvedValue({
            ok: true,
            data: {
                results: mockResults,
                parseErrors: [],
                stats: { totalFiles: 1, totalErrors: 0, totalWarnings: 0 }
            }
        } as any);

        const cache = {
            results: {
                setMany: vi.fn().mockResolvedValue(undefined)
            }
        };

        registerAnalyzeCommand(program, cache as any);

        // Action
        await program.parseAsync(['node', 'test', 'analyze', '--format', 'json']);

        // Assertions
        expect(configModule.resolveConfig).toHaveBeenCalled();
        expect(scannerModule.scan).toHaveBeenCalled();
        expect(rulesModule.resolveRules).toHaveBeenCalled();
        expect(plannerModule.buildExecutionPlan).toHaveBeenCalled();
        expect(engineModule.runAnalysis).toHaveBeenCalled();

        expect(mockReporter.report).toHaveBeenCalledWith(mockResults);
        expect(mockReporter.summary).toHaveBeenCalled();
        expect(cache.results.setMany).toHaveBeenCalled();
        
        expect(mockExit).not.toHaveBeenCalled(); // 0 exit code if no totalErrors
    });

    it('exits with code 1 if config resolution fails', async () => {
        vi.spyOn(configModule, 'resolveConfig').mockResolvedValue({
            report: { valid: false, issues: [{ message: 'bad config', severity: 'error' }] }
        } as any);

        registerAnalyzeCommand(program, {} as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(mockReporter.error).toHaveBeenCalled();
        // Pipeline stops early
        expect(scannerModule.scan).not.toHaveBeenCalled();
    });

    it('exits with code 1 if analysis yields errors', async () => {
        vi.spyOn(configModule, 'resolveConfig').mockResolvedValue({ report: { valid: true }, config: {} } as any);
        vi.spyOn(scannerModule, 'scan').mockResolvedValue({ ok: true, data: { files: [] } } as any);
        vi.spyOn(rulesModule, 'resolveRules').mockResolvedValue({ ok: true, data: { rules: {} } } as any);
        vi.spyOn(rulesModule, 'getEnabledRules').mockReturnValue(new Map());
        vi.spyOn(plannerModule, 'buildExecutionPlan').mockResolvedValue({ ok: true, data: { tasks: [] } } as any);
        
        // Return 1 error
        vi.spyOn(engineModule, 'runAnalysis').mockResolvedValue({
            ok: true,
            data: {
                results: [],
                parseErrors: [],
                stats: { totalFiles: 1, totalErrors: 1, totalWarnings: 0 }
            }
        } as any);

        registerAnalyzeCommand(program, { results: { setMany: vi.fn() } } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(mockExit).toHaveBeenCalledWith(1);
    });
});
