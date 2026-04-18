/**
 * Unit Tests — security rules
 *
 * Covered rules:
 *  - no-bypass-sanitization
 *  - template-no-unsafe-bindings
 */

import { describe, it, expect } from 'vitest';
import { makeContext, findCallExpressions } from './helpers.js';
import { noBypassSanitizationRule } from '../src/rules/security/no-bypass-sanitization.rule.js';
import { templateNoUnsafeBindingsRule } from '../src/rules/security/template-no-unsafe-bindings.rule.js';

// ---------------------------------------------------------------------------
// no-bypass-sanitization
// ---------------------------------------------------------------------------

describe('no-bypass-sanitization', () => {
    it('has correct name and streamType', () => {
        expect(noBypassSanitizationRule.name).toBe('no-bypass-sanitization');
        expect(noBypassSanitizationRule.streamType).toBe('CallExpression');
    });

    it('flags a direct bypassSecurityTrustHtml() call', () => {
        const source = `const safe = bypassSecurityTrustHtml('<b>trusted</b>');`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'bypassSecurityTrustHtml');
        expect(calls.length).toBeGreaterThan(0);
        const result = noBypassSanitizationRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('no-bypass-sanitization');
        expect((result as any).severity).toBe('error');
    });

    it('flags this.sanitizer.bypassSecurityTrustHtml()', () => {
        const source = `const x = this.sanitizer.bypassSecurityTrustHtml(content);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'bypassSecurityTrustHtml');
        expect(calls.length).toBeGreaterThan(0);
        const result = noBypassSanitizationRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('bypassSecurityTrustHtml');
    });

    it('flags bypassSecurityTrustScript()', () => {
        const source = `const s = this.san.bypassSecurityTrustScript(src);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'bypassSecurityTrustScript');
        expect(calls.length).toBeGreaterThan(0);
        const result = noBypassSanitizationRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('flags bypassSecurityTrustStyle()', () => {
        const source = `this.san.bypassSecurityTrustStyle(css);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'bypassSecurityTrustStyle');
        const result = noBypassSanitizationRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('flags bypassSecurityTrustUrl()', () => {
        const source = `this.san.bypassSecurityTrustUrl(url);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'bypassSecurityTrustUrl');
        const result = noBypassSanitizationRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('flags bypassSecurityTrustResourceUrl()', () => {
        const source = `this.san.bypassSecurityTrustResourceUrl(url);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'bypassSecurityTrustResourceUrl');
        const result = noBypassSanitizationRule.handle(calls[0], ctx);
        expect(result).not.toBeNull();
    });

    it('does not flag an unrelated method call', () => {
        const source = `this.service.getData();`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'getData');
        const result = noBypassSanitizationRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('does not flag safe DomSanitizer usage like sanitize()', () => {
        const source = `this.sanitizer.sanitize(SecurityContext.HTML, content);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'sanitize');
        const result = noBypassSanitizationRule.handle(calls[0], ctx);
        expect(result).toBeNull();
    });

    it('includes fix recommendation', () => {
        const source = `bypassSecurityTrustHtml(x);`;
        const ctx = makeContext(source);
        const calls = findCallExpressions(ctx.program, 'bypassSecurityTrustHtml');
        const result = noBypassSanitizationRule.handle(calls[0], ctx) as any;
        expect(result?.fix).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// template-no-unsafe-bindings
// ---------------------------------------------------------------------------

describe('template-no-unsafe-bindings', () => {
    it('has correct name and streamType', () => {
        expect(templateNoUnsafeBindingsRule.name).toBe('template-no-unsafe-bindings');
        expect(templateNoUnsafeBindingsRule.streamType).toBe('TemplateAttribute');
    });

    it('flags [innerHTML] binding with unsanitized value', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[innerHTML]',
            value: 'userInput',
            sourceSpan: { start: 0, end: 20 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
        expect((result as any).ruleName).toBe('template-no-unsafe-bindings');
        expect((result as any).severity).toBe('error');
        expect((result as any).message).toContain('[innerHTML]');
    });

    it('flags [outerHTML] binding with unsanitized value', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[outerHTML]',
            value: 'rawHtml',
            sourceSpan: { start: 0, end: 20 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('[outerHTML]');
    });

    it('flags [srcdoc] binding with unsanitized value', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[srcdoc]',
            value: 'embedContent',
            sourceSpan: { start: 0, end: 15 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
        expect((result as any).message).toContain('[srcdoc]');
    });

    it('does NOT flag [innerHTML] when a safeHtml pipe is used', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[innerHTML]',
            value: 'userInput | safeHtml',
            sourceSpan: { start: 0, end: 30 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag [innerHTML] when a sanitize pipe is used', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[innerHTML]',
            value: 'content | sanitize',
            sourceSpan: { start: 0, end: 30 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).toBeNull();
    });

    it('does NOT flag an unrelated attribute like [class]', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[class]',
            value: 'activeClass',
            sourceSpan: { start: 0, end: 15 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).toBeNull();
    });

    it('includes a fix recommendation', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[innerHTML]',
            value: 'content',
            sourceSpan: { start: 0, end: 20 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx) as any;
        expect(result?.fix).toBeDefined();
    });

    it('still flags when pipe name is only a prefix match like safetyNet', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[innerHTML]',
            value: 'content | safetyNet',
            sourceSpan: { start: 0, end: 30 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
    });

    it('does NOT flag [innerHTML] when getSafeHtml() method is used in value', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[innerHTML]',
            value: 'getSafeHtml(content)',
            sourceSpan: { start: 0, end: 30 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).toBeNull();
    });

    it('flags [style] with complex expression (method call)', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[style]',
            value: 'getStyle(item)',
            sourceSpan: { start: 0, end: 20 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).not.toBeNull();
        expect((result as any).severity).toBe('warn');
    });

    it('does NOT flag [style] with simple value', () => {
        const ctx = makeContext('', '/src/app.component.ts');
        const fakeNode = {
            name: '[style]',
            value: 'backgroundColor',
            sourceSpan: { start: 0, end: 20 },
        } as any;
        const result = templateNoUnsafeBindingsRule.handle(fakeNode, ctx);
        expect(result).toBeNull();
    });
});
