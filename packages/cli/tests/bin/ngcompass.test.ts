import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('CLI bin (ngcompass.ts)', () => {
    const binPath = path.resolve(__dirname, '../../src/bin/ngcompass.ts');

    it('outputs help when no commands are given', () => {
        try {
            // Running without args should trigger outputHelp
            const output = execSync(`npx tsx "${binPath}"`, { encoding: 'utf-8', stdio: 'pipe' });
            expect(output).toContain('Usage: compass');
            expect(output).toContain('Commands:');
        } catch (error: any) {
            // sometimes outputHelp() causes exit(1) depending on commander config, 
            // but we can just check the stdout from the error
            const output = error.stdout || error.stderr || '';
            expect(output).toContain('Usage: compass');
        }
    });

    it('registers all subcommands', () => {
        const output = execSync(`npx tsx "${binPath}" --help`, { encoding: 'utf-8' });
        expect(output).toContain('analyze');
        expect(output).toContain('config');
        expect(output).toContain('cache');
        expect(output).toContain('init');
    });
});
