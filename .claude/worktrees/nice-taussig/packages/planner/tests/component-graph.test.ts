import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { ComponentDependencyGraph } from '../src/component-graph.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Joins path segments with the platform separator. */
const p = (...parts: string[]) => path.join(...parts);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComponentDependencyGraph', () => {
    it('returns undefined for non-component files', () => {
        const graph = new ComponentDependencyGraph();
        graph.build([p('/src', 'auth.service.ts')]);
        expect(graph.getResources(p('/src', 'auth.service.ts'))).toBeUndefined();
    });

    it('returns undefined for a component not in the file list', () => {
        const graph = new ComponentDependencyGraph();
        graph.build([]);
        expect(graph.getResources(p('/src', 'app.component.ts'))).toBeUndefined();
    });

    it('detects an external HTML template', () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const tmpl = p(dir, 'app.component.html');
        const graph = new ComponentDependencyGraph();
        graph.build([comp, tmpl]);
        const node = graph.getResources(comp);
        expect(node).toBeDefined();
        expect(node!.templatePath).toBe(tmpl);
    });

    it('detects an alternative base.html template', () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const tmpl = p(dir, 'app.html');
        const graph = new ComponentDependencyGraph();
        graph.build([comp, tmpl]);
        const node = graph.getResources(comp);
        expect(node?.templatePath).toBe(tmpl);
    });

    it('reports no template when none exists', () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const graph = new ComponentDependencyGraph();
        graph.build([comp]);
        const node = graph.getResources(comp);
        expect(node!.templatePath).toBeUndefined();
    });

    it('detects scss style file', () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const style = p(dir, 'app.component.scss');
        const graph = new ComponentDependencyGraph();
        graph.build([comp, style]);
        const node = graph.getResources(comp);
        expect(node!.stylePaths).toContain(style);
    });

    it('detects css style file', () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const style = p(dir, 'app.component.css');
        const graph = new ComponentDependencyGraph();
        graph.build([comp, style]);
        expect(graph.getResources(comp)!.stylePaths).toContain(style);
    });

    it('detects multiple style files', () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const scss = p(dir, 'app.component.scss');
        const css = p(dir, 'app.component.css');
        const graph = new ComponentDependencyGraph();
        graph.build([comp, scss, css]);
        const styles = graph.getResources(comp)!.stylePaths;
        expect(styles).toContain(scss);
        expect(styles).toContain(css);
    });

    it('detects spec file (*.component.spec.ts)', () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const spec = p(dir, 'app.component.spec.ts');
        const graph = new ComponentDependencyGraph();
        graph.build([comp, spec]);
        expect(graph.getResources(comp)!.specPath).toBe(spec);
    });

    it('detects spec file (*.spec.ts shorthand)', () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const spec = p(dir, 'app.spec.ts');
        const graph = new ComponentDependencyGraph();
        graph.build([comp, spec]);
        expect(graph.getResources(comp)!.specPath).toBe(spec);
    });

    it('handles multiple components in the same directory independently', () => {
        const dir = '/src/features';
        const compA = p(dir, 'alpha.component.ts');
        const tmplA = p(dir, 'alpha.component.html');
        const compB = p(dir, 'beta.component.ts');
        const tmplB = p(dir, 'beta.component.html');
        const graph = new ComponentDependencyGraph();
        graph.build([compA, tmplA, compB, tmplB]);

        expect(graph.getResources(compA)!.templatePath).toBe(tmplA);
        expect(graph.getResources(compB)!.templatePath).toBe(tmplB);
    });

    it('handles components in different directories without cross-contamination', () => {
        const compA = p('/dirA', 'foo.component.ts');
        const tmplA = p('/dirA', 'foo.component.html');
        const compB = p('/dirB', 'foo.component.ts');
        const tmplB = p('/dirB', 'foo.component.html');
        const graph = new ComponentDependencyGraph();
        graph.build([compA, tmplA, compB, tmplB]);

        expect(graph.getResources(compA)!.templatePath).toBe(tmplA);
        expect(graph.getResources(compB)!.templatePath).toBe(tmplB);
    });

    it('clears the graph on repeated build() calls', () => {
        const dir = '/src';
        const comp = p(dir, 'app.component.ts');
        const graph = new ComponentDependencyGraph();
        graph.build([comp, p(dir, 'app.component.html')]);
        expect(graph.getResources(comp)!.templatePath).toBeDefined();

        // Rebuild without the template
        graph.build([comp]);
        expect(graph.getResources(comp)!.templatePath).toBeUndefined();
    });

    it('sets type to "component" for every node', () => {
        const comp = p('/src', 'app.component.ts');
        const graph = new ComponentDependencyGraph();
        graph.build([comp]);
        expect(graph.getResources(comp)!.type).toBe('component');
    });
});
