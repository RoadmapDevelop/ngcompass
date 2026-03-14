import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { normalizeOptions, validateOptions } from '../src/normalize.js';
import type { ScanOptions } from '../src/types.js';

describe('normalizeOptions', () => {

    it('retains provided values over defaults', () => {
        const options: ScanOptions = {
            rootDir: 'custom',
            include: ['**/*.js'],
            exclude: ['node_modules'],
            ignorePatterns: ['.env'],
            respectGitignore: false,
            followSymlinks: true,
            dot: true
        };

        const result = normalizeOptions(options);

        expect(result.rootDir).toBe(path.resolve('custom'));
        expect(result.include).toEqual(['**/*.js']);
        expect(result.exclude).toEqual(['node_modules']);
        expect(result.ignorePatterns).toEqual(['.env']);
        expect(result.respectGitignore).toBe(false);
        expect(result.followSymlinks).toBe(true);
        expect(result.dot).toBe(true);
    });
});

describe('validateOptions', () => {
    it('returns empty array for valid options', () => {
        const options: ScanOptions = {
            rootDir: 'src',
            include: ['**/*.ts'],
            exclude: []
        };
        const errors = validateOptions(options);
        expect(errors.length).toBe(0);
    });

    it('returns error when rootDir is empty', () => {
        const options: ScanOptions = {
            rootDir: '  ',
            include: ['**/*.ts'],
            exclude: []
        };
        const errors = validateOptions(options);
        expect(errors).toContain('rootDir cannot be empty');
    });

    it('returns error when rootDir is missing', () => {
        const options = {
            include: ['**/*.ts'],
            exclude: []
        } as unknown as ScanOptions;
        const errors = validateOptions(options);
        expect(errors).toContain('rootDir cannot be empty');
    });

    it('returns warning error when include patterns are empty', () => {
        const options: ScanOptions = {
            rootDir: 'src',
            include: [],
            exclude: []
        };
        const errors = validateOptions(options);
        expect(errors).toContain('No include patterns specified (will use defaults)');
    });
});
