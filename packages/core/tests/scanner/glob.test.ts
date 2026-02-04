import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeGlob } from '../../src/scanner/glob.js';
import fs from 'fs/promises';
import path from 'path';

describe('executeGlob (Side Effect - Isolated)', () => {
    const testDir = path.join(__dirname, '.test-glob-fixtures');

    beforeEach(async () => {
        // Setup test fixture directory
        await fs.mkdir(testDir, { recursive: true });
        await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'src', 'components'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'lib'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'dist'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
        await fs.mkdir(path.join(testDir, 'test'), { recursive: true });

        // Create test files
        await fs.writeFile(path.join(testDir, 'src', 'app.ts'), 'export const app = "app";');
        await fs.writeFile(path.join(testDir, 'src', 'utils.ts'), 'export const utils = () => {};');
        await fs.writeFile(path.join(testDir, 'src', 'components', 'button.tsx'), 'export const Button = () => {};');
        await fs.writeFile(path.join(testDir, 'lib', 'helper.ts'), 'export const helper = () => {};');
        await fs.writeFile(path.join(testDir, 'lib', 'index.js'), 'module.exports = {};');
        await fs.writeFile(path.join(testDir, 'dist', 'bundle.js'), 'compiled code');
        await fs.writeFile(path.join(testDir, 'node_modules', 'lib.js'), 'library code');
        await fs.writeFile(path.join(testDir, 'test', 'app.spec.ts'), 'test code');
        await fs.writeFile(path.join(testDir, 'README.md'), '# README');
    });

    afterEach(async () => {
        // Cleanup
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Success Path (Result.ok = true)', () => {
        it('should find matching files', async () => {
            const patterns = {
                include: ['**/*.ts'],
                ignore: ['dist/**'],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);
                const basenames = result.data.files.map(f => path.basename(f));
                expect(basenames).toContain('app.ts');
                expect(basenames).toContain('utils.ts');
                expect(basenames).toContain('helper.ts');
                expect(basenames).toContain('app.spec.ts');
            }
        });

        it('should respect ignore patterns', async () => {
            const patterns = {
                include: ['**/*'],
                ignore: ['dist/**', '**/*.js', 'node_modules/**'],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
                expect(result.data.files.every(f => !f.endsWith('.js'))).toBe(true);
            }
        });

        it('should find files with multiple extensions', async () => {
            const patterns = {
                include: ['**/*.{ts,tsx}'],
                ignore: [],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const basenames = result.data.files.map(f => path.basename(f));
                expect(basenames).toContain('app.ts');
                expect(basenames).toContain('button.tsx');
                expect(basenames.every(f => f.endsWith('.ts') || f.endsWith('.tsx'))).toBe(true);
            }
        });

        it('should return empty array when no files match', async () => {
            const patterns = {
                include: ['**/*.java'],
                ignore: [],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
            }
        });

        it('should find files in nested directories', async () => {
            const patterns = {
                include: ['src/**/*.tsx'],
                ignore: [],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBe(1);
                expect(result.data.files[0]).toContain('button.tsx');
            }
        });

        it('should support wildcard patterns', async () => {
            const patterns = {
                include: ['*.md'],
                ignore: [],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBe(1);
                expect(result.data.files[0]).toContain('README.md');
            }
        });

        it('should handle multiple include patterns', async () => {
            const patterns = {
                include: ['**/*.ts', '**/*.md'],
                ignore: ['**/*.spec.ts'],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const basenames = result.data.files.map(f => path.basename(f));
                expect(basenames).toContain('app.ts');
                expect(basenames).toContain('README.md');
                expect(basenames).not.toContain('app.spec.ts');
            }
        });

        it('should return absolute paths', async () => {
            const patterns = {
                include: ['**/*.ts'],
                ignore: [],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.every(f => path.isAbsolute(f))).toBe(true);
            }
        });

        it('should exclude spec files when specified', async () => {
            const patterns = {
                include: ['**/*.ts'],
                ignore: ['**/*.spec.ts'],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const hasSpecFiles = result.data.files.some(f => f.includes('.spec.ts'));
                expect(hasSpecFiles).toBe(false);
            }
        });

        it('should find all TypeScript files by default', async () => {
            const patterns = {
                include: ['**/*.ts', '**/*.tsx'],
                ignore: ['node_modules/**', 'dist/**'],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBeGreaterThan(0);
                const allTypeScript = result.data.files.every(f =>
                    f.endsWith('.ts') || f.endsWith('.tsx')
                );
                expect(allTypeScript).toBe(true);
            }
        });
    });

    describe('Result Type Properties', () => {
        it('should return Result type with ok field', async () => {
            const patterns = { include: ['**/*.ts'], ignore: [] };
            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect('ok' in result).toBe(true);
        });

        it('should never return both ok=true and error', async () => {
            const patterns = { include: ['**/*.ts'], ignore: [] };
            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            if (result.ok) {
                expect('error' in result).toBe(false);
                expect('data' in result).toBe(true);
            } else {
                expect('data' in result).toBe(false);
                expect('error' in result).toBe(true);
            }
        });

        it('should have files array in data when successful', async () => {
            const patterns = { include: ['**/*.ts'], ignore: [] };
            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(Array.isArray(result.data.files)).toBe(true);
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty include patterns', async () => {
            const patterns = {
                include: [],
                ignore: [],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
            }
        });

        it('should handle non-existent directory gracefully', async () => {
            const patterns = {
                include: ['**/*.ts'],
                ignore: [],
            };

            const result = await executeGlob(
                patterns,
                '/absolutely/non/existent/path/12345',
                { followSymlinks: false }
            );

            // fast-glob returns empty for non-existent paths
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
            }
        });

        it('should handle patterns with no matches', async () => {
            const patterns = {
                include: ['**/*.nonexistent'],
                ignore: [],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
            }
        });

        it('should handle very specific patterns', async () => {
            const patterns = {
                include: ['src/app.ts'],
                ignore: [],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBeLessThanOrEqual(1);
            }
        });
    });

    describe('followSymlinks Option', () => {
        it('should respect followSymlinks=false', async () => {
            const patterns = { include: ['**/*.ts'], ignore: [] };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
        });

        it('should respect followSymlinks=true', async () => {
            const patterns = { include: ['**/*.ts'], ignore: [] };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: true,
            });

            expect(result.ok).toBe(true);
        });
    });

    describe('Complex Pattern Combinations', () => {
        it('should handle exclude patterns for common directories', async () => {
            const patterns = {
                include: ['**/*'],
                ignore: [
                    'node_modules/**',
                    'dist/**',
                    '**/*.spec.ts',
                    '**/*.d.ts',
                ],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.every(f => !f.includes('node_modules'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('dist'))).toBe(true);
                expect(result.data.files.every(f => !f.includes('.spec.ts'))).toBe(true);
            }
        });

        it('should find TypeScript and HTML files', async () => {
            // Create HTML file
            await fs.writeFile(path.join(testDir, 'src', 'template.html'), '<div>Template</div>');

            const patterns = {
                include: ['**/*.ts', '**/*.html'],
                ignore: ['node_modules/**'],
            };

            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                const hasTypeScript = result.data.files.some(f => f.endsWith('.ts'));
                const hasHTML = result.data.files.some(f => f.endsWith('.html'));
                expect(hasTypeScript).toBe(true);
                expect(hasHTML).toBe(true);
            }

            // Cleanup
            await fs.unlink(path.join(testDir, 'src', 'template.html'));
        });
    });

    describe('Performance', () => {
        it('should complete in reasonable time for small directories', async () => {
            const patterns = {
                include: ['**/*.ts'],
                ignore: [],
            };

            const start = performance.now();
            const result = await executeGlob(patterns, testDir, {
                followSymlinks: false,
            });
            const duration = performance.now() - start;

            expect(result.ok).toBe(true);
            expect(duration).toBeLessThan(1000); // Should be very fast for small dir
        });
    });
});
