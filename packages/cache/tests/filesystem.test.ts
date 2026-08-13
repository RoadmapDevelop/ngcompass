import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDirectoryStats } from '../src/filesystem.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('getDirectoryStats', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns {entries: 0, size: 0} if directory does not exist', async () => {
    vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'));

    const stats = await getDirectoryStats('/fake/path');
    expect(stats).toEqual({ entries: 0, size: 0 });
  });

  it('recurses directories to compute entries and size', async () => {
    vi.spyOn(fs, 'access').mockResolvedValue(undefined);

    const rootPath = path.resolve('/fake/path');
    const subdirPath = path.join(rootPath, 'subdir');
    const file1Path = path.join(rootPath, 'file1.txt');
    const file2Path = path.join(subdirPath, 'file2.txt');

    vi.spyOn(fs, 'readdir').mockImplementation(async (p) => {
      if (p === rootPath) {
        return [
          { name: 'file1.txt', isDirectory: () => false },
          { name: 'subdir', isDirectory: () => true },
        ] as any;
      } else if (p === subdirPath) {
        return [{ name: 'file2.txt', isDirectory: () => false }] as any;
      }
      return [];
    });

    vi.spyOn(fs, 'stat').mockImplementation(async (p) => {
      if (p === file1Path) {
        return { size: 100 } as any;
      } else if (p === file2Path) {
        return { size: 50 } as any;
      }
      return { size: 0 } as any;
    });

    const stats = await getDirectoryStats(rootPath);

    expect(stats.entries).toBe(2);
    expect(stats.size).toBe(150);
  });
});
