import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import {
    deduplicateFiles,
    filterByExtension,
    filterByPattern,
    filterByGlob,
    applyGitignoreFilter,
    applyFilters
} from '../src/filters.js';
import type { NormalizedOptions } from '../src/types.js';

describe('deduplicateFiles', () => {
    it('removes duplicate files', () => {
        const files = ['a.ts', 'b.ts', 'a.ts', 'c.html', 'b.ts'];
        const result = deduplicateFiles(files);
        expect(result).toEqual(['a.ts', 'b.ts', 'c.html']);
    });
});

describe('filterByExtension', () => {
    it('keeps only files with specified extensions', () => {
        const files = ['a.ts', 'b.html', 'c.js', 'd.css', 'e.test.ts'];
        const exts = ['.ts', '.html'];
        const result = filterByExtension(files, exts);
        expect(result).toEqual(['a.ts', 'b.html', 'e.test.ts']);
    });

    it('returns empty array if no files match', () => {
        const files = ['a.js', 'b.css'];
        const result = filterByExtension(files, ['.ts']);
        expect(result).toEqual([]);
    });
});

describe('filterByPattern', () => {
    it('keeps files matching the regex', () => {
        const files = ['test.spec.ts', 'app.ts', 'component.js'];
        const result = filterByPattern(files, /\.spec\.ts$/);
        expect(result).toEqual(['test.spec.ts']);
    });
});

describe('filterByGlob', () => {
    it('filters files based on includes and ignores', () => {
        const files = [
            path.normalize('src/app/a.ts'),
            path.normalize('src/app/b.html'),
            path.normalize('dist/c.ts'),
            path.normalize('src/d.js')
        ];
        const includes = ['src/**/*.ts', 'src/**/*.html'];
        const ignores = ['dist/**'];

        const result = filterByGlob(files, includes, ignores, process.cwd());

        expect(result.length).toBe(2);
        expect(result[0].endsWith('a.ts')).toBe(true);
        expect(result[1].endsWith('b.html')).toBe(true);
    });
});

describe('applyGitignoreFilter', () => {
    it('applies the filter function', () => {
        const files = ['a.ts', 'node_modules/b.ts'];
        const filterFn = (file: string) => !file.includes('node_modules');
        const result = applyGitignoreFilter(files, 'root', filterFn);
        expect(result).toEqual(['a.ts']);
    });
});

describe('applyFilters', () => {
    it('deduplicates files when gitignore is disabled', async () => {
        const options: NormalizedOptions = {
            rootDir: 'src',
            include: [],
            exclude: [],
            ignorePatterns: [],
            respectGitignore: false,
            followSymlinks: false,
            dot: false
        };

        const result = await applyFilters({ files: ['a.ts', 'a.ts'] }, options);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.files).toEqual(['a.ts']);
            expect(result.data.filtered).toBe(1);
        }
    });
});
