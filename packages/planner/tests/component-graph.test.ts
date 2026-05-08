import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { ComponentDependencyGraph } from '../src/component-graph.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Joins path segments with the platform separator. */
const p = (...parts: string[]) => path.join(...parts);

/** Creates a temp directory, writes files, runs fn, then cleans up. */
async function withTmpDir(
    fn: (dir: string) => Promise<void>
): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngcompass-graph-'));
    try {
        await fn(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComponentDependencyGraph', () => {
    it('returns undefined for non-component files', async () => {
        const graph = new ComponentDependencyGraph();
        await graph.build([p('/src', 'auth.service.ts')]);
        expect(graph.getResources(p('/src', 'auth.service.ts'))).toBeUndefined();
    });

    it('returns undefined for a component not in the file list', async () => {
        const graph = new ComponentDependencyGraph();
        await graph.build([]);
        expect(graph.getResources(p('/src', 'app.component.ts'))).toBeUndefined();
    });

    it('detects an external HTML template', async () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const tmpl = p(dir, 'app.component.html');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp, tmpl]);
        const node = graph.getResources(comp);
        expect(node).toBeDefined();
        expect(node!.templatePath).toBe(tmpl);
    });

    it('detects an alternative base.html template', async () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const tmpl = p(dir, 'app.html');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp, tmpl]);
        const node = graph.getResources(comp);
        expect(node?.templatePath).toBe(tmpl);
    });

    it('reports no template when none exists', async () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp]);
        const node = graph.getResources(comp);
        expect(node!.templatePath).toBeUndefined();
    });

    it('detects scss style file', async () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const style = p(dir, 'app.component.scss');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp, style]);
        const node = graph.getResources(comp);
        expect(node!.stylePaths).toContain(style);
    });

    it('detects css style file', async () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const style = p(dir, 'app.component.css');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp, style]);
        expect(graph.getResources(comp)!.stylePaths).toContain(style);
    });

    it('detects multiple style files', async () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const scss = p(dir, 'app.component.scss');
        const css = p(dir, 'app.component.css');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp, scss, css]);
        const styles = graph.getResources(comp)!.stylePaths;
        expect(styles).toContain(scss);
        expect(styles).toContain(css);
    });

    it('detects spec file (*.component.spec.ts)', async () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const spec = p(dir, 'app.component.spec.ts');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp, spec]);
        expect(graph.getResources(comp)!.specPath).toBe(spec);
    });

    it('detects spec file (*.spec.ts shorthand)', async () => {
        const dir = '/src/app';
        const comp = p(dir, 'app.component.ts');
        const spec = p(dir, 'app.spec.ts');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp, spec]);
        expect(graph.getResources(comp)!.specPath).toBe(spec);
    });

    it('handles multiple components in the same directory independently', async () => {
        const dir = '/src/features';
        const compA = p(dir, 'alpha.component.ts');
        const tmplA = p(dir, 'alpha.component.html');
        const compB = p(dir, 'beta.component.ts');
        const tmplB = p(dir, 'beta.component.html');
        const graph = new ComponentDependencyGraph();
        await graph.build([compA, tmplA, compB, tmplB]);

        expect(graph.getResources(compA)!.templatePath).toBe(tmplA);
        expect(graph.getResources(compB)!.templatePath).toBe(tmplB);
    });

    it('handles components in different directories without cross-contamination', async () => {
        const compA = p('/dirA', 'foo.component.ts');
        const tmplA = p('/dirA', 'foo.component.html');
        const compB = p('/dirB', 'foo.component.ts');
        const tmplB = p('/dirB', 'foo.component.html');
        const graph = new ComponentDependencyGraph();
        await graph.build([compA, tmplA, compB, tmplB]);

        expect(graph.getResources(compA)!.templatePath).toBe(tmplA);
        expect(graph.getResources(compB)!.templatePath).toBe(tmplB);
    });

    it('clears the graph on repeated build() calls', async () => {
        const dir = '/src';
        const comp = p(dir, 'app.component.ts');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp, p(dir, 'app.component.html')]);
        expect(graph.getResources(comp)!.templatePath).toBeDefined();

        // Rebuild without the template
        await graph.build([comp]);
        expect(graph.getResources(comp)!.templatePath).toBeUndefined();
    });

    it('sets type to "component" for every node', async () => {
        const comp = p('/src', 'app.component.ts');
        const graph = new ComponentDependencyGraph();
        await graph.build([comp]);
        expect(graph.getResources(comp)!.type).toBe('component');
    });

    // -------------------------------------------------------------------------
    // templateUrl / styleUrls fallback (non-conventional paths)
    // These tests use real temp files to avoid ESM mock-hoisting issues.
    // -------------------------------------------------------------------------

    describe('decorator fallback', () => {
        it('resolves templateUrl when convention fails', async () => {
            await withTmpDir(async (dir) => {
                const comp = path.join(dir, 'app.component.ts');
                const tmplDir = path.join(dir, 'templates');
                const tmpl = path.join(tmplDir, 'app.html');

                await fs.writeFile(comp, `@Component({ templateUrl: './templates/app.html' })`);
                await fs.mkdir(tmplDir);
                await fs.writeFile(tmpl, '');

                const graph = new ComponentDependencyGraph();
                await graph.build([comp, tmpl]);

                expect(graph.getResources(comp)!.templatePath).toBe(tmpl);
            });
        });

        it('resolves styleUrls when convention finds no styles', async () => {
            await withTmpDir(async (dir) => {
                const comp = path.join(dir, 'app.component.ts');
                const styleDir = path.join(dir, 'styles');
                const style = path.join(styleDir, 'app.scss');

                await fs.writeFile(comp, `@Component({ styleUrls: ['./styles/app.scss'] })`);
                await fs.mkdir(styleDir);
                await fs.writeFile(style, '');

                const graph = new ComponentDependencyGraph();
                await graph.build([comp, style]);

                expect(graph.getResources(comp)!.stylePaths).toContain(style);
            });
        });

        it('resolves Angular 17+ styleUrl (singular) when convention finds no styles', async () => {
            await withTmpDir(async (dir) => {
                const comp = path.join(dir, 'app.component.ts');
                const style = path.join(dir, 'app.styles.scss');

                await fs.writeFile(comp, `@Component({ styleUrl: './app.styles.scss' })`);
                await fs.writeFile(style, '');

                const graph = new ComponentDependencyGraph();
                await graph.build([comp, style]);

                expect(graph.getResources(comp)!.stylePaths).toContain(style);
            });
        });

        it('ignores templateUrl when resolved path is not in file set', async () => {
            await withTmpDir(async (dir) => {
                const comp = path.join(dir, 'app.component.ts');
                // Write the component referencing a template that won't be in the file list
                await fs.writeFile(comp, `@Component({ templateUrl: './missing.html' })`);

                const graph = new ComponentDependencyGraph();
                // missing.html is NOT in the file set
                await graph.build([comp]);

                expect(graph.getResources(comp)!.templatePath).toBeUndefined();
            });
        });
    });
});
