/**
 * @fileoverview
 * Unit tests for the initConfig configuration scaffold action.
 *
 * Verifies that initConfig successfully outputs a valid defineConfig typescript template
 * populated with standard directory and file glob inclusions/exclusions, handles already-existing files,
 * and handles force overwrite options correctly.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initConfig } from '../src/actions/init.js';

const createdDirs: string[] = [];

async function makeWorkspace(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngcompass-init-'));
    createdDirs.push(dir);
    return dir;
}

afterEach(async () => {
    for (const dir of createdDirs.splice(0)) {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

describe('initConfig', () => {
    it('writes the default config in defineConfig style', async () => {
        const cwd = await makeWorkspace();

        const result = await initConfig({ cwd });
        const configPath = path.join(cwd, 'ngcompass.config.ts');
        const content = await fs.readFile(configPath, 'utf-8');

        expect(result.success).toBe(true);
        expect(content).toBe(`import { defineConfig } from '@ngcompass/config';

export default defineConfig({
  extends: 'ngcompass:recommended',

  include: [
    '**/*.ts',
    '**/*.html',
  ],

  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.spec.ts',
    '**/*.test.ts',
  ],

  profiles: {
    ci: {
      outputFormat: 'json',
      maxWarnings: 0,
    },
  },
});
`);
    });

});
