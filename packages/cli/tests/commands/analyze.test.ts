import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerAnalyzeCommand } from '../../src/commands/analyze.js';

import * as configModule from '@ngcompass/config';
import * as rulesModule from '@ngcompass/rules';
import * as scannerModule from '@ngcompass/scanner';
import * as plannerModule from '@ngcompass/planner';
import * as engineModule from '@ngcompass/engine';
import * as reportersModule from '@ngcompass/reporters';
import * as cacheModule from '@ngcompass/cache';

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
    let mockRuntimeCache: any;

    function setupSuccessfulPipeline(configOverrides: Record<string, unknown> = {}, statsOverrides: Record<string, unknown> = {}) {
        vi.spyOn(configModule, 'resolveConfig').mockResolvedValue({
            report: { valid: true },
            config: {
                plugins: [],
                outputFormat: 'text',
                outputPath: undefined,
                failOnSeverity: 'error',
                maxWarnings: 10,
                ignorePatterns: [],
                maxWorkers: 4,
                parserOptions: undefined,
                cache: {
                    enabled: true,
                    location: 'node_modules/.cache/ngcompass',
                    strategy: 'local',
                    ttl: 86400000,
                },
                overrides: [],
                ...configOverrides,
            } as any,
        } as any);

        vi.spyOn(scannerModule, 'scan').mockResolvedValue({
            ok: true,
            data: { files: ['/test.ts'] }
        } as any);

        const rulesMap = new Map();
        rulesMap.set('test-rule', { id: 'test-rule' });
        vi.spyOn(rulesModule, 'resolveRules').mockResolvedValue({
            ok: true,
            data: { rules: {} }
        } as any);
        vi.spyOn(rulesModule, 'getEnabledRules').mockReturnValue(rulesMap);

        vi.spyOn(plannerModule, 'buildExecutionPlan').mockResolvedValue({
            ok: true,
            data: {
                tasks: [{ id: 'task1' }],
                precomputedAnalysis: false
            }
        } as any);

        vi.spyOn(engineModule, 'runAnalysis').mockResolvedValue({
            ok: true,
            data: {
                results: [{ taskId: 'task1', level: 'warn' }],
                parseErrors: [],
                stats: {
                    totalFiles: 1,
                    totalErrors: 0,
                    totalWarnings: 0,
                    ...statsOverrides,
                }
            }
        } as any);
    }

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
        mockRuntimeCache = {
            results: {
                setMany: vi.fn().mockResolvedValue(undefined),
            },
            flush: vi.fn().mockResolvedValue(undefined),
        };
        
        vi.spyOn(reportersModule, 'getReporter').mockReturnValue(mockReporter);
        vi.spyOn(cacheModule, 'createRuntimeCache').mockReturnValue(mockRuntimeCache as any);
        mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    });

    it('runs the full happy path analysis pipeline', async () => {
        setupSuccessfulPipeline();

        const mockResults = [{ taskId: 'task1', level: 'warn' }];

        const cache = { flush: vi.fn().mockResolvedValue(undefined) };

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
        expect(mockRuntimeCache.results.setMany).toHaveBeenCalled();
        
        expect(mockExit).not.toHaveBeenCalled(); // 0 exit code if no totalErrors
    });

    it('uses config outputFormat and outputPath when CLI flags are absent', async () => {
        setupSuccessfulPipeline({
            outputFormat: 'html',
            outputPath: 'reports/from-config.html',
        });

        registerAnalyzeCommand(program, { results: { setMany: vi.fn().mockResolvedValue(undefined) } } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(reportersModule.getReporter).toHaveBeenNthCalledWith(1, 'console', expect.objectContaining({
            outputPath: undefined,
        }));
        expect(reportersModule.getReporter).toHaveBeenNthCalledWith(2, 'html', expect.objectContaining({
            outputPath: 'reports/from-config.html',
        }));
    });

    it('prints console summary before findings', async () => {
        setupSuccessfulPipeline();

        registerAnalyzeCommand(program, { flush: vi.fn().mockResolvedValue(undefined) } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(mockReporter.summary.mock.invocationCallOrder[0]).toBeLessThan(
            mockReporter.report.mock.invocationCallOrder[0],
        );
    });

    it('lets CLI format and output override config defaults', async () => {
        setupSuccessfulPipeline({
            outputFormat: 'html',
            outputPath: 'reports/from-config.html',
        });

        registerAnalyzeCommand(program, { results: { setMany: vi.fn().mockResolvedValue(undefined) } } as any);
        await program.parseAsync(['node', 'test', 'analyze', '--format', 'json', '--output', 'reports/from-cli.json']);

        expect(reportersModule.getReporter).toHaveBeenNthCalledWith(2, 'json', expect.objectContaining({
            outputPath: 'reports/from-cli.json',
        }));
    });

    it('passes ignorePatterns from config into the scanner', async () => {
        setupSuccessfulPipeline({
            ignorePatterns: ['.angular/**', 'tmp/**'],
        });

        registerAnalyzeCommand(program, { results: { setMany: vi.fn().mockResolvedValue(undefined) } } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(scannerModule.scan).toHaveBeenCalledWith(expect.objectContaining({
            ignorePatterns: ['.angular/**', 'tmp/**'],
        }));
    });

    it('passes parserOptions.project to the scanner as tsConfigPath', async () => {
        setupSuccessfulPipeline({
            parserOptions: {
                project: 'tsconfig.app.json',
                tsconfigRootDir: 'configs',
            },
        });

        registerAnalyzeCommand(program, { flush: vi.fn().mockResolvedValue(undefined) } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(scannerModule.scan).toHaveBeenCalledWith(expect.objectContaining({
            tsConfigPath: expect.stringContaining('configs'),
        }));
        expect(engineModule.runAnalysis).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            parserOptions: {
                project: 'tsconfig.app.json',
                tsconfigRootDir: 'configs',
            },
        }));
    });

    it('passes maxWorkers to planner and engine', async () => {
        setupSuccessfulPipeline({ maxWorkers: 7 });

        registerAnalyzeCommand(program, { flush: vi.fn().mockResolvedValue(undefined) } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(plannerModule.buildExecutionPlan).toHaveBeenCalledWith(expect.objectContaining({
            workerCount: 7,
        }));
        expect(engineModule.runAnalysis).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            maxWorkers: 7,
        }));
    });

    it('creates the runtime cache from config', async () => {
        setupSuccessfulPipeline({
            cache: {
                enabled: true,
                location: '.cache/custom',
                strategy: 'local',
                ttl: 1234,
            },
        });

        registerAnalyzeCommand(program, { flush: vi.fn().mockResolvedValue(undefined) } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(cacheModule.createRuntimeCache).toHaveBeenCalledWith(expect.objectContaining({
            cache: expect.objectContaining({
                location: '.cache/custom',
                strategy: 'local',
                ttl: 1234,
            }),
        }), expect.any(String));
    });

    it('uses memory-only runtime cache when cache.strategy is memory', async () => {
        setupSuccessfulPipeline({
            cache: {
                enabled: true,
                location: '.cache/ignored-for-memory',
                strategy: 'memory',
                ttl: 555,
            },
        });

        registerAnalyzeCommand(program, { flush: vi.fn().mockResolvedValue(undefined) } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(cacheModule.createRuntimeCache).toHaveBeenCalledWith(expect.objectContaining({
            cache: expect.objectContaining({
                location: '.cache/ignored-for-memory',
                strategy: 'memory',
                ttl: 555,
            }),
        }), expect.any(String));
    });

    it('disables runtime caching when cache.enabled is false', async () => {
        setupSuccessfulPipeline({
            cache: {
                enabled: false,
                location: '.cache/custom',
                strategy: 'local',
                ttl: 1234,
            },
        });

        registerAnalyzeCommand(program, { flush: vi.fn().mockResolvedValue(undefined) } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(cacheModule.createRuntimeCache).toHaveBeenCalledWith(expect.objectContaining({
            cache: expect.objectContaining({
                enabled: false,
            }),
        }), expect.any(String));
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
        setupSuccessfulPipeline({}, { totalErrors: 1 });
        const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        registerAnalyzeCommand(program, { flush: vi.fn().mockResolvedValue(undefined) } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(stdoutWrite).not.toHaveBeenCalledWith('\x1B[?25h');
    });

    it('exits with code 1 when warnings exceed maxWarnings', async () => {
        setupSuccessfulPipeline({ maxWarnings: 0 }, { totalWarnings: 1 });

        registerAnalyzeCommand(program, { flush: vi.fn().mockResolvedValue(undefined) } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits with code 1 when failOnSeverity is warn and warnings exist', async () => {
        setupSuccessfulPipeline({ failOnSeverity: 'warn', maxWarnings: 10 }, { totalWarnings: 1 });

        registerAnalyzeCommand(program, { flush: vi.fn().mockResolvedValue(undefined) } as any);
        await program.parseAsync(['node', 'test', 'analyze']);

        expect(mockExit).toHaveBeenCalledWith(1);
    });
});
