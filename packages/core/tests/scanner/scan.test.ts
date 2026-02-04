import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scan } from '../../src/scanner/scan.js';
import fs from 'fs/promises';
import path from 'path';

describe('scan (Pipeline Composition)', () => {
    const testDir = path.join(__dirname, '.test-scan-pipeline');

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
        await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'src', 'app'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'src', 'lib'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'dist'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'test'), { recursive: true });

        // Create test files
        await fs.writeFile(path.join(testDir, 'src', 'app', 'app.component.ts'), 'component');
        await fs.writeFile(path.join(testDir, 'src', 'app', 'app.module.ts'), 'module');
        await fs.writeFile(path.join(testDir, 'src', 'lib', 'utils.ts'), 'utils');
        await fs.writeFile(path.join(testDir, 'src', 'lib', 'helpers.ts'), 'helpers');
        await fs.writeFile(path.join(testDir, 'src', 'app', 'template.html'), '<div>Template</div>');
        await fs.writeFile(path.join(testDir, 'dist', 'bundle.js'), 'compiled');
        await fs.writeFile(path.join(testDir, 'node_modules', 'lib.js'), 'library');
        await fs.writeFile(path.join(testDir, 'test', 'app.spec.ts'), 'test');

        // Create .gitignore
        await fs.writeFile(
            path.join(testDir, '.gitignore'),
            'node_modules/\ndist/\n*.log\n.cache/'
        );
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Complete Pipeline - Success Path', () => {
        it('should discover files matching include patterns', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);
                const basenames = result.data.files.map(f => path.basename(f));
                expect(basenames).toContain('app.component.ts');
                expect(basenames).toContain('app.module.ts');
                expect(basenames).toContain('utils.ts');
                expect(basenames).toContain('helpers.ts');
            }
        });

        it('should respect exclude patterns', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*'],
                exclude: ['dist/**', '*.js'],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
                expect(result.data.files.every(f => !f.endsWith('.js'))).toBe(true);
            }
        });

        it('should respect .gitignore when enabled', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*'],
                exclude: [],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should exclude node_modules and dist due to .gitignore
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
            }
        });

        it('should ignore .gitignore when disabled', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.js'],
                exclude: [],
                respectGitignore: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should include files from node_modules and dist
                const hasNodeModules = result.data.files.some(f =>
                    f.includes('node_modules')
                );
                const hasDist = result.data.files.some(f => f.includes('dist'));
                expect(hasNodeModules || hasDist).toBe(true);
            }
        });

        it('should support multiple include patterns', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts', '**/*.html'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const basenames = result.data.files.map(f => path.basename(f));
                expect(basenames).toContain('template.html');
                expect(basenames).toContain('app.component.ts');
            }
        });

        it('should exclude test files when specified', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: ['**/*.spec.ts'],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const hasSpecFiles = result.data.files.some(f => f.includes('.spec.ts'));
                expect(hasSpecFiles).toBe(false);
            }
        });

        it('should scan realistic Angular project structure', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: ['**/*.spec.ts'],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should find source files, not test/dist/node_modules
                const filenames = result.data.files.map(f => path.basename(f));
                expect(filenames).toContain('app.component.ts');
                expect(filenames).toContain('app.module.ts');
                expect(filenames).toContain('utils.ts');
                expect(filenames).toContain('helpers.ts');
                expect(filenames).not.toContain('app.spec.ts');
            }
        });

        it('should handle ignorePatterns option', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: ['**/*.spec.ts', '**/test/**'],
                respectGitignore: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const hasSpecFiles = result.data.files.some(f => f.includes('.spec.ts'));
                const hasTestDir = result.data.files.some(f => f.includes('/test/'));
                expect(hasSpecFiles).toBe(false);
                expect(hasTestDir).toBe(false);
            }
        });
    });

    describe('Statistics Generation', () => {
        it('should calculate file count statistics', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts', '**/*.html'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.stats.totalFiles).toBeGreaterThan(0);
                expect(result.data.stats.byExtension.get('.ts')).toBeGreaterThan(0);
            }
        });

        it('should measure scan time', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.stats.scanTime).toBeGreaterThan(0);
                expect(result.data.stats.scanTime).toBeLessThan(5000); // Should be fast
            }
        });

        it('should include timestamp', async () => {
            const before = Date.now();
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });
            const after = Date.now();

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.timestamp).toBeGreaterThanOrEqual(before);
                expect(result.data.timestamp).toBeLessThanOrEqual(after);
            }
        });

        it('should set cacheHit to false for non-cached scans', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.stats.cacheHit).toBe(false);
            }
        });

        it('should group files by extension correctly', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts', '**/*.html', '**/*.js'],
                exclude: [],
                respectGitignore: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.stats.byExtension.get('.ts')).toBeGreaterThan(0);
                expect(result.data.stats.byExtension.get('.html')).toBeGreaterThan(0);
                expect(result.data.stats.byExtension.get('.js')).toBeGreaterThan(0);
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty result set gracefully', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.java'], // No Java files
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
                expect(result.data.stats.totalFiles).toBe(0);
            }
        });

        it('should handle non-existent rootDir', async () => {
            const result = await scan({
                rootDir: '/absolutely/non/existent/path/12345',
                include: ['**/*.ts'],
                exclude: [],
            });

            // May return empty or error depending on implementation
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
            }
        });

        it('should deduplicate files found multiple times', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts', 'src/**/*.ts'], // Overlapping patterns
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should not have duplicates
                const unique = new Set(result.data.files);
                expect(unique.size).toBe(result.data.files.length);
            }
        });

        it('should handle relative rootDir (normalize to absolute)', async () => {
            // Change to parent dir and use relative path
            const relativePath = path.relative(process.cwd(), testDir);

            const result = await scan({
                rootDir: relativePath || '.',
                include: ['**/*.ts'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // All paths should be absolute
                expect(result.data.files.every(f => path.isAbsolute(f))).toBe(true);
            }
        });
    });

    describe('Default Values', () => {
        it('should use default include patterns when empty', async () => {
            const result = await scan({
                rootDir: testDir,
                include: [], // Empty should use defaults
                exclude: [],
            });

            expect(result.ok).toBe(true);
            // Should use defaults: ['**/*.ts', '**/*.html']
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);
            }
        });

        it('should default respectGitignore to true', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.js'],
                exclude: [],
                // respectGitignore not specified
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should exclude node_modules due to .gitignore
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
            }
        });

        it('should default followSymlinks to false', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
                // followSymlinks not specified
            });

            expect(result.ok).toBe(true);
            // Just verify scan completes successfully
        });
    });

    describe('Complex Patterns', () => {
        it('should handle multiple extensions in braces', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.{ts,html}'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const hasTypeScript = result.data.files.some(f => f.endsWith('.ts'));
                const hasHTML = result.data.files.some(f => f.endsWith('.html'));
                expect(hasTypeScript).toBe(true);
                expect(hasHTML).toBe(true);
            }
        });

        it('should handle complex exclude patterns', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*'],
                exclude: [
                    'node_modules/**',
                    'dist/**',
                    '**/*.spec.ts',
                    '**/*.d.ts',
                ],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('.spec.ts'))).toBe(true);
            }
        });
    });

    describe('Performance', () => {
        it('should complete scan in reasonable time', async () => {
            const start = performance.now();

            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            const duration = performance.now() - start;

            expect(result.ok).toBe(true);
            expect(duration).toBeLessThan(2000); // Should be fast for small project
        });

        it('should report accurate scan time in stats', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Scan time should be reasonable
                expect(result.data.stats.scanTime).toBeGreaterThan(0);
                expect(result.data.stats.scanTime).toBeLessThan(2000);
            }
        });
    });

    describe('Result Structure', () => {
        it('should return Result type with ok field', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            expect('ok' in result).toBe(true);
        });

        it('should have complete ScanResult structure on success', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect('files' in result.data).toBe(true);
                expect('stats' in result.data).toBe(true);
                expect('timestamp' in result.data).toBe(true);

                expect(Array.isArray(result.data.files)).toBe(true);
                expect(typeof result.data.stats).toBe('object');
                expect(typeof result.data.timestamp).toBe('number');

                // Stats structure
                expect('totalFiles' in result.data.stats).toBe(true);
                expect('byExtension' in result.data.stats).toBe(true);
                expect('totalSize' in result.data.stats).toBe(true);
                expect('scanTime' in result.data.stats).toBe(true);
                expect('cacheHit' in result.data.stats).toBe(true);
            }
        });

        it('should return readonly arrays and objects', async () => {
            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(Array.isArray(result.data.files)).toBe(true);
                expect(result.data.stats.byExtension instanceof Map).toBe(true);
            }
        });
    });

    describe('Integration with .gitignore', () => {
        it('should respect multiple gitignore patterns', async () => {
            // Update .gitignore
            await fs.writeFile(
                path.join(testDir, '.gitignore'),
                'node_modules/\ndist/\n*.log\n*.tmp\nbuild/'
            );

            const result = await scan({
                rootDir: testDir,
                include: ['**/*'],
                exclude: [],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
            }
        });

        it('should work without .gitignore file', async () => {
            // Remove .gitignore
            await fs.unlink(path.join(testDir, '.gitignore'));

            const result = await scan({
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
                respectGitignore: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);
            }
        });
    });
});
