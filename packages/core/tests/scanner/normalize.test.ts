import { describe, it, expect } from 'vitest';
import { fc } from 'fast-check';
import { normalizeOptions, validateOptions } from '../../src/scanner/normalize.js';
import type { ScanOptions } from '../../src/scanner/types.js';
import path from 'path';

describe('normalizeOptions (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should resolve rootDir to absolute path', () => {
            const options: ScanOptions = {
                rootDir: './src',
                include: ['**/*.ts'],
                exclude: ['node_modules'],
            };

            const result = normalizeOptions(options);

            expect(path.isAbsolute(result.rootDir)).toBe(true);
            expect(result.rootDir).toContain('src');
        });

        it('should use default include patterns when empty', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: [],
                exclude: [],
            };

            const result = normalizeOptions(options);

            expect(result.include).toEqual(['**/*.ts', '**/*.html']);
        });

        it('should preserve non-empty include patterns', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.tsx', '**/*.jsx'],
                exclude: [],
            };

            const result = normalizeOptions(options);

            expect(result.include).toEqual(['**/*.tsx', '**/*.jsx']);
        });

        it('should default ignorePatterns to empty array', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: [],
            };

            const result = normalizeOptions(options);

            expect(result.ignorePatterns).toEqual([]);
        });

        it('should preserve provided ignorePatterns', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: ['**/*.min.js', '**/*.d.ts'],
            };

            const result = normalizeOptions(options);

            expect(result.ignorePatterns).toEqual(['**/*.min.js', '**/*.d.ts']);
        });

        it('should default respectGitignore to true', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: [],
            };

            const result = normalizeOptions(options);

            expect(result.respectGitignore).toBe(true);
        });

        it('should preserve respectGitignore when false', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: [],
                respectGitignore: false,
            };

            const result = normalizeOptions(options);

            expect(result.respectGitignore).toBe(false);
        });

        it('should default followSymlinks to false', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: [],
            };

            const result = normalizeOptions(options);

            expect(result.followSymlinks).toBe(false);
        });

        it('should preserve followSymlinks when true', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: [],
                followSymlinks: true,
            };

            const result = normalizeOptions(options);

            expect(result.followSymlinks).toBe(true);
        });

        it('should preserve exclude patterns', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: ['node_modules', 'dist', 'build'],
            };

            const result = normalizeOptions(options);

            expect(result.exclude).toEqual(['node_modules', 'dist', 'build']);
        });

        it('should handle complex options', () => {
            const options: ScanOptions = {
                rootDir: './my-project',
                include: ['src/**/*.ts', 'lib/**/*.tsx'],
                exclude: ['**/*.spec.ts', 'node_modules'],
                ignorePatterns: ['**/*.min.js'],
                respectGitignore: true,
                followSymlinks: true,
            };

            const result = normalizeOptions(options);

            expect(path.isAbsolute(result.rootDir)).toBe(true);
            expect(result.include).toEqual(['src/**/*.ts', 'lib/**/*.tsx']);
            expect(result.exclude).toEqual(['**/*.spec.ts', 'node_modules']);
            expect(result.ignorePatterns).toEqual(['**/*.min.js']);
            expect(result.respectGitignore).toBe(true);
            expect(result.followSymlinks).toBe(true);
        });
    });

    describe('Property-based tests', () => {
        it('should always produce absolute rootDir', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    (rootDir, include, exclude) => {
                        const options: ScanOptions = {
                            rootDir: rootDir || '.',
                            include,
                            exclude,
                        };

                        const result = normalizeOptions(options);
                        expect(path.isAbsolute(result.rootDir)).toBe(true);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should preserve include length when non-empty', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string(), { minLength: 1 }),
                    (include) => {
                        const options: ScanOptions = {
                            rootDir: '/project',
                            include,
                            exclude: [],
                        };

                        const result = normalizeOptions(options);
                        expect(result.include.length).toBe(include.length);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should always return required fields', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    (rootDir, include, exclude) => {
                        const options: ScanOptions = {
                            rootDir: rootDir || '.',
                            include,
                            exclude,
                        };

                        const result = normalizeOptions(options);

                        expect('rootDir' in result).toBe(true);
                        expect('include' in result).toBe(true);
                        expect('exclude' in result).toBe(true);
                        expect('ignorePatterns' in result).toBe(true);
                        expect('respectGitignore' in result).toBe(true);
                        expect('followSymlinks' in result).toBe(true);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should be deterministic (same input = same output)', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    (rootDir, include, exclude) => {
                        const options: ScanOptions = {
                            rootDir: rootDir || '.',
                            include,
                            exclude,
                        };

                        const result1 = normalizeOptions(options);
                        const result2 = normalizeOptions(options);

                        expect(result1).toEqual(result2);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate input options', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: ['node_modules'],
                ignorePatterns: ['dist'],
            };

            const original = JSON.parse(JSON.stringify(options));
            normalizeOptions(options);

            expect(options).toEqual(original);
        });
    });

    describe('Default values behavior', () => {
        it('should use defaults for all optional fields', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: [],
                exclude: [],
            };

            const result = normalizeOptions(options);

            expect(result.include).toEqual(['**/*.ts', '**/*.html']);
            expect(result.ignorePatterns).toEqual([]);
            expect(result.respectGitignore).toBe(true);
            expect(result.followSymlinks).toBe(false);
        });
    });
});

describe('validateOptions (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should return empty array for valid options', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: ['node_modules'],
            };

            const errors = validateOptions(options);

            expect(errors).toEqual([]);
        });

        it('should return error for empty rootDir', () => {
            const options: ScanOptions = {
                rootDir: '',
                include: ['**/*.ts'],
                exclude: [],
            };

            const errors = validateOptions(options);

            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]).toContain('rootDir');
            expect(errors[0]).toContain('empty');
        });

        it('should return error for whitespace-only rootDir', () => {
            const options: ScanOptions = {
                rootDir: '   ',
                include: ['**/*.ts'],
                exclude: [],
            };

            const errors = validateOptions(options);

            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]).toContain('rootDir');
        });

        it('should warn about empty include (will use defaults)', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: [],
                exclude: [],
            };

            const errors = validateOptions(options);

            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]).toContain('include');
            expect(errors[0]).toContain('default');
        });

        it('should handle valid complex options', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts', '**/*.tsx'],
                exclude: ['node_modules', 'dist'],
                ignorePatterns: ['**/*.min.js'],
                respectGitignore: true,
                followSymlinks: false,
            };

            const errors = validateOptions(options);

            expect(errors).toEqual([]);
        });
    });

    describe('Property-based tests', () => {
        it('should always return an array', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    (rootDir, include, exclude) => {
                        const options: ScanOptions = {
                            rootDir,
                            include,
                            exclude,
                        };

                        const errors = validateOptions(options);
                        expect(Array.isArray(errors)).toBe(true);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should be deterministic', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    (rootDir, include, exclude) => {
                        const options: ScanOptions = {
                            rootDir,
                            include,
                            exclude,
                        };

                        const errors1 = validateOptions(options);
                        const errors2 = validateOptions(options);

                        expect(errors1).toEqual(errors2);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should return errors for empty rootDir strings', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('', '   ', '\t', '\n'),
                    (rootDir) => {
                        const options: ScanOptions = {
                            rootDir,
                            include: ['**/*.ts'],
                            exclude: [],
                        };

                        const errors = validateOptions(options);
                        expect(errors.length).toBeGreaterThan(0);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate input options', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: ['node_modules'],
            };

            const original = JSON.parse(JSON.stringify(options));
            validateOptions(options);

            expect(options).toEqual(original);
        });
    });

    describe('Error message quality', () => {
        it('should provide descriptive error for empty rootDir', () => {
            const options: ScanOptions = {
                rootDir: '',
                include: ['**/*.ts'],
                exclude: [],
            };

            const errors = validateOptions(options);

            expect(errors[0].toLowerCase()).toContain('rootdir');
            expect(errors[0].toLowerCase()).toContain('empty');
        });

        it('should provide descriptive warning for empty include', () => {
            const options: ScanOptions = {
                rootDir: '/project',
                include: [],
                exclude: [],
            };

            const errors = validateOptions(options);

            expect(errors[0].toLowerCase()).toContain('include');
        });
    });
});
