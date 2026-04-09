/**
 * Unit Tests — testing rules
 *
 * Covered rules:
 *  - spec-no-focused-test
 */

import { describe, it, expect } from 'vitest';
import { makeContext, findCallExpressions } from './helpers.js';
import { specNoFocusedTestRule } from '../src/rules/testing/spec-no-focused-test.rule.js';

const SPEC_PATH = '/src/app.spec.ts';
const NON_SPEC_PATH = '/src/app.ts';

// ---------------------------------------------------------------------------
// spec-no-focused-test
// ---------------------------------------------------------------------------

describe('spec-no-focused-test', () => {
    it('has correct name and streamType', () => {
        expect(specNoFocusedTestRule.name).toBe('spec-no-focused-test');
        expect(specNoFocusedTestRule.streamType).toBe('CallExpression');
    });

    it('flags fdescribe() in a .spec.ts file', () => {
        const source = `fdescribe('my suite', () => { it('test', () => {}); });`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'fdescribe');
        expect(calls.length).toBeGreaterThan(0);
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('spec-no-focused-test');
        expect((result as any).severity).toBe('error');
        expect((result as any).message).toContain('fdescribe');
    });

    it('flags fit() in a .spec.ts file', () => {
        const source = `fit('focused test', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'fit');
        expect(calls.length).toBeGreaterThan(0);
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('fit');
    });

    it('flags describe.only() in a .spec.ts file', () => {
        const source = `describe.only('suite', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'only');
        expect(calls.length).toBeGreaterThan(0);
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('describe.only');
    });

    it('flags it.only() in a .spec.ts file', () => {
        const source = `it.only('focused it', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'only');
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('it.only');
    });

    it('flags test.only() in a .spec.ts file', () => {
        const source = `test.only('focused test', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'only');
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('does NOT flag regular describe() in a spec file', () => {
        const source = `describe('normal suite', () => { it('a test', () => {}); });`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'describe');
        const results = calls.map((c) => specNoFocusedTestRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });

    it('does NOT flag regular it() in a spec file', () => {
        const source = `it('regular test', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'it');
        const results = calls.map((c) => specNoFocusedTestRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });

    it('does NOT flag fdescribe() in a non-spec file', () => {
        const source = `fdescribe('suite', () => {});`;
        // filePath does NOT end in .spec.ts or .test.ts
        const ctx = makeContext(source, NON_SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'fdescribe');
        const results = calls.map((c) => specNoFocusedTestRule.handle(c, ctx));
        expect(results.every((r) => r === null)).toBe(true);
    });

    it('flags in .test.ts files as well as .spec.ts', () => {
        const source = `fdescribe('suite', () => {});`;
        const ctx = makeContext(source, '/src/app.test.ts');
        const calls = findCallExpressions(ctx.program, 'fdescribe');
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('reports an accurate line and column', () => {
        const source = `fdescribe('suite', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'fdescribe');
        const result = specNoFocusedTestRule.handle(calls[0], ctx) as any;
        expect(result.line).toBeGreaterThanOrEqual(1);
        expect(result.column).toBeGreaterThanOrEqual(0);
    });

    it('flags xit() in a .spec.ts file', () => {
        const source = `xit('skipped test', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'xit');
        expect(calls.length).toBeGreaterThan(0);
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('xit');
    });

    it('flags xdescribe() in a .spec.ts file', () => {
        const source = `xdescribe('skipped suite', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'xdescribe');
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('xdescribe');
    });

    it('flags xtest() in a .spec.ts file', () => {
        const source = `xtest('skipped test', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'xtest');
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('xtest');
    });

    it('uses "disables" wording for x-prefixed helpers', () => {
        const source = `xit('skipped', () => {});`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'xit');
        const result = specNoFocusedTestRule.handle(calls[0], ctx) as any;
        expect(result.message).toContain('disables');
        expect(result.message).not.toContain('focused');
    });

    it('flags pending() in a .spec.ts file', () => {
        const source = `it('test', () => { pending(); });`;
        const ctx = makeContext(source, SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'pending');
        expect(calls.length).toBeGreaterThan(0);
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('pending');
    });

    it('does NOT flag pending() in a non-spec file', () => {
        const source = `pending();`;
        const ctx = makeContext(source, NON_SPEC_PATH);
        const calls = findCallExpressions(ctx.program, 'pending');
        const result = specNoFocusedTestRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });
});
