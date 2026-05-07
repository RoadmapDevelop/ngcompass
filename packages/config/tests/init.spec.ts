import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initConfig } from '../src/actions/init.js';
import { findAndLoadConfig } from '../src/loaders/discovery.js';

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
    'src/**/*.ts',
    'src/**/*.html',
  ],

  exclude: [
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '**/*.d.ts',
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

    it('loads the generated config from a directory without local ngcompass dependencies', async () => {
        const cwd = await makeWorkspace();

        await initConfig({ cwd });
        const loaded = await findAndLoadConfig(cwd);

        expect(loaded?.config).toMatchObject({
            extends: 'ngcompass:recommended',
            profiles: {
                ci: {
                    outputFormat: 'json',
                    maxWarnings: 0,
                },
            },
        });
    }, 15000);
});
