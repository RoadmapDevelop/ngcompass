import { describe, it, expect } from 'vitest';
import { extractTemplateFromProgram } from '../../src/parsers/template-extractor.js';
import { parseTs } from '../../src/parsers/ts.js';

describe('extractTemplateFromProgram', () => {
    it('extracts StringLiteral templates', () => {
        const source = `
            import { Component } from '@angular/core';
            @Component({
                template: '<div>Hello</div>'
            })
            export class TestComponent {}
        `;
        const result = parseTs(source, 'test.ts');
        const template = extractTemplateFromProgram(result.program);
        expect(template.content).toBe('<div>Hello</div>');
        expect(template.startOffset).toBeGreaterThan(0);
    });

    it('extracts TemplateLiteral templates', () => {
        const source = `
            import { Component } from '@angular/core';
            @Component({
                template: \`<span>Hi {{name}}</span>\`
            })
            export class TestComponent {}
        `;
        const result = parseTs(source, 'test.ts');
        const template = extractTemplateFromProgram(result.program);
        expect(template.content).toBe('<span>Hi {{name}}</span>');
        expect(template.startOffset).toBeGreaterThan(0);
    });

    it('returns empty when no template is present', () => {
        const source = `
            import { Component } from '@angular/core';
            @Component({
                templateUrl: './xyz.html'
            })
            export class TestComponent {}
        `;
        const result = parseTs(source, 'test.ts');
        const template = extractTemplateFromProgram(result.program);
        expect(template.content).toBe('');
        expect(template.startOffset).toBe(0);
    });
});
