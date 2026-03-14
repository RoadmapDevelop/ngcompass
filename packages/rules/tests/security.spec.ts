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
