/**
 * Integration Tests - Scanner Complete Workflow
 *
 * Tests the complete scanner pipeline with realistic project structures
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scan } from '../../src/scanner/index.js';
import fs from 'fs/promises';
import path from 'path';

describe('Scanner Integration - Complete Workflow', () => {
    const fixtureDir = path.join(__dirname, '../fixtures/scanner-integration');

    beforeAll(async () => {
        // Create realistic Angular project structure
        await fs.mkdir(path.join(fixtureDir, 'src/app/components'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'src/app/services'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'src/app/models'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'src/lib/utils'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'src/lib/validators'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'test/unit'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'test/integration'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'dist/bundle'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'node_modules/angular'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, 'node_modules/rxjs'), { recursive: true });
        await fs.mkdir(path.join(fixtureDir, '.cache'), { recursive: true });

        // Create source files
        const files = [
            // App components
            'src/app/components/header.component.ts',
            'src/app/components/footer.component.ts',
            'src/app/components/nav.component.ts',
            'src/app/components/header.component.html',
            'src/app/components/footer.component.html',

            // App services
            'src/app/services/auth.service.ts',
            'src/app/services/user.service.ts',
            'src/app/services/api.service.ts',

            // App models
            'src/app/models/user.model.ts',
            'src/app/models/auth.model.ts',

            // Main app files
            'src/app/app.component.ts',
            'src/app/app.module.ts',
            'src/app/app.component.html',

            // Library utilities
            'src/lib/utils/string.utils.ts',
            'src/lib/utils/date.utils.ts',
            'src/lib/validators/email.validator.ts',
            'src/lib/validators/phone.validator.ts',

            // Test files
            'test/unit/auth.service.spec.ts',
            'test/unit/user.service.spec.ts',
            'test/integration/app.spec.ts',

            // Build artifacts
            'dist/bundle/main.js',
            'dist/bundle/vendor.js',
            'dist/bundle/polyfills.js',

            // Node modules
            'node_modules/angular/core.js',
            'node_modules/rxjs/operators.js',

            // Cache
            '.cache/ast-cache.json',

            // Config files
            'tsconfig.json',
            'package.json',
            'README.md',
        ];

        for (const file of files) {
            const content = `// Content for ${file}\nexport const data = "${path.basename(file)}";`;
            await fs.writeFile(path.join(fixtureDir, file), content);
        }

        // Create .gitignore
        await fs.writeFile(
            path.join(fixtureDir, '.gitignore'),
            [
                '# Dependencies',
                'node_modules/',
                '',
                '# Build',
                'dist/',
                '*.log',
                '',
                '# Cache',
                '.cache/',
                '*.tmp',
                '',
                '# IDEs',
                '.vscode/',
                '.idea/',
            ].join('\n')
        );
    });

    afterAll(async () => {
        await fs.rm(fixtureDir, { recursive: true, force: true });
    });

    describe('Realistic Angular Project Scanning', () => {
        it('should scan all TypeScript source files', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*.ts'],
                exclude: ['**/*.spec.ts'],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should find app and lib TypeScript files, excluding test/dist/node_modules
                expect(result.data.files.length).toBeGreaterThan(10);

                const basenames = result.data.files.map(f => path.basename(f));

                // Verify source files are included
                expect(basenames).toContain('header.component.ts');
                expect(basenames).toContain('auth.service.ts');
                expect(basenames).toContain('user.model.ts');
                expect(basenames).toContain('string.utils.ts');

                // Verify test files are excluded
                expect(basenames).not.toContain('auth.service.spec.ts');
                expect(basenames).not.toContain('app.spec.ts');

                // Verify dist/node_modules are excluded by gitignore
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('.cache'))).toBe(true);
            }
        });

        it('should scan TypeScript and HTML templates together', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*.ts', '**/*.html'],
                exclude: ['**/*.spec.ts'],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.stats.byExtension.get('.ts')).toBeGreaterThan(0);
                expect(result.data.stats.byExtension.get('.html')).toBeGreaterThan(0);

                const hasTypeScript = result.data.files.some(f => f.endsWith('.ts'));
                const hasHTML = result.data.files.some(f => f.endsWith('.html'));
                expect(hasTypeScript).toBe(true);
                expect(hasHTML).toBe(true);
            }
        });

        it('should exclude test files when configured', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*.ts'],
                exclude: ['test/**', '**/*.spec.ts'],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const hasTestFiles = result.data.files.some(f =>
                    f.includes('/test/') || f.includes('.spec.')
                );
                expect(hasTestFiles).toBe(false);
            }
        });

        it('should scan only specific directories', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['src/app/**/*.ts'],
                exclude: [],
                respectGitignore: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.every(f => f.includes('/src/app/'))).toBe(true);

                const hasLibFiles = result.data.files.some(f => f.includes('/src/lib/'));
                expect(hasLibFiles).toBe(false);
            }
        });

        it('should handle complex glob patterns', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['src/**/*.{ts,html}'],
                exclude: ['**/*.spec.ts', '**/*.d.ts'],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);
                expect(result.data.files.every(f =>
                    f.endsWith('.ts') || f.endsWith('.html')
                )).toBe(true);
            }
        });
    });

    describe('Statistics and Performance', () => {
        it('should calculate accurate file statistics', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*.ts', '**/*.html', '**/*.json'],
                exclude: [],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Verify stats structure
                expect(result.data.stats.totalFiles).toBeGreaterThan(0);
                expect(result.data.stats.byExtension.size).toBeGreaterThan(0);
                expect(result.data.stats.scanTime).toBeGreaterThan(0);
                expect(result.data.stats.cacheHit).toBe(false);

                // Verify extension breakdown
                const extensions = Array.from(result.data.stats.byExtension.keys());
                expect(extensions).toContain('.ts');
                expect(extensions).toContain('.html');
                expect(extensions).toContain('.json');
            }
        });

        it('should complete scan in reasonable time', async () => {
            const start = performance.now();

            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*.ts'],
                exclude: [],
                respectGitignore: true,
            });

            const duration = performance.now() - start;

            expect(result.ok).toBe(true);
            expect(duration).toBeLessThan(1000); // Should be fast for ~20 files
        });

        it('should accurately count files by extension', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['src/**/*.ts', 'src/**/*.html'],
                exclude: [],
                respectGitignore: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const tsCount = result.data.stats.byExtension.get('.ts') || 0;
                const htmlCount = result.data.stats.byExtension.get('.html') || 0;

                expect(tsCount).toBeGreaterThan(0);
                expect(htmlCount).toBeGreaterThan(0);

                // Manual verification: count actual files
                const tsFiles = result.data.files.filter(f => f.endsWith('.ts')).length;
                const htmlFiles = result.data.files.filter(f => f.endsWith('.html')).length;

                expect(tsCount).toBe(tsFiles);
                expect(htmlCount).toBe(htmlFiles);
            }
        });
    });

    describe('Gitignore Integration', () => {
        it('should respect .gitignore patterns', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*'],
                exclude: [],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should exclude node_modules, dist, .cache
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('.cache'))).toBe(true);
            }
        });

        it('should include gitignored files when respectGitignore=false', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*.js'],
                exclude: [],
                respectGitignore: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should include files from node_modules and dist
                const hasNodeModules = result.data.files.some(f => f.includes('node_modules'));
                const hasDist = result.data.files.some(f => f.includes('dist'));
                expect(hasNodeModules || hasDist).toBe(true);
            }
        });

        it('should handle missing .gitignore gracefully', async () => {
            // Remove .gitignore temporarily
            const gitignorePath = path.join(fixtureDir, '.gitignore');
            const backup = await fs.readFile(gitignorePath, 'utf8');
            await fs.unlink(gitignorePath);

            try {
                const result = await scan({
                    rootDir: fixtureDir,
                    include: ['**/*.ts'],
                    exclude: [],
                    respectGitignore: true,
                });

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.data.files.length).toBeGreaterThan(0);
                }
            } finally {
                // Restore .gitignore
                await fs.writeFile(gitignorePath, backup);
            }
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle empty project directory', async () => {
            const emptyDir = path.join(fixtureDir, 'empty-project');
            await fs.mkdir(emptyDir, { recursive: true });

            try {
                const result = await scan({
                    rootDir: emptyDir,
                    include: ['**/*.ts'],
                    exclude: [],
                });

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.data.files).toEqual([]);
                    expect(result.data.stats.totalFiles).toBe(0);
                }
            } finally {
                await fs.rm(emptyDir, { recursive: true, force: true });
            }
        });

        it('should handle patterns with no matches', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*.xyz'], // Non-existent extension
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
                expect(result.data.stats.totalFiles).toBe(0);
            }
        });

        it('should deduplicate overlapping patterns', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: [
                    '**/*.ts',
                    'src/**/*.ts',
                    'src/app/**/*.ts', // All overlapping
                ],
                exclude: [],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should not have duplicates
                const unique = new Set(result.data.files);
                expect(unique.size).toBe(result.data.files.length);
            }
        });

        it('should handle very deep directory structures', async () => {
            const deepDir = path.join(fixtureDir, 'a/b/c/d/e/f/g/h');
            await fs.mkdir(deepDir, { recursive: true });
            await fs.writeFile(path.join(deepDir, 'deep.ts'), 'export const deep = true;');

            try {
                const result = await scan({
                    rootDir: fixtureDir,
                    include: ['**/*.ts'],
                    exclude: [],
                    respectGitignore: false,
                });

                expect(result.ok).toBe(true);
                if (result.ok) {
                    const hasDeepFile = result.data.files.some(f => f.includes('deep.ts'));
                    expect(hasDeepFile).toBe(true);
                }
            } finally {
                await fs.rm(path.join(fixtureDir, 'a'), { recursive: true, force: true });
            }
        });
    });

    describe('Configuration Variations', () => {
        it('should use default patterns when include is empty', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: [], // Should use defaults: ['**/*.ts', '**/*.html']
                exclude: [],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);

                const hasTypeScript = result.data.files.some(f => f.endsWith('.ts'));
                const hasHTML = result.data.files.some(f => f.endsWith('.html'));
                expect(hasTypeScript || hasHTML).toBe(true);
            }
        });

        it('should support ignorePatterns option', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: ['**/*.model.ts', '**/*.validator.ts'],
                respectGitignore: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const hasModelFiles = result.data.files.some(f => f.includes('.model.ts'));
                const hasValidatorFiles = result.data.files.some(f => f.includes('.validator.ts'));
                expect(hasModelFiles).toBe(false);
                expect(hasValidatorFiles).toBe(false);
            }
        });

        it('should combine exclude and ignorePatterns', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['**/*.ts'],
                exclude: ['test/**'],
                ignorePatterns: ['**/*.spec.ts'],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const hasTestDir = result.data.files.some(f => f.includes('/test/'));
                const hasSpecFiles = result.data.files.some(f => f.includes('.spec.ts'));
                expect(hasTestDir).toBe(false);
                expect(hasSpecFiles).toBe(false);
            }
        });
    });

    describe('Real-World Patterns', () => {
        it('should scan like typical Angular CLI configuration', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['src/**/*.ts'],
                exclude: ['**/*.spec.ts', '**/*.d.ts'],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);
                expect(result.data.files.every(f => f.includes('/src/'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('.spec.ts'))).toBe(true);
            }
        });

        it('should find all component files (TS + HTML)', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['src/**/*.component.{ts,html}'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const componentFiles = result.data.files.filter(f =>
                    f.includes('.component.')
                );
                expect(componentFiles.length).toBeGreaterThan(0);

                const hasTS = componentFiles.some(f => f.endsWith('.ts'));
                const hasHTML = componentFiles.some(f => f.endsWith('.html'));
                expect(hasTS).toBe(true);
                expect(hasHTML).toBe(true);
            }
        });

        it('should scan with production-ready configuration', async () => {
            const result = await scan({
                rootDir: fixtureDir,
                include: ['src/**/*.{ts,html}'],
                exclude: [
                    '**/*.spec.ts',
                    '**/*.d.ts',
                    'test/**',
                    'e2e/**',
                ],
                ignorePatterns: [
                    '**/*.min.js',
                    '**/*.generated.ts',
                ],
                respectGitignore: true,
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);
                expect(result.data.stats.totalFiles).toBeGreaterThan(0);
                expect(result.data.timestamp).toBeGreaterThan(0);
            }
        });
    });
});
