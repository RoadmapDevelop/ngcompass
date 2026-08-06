import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectAngularVersion } from '../src/angular/detect-version.js';

let workspace: string;

async function writeJson(
  filePath: string,
  content: Record<string, unknown>
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(content), 'utf8');
}

async function writeInstalledCore(dir: string, version: string): Promise<void> {
  await writeJson(
    path.join(dir, 'node_modules', '@angular', 'core', 'package.json'),
    { name: '@angular/core', version }
  );
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ngcompass-ngver-'));
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('detectAngularVersion', () => {
  it('prefers an explicit config value over everything else', async () => {
    await writeInstalledCore(workspace, '18.1.0');

    const detection = detectAngularVersion(workspace, '17.2');

    expect(detection).toEqual({ version: '17.2', source: 'config' });
  });

  it('falls through to detection when the explicit value is malformed', async () => {
    await writeInstalledCore(workspace, '18.1.0');

    const detection = detectAngularVersion(workspace, '^18');

    expect(detection.source).toBe('installed');
    expect(detection.version).toBe('18.1');
  });

  it('reads the installed version rather than the declared range', async () => {
    await writeInstalledCore(workspace, '17.3.11');
    await writeJson(path.join(workspace, 'package.json'), {
      dependencies: { '@angular/core': '^17.0.0' },
    });

    const detection = detectAngularVersion(workspace, undefined);

    expect(detection).toEqual({ version: '17.3', source: 'installed' });
  });

  it('finds an installed version hoisted to a parent directory', async () => {
    const projectDir = path.join(workspace, 'projects', 'app');
    await fs.mkdir(projectDir, { recursive: true });
    await writeInstalledCore(workspace, '19.0.4');

    const detection = detectAngularVersion(projectDir, undefined);

    expect(detection).toEqual({ version: '19.0', source: 'installed' });
  });

  it('falls back to the declared range floor when nothing is installed', async () => {
    await writeJson(path.join(workspace, 'package.json'), {
      dependencies: { '@angular/core': '^17.2.0' },
    });

    const detection = detectAngularVersion(workspace, undefined);

    expect(detection).toEqual({ version: '17.2', source: 'declared' });
  });

  it('reads the declared range from peerDependencies', async () => {
    await writeJson(path.join(workspace, 'package.json'), {
      peerDependencies: { '@angular/core': '>=16.0.0' },
    });

    const detection = detectAngularVersion(workspace, undefined);

    expect(detection).toEqual({ version: '16.0', source: 'declared' });
  });

  it('reports unknown for a workspace protocol specifier', async () => {
    await writeJson(path.join(workspace, 'package.json'), {
      dependencies: { '@angular/core': 'workspace:*' },
    });

    const detection = detectAngularVersion(workspace, undefined);

    expect(detection.version).toBeNull();
    expect(detection.source).toBe('unknown');
    expect(detection.reason).toBeDefined();
  });

  it('reports unknown when no Angular dependency exists at all', async () => {
    await writeJson(path.join(workspace, 'package.json'), {
      dependencies: { rxjs: '^7.0.0' },
    });

    const detection = detectAngularVersion(workspace, undefined);

    expect(detection.version).toBeNull();
    expect(detection.source).toBe('unknown');
  });

  it('ignores a corrupt package manifest instead of throwing', async () => {
    await fs.writeFile(
      path.join(workspace, 'package.json'),
      '{ not valid json',
      'utf8'
    );

    const detection = detectAngularVersion(workspace, undefined);

    expect(detection.source).toBe('unknown');
  });
});
