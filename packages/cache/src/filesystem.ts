import fs from 'node:fs/promises';
import path from 'node:path';
import { debug } from '@ngcompass/common';

export const getDirectoryStats = async (
  dirPath: string
): Promise<{ entries: number; size: number }> => {
  let entries = 0;
  let size = 0;

  try {
    await fs.access(dirPath);
  } catch {
    return { entries: 0, size: 0 };
  }

  const traverse = async (currentPath: string): Promise<void> => {
    const files = await fs.readdir(currentPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(currentPath, file.name);
      if (file.isDirectory()) {
        await traverse(fullPath);
      } else {
        entries++;
        const stats = await fs.stat(fullPath);
        size += stats.size;
      }
    }
  };

  try {
    await traverse(dirPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    debug(
      'cache',
      `getDirectoryStats partial failure on ${dirPath}: ${message}`
    );
  }

  return { entries, size };
};
