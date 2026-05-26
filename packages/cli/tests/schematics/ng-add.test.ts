







import path from 'node:path';
import url from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';

const COLLECTION_PATH = path.resolve(
    path.dirname(url.fileURLToPath(import.meta.url)),
    '../../schematics/collection.json',
);

function freshTreeWithPackageJson(extra: Partial<Record<string, unknown>> = {}): UnitTestTree {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(
        'package.json',
        JSON.stringify({ name: 'host-project', scripts: { start: 'ng serve' }, ...extra }, null, 2) + '\n',
    );
    return tree;
}

describe('ng-add schematic', () => {
    let runner: SchematicTestRunner;
    beforeEach(() => {
        runner = new SchematicTestRunner('ngcompass', COLLECTION_PATH);
    });

    it('creates ngcompass.config.ts at the workspace root', async () => {
        const tree = await runner.runSchematic('ng-add', {}, freshTreeWithPackageJson());

        expect(tree.files).toContain('/ngcompass.config.ts');
        const config = tree.readContent('/ngcompass.config.ts');
        expect(config).toContain("from '@ngcompass/config'");
        expect(config).toContain('extends:');
        expect(config).toContain('ngcompass:recommended');
    });

    it('inserts the lint:ngcompass npm script into package.json', async () => {
        const tree = await runner.runSchematic('ng-add', {}, freshTreeWithPackageJson());

        const pkg = JSON.parse(tree.readContent('/package.json')) as { scripts: Record<string, string> };
        expect(pkg.scripts['lint:ngcompass']).toBe('ngcompass analyze');
        
        expect(pkg.scripts.start).toBe('ng serve');
    });

    it('preserves an existing lint:ngcompass script verbatim', async () => {
        const baseTree = freshTreeWithPackageJson({ scripts: { 'lint:ngcompass': 'custom-runner --ci' } });

        const tree = await runner.runSchematic('ng-add', {}, baseTree);

        const pkg = JSON.parse(tree.readContent('/package.json')) as { scripts: Record<string, string> };
        expect(pkg.scripts['lint:ngcompass']).toBe('custom-runner --ci');
    });

    it('does not overwrite an existing ngcompass.config.ts without --force', async () => {
        const baseTree = freshTreeWithPackageJson();
        baseTree.create('/ngcompass.config.ts', '// user override\n');

        const tree = await runner.runSchematic('ng-add', {}, baseTree);

        expect(tree.readContent('/ngcompass.config.ts')).toBe('// user override\n');
    });

    it('overwrites an existing ngcompass.config.ts when force is true', async () => {
        const baseTree = freshTreeWithPackageJson();
        baseTree.create('/ngcompass.config.ts', '// user override\n');

        const tree = await runner.runSchematic('ng-add', { force: true }, baseTree);

        const content = tree.readContent('/ngcompass.config.ts');
        expect(content).not.toBe('// user override\n');
        expect(content).toContain('defineConfig');
    });

    it('skips package.json mutation when skipScript is true', async () => {
        const tree = await runner.runSchematic('ng-add', { skipScript: true }, freshTreeWithPackageJson());

        const pkg = JSON.parse(tree.readContent('/package.json')) as { scripts: Record<string, string> };
        expect(pkg.scripts['lint:ngcompass']).toBeUndefined();
        
        expect(tree.files).toContain('/ngcompass.config.ts');
    });

    it('works when the project has no package.json (warns but still writes the config)', async () => {
        const tree = await runner.runSchematic('ng-add', {}, new UnitTestTree(Tree.empty()));

        expect(tree.files).toContain('/ngcompass.config.ts');
    });
});
