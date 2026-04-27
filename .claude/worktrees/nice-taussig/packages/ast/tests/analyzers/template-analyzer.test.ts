import { describe, it, expect } from 'vitest';
import { analyzeTemplate } from '../../src/analyzers/template-analyzer.js';
import { parseHtml } from '../../src/parsers/html.js';

describe('template-analyzer', () => {
    it('analyzes attributes from HTML elements', () => {
        const html = '<div id="test" class="my-class"></div>';
        const parsed = parseHtml(html);
        const analyzed = analyzeTemplate(parsed);

        expect(analyzed.attributes.length).toBeGreaterThan(0);
        // Note: Id and Class may either be extracted or ignored depending on internal angular-html-parser representation, 
        // but 'id' and 'class' should emit attributes at the very least.
        const ids = analyzed.attributes.filter(a => a.name === 'id');
        expect(ids.length).toBe(1);
        expect(ids[0].value).toBe('test');
    });

    it('analyzes structural directives', () => {
        const html = '<div *ngIf="show"></div>';
        const parsed = parseHtml(html);
        const analyzed = analyzeTemplate(parsed);

        expect(analyzed.expressions.length).toBeGreaterThan(0);
        // "show" wrapped expression will be available
        const expr = analyzed.expressions[0];
        expect(expr.expression).toBeDefined();
        // Since it's parsed via oxc into ts AST, it will have type Identifier
        expect(expr.expression.type).toBe('Identifier');
    });

    it('analyzes property bindings', () => {
        const html = '<custom-component [prop]="someValue"></custom-component>';
        const parsed = parseHtml(html);
        const analyzed = analyzeTemplate(parsed);

        expect(analyzed.attributes.some(a => a.name === '[prop]')).toBe(true);
        expect(analyzed.expressions.length).toBeGreaterThan(0);
        expect(analyzed.expressions[0].expression.type).toBe('Identifier');
    });
});
