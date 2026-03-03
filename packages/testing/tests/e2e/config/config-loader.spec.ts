import { test, expect } from '@playwright/test';
import { resolveConfig } from '@ngcompass/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * E2E Suite: Configuration Loader
 * * Verifies that the engine correctly discovers, parses, and validates 
 * configuration files across different formats and locations.
 */
test.describe('Config Loader: Discovery & Resolution', () => {
    let tempDir: string;

    /**
     * Environment Setup: Isolated Workspace
     * Creates a unique temporary directory for each test to prevent 
     * cross-test filesystem contamination.
     */
    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngcompass-config-e2e-'));
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    /**
     * Scenario: Dedicated JSON Configuration
     * Verifies the standard ngcompass.config.json discovery path.
     */
    test('should resolve configuration from a dedicated ngcompass.config.json', async () => {
        const configPath = path.join(tempDir, 'ngcompass.config.json');
        const content = {
            include: ['src/**/*.ts'],
            exclude: ['node_modules/**'],
            rules: { 'base-rule': 'error' }
        };

        fs.writeFileSync(configPath, JSON.stringify(content, null, 2));

        const result = await resolveConfig({ cwd: tempDir } as any);

        expect(result.report.valid).toBe(true);
        expect(result.config?.include).toContain('src/**/*.ts');
        expect(result.config?.rules?.['base-rule']).toBe('error');
    });

    /**
     * Scenario: TypeScript Configuration
     * Verifies that the loader can handle ESM-based TypeScript configuration files.
     */
    test('should resolve configuration from ngcompass.config.ts', async () => {
        const configPath = path.join(tempDir, 'ngcompass.config.ts');
        const content = `
            export default {
                include: ['src/**/*.ts'],
                rules: {
                    'architecture/no-circular': 'error'
                }
            };
        `;

        fs.writeFileSync(configPath, content);

        const result = await resolveConfig({ cwd: tempDir } as any);

        expect(result.report.valid).toBe(true);
        expect(result.config?.rules?.['architecture/no-circular']).toBe('error');
    });

    /**
     * Scenario: Embedded package.json Configuration
     * Verifies discovery via the "ngcompass" key in a project's package.json.
     */
    test('should resolve configuration from package.json "ngcompass" key', async () => {
        const pkgPath = path.join(tempDir, 'package.json');
        const content = {
            name: "test-package",
            ngcompass: {
                include: ['src/**/*.ts'],
                rules: { 'pkg-rule': 'info' }
            }
        };

        fs.writeFileSync(pkgPath, JSON.stringify(content, null, 2));

        const result = await resolveConfig({ cwd: tempDir } as any);

        expect(result.report.valid).toBe(true);
        expect(result.config?.rules?.['pkg-rule']).toBe('info');
    });

    /**
     * Scenario: Profile Merging
     * Ensures that specifying a profile correctly triggers the inheritance 
     * and override logic during resolution.
     */
    test('should apply profile-specific overrides during resolution', async () => {
        const configPath = path.join(tempDir, 'ngcompass.config.json');
        const content = {
            include: ['src/**/*.ts'],
            rules: { 'base-rule': 'error' },
            profiles: {
                ci: { rules: { 'ci-rule': 'warning' } }
            }
        };

        fs.writeFileSync(configPath, JSON.stringify(content, null, 2));

        const result = await resolveConfig({ cwd: tempDir, profile: 'ci' } as any);

        expect(result.report.valid).toBe(true);
        expect(result.config?.rules?.['base-rule']).toBe('error');
        expect(result.config?.rules?.['ci-rule']).toBe('warning');
    });

    /**
     * Scenario: Validation Feedback
     * Ensures that invalid configuration data results in a clear error report.
     */
    test('should provide detailed error reports for invalid data types', async () => {
        const configPath = path.join(tempDir, 'ngcompass.config.json');
        const content = {
            include: 'not-an-array' // Should be string[]
        };

        fs.writeFileSync(configPath, JSON.stringify(content, null, 2));

        const result = await resolveConfig({ cwd: tempDir } as any);

        expect(result.report.valid).toBe(false);
        const hasTypeError = result.report.issues.some(i =>
            i.message.toLowerCase().includes('expected array')
        );
        expect(hasTypeError).toBe(true);
    });
});