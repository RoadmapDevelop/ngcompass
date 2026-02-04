import { describe, it, expect } from 'vitest';
import { fc } from 'fast-check';
import {
    normalizePattern,
    expandPatterns,
    isValidPattern,
    validatePatterns
} from '../../src/scanner/patterns.js';
import type { NormalizedOptions } from '../../src/scanner/types.js';

describe('normalizePattern (Pure Function)', () => {
    // Example-based tests for clarity
    describe('Example-based tests', () => {
        it('should convert backslashes to forward slashes', () => {
            expect(normalizePattern('src\\app\\*.ts')).toBe('src/app/*.ts');
            expect(normalizePattern('lib\\**\\*.tsx')).toBe('lib/**/*.tsx');
        });

        it('should handle already normalized patterns', () => {
            expect(normalizePattern('src/app/*.ts')).toBe('src/app/*.ts');
        });

        it('should handle mixed slashes', () => {
            expect(normalizePattern('src\\app/component\\*.ts'))
                .toBe('src/app/component/*.ts');
        });

        it('should handle multiple consecutive backslashes', () => {
            expect(normalizePattern('src\\\\app\\\\*.ts')).toBe('src//app//*.ts');
        });

        it('should handle empty string', () => {
            expect(normalizePattern('')).toBe('');
        });
    });

    // Property-based tests: CRITICAL for pure functions
    describe('Property-based tests', () => {
        it('should be idempotent (normalizing twice = normalizing once)', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    (pattern) => {
                        const once = normalizePattern(pattern);
                        const twice = normalizePattern(once);
                        expect(once).toBe(twice);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should always produce forward slashes only', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    (pattern) => {
                        const result = normalizePattern(pattern);
                        expect(result).not.toContain('\\');
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should preserve string length', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    (pattern) => {
                        const result = normalizePattern(pattern);
                        expect(result.length).toBe(pattern.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should return empty string for empty input', () => {
            const result = normalizePattern('');
            expect(result).toBe('');
        });
    });
});

describe('expandPatterns (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should combine include and exclude patterns', () => {
            const input: NormalizedOptions = {
                rootDir: '/project',
                include: ['src/**/*.ts', 'lib/**/*.tsx'],
                exclude: ['node_modules', 'dist'],
                ignorePatterns: ['**/*.min.js', '**/*.d.ts'],
                respectGitignore: true,
                followSymlinks: false,
            };

            const result = expandPatterns(input);

            expect(result).toEqual({
                include: ['src/**/*.ts', 'lib/**/*.tsx'],
                ignore: ['node_modules', 'dist', '**/*.min.js', '**/*.d.ts'],
            });
        });

        it('should normalize all patterns', () => {
            const input: NormalizedOptions = {
                rootDir: '/project',
                include: ['src\\**\\*.ts'],
                exclude: ['node_modules\\**'],
                ignorePatterns: ['dist\\**'],
                respectGitignore: true,
                followSymlinks: false,
            };

            const result = expandPatterns(input);

            expect(result).toEqual({
                include: ['src/**/*.ts'],
                ignore: ['node_modules/**', 'dist/**'],
            });
        });

        it('should handle empty exclude and ignorePatterns', () => {
            const input: NormalizedOptions = {
                rootDir: '/project',
                include: ['**/*.ts'],
                exclude: [],
                ignorePatterns: [],
                respectGitignore: false,
                followSymlinks: false,
            };

            const result = expandPatterns(input);

            expect(result).toEqual({
                include: ['**/*.ts'],
                ignore: [],
            });
        });

        it('should handle empty include', () => {
            const input: NormalizedOptions = {
                rootDir: '/project',
                include: [],
                exclude: ['node_modules'],
                ignorePatterns: ['dist'],
                respectGitignore: false,
                followSymlinks: false,
            };

            const result = expandPatterns(input);

            expect(result).toEqual({
                include: [],
                ignore: ['node_modules', 'dist'],
            });
        });
    });

    describe('Property-based tests', () => {
        it('should have ignore length = exclude + ignorePatterns', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    (exclude, ignorePatterns) => {
                        const input: NormalizedOptions = {
                            rootDir: '/test',
                            include: ['**/*.ts'],
                            exclude,
                            ignorePatterns,
                            respectGitignore: false,
                            followSymlinks: false,
                        };

                        const result = expandPatterns(input);
                        expect(result.ignore.length).toBe(
                            exclude.length + ignorePatterns.length
                        );
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should preserve include length', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (include) => {
                        const input: NormalizedOptions = {
                            rootDir: '/test',
                            include,
                            exclude: [],
                            ignorePatterns: [],
                            respectGitignore: false,
                            followSymlinks: false,
                        };

                        const result = expandPatterns(input);
                        expect(result.include.length).toBe(include.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should not contain backslashes in any output', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    fc.array(fc.string()),
                    (include, exclude, ignorePatterns) => {
                        const input: NormalizedOptions = {
                            rootDir: '/test',
                            include,
                            exclude,
                            ignorePatterns,
                            respectGitignore: false,
                            followSymlinks: false,
                        };

                        const result = expandPatterns(input);
                        const allPatterns = [...result.include, ...result.ignore];
                        expect(allPatterns.every(p => !p.includes('\\'))).toBe(true);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate input object', () => {
            const input: NormalizedOptions = {
                rootDir: '/project',
                include: ['src/**/*.ts'],
                exclude: ['node_modules'],
                ignorePatterns: ['dist'],
                respectGitignore: true,
                followSymlinks: false,
            };

            const original = JSON.parse(JSON.stringify(input));
            expandPatterns(input);

            expect(input).toEqual(original);
        });
    });
});

describe('isValidPattern (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should reject empty patterns', () => {
            expect(isValidPattern('')).toBe(false);
            expect(isValidPattern('   ')).toBe(false);
            expect(isValidPattern('\t')).toBe(false);
            expect(isValidPattern('\n')).toBe(false);
        });

        it('should reject triple-star patterns', () => {
            expect(isValidPattern('***/*.ts')).toBe(false);
            expect(isValidPattern('src/***/file.ts')).toBe(false);
            expect(isValidPattern('***/***')).toBe(false);
        });

        it('should accept valid glob patterns', () => {
            expect(isValidPattern('src/**/*.ts')).toBe(true);
            expect(isValidPattern('**/*.{ts,tsx}')).toBe(true);
            expect(isValidPattern('lib/*.js')).toBe(true);
            expect(isValidPattern('*.json')).toBe(true);
            expect(isValidPattern('test')).toBe(true);
        });

        it('should accept patterns with double-star', () => {
            expect(isValidPattern('**')).toBe(true);
            expect(isValidPattern('**/*.ts')).toBe(true);
            expect(isValidPattern('src/**')).toBe(true);
        });

        it('should accept patterns with single star', () => {
            expect(isValidPattern('*')).toBe(true);
            expect(isValidPattern('*.ts')).toBe(true);
            expect(isValidPattern('src/*')).toBe(true);
        });
    });

    describe('Property-based tests', () => {
        it('should return true for non-empty strings without triple-star', () => {
            fc.assert(
                fc.property(
                    fc.string().filter(s => s.trim() !== '' && !s.includes('***')),
                    (pattern) => {
                        expect(isValidPattern(pattern)).toBe(true);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should return false for strings containing triple-star', () => {
            fc.assert(
                fc.property(
                    fc.string().filter(s => s.includes('***')),
                    (pattern) => {
                        expect(isValidPattern(pattern)).toBe(false);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should return boolean for all inputs', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    (pattern) => {
                        const result = isValidPattern(pattern);
                        expect(typeof result).toBe('boolean');
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });
});

describe('validatePatterns (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should separate valid and invalid patterns', () => {
            const patterns = ['src/**/*.ts', '', '***/*.js', 'lib/*.tsx', '   '];

            const [valid, errors] = validatePatterns(patterns);

            expect(valid).toEqual(['src/**/*.ts', 'lib/*.tsx']);
            expect(errors).toHaveLength(3);
            expect(errors).toContain('Invalid pattern: ""');
            expect(errors).toContain('Invalid pattern: "***/*.js"');
            expect(errors).toContain('Invalid pattern: "   "');
        });

        it('should preserve order of valid patterns', () => {
            const patterns = ['z.ts', 'a.ts', 'm.ts'];
            const [valid] = validatePatterns(patterns);
            expect(valid).toEqual(['z.ts', 'a.ts', 'm.ts']);
        });

        it('should handle all valid patterns', () => {
            const patterns = ['**/*.ts', 'src/**', 'lib/*.js'];
            const [valid, errors] = validatePatterns(patterns);

            expect(valid).toEqual(patterns);
            expect(errors).toEqual([]);
        });

        it('should handle all invalid patterns', () => {
            const patterns = ['', '   ', '***/*.ts'];
            const [valid, errors] = validatePatterns(patterns);

            expect(valid).toEqual([]);
            expect(errors).toHaveLength(3);
        });

        it('should handle empty input', () => {
            const [valid, errors] = validatePatterns([]);

            expect(valid).toEqual([]);
            expect(errors).toEqual([]);
        });
    });

    describe('Property-based tests', () => {
        it('should account for all patterns (valid + errors = total)', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (patterns) => {
                        const [valid, errors] = validatePatterns(patterns);
                        expect(valid.length + errors.length).toBe(patterns.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should not produce duplicate valid patterns', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (patterns) => {
                        const [valid] = validatePatterns(patterns);
                        const uniqueValid = new Set(valid);
                        expect(uniqueValid.size).toBe(valid.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should always return arrays', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (patterns) => {
                        const [valid, errors] = validatePatterns(patterns);
                        expect(Array.isArray(valid)).toBe(true);
                        expect(Array.isArray(errors)).toBe(true);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate input array', () => {
            const patterns = ['src/**/*.ts', '', '***/*.js'];
            const original = [...patterns];

            validatePatterns(patterns);

            expect(patterns).toEqual(original);
        });
    });
});
