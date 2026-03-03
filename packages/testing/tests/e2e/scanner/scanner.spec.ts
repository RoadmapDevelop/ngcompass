import { test, expect } from '@playwright/test';
import { scan } from '@ngcompass/scanner';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test.describe('Scanner E2E: File Discovery', () => {
    let tempDir: string;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngcompass-scanner-e2e-'));
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // Helper to create nested files
    const createFiles = (files: Record<string, string>) => {
        for (const [filePath, content] of Object.entries(files)) {
            const absolutePath = path.join(tempDir, filePath);
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            fs.writeFileSync(absolutePath, content);
        }
    };

    /**
     * Scenario: Basic File Discovery
     * Verifies that the scanner can discover files using basic patterns.
     */
    test('should discover files based on include and exclude patterns', async () => {
        createFiles({
            'src/index.ts': 'console.log("index");',
            'src/components/button.ts': 'export const Button = () => {};',
            'src/assets/logo.svg': '<svg></svg>',
            'node_modules/fake-lib/index.ts': 'export const Lib = () => {};',
            'dist/bundle.js': 'console.log("bundle");',
            '.angular/cache/db.json': '{}'
        });

        const result = await scan({
            rootDir: tempDir,
            include: ['src/**/*.ts'],
            exclude: ['node_modules/**', 'dist/**'],
            debug: false
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            const discoveredFiles = result.data.files.map((f: string) => path.relative(tempDir, f).replace(/\\/g, '/'));
            expect(discoveredFiles.sort()).toEqual([
                'src/components/button.ts',
                'src/index.ts'
            ].sort());

            // Stats checks
            expect(result.data.stats.totalFiles).toBe(2);
            expect(result.data.stats.byExtension.get('.ts')).toBe(2);
        }
    });

    /**
     * Scenario: Non-existent directory
     * Verifies that a clear error is returned when rootDir does not exist.
     */
    test('should return an error for a non-existent root directory', async () => {
        const fakePath = path.join(tempDir, 'does-not-exist');

        const result = await scan({
            rootDir: fakePath,
            include: ['**/*.ts'],
            exclude: []
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.message).toContain('rootDir does not exist');
        }
    });

    /**
     * Scenario: Dotfiles and directories
     * Verifies that dotfiles/folders are ignored by default unless dot: true
     */
    test('should handle dotfiles based on the dot option', async () => {
        createFiles({
            'src/.env.local': 'KEY=VAL',
            'src/normal.ts': 'console.log("normal");',
            '.nx/cache/meta.json': '{}'
        });

        // With dot = false (default behavior)
        const resultWithoutDot = await scan({
            rootDir: tempDir,
            include: ['**/*'],
            exclude: [],
            dot: false
        });

        expect(resultWithoutDot.ok).toBe(true);
        if (resultWithoutDot.ok) {
            const discoveredWithoutDot = resultWithoutDot.data.files.map((f: string) => path.relative(tempDir, f).replace(/\\/g, '/'));
            expect(discoveredWithoutDot).toContain('src/normal.ts');
            expect(discoveredWithoutDot).not.toContain('src/.env.local');
            expect(discoveredWithoutDot).not.toContain('.nx/cache/meta.json');
        }

        // With dot = true
        const resultWithDot = await scan({
            rootDir: tempDir,
            include: ['**/*'],
            exclude: [],
            dot: true
        });

        expect(resultWithDot.ok).toBe(true);
        if (resultWithDot.ok) {
            const discoveredWithDot = resultWithDot.data.files.map((f: string) => path.relative(tempDir, f).replace(/\\/g, '/'));
            expect(discoveredWithDot).toContain('src/normal.ts');
            expect(discoveredWithDot).toContain('src/.env.local');
            expect(discoveredWithDot).toContain('.nx/cache/meta.json');
        }
    });

    /**
     * Scenario: Empty Results
     * Verifies behavior when no files match the pattern
     */
    test('should return empty result when no files match', async () => {
        createFiles({
            'src/index.js': 'console.log("index");',
        });

        const result = await scan({
            rootDir: tempDir,
            include: ['src/**/*.ts'], // No .ts files exist
            exclude: []
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.files).toHaveLength(0);
            expect(result.data.stats.totalFiles).toBe(0);
        }
    });

    /**
     * Scenario: Symlink Handling
     * Verifies that symlinks are ignored by default and traversed when followSymlinks is true.
     */
    test('should handle symlinks based on followSymlinks option', async () => {
        // Skip on environments where symlink creation might fail without admin rights (e.g. Windows)
        test.skip(os.platform() === 'win32', 'Symlinks require admin privileges on Windows');

        createFiles({
            'actual-dir/target.ts': 'console.log("target");'
        });

        // Create a symlink
        const targetPath = path.join(tempDir, 'actual-dir');
        const linkPath = path.join(tempDir, 'symlinked-dir');

        try {
            fs.symlinkSync(targetPath, linkPath, 'dir');
        } catch (e) {
            // If it fails even on non-Windows for some reason
            console.warn('Failed to create symlink for test', e);
            test.skip();
        }

        // Scan without following symlinks (default)
        const resNoFollow = await scan({
            rootDir: tempDir,
            include: ['symlinked-dir/**/*.ts'],
            exclude: [],
            followSymlinks: false
        });

        expect(resNoFollow.ok).toBe(true);
        if (resNoFollow.ok) {
            // Based on node-glob / tinyglobby, it may or may not find anything if we target the symlink directly.
            // But if we do a general discovery, it shouldn't traverse into 'symlinked-dir'
            const generalRes = await scan({
                rootDir: tempDir,
                include: ['**/*.ts'],
                exclude: []
            });
            if (generalRes.ok) {
                const f = generalRes.data.files.map((file: string) => path.relative(tempDir, file).replace(/\\/g, '/'));
                expect(f).not.toContain('symlinked-dir/target.ts');
            }
        }

        // Scan following symlinks
        const resFollow = await scan({
            rootDir: tempDir,
            include: ['**/*.ts'],
            exclude: [],
            followSymlinks: true
        });

        expect(resFollow.ok).toBe(true);
        if (resFollow.ok) {
            const filesFollow = resFollow.data.files.map((file: string) => path.relative(tempDir, file).replace(/\\/g, '/'));
            expect(filesFollow).toContain('actual-dir/target.ts');
            expect(filesFollow).toContain('symlinked-dir/target.ts');
        }
    });
});
