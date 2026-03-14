/**
 * Unit Tests — SSR rules
 *
 * Covered rules:
 *  - no-document-access
 *  - prefer-after-render-over-after-view-init
 */

import { describe, it, expect } from 'vitest';
import { makeContext, findCallExpressions } from './helpers.js';
import { noDocumentAccessRule } from '../src/rules/ssr/no-document-access.rule.js';
import { preferAfterRenderOverAfterViewInitRule } from '../src/rules/ssr/prefer-after-render-over-after-view-init.rule.js';

// ---------------------------------------------------------------------------
// no-document-access
// ---------------------------------------------------------------------------

describe('no-document-access', () => {
    it('has correct name and streamType', () => {
        expect(noDocumentAccessRule.name).toBe('no-document-access');
        expect(noDocumentAccessRule.streamType).toBe('CallExpression');
    });

    it('flags document.querySelector() method call', () => {
        const source = `const el = document.querySelector('.foo');`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'querySelector');
        expect(calls.length).toBeGreaterThan(0);
        const result = noDocumentAccessRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('no-document-access');
        expect((result as any).severity).toBe('error');
        expect((result as any).message).toContain('document');
    });

    it('flags window.scrollTo() method call', () => {
        const source = `window.scrollTo(0, 0);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'scrollTo');
        expect(calls.length).toBeGreaterThan(0);
        const result = noDocumentAccessRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('window');
    });

    it('flags localStorage.setItem() method call', () => {
        const source = `localStorage.setItem('key', 'val');`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'setItem');
        expect(calls.length).toBeGreaterThan(0);
        const result = noDocumentAccessRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('localStorage');
    });

    it('flags sessionStorage.getItem() method call', () => {
        const source = `sessionStorage.getItem('k');`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'getItem');
        const result = noDocumentAccessRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('flags navigator.geolocation.getCurrentPosition()', () => {
        const source = `navigator.geolocation.getCurrentPosition(cb);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'getCurrentPosition');
        const result = noDocumentAccessRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('does not flag isPlatformBrowser() — safe Angular API', () => {
        const source = `const isBrowser = isPlatformBrowser(platformId);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'isPlatformBrowser');
        const result = noDocumentAccessRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does not flag afterNextRender() — safe Angular API', () => {
        const source = `afterNextRender(() => { doWork(); });`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'afterNextRender');
        const result = noDocumentAccessRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does not flag unrelated service method calls', () => {
        const source = `this.myService.doSomething();`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'doSomething');
        const result = noDocumentAccessRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('includes a fix recommendation', () => {
        const source = `document.querySelector('.cls');`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'querySelector');
        const result = noDocumentAccessRule.handle(calls[0], ctx) as any;
        expect(result?.fix).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// prefer-after-render-over-after-view-init
// ---------------------------------------------------------------------------

describe('prefer-after-render-over-after-view-init', () => {
    it('has correct name and streamType', () => {
        expect(preferAfterRenderOverAfterViewInitRule.name).toBe('prefer-after-render-over-after-view-init');
        expect(preferAfterRenderOverAfterViewInitRule.streamType).toBe('AnyAngularClass');
    });
});
