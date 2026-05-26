import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectAngularWorkspaceIncludes,
  initConfig,
} from '../src/actions/init.js';

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

  it('scopes generated config to Angular workspace source roots', async () => {
    const cwd = await makeWorkspace();
    await fs.writeFile(
      path.join(cwd, 'angular.json'),
      JSON.stringify(
        {
          version: 1,
          projects: {
            app: { sourceRoot: 'src' },
            admin: { sourceRoot: 'projects/admin/src' },
            shared: { root: 'projects/shared' },
          },
        },
        null,
        2
      )
    );

    const result = await initConfig({ cwd });
    const configPath = path.join(cwd, 'ngcompass.config.ts');
    const content = await fs.readFile(configPath, 'utf-8');

    expect(result.success).toBe(true);
    expect(content).toContain("    'projects/admin/src/**/*.ts',");
    expect(content).toContain("    'projects/admin/src/**/*.html',");
    expect(content).toContain("    'projects/shared/**/*.ts',");
    expect(content).toContain("    'projects/shared/**/*.html',");
    expect(content).toContain("    'src/**/*.ts',");
    expect(content).toContain("    'src/**/*.html',");
    expect(content).not.toContain("    '**/*.ts',");
  });

  it('returns Angular source root include patterns in stable order', async () => {
    const cwd = await makeWorkspace();
    await fs.writeFile(
      path.join(cwd, 'angular.json'),
      JSON.stringify({
        projects: {
          zed: { sourceRoot: 'projects/zed/src' },
          app: { sourceRoot: 'src' },
        },
      })
    );

    await expect(detectAngularWorkspaceIncludes(cwd)).resolves.toEqual([
      'projects/zed/src/**/*.ts',
      'projects/zed/src/**/*.html',
      'src/**/*.ts',
      'src/**/*.html',
    ]);
  });
});
