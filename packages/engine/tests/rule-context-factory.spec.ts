/**
 * Unit Tests — rule-context-factory.ts
 *
 * Verifies RuleContextFactory.build using a fully in-memory mock ExecutionContext.
 * No real filesystem I/O is needed for these tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { RuleContextFactory, type ExecutionContext } from '../src/rule-context-factory.js';
import { Locator } from '@ngcompass/common';
import { parseTs } from '@ngcompass/ast';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const SIMPLE_TS = 'export class Foo {}';
const COMPONENT_TS = `
import { Component } from '@angular/core';
@Component({ selector: 'app-root', template: '<div>Hello</div>' })
export class AppComponent { title = 'app'; }
`;

function makeFakeProgram(source: string, fileName: string) {
    return parseTs(source, fileName).program;
}

function makeBaseContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
    const filePath = '/src/foo.ts';
    const program = makeFakeProgram(SIMPLE_TS, filePath);
    return {
        rootDir: '/src',
        readFile: vi.fn().mockResolvedValue(SIMPLE_TS),
        getProgram: vi.fn().mockResolvedValue(program),
        getTemplate: vi.fn().mockResolvedValue(undefined),
        getStyle: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RuleContextFactory.build', () => {
    it('sets filePath on the returned context', async () => {
        const ctx = makeBaseContext();
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, false);
        expect(result.filePath).toBe('/src/foo.ts');
    });

    it('sets fileContent from readFile', async () => {
        const ctx = makeBaseContext();
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, false);
        expect(result.fileContent).toBe(SIMPLE_TS);
    });

    it('creates a Locator instance', async () => {
        const ctx = makeBaseContext();
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, false);
        expect(result.locator).toBeInstanceOf(Locator);
    });

    it('populates program from getProgram', async () => {
        const ctx = makeBaseContext();
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, false);
        expect(result.program).toBeDefined();
        expect(result.program).not.toBeNull();
    });

    it('returns undefined for template when needsTemplate is false', async () => {
        const ctx = makeBaseContext();
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, false);
        expect(result.template).toBeUndefined();
        expect(ctx.getTemplate).not.toHaveBeenCalled();
    });

    it('calls getTemplate when needsTemplate is true', async () => {
        const ctx = makeBaseContext();
        const factory = new RuleContextFactory(ctx);
        await factory.build('/src/foo.ts', {}, true);
        expect(ctx.getTemplate).toHaveBeenCalledWith('/src/foo.ts');
    });

    it('attaches template from getTemplate when needsTemplate is true', async () => {
        const fakeTemplate = { rootNodes: [] } as any;
        const ctx = makeBaseContext({ getTemplate: vi.fn().mockResolvedValue(fakeTemplate) });
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, true);
        expect(result.template).toBe(fakeTemplate);
    });

    it('populates options on the context', async () => {
        const ctx = makeBaseContext();
        const factory = new RuleContextFactory(ctx);
        const opts = { maxWarnings: 10 };
        const result = await factory.build('/src/foo.ts', opts, false);
        expect(result.options).toBe(opts);
    });

    it('does not populate typeChecker when getTypeChecker is absent', async () => {
        const ctx = makeBaseContext(); // no getTypeChecker
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, false);
        expect(result.typeChecker).toBeUndefined();
    });

    it('calls getTypeChecker and attaches the result when provided', async () => {
        const fakeChecker = {} as any;
        const ctx = makeBaseContext({
            getTypeChecker: vi.fn().mockResolvedValue(fakeChecker),
        });
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, false);
        expect(result.typeChecker).toBe(fakeChecker);
    });

    it('project is undefined when getProjectContext is absent', async () => {
        const ctx = makeBaseContext();
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, false);
        expect(result.project).toBeUndefined();
    });

    it('populates project from getProjectContext when provided', async () => {
        const fakeProject = {
            componentGraph: new Map(),
            importGraph: new Map(),
            templateToComponent: new Map(),
            barrelFiles: new Set(),
        } as any;
        const ctx = makeBaseContext({
            getProjectContext: vi.fn().mockReturnValue(fakeProject),
        });
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/foo.ts', {}, false);
        expect(result.project).toBe(fakeProject);
    });

    it('crossRef is undefined for a non-component file', async () => {
        // Non .component.ts file + no project context = no crossRef
        const ctx = makeBaseContext();
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build('/src/services/my.service.ts', {}, false);
        expect(result.crossRef).toBeUndefined();
    });

    it('crossRef.componentPath is set for a .component.ts file when project context is present', async () => {
        const componentPath = '/src/app/app.component.ts';
        const fakeProject = {
            componentGraph: new Map([[componentPath, {
                templatePath: '/src/app/app.component.html',
                stylePaths: [],
                specPath: undefined,
            }]]),
            importGraph: new Map(),
            templateToComponent: new Map(),
            barrelFiles: new Set(),
        } as any;
        const program = makeFakeProgram(COMPONENT_TS, componentPath);
        const ctx = makeBaseContext({
            readFile: vi.fn().mockResolvedValue(COMPONENT_TS),
            getProgram: vi.fn().mockResolvedValue(program),
            getProjectContext: vi.fn().mockReturnValue(fakeProject),
        });
        const factory = new RuleContextFactory(ctx);
        const result = await factory.build(componentPath, {}, false);
        expect(result.crossRef).toBeDefined();
        expect(result.crossRef!.componentPath).toBe(componentPath);
    });
});
