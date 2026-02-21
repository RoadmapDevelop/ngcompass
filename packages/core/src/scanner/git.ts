import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { debug } from '@ngcompass/common';

const execAsync = promisify(exec);

/**
 * Checks if a directory is a Git repository.
 */
export const isGitRepo = async (dir: string): Promise<boolean> => {
    try {
        await execAsync('git rev-parse --is-inside-work-tree', { cwd: dir });
        return true;
    } catch {
        return false;
    }
};

/**
 * Discovers files using Git ls-files.
 * This is significantly faster than standard globbing for large repositories.
 */
export const executeGitDiscovery = async (
    rootDir: string
): Promise<string[]> => {
    try {
        // -c: cached files (tracked)
        // -o: other files (untracked)
        // --exclude-standard: use standard git exclude rules (.gitignore)
        // Relative to current directory (omitting --full-name)
        const { stdout } = await execAsync('git ls-files -c -o --exclude-standard', {
            cwd: rootDir,
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large lists
        });

        const files = stdout
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .map((file) => path.resolve(rootDir, file));

        return files;
    } catch (error) {
        debug('scanner', `Git discovery failed: ${(error as Error).message}`);
        return [];
    }
};

/**
 * Gets a fingerprint for the current repo state (HEAD commit + .git/index stats)
 */
export const getRepoFingerprint = async (dir: string): Promise<string> => {
    try {
        const { stdout: head } = await execAsync('git rev-parse HEAD', { cwd: dir });

        try {
            const { stdout: root } = await execAsync('git rev-parse --show-toplevel', { cwd: dir });
            const indexPath = path.join(root.trim(), '.git', 'index');
            const stats = await fs.stat(indexPath);
            return `${head.trim()}-${stats.mtime.getTime()}`;
        } catch {
            // Fallback if index not readable or not found
            return head.trim();
        }
    } catch (error) {
        debug('scanner', `Failed to get repo fingerprint: ${error instanceof Error ? error.message : String(error)}`);
        return '';
    }
};
