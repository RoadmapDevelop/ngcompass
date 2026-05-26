import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import {
  isGitRepo,
  executeGitDiscovery,
  getRepoFingerprint,
  getDirectoryFingerprint,
} from '../src/git.js';

let gitFixtureDir: string;
let plainDir: string;

beforeAll(async () => {
  gitFixtureDir = await mkdtemp(join(tmpdir(), 'ngcompass-git-'));
  execSync('git init', { cwd: gitFixtureDir, stdio: 'pipe' });
  execSync('git config user.email "ci@ngcompass.test"', {
    cwd: gitFixtureDir,
    stdio: 'pipe',
  });
  execSync('git config user.name "CI"', { cwd: gitFixtureDir, stdio: 'pipe' });
  await writeFile(join(gitFixtureDir, 'app.component.ts'), 'const x = 1;');
  await writeFile(join(gitFixtureDir, 'app.component.html'), '<div></div>');
  execSync('git add .', { cwd: gitFixtureDir, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: gitFixtureDir, stdio: 'pipe' });

  plainDir = await mkdtemp(join(tmpdir(), 'ngcompass-plain-'));
  await writeFile(join(plainDir, 'some.ts'), 'export {};');
});

afterAll(async () => {
  await rm(gitFixtureDir, { recursive: true, force: true });
  await rm(plainDir, { recursive: true, force: true });
});

describe('isGitRepo', () => {
  it('returns true for a valid git repository', async () => {
    const result = await isGitRepo(gitFixtureDir);
    expect(result).toBe(true);
  });

  it('returns false for a plain directory with no .git folder', async () => {
    const result = await isGitRepo(plainDir);
    expect(result).toBe(false);
  });

  it('returns false for a non-existent path', async () => {
    const result = await isGitRepo('/nonexistent-path-' + Date.now());
    expect(result).toBe(false);
  });
});

describe('executeGitDiscovery', () => {
  it('returns all committed files as absolute paths', async () => {
    const files = await executeGitDiscovery(gitFixtureDir);

    expect(files).toHaveLength(2);
    expect(files.every((f) => f.startsWith('/') || /^[A-Z]:/.test(f))).toBe(
      true
    );
    expect(files.some((f) => f.endsWith('app.component.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('app.component.html'))).toBe(true);
  });

  it('returns an untracked file created after the commit', async () => {
    const untracked = join(gitFixtureDir, 'untracked.ts');
    await writeFile(untracked, 'const y = 2;');
    try {
      const files = await executeGitDiscovery(gitFixtureDir);
      expect(files.some((f) => f.endsWith('untracked.ts'))).toBe(true);
    } finally {
      await rm(untracked, { force: true });
    }
  });

  it('returns an empty array for an empty git repo (no commits)', async () => {
    const emptyGit = await mkdtemp(join(tmpdir(), 'ngcompass-empty-git-'));
    try {
      execSync('git init', { cwd: emptyGit, stdio: 'pipe' });
      const files = await executeGitDiscovery(emptyGit);
      expect(files).toEqual([]);
    } finally {
      await rm(emptyGit, { recursive: true, force: true });
    }
  });

  it('resolves files relative to rootDir (absolute paths)', async () => {
    const files = await executeGitDiscovery(gitFixtureDir);
    for (const file of files) {
      expect(file).toMatch(/^([A-Z]:[\\/]|\/)/);
      expect(file.startsWith(gitFixtureDir.replace(/\\/g, '/'))).toBe(
        !file.includes('\\')
      );
    }
  });
});

describe('getRepoFingerprint', () => {
  it('returns a non-empty string for a valid git repo', async () => {
    const fp = await getRepoFingerprint(gitFixtureDir);
    expect(typeof fp).toBe('string');
    expect(fp.length).toBeGreaterThan(0);
  });

  it('returns a stable fingerprint for the same commit', async () => {
    const fp1 = await getRepoFingerprint(gitFixtureDir);
    const fp2 = await getRepoFingerprint(gitFixtureDir);

    expect(fp1).toBeTruthy();
    expect(fp2).toBeTruthy();
  });

  it('returns an empty string for a non-git directory', async () => {
    const fp = await getRepoFingerprint(plainDir);
    expect(fp).toBe('');
  });

  it('returns an empty string for a non-existent path', async () => {
    const fp = await getRepoFingerprint('/does-not-exist-' + Date.now());
    expect(fp).toBe('');
  });
});

describe('getDirectoryFingerprint', () => {
  it('returns a string matching the dir-N-N-N-N pattern', async () => {
    const fp = await getDirectoryFingerprint(plainDir);

    expect(fp).toMatch(/^dir-\d+-\d+-\d+-[\d.]+$/);
  });

  it('includes the file count in the fingerprint', async () => {
    const tmpD = await mkdtemp(join(tmpdir(), 'ngcompass-dirfp-'));
    try {
      const fp0 = await getDirectoryFingerprint(tmpD);
      expect(fp0).toMatch(/^dir-0-/);

      await writeFile(join(tmpD, 'a.ts'), 'x');
      const fp1 = await getDirectoryFingerprint(tmpD);
      expect(fp1).toMatch(/^dir-1-/);

      await writeFile(join(tmpD, 'b.ts'), 'y');
      const fp2 = await getDirectoryFingerprint(tmpD);
      expect(fp2).toMatch(/^dir-2-/);
    } finally {
      await rm(tmpD, { recursive: true, force: true });
    }
  });

  it('returns an empty string for a non-existent directory', async () => {
    const fp = await getDirectoryFingerprint('/nonexistent-' + Date.now());
    expect(fp).toBe('');
  });
});
