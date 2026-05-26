







import path from 'node:path';
import url from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';

interface PackageFile {
    readonly scripts: Record<string, string>;
}

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

function readPackageJson(tree: UnitTestTree): PackageFile {
    const value: unknown = JSON.parse(tree.readContent('/package.json'));
    if (!isRecord(value) || !isStringRecord(value.scripts)) {
        throw new Error('Invalid package.json fixture');
    }
    return { scripts: value.scripts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
    if (!isRecord(value)) return false;
    return Object.values(value).every((entry) => typeof entry === 'string');
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

        const pkg = readPackageJson(tree);
        expect(pkg.scripts['lint:ngcompass']).toBe('ngcompass analyze');
        
        expect(pkg.scripts.start).toBe('ng serve');
    });

    it('preserves an existing lint:ngcompass script verbatim', async () => {
        const baseTree = freshTreeWithPackageJson({ scripts: { 'lint:ngcompass': 'custom-runner --ci' } });

        const tree = await runner.runSchematic('ng-add', {}, baseTree);

        const pkg = readPackageJson(tree);
        expect(pkg.scripts['lint:ngcompass']).toBe('custom-runner --ci');
    });

    it('does not overwrite an existing ngcompass.config.ts without --force', async () => {
        const baseTree = freshTreeWithPackageJson();
        baseTree.create('/ngcompass.config.ts', 'export default {};\n');

        const tree = await runner.runSchematic('ng-add', {}, baseTree);

        expect(tree.readContent('/ngcompass.config.ts')).toBe('export default {};\n');
    });

    it('overwrites an existing ngcompass.config.ts when force is true', async () => {
        const baseTree = freshTreeWithPackageJson();
        baseTree.create('/ngcompass.config.ts', 'export default {};\n');

        const tree = await runner.runSchematic('ng-add', { force: true }, baseTree);

        const content = tree.readContent('/ngcompass.config.ts');
        expect(content).not.toBe('export default {};\n');
        expect(content).toContain('defineConfig');
    });

    it('skips package.json mutation when skipScript is true', async () => {
        const tree = await runner.runSchematic('ng-add', { skipScript: true }, freshTreeWithPackageJson());

        const pkg = readPackageJson(tree);
        expect(pkg.scripts['lint:ngcompass']).toBeUndefined();
        
        expect(tree.files).toContain('/ngcompass.config.ts');
    });

    it('works when the project has no package.json (warns but still writes the config)', async () => {
        const tree = await runner.runSchematic('ng-add', {}, new UnitTestTree(Tree.empty()));

        expect(tree.files).toContain('/ngcompass.config.ts');
    });

    it('scopes generated config to Angular workspace source roots', async () => {
        const baseTree = freshTreeWithPackageJson();
        baseTree.create(
            '/angular.json',
            JSON.stringify({
                projects: {
                    app: { sourceRoot: 'src' },
                    admin: { sourceRoot: 'projects/admin/src' },
                },
            }),
        );

        const tree = await runner.runSchematic('ng-add', {}, baseTree);

        const config = tree.readContent('/ngcompass.config.ts');
        expect(config).toContain("    'projects/admin/src/**/*.ts',");
        expect(config).toContain("    'projects/admin/src/**/*.html',");
        expect(config).toContain("    'src/**/*.ts',");
        expect(config).toContain("    'src/**/*.html',");
        expect(config).not.toContain("    '**/*.ts',");
    });
});
