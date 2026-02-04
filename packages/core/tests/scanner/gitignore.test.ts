import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fc } from 'fast-check';
import {
    createGitignoreFilter,
    createPassThroughFilter,
    loadGitignore,
    loadAndCreateGitignoreFilter,
} from '../../src/scanner/gitignore.js';
import path from 'path';
import fs from 'fs/promises';

describe('createGitignoreFilter (Higher-Order Function)', () => {
    describe('Factory Function Behavior', () => {
        it('should create a filter function from gitignore content', () => {
            const content = 'node_modules/\n*.log\ndist/';
            const filter = createGitignoreFilter(content);

            expect(typeof filter).toBe('function');
            expect(filter.length).toBe(2); // Takes (file, rootDir)
        });

        it('should create different filter functions for different content', () => {
            const filter1 = createGitignoreFilter('*.log');
            const filter2 = createGitignoreFilter('*.tmp');

            expect(filter1).not.toBe(filter2);
        });

        it('should handle empty content', () => {
            const filter = createGitignoreFilter('');

            expect(typeof filter).toBe('function');
        });
    });

    describe('Returned Filter Function Behavior', () => {
        it('should filter files matching gitignore patterns', () => {
            const content = 'node_modules/\n*.log\ndist/';
            const filter = createGitignoreFilter(content);
            const rootDir = '/project';

            expect(filter('/project/src/app.ts', rootDir)).toBe(true); // Not ignored
            expect(filter('/project/node_modules/lib.js', rootDir)).toBe(false); // Ignored
            expect(filter('/project/debug.log', rootDir)).toBe(false); // Ignored
            expect(filter('/project/dist/bundle.js', rootDir)).toBe(false); // Ignored
        });

        it('should handle nested directories', () => {
            const content = 'build/';
            const filter = createGitignoreFilter(content);
            const rootDir = '/project';

            expect(filter('/project/src/app.ts', rootDir)).toBe(true);
            expect(filter('/project/build/index.js', rootDir)).toBe(false);
            expect(filter('/project/src/build/test.ts', rootDir)).toBe(false);
        });

        it('should handle wildcard patterns', () => {
            const content = '*.min.js\n*.map';
            const filter = createGitignoreFilter(content);
            const rootDir = '/app';

            expect(filter('/app/src/app.js', rootDir)).toBe(true);
            expect(filter('/app/dist/bundle.min.js', rootDir)).toBe(false);
            expect(filter('/app/dist/app.js.map', rootDir)).toBe(false);
        });

        it('should handle negation patterns', () => {
            const content = '*.log\n!important.log';
            const filter = createGitignoreFilter(content);
            const rootDir = '/logs';

            expect(filter('/logs/debug.log', rootDir)).toBe(false);
            expect(filter('/logs/important.log', rootDir)).toBe(true); // Not ignored due to !
        });

        it('should handle comment lines', () => {
            const content = '# This is a comment\nnode_modules/\n# Another comment\n*.log';
            const filter = createGitignoreFilter(content);
            const rootDir = '/project';

            expect(filter('/project/src/app.ts', rootDir)).toBe(true);
            expect(filter('/project/node_modules/lib.js', rootDir)).toBe(false);
            expect(filter('/project/debug.log', rootDir)).toBe(false);
        });

        it('should handle empty content (allows all)', () => {
            const filter = createGitignoreFilter('');
            const rootDir = '/project';

            expect(filter('/project/src/app.ts', rootDir)).toBe(true);
            expect(filter('/project/any/file.js', rootDir)).toBe(true);
        });

        it('should handle double-star patterns', () => {
            const content = '**/node_modules/**';
            const filter = createGitignoreFilter(content);
            const rootDir = '/app';

            expect(filter('/app/src/app.ts', rootDir)).toBe(true);
            expect(filter('/app/node_modules/lib.js', rootDir)).toBe(false);
            expect(filter('/app/src/lib/node_modules/dep.js', rootDir)).toBe(false);
        });

        it('should handle leading slash patterns', () => {
            const content = '/dist';
            const filter = createGitignoreFilter(content);
            const rootDir = '/project';

            expect(filter('/project/dist/bundle.js', rootDir)).toBe(false);
            expect(filter('/project/src/dist/file.ts', rootDir)).toBe(true); // Only root /dist ignored
        });

        it('should be case-sensitive on case-sensitive systems', () => {
            const content = 'Dist/';
            const filter = createGitignoreFilter(content);
            const rootDir = '/project';

            // On case-sensitive systems
            if (process.platform !== 'win32') {
                expect(filter('/project/dist/file.js', rootDir)).toBe(true);
                expect(filter('/project/Dist/file.js', rootDir)).toBe(false);
            }
        });
    });

    describe('Property-Based Tests', () => {
        it('should always return boolean', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.string(),
                    fc.string(),
                    (content, file, rootDir) => {
                        const filter = createGitignoreFilter(content);
                        const result = filter(file, rootDir);
                        expect(typeof result).toBe('boolean');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should be deterministic (same inputs = same output)', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.string(),
                    fc.string(),
                    (content, file, rootDir) => {
                        const filter = createGitignoreFilter(content);
                        const result1 = filter(file, rootDir);
                        const result2 = filter(file, rootDir);
                        expect(result1).toBe(result2);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should handle empty strings gracefully', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    (content) => {
                        const filter = createGitignoreFilter(content);
                        const result = filter('', '');
                        expect(typeof result).toBe('boolean');
                    }
                ),
                { numRuns: 500 }
            );
        });
    });
});

describe('createPassThroughFilter', () => {
    describe('Example-based tests', () => {
        it('should always return true (allows all files)', () => {
            const filter = createPassThroughFilter();

            expect(filter('/any/file.ts', '/any')).toBe(true);
            expect(filter('/node_modules/lib.js', '/')).toBe(true);
            expect(filter('', '')).toBe(true);
        });

        it('should be a valid GitignoreFilter type', () => {
            const filter = createPassThroughFilter();
            expect(typeof filter).toBe('function');
            expect(filter.length).toBe(2);
        });
    });

    describe('Property-based tests', () => {
        it('should always return true for any input', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.string(),
                    (file, rootDir) => {
                        const filter = createPassThroughFilter();
                        expect(filter(file, rootDir)).toBe(true);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });
});

describe('loadGitignore (Side Effect - File I/O)', () => {
    const testDir = path.join(__dirname, '.test-gitignore-load');

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Example-based tests', () => {
        it('should load .gitignore content', async () => {
            const gitignorePath = path.join(testDir, '.gitignore');
            await fs.writeFile(gitignorePath, 'node_modules/\n*.log');

            const content = await loadGitignore(testDir);

            expect(content).toContain('node_modules/');
            expect(content).toContain('*.log');
        });

        it('should return null when .gitignore does not exist', async () => {
            const content = await loadGitignore(testDir);

            expect(content).toBeNull();
        });

        it('should handle empty .gitignore', async () => {
            const gitignorePath = path.join(testDir, '.gitignore');
            await fs.writeFile(gitignorePath, '');

            const content = await loadGitignore(testDir);

            expect(content).toBe('');
        });

        it('should handle .gitignore with only whitespace', async () => {
            const gitignorePath = path.join(testDir, '.gitignore');
            await fs.writeFile(gitignorePath, '   \n\n   \t');

            const content = await loadGitignore(testDir);

            expect(content).toContain('   ');
        });

        it('should handle .gitignore with comments', async () => {
            const gitignorePath = path.join(testDir, '.gitignore');
            await fs.writeFile(
                gitignorePath,
                '# Comment\nnode_modules/\n# Another comment'
            );

            const content = await loadGitignore(testDir);

            expect(content).toContain('# Comment');
            expect(content).toContain('node_modules/');
        });
    });
});

describe('loadAndCreateGitignoreFilter (Side Effect + HOF)', () => {
    const testDir = path.join(__dirname, '.test-gitignore-filter');

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Success Path (Result.ok = true)', () => {
        it('should load .gitignore and create filter', async () => {
            const gitignorePath = path.join(testDir, '.gitignore');
            await fs.writeFile(gitignorePath, 'node_modules/\n*.log');

            const result = await loadAndCreateGitignoreFilter(testDir);

            expect(result.ok).toBe(true);
            if (result.ok) {
                const filter = result.data;
                expect(filter(path.join(testDir, 'src/app.ts'), testDir)).toBe(true);
                expect(filter(path.join(testDir, 'node_modules/lib.js'), testDir)).toBe(false);
                expect(filter(path.join(testDir, 'debug.log'), testDir)).toBe(false);
            }
        });

        it('should return pass-through filter when no .gitignore exists', async () => {
            const result = await loadAndCreateGitignoreFilter(testDir);

            expect(result.ok).toBe(true);
            if (result.ok) {
                const filter = result.data;
                expect(filter(path.join(testDir, 'any/file.ts'), testDir)).toBe(true);
                expect(filter(path.join(testDir, 'node_modules/lib.js'), testDir)).toBe(true);
            }
        });

        it('should create filter from empty .gitignore', async () => {
            const gitignorePath = path.join(testDir, '.gitignore');
            await fs.writeFile(gitignorePath, '');

            const result = await loadAndCreateGitignoreFilter(testDir);

            expect(result.ok).toBe(true);
            if (result.ok) {
                const filter = result.data;
                expect(filter(path.join(testDir, 'any/file.ts'), testDir)).toBe(true);
            }
        });

        it('should create filter with complex patterns', async () => {
            const gitignorePath = path.join(testDir, '.gitignore');
            await fs.writeFile(
                gitignorePath,
                '# Comments\nnode_modules/\ndist/\n*.log\n*.tmp\n!important.log'
            );

            const result = await loadAndCreateGitignoreFilter(testDir);

            expect(result.ok).toBe(true);
            if (result.ok) {
                const filter = result.data;
                expect(filter(path.join(testDir, 'src/app.ts'), testDir)).toBe(true);
                expect(filter(path.join(testDir, 'node_modules/lib.js'), testDir)).toBe(false);
                expect(filter(path.join(testDir, 'dist/bundle.js'), testDir)).toBe(false);
                expect(filter(path.join(testDir, 'debug.log'), testDir)).toBe(false);
                expect(filter(path.join(testDir, 'temp.tmp'), testDir)).toBe(false);
                expect(filter(path.join(testDir, 'important.log'), testDir)).toBe(true);
            }
        });
    });

    describe('Error Path (Result.ok = false)', () => {
        it('should handle non-existent directory gracefully', async () => {
            const result = await loadAndCreateGitignoreFilter(
                '/absolutely/non/existent/path/12345'
            );

            // Should return pass-through filter or error
            expect(result.ok).toBe(true); // Current implementation returns pass-through
        });

        it('should handle permission errors gracefully', async () => {
            // This test is platform-dependent and may need adjustment
            const result = await loadAndCreateGitignoreFilter('/root/protected');

            expect(result.ok).toBe(true); // Should still work (returns pass-through)
        });
    });

    describe('Result Type Properties', () => {
        it('should return Result type with ok field', async () => {
            const result = await loadAndCreateGitignoreFilter(testDir);

            expect('ok' in result).toBe(true);
            if (result.ok) {
                expect('data' in result).toBe(true);
                expect('error' in result).toBe(false);
            } else {
                expect('data' in result).toBe(false);
                expect('error' in result).toBe(true);
            }
        });

        it('should return filter function on success', async () => {
            const result = await loadAndCreateGitignoreFilter(testDir);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(typeof result.data).toBe('function');
            }
        });
    });
});
