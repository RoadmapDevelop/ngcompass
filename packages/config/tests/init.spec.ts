import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectAngularWorkspaceIncludes,
  initConfig,
} from '../src/init.js';

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

describe('detectAngularWorkspaceIncludes', () => {
  it('returns undefined when angular.json is absent', async () => {
    const cwd = await makeWorkspace();
    await expect(detectAngularWorkspaceIncludes(cwd)).resolves.toBeUndefined();
  });

  it('resolves Nx-style string project references using project.json sourceRoot', async () => {
    const cwd = await makeWorkspace();

    await fs.mkdir(path.join(cwd, 'apps', 'shell'), { recursive: true });
    await fs.mkdir(path.join(cwd, 'libs', 'ui'), { recursive: true });

    await fs.writeFile(
      path.join(cwd, 'angular.json'),
      JSON.stringify({ version: 2, projects: { shell: 'apps/shell', ui: 'libs/ui' } })
    );
    await fs.writeFile(
      path.join(cwd, 'apps', 'shell', 'project.json'),
      JSON.stringify({ sourceRoot: 'apps/shell/src' })
    );
    await fs.writeFile(
      path.join(cwd, 'libs', 'ui', 'project.json'),
      JSON.stringify({ sourceRoot: 'libs/ui/src' })
    );

    await expect(detectAngularWorkspaceIncludes(cwd)).resolves.toEqual([
      'apps/shell/src/**/*.ts',
      'apps/shell/src/**/*.html',
      'libs/ui/src/**/*.ts',
      'libs/ui/src/**/*.html',
    ]);
  });

  it('falls back to <projectPath>/src when Nx project.json is absent', async () => {
    const cwd = await makeWorkspace();

    await fs.writeFile(
      path.join(cwd, 'angular.json'),
      JSON.stringify({ version: 2, projects: { shell: 'apps/shell', ui: 'libs/ui' } })
    );

    await expect(detectAngularWorkspaceIncludes(cwd)).resolves.toEqual([
      'apps/shell/src/**/*.ts',
      'apps/shell/src/**/*.html',
      'libs/ui/src/**/*.ts',
      'libs/ui/src/**/*.html',
    ]);
  });

  it('handles a workspace with 13 mixed-format projects', async () => {
    const cwd = await makeWorkspace();

    const projects: Record<string, unknown> = {};
    for (let i = 1; i <= 8; i++) {
      projects[`app${i}`] = { sourceRoot: `apps/app${i}/src` };
    }
    for (let i = 1; i <= 5; i++) {
      projects[`lib${i}`] = `libs/lib${i}`;
    }

    await fs.writeFile(
      path.join(cwd, 'angular.json'),
      JSON.stringify({ version: 2, projects })
    );

    for (let i = 1; i <= 3; i++) {
      await fs.mkdir(path.join(cwd, 'libs', `lib${i}`), { recursive: true });
      await fs.writeFile(
        path.join(cwd, 'libs', `lib${i}`, 'project.json'),
        JSON.stringify({ sourceRoot: `libs/lib${i}/src` })
      );
    }

    const result = await detectAngularWorkspaceIncludes(cwd);

    expect(result).toBeDefined();
    expect(result!.length).toBe(26);

    for (let i = 1; i <= 8; i++) {
      expect(result).toContain(`apps/app${i}/src/**/*.ts`);
      expect(result).toContain(`apps/app${i}/src/**/*.html`);
    }

    for (let i = 1; i <= 5; i++) {
      expect(result).toContain(`libs/lib${i}/src/**/*.ts`);
      expect(result).toContain(`libs/lib${i}/src/**/*.html`);
    }
  });

  it('deduplicates projects that share the same source root', async () => {
    const cwd = await makeWorkspace();
    await fs.writeFile(
      path.join(cwd, 'angular.json'),
      JSON.stringify({
        projects: {
          app: { sourceRoot: 'src' },
          'app-e2e': { sourceRoot: 'src' },
        },
      })
    );

    await expect(detectAngularWorkspaceIncludes(cwd)).resolves.toEqual([
      'src/**/*.ts',
      'src/**/*.html',
    ]);
  });

  it('skips projects with empty root and no sourceRoot', async () => {
    const cwd = await makeWorkspace();
    await fs.writeFile(
      path.join(cwd, 'angular.json'),
      JSON.stringify({
        projects: {
          ghost: { root: '' },
          lib: { sourceRoot: 'projects/lib/src' },
        },
      })
    );

    await expect(detectAngularWorkspaceIncludes(cwd)).resolves.toEqual([
      'projects/lib/src/**/*.ts',
      'projects/lib/src/**/*.html',
    ]);
  });
});
