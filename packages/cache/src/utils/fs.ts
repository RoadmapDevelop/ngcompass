import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Recursively gets the number of files and total size of a directory.
 */
export async function getDirectoryStats(dirPath: string): Promise<{ entries: number; size: number }> {
    let entries = 0;
    let size = 0;

    try {
        await fs.access(dirPath);
    } catch {
        return { entries: 0, size: 0 };
    }

    async function traverse(currentPath: string) {
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
    }

    try {
        await traverse(dirPath);
    } catch {
        // Ignore errors during traversal (e.g. race conditions)
    }

    return { entries, size };
}
