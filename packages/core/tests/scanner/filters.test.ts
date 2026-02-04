import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fc } from 'fast-check';
import {
    deduplicateFiles,
    filterByExtension,
    applyGitignoreFilter,
    applyFilters,
} from '../../src/scanner/filters.js';
import type { RawFileList, NormalizedOptions } from '../../src/scanner/types.js';
import fs from 'fs/promises';
import path from 'path';

describe('deduplicateFiles (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should remove duplicate files', () => {
            const files = [
                '/app/src/app.ts',
                '/app/src/utils.ts',
                '/app/src/app.ts', // Duplicate
                '/app/lib/helper.ts',
                '/app/src/utils.ts', // Duplicate
            ];

            const result = deduplicateFiles(files);

            expect(result).toHaveLength(3);
            expect(result).toContain('/app/src/app.ts');
            expect(result).toContain('/app/src/utils.ts');
            expect(result).toContain('/app/lib/helper.ts');
        });

        it('should handle array with no duplicates', () => {
            const files = [
                '/app/src/app.ts',
                '/app/src/utils.ts',
                '/app/lib/helper.ts',
            ];

            const result = deduplicateFiles(files);

            expect(result).toHaveLength(3);
            expect(result).toEqual(expect.arrayContaining(files));
        });

        it('should handle empty array', () => {
            const result = deduplicateFiles([]);

            expect(result).toEqual([]);
        });

        it('should handle array with single item', () => {
            const files = ['/app/src/app.ts'];

            const result = deduplicateFiles(files);

            expect(result).toEqual(files);
        });

        it('should handle array with all duplicates', () => {
            const files = [
                '/app/src/app.ts',
                '/app/src/app.ts',
                '/app/src/app.ts',
            ];

            const result = deduplicateFiles(files);

            expect(result).toHaveLength(1);
            expect(result[0]).toBe('/app/src/app.ts');
        });
    });

    describe('Property-based tests', () => {
        it('should not mutate input array', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files) => {
                        const original = [...files];
                        deduplicateFiles(files);
                        expect(files).toEqual(original);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should return array with length <= input length', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files) => {
                        const result = deduplicateFiles(files);
                        expect(result.length).toBeLessThanOrEqual(files.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should have no duplicate entries in result', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files) => {
                        const result = deduplicateFiles(files);
                        const unique = new Set(result);
                        expect(unique.size).toBe(result.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should be idempotent (deduplicating twice = once)', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files) => {
                        const once = deduplicateFiles(files);
                        const twice = deduplicateFiles(once);
                        expect(once).toEqual(twice);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });
});

describe('filterByExtension (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should filter files by extension', () => {
            const files = [
                '/app/src/app.ts',
                '/app/src/utils.ts',
                '/app/lib/component.tsx',
                '/app/styles/main.css',
            ];

            const result = filterByExtension(files, ['.ts', '.tsx']);

            expect(result).toHaveLength(3);
            expect(result).toContain('/app/src/app.ts');
            expect(result).toContain('/app/src/utils.ts');
            expect(result).toContain('/app/lib/component.tsx');
            expect(result).not.toContain('/app/styles/main.css');
        });

        it('should return empty array when no files match', () => {
            const files = [
                '/app/src/app.ts',
                '/app/lib/utils.ts',
            ];

            const result = filterByExtension(files, ['.css', '.scss']);

            expect(result).toEqual([]);
        });

        it('should handle empty extensions array (returns all)', () => {
            const files = ['/app/src/app.ts', '/app/lib/utils.js'];

            const result = filterByExtension(files, []);

            expect(result).toEqual(files);
        });

        it('should handle empty files array', () => {
            const result = filterByExtension([], ['.ts']);

            expect(result).toEqual([]);
        });

        it('should be case-sensitive', () => {
            const files = [
                '/app/file.ts',
                '/app/file.TS',
            ];

            const result = filterByExtension(files, ['.ts']);

            expect(result).toHaveLength(1);
            expect(result[0]).toBe('/app/file.ts');
        });

        it('should handle files without extensions', () => {
            const files = [
                '/app/README',
                '/app/src/app.ts',
            ];

            const result = filterByExtension(files, ['.ts']);

            expect(result).toHaveLength(1);
            expect(result[0]).toBe('/app/src/app.ts');
        });
    });

    describe('Property-based tests', () => {
        it('should not mutate input arrays', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    (files, extensions) => {
                        const originalFiles = [...files];
                        const originalExts = [...extensions];

                        filterByExtension(files, extensions);

                        expect(files).toEqual(originalFiles);
                        expect(extensions).toEqual(originalExts);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should return array with length <= input length', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    (files, extensions) => {
                        const result = filterByExtension(files, extensions);
                        expect(result.length).toBeLessThanOrEqual(files.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should return all files when extensions is empty', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files) => {
                        const result = filterByExtension(files, []);
                        expect(result.length).toBe(files.length);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });
});

describe('applyGitignoreFilter (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should filter files using gitignore filter', () => {
            const files = [
                '/project/src/app.ts',
                '/project/node_modules/lib.js',
                '/project/dist/bundle.js',
            ];
            const rootDir = '/project';
            const filter = (file: string, _rootDir: string) => {
                // Ignore node_modules and dist
                return !file.includes('node_modules') && !file.includes('dist');
            };

            const result = applyGitignoreFilter(files, rootDir, filter);

            expect(result).toHaveLength(1);
            expect(result[0]).toBe('/project/src/app.ts');
        });

        it('should keep all files when filter allows everything', () => {
            const files = [
                '/project/src/app.ts',
                '/project/lib/utils.ts',
            ];
            const rootDir = '/project';
            const filter = () => true; // Allow all

            const result = applyGitignoreFilter(files, rootDir, filter);

            expect(result).toEqual(files);
        });

        it('should remove all files when filter blocks everything', () => {
            const files = [
                '/project/src/app.ts',
                '/project/lib/utils.ts',
            ];
            const rootDir = '/project';
            const filter = () => false; // Block all

            const result = applyGitignoreFilter(files, rootDir, filter);

            expect(result).toEqual([]);
        });

        it('should handle empty file list', () => {
            const rootDir = '/project';
            const filter = () => true;

            const result = applyGitignoreFilter([], rootDir, filter);

            expect(result).toEqual([]);
        });

        it('should call filter with correct arguments', () => {
            const files = ['/project/src/app.ts'];
            const rootDir = '/project';
            let calledWithFile = '';
            let calledWithRoot = '';

            const filter = (file: string, root: string) => {
                calledWithFile = file;
                calledWithRoot = root;
                return true;
            };

            applyGitignoreFilter(files, rootDir, filter);

            expect(calledWithFile).toBe('/project/src/app.ts');
            expect(calledWithRoot).toBe('/project');
        });
    });

    describe('Property-based tests', () => {
        it('should not mutate input array', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    fc.string(),
                    (files, rootDir) => {
                        const original = [...files];
                        const filter = () => true;

                        applyGitignoreFilter(files, rootDir, filter);

                        expect(files).toEqual(original);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should return array with length <= input length', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    fc.string(),
                    fc.boolean(),
                    (files, rootDir, allowAll) => {
                        const filter = () => allowAll;
                        const result = applyGitignoreFilter(files, rootDir, filter);

                        expect(result.length).toBeLessThanOrEqual(files.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });
});

describe('applyFilters (Integration with Side Effects)', () => {
    const testDir = path.join(__dirname, '.test-filters');

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Success Path (Result.ok = true)', () => {
        it('should filter files with gitignore enabled', async () => {
            // Create .gitignore
            await fs.writeFile(
                path.join(testDir, '.gitignore'),
                'node_modules/\ndist/'
            );

            const rawFiles: RawFileList = {
                files: [
                    path.join(testDir, 'src/app.ts'),
                    path.join(testDir, 'node_modules/lib.js'),
                    path.join(testDir, 'dist/bundle.js'),
                ],
            };

            const options: NormalizedOptions = {
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: [],
                respectGitignore: true,
                followSymlinks: false,
            };

            const result = await applyFilters(rawFiles, options);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files.length).toBe(1);
                expect(result.data.files[0]).toContain('src/app.ts');
                expect(result.data.filtered).toBe(2); // 2 files filtered out
            }
        });

        it('should not filter when gitignore is disabled', async () => {
            // Create .gitignore
            await fs.writeFile(
                path.join(testDir, '.gitignore'),
                'node_modules/'
            );

            const rawFiles: RawFileList = {
                files: [
                    path.join(testDir, 'src/app.ts'),
                    path.join(testDir, 'node_modules/lib.js'),
                ],
            };

            const options: NormalizedOptions = {
                rootDir: testDir,
                include: ['**/*'],
                exclude: [],
                ignorePatterns: [],
                respectGitignore: false,
                followSymlinks: false,
            };

            const result = await applyFilters(rawFiles, options);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toHaveLength(2);
            }
        });

        it('should deduplicate files', async () => {
            const rawFiles: RawFileList = {
                files: [
                    path.join(testDir, 'src/app.ts'),
                    path.join(testDir, 'src/utils.ts'),
                    path.join(testDir, 'src/app.ts'), // Duplicate
                ],
            };

            const options: NormalizedOptions = {
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: [],
                respectGitignore: false,
                followSymlinks: false,
            };

            const result = await applyFilters(rawFiles, options);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toHaveLength(2);
                expect(result.data.filtered).toBe(1); // 1 duplicate removed
            }
        });

        it('should handle empty file list', async () => {
            const rawFiles: RawFileList = {
                files: [],
            };

            const options: NormalizedOptions = {
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: [],
                respectGitignore: false,
                followSymlinks: false,
            };

            const result = await applyFilters(rawFiles, options);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toEqual([]);
                expect(result.data.filtered).toBe(0);
            }
        });

        it('should work without .gitignore file', async () => {
            const rawFiles: RawFileList = {
                files: [
                    path.join(testDir, 'src/app.ts'),
                    path.join(testDir, 'lib/utils.ts'),
                ],
            };

            const options: NormalizedOptions = {
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: [],
                respectGitignore: true,
                followSymlinks: false,
            };

            const result = await applyFilters(rawFiles, options);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toHaveLength(2);
            }
        });

        it('should calculate filtered count correctly', async () => {
            await fs.writeFile(
                path.join(testDir, '.gitignore'),
                '*.log\n*.tmp'
            );

            const rawFiles: RawFileList = {
                files: [
                    path.join(testDir, 'app.ts'),
                    path.join(testDir, 'debug.log'),
                    path.join(testDir, 'cache.tmp'),
                    path.join(testDir, 'utils.ts'),
                ],
            };

            const options: NormalizedOptions = {
                rootDir: testDir,
                include: ['**/*'],
                exclude: [],
                ignorePatterns: [],
                respectGitignore: true,
                followSymlinks: false,
            };

            const result = await applyFilters(rawFiles, options);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.files).toHaveLength(2);
                expect(result.data.filtered).toBe(2);
            }
        });
    });

    describe('Result Type Properties', () => {
        it('should return Result type with ok field', async () => {
            const rawFiles: RawFileList = { files: [] };
            const options: NormalizedOptions = {
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: [],
                respectGitignore: false,
                followSymlinks: false,
            };

            const result = await applyFilters(rawFiles, options);

            expect('ok' in result).toBe(true);
        });

        it('should have FilteredFileList structure on success', async () => {
            const rawFiles: RawFileList = {
                files: [path.join(testDir, 'app.ts')],
            };
            const options: NormalizedOptions = {
                rootDir: testDir,
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: [],
                respectGitignore: false,
                followSymlinks: false,
            };

            const result = await applyFilters(rawFiles, options);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect('files' in result.data).toBe(true);
                expect('filtered' in result.data).toBe(true);
                expect(Array.isArray(result.data.files)).toBe(true);
                expect(typeof result.data.filtered).toBe('number');
            }
        });
    });
});
