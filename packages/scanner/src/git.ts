import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { debug } from '@ngcompass/common';

const execAsync = promisify(exec);


export const isGitRepo = async (dir: string): Promise<boolean> => {
    try {
        await execAsync('git rev-parse --is-inside-work-tree', { cwd: dir });
        return true;
    } catch {
        return false;
    }
};

/**
 * Discovers all tracked and untracked (non-ignored) files via `git ls-files`.
 *
 * Uses `spawn` with streaming stdout instead of `exec` so there is no
 * hardcoded maxBuffer limit. Large repos with hundreds of thousands of
 * files are handled without hitting the old 10 MB ceiling.
 *
 * Flags:
 *   -c   Cached (staged / tracked) files
 *   -o   Other (untracked) files
 *   --exclude-standard  Respects .gitignore, .git/info/exclude, etc.
 *
 * @param rootDir - Absolute path to the repository working tree
 * @returns Absolute file paths; empty array on any error
 */
export const executeGitDiscovery = async (
    rootDir: string
): Promise<string[]> => {
    return new Promise((resolve) => {
        try {
            const child = spawn('git', ['ls-files', '-c', '-o', '--exclude-standard'], {
                cwd: rootDir,
            });

            const chunks: string[] = [];

            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (chunk: string) => {
                chunks.push(chunk);
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    debug('scanner', `git ls-files exited with code ${code}`);
                    resolve([]);
                    return;
                }

                const files = chunks
                    .join('')
                    .split('\n')
                    .filter((line) => line.trim().length > 0)
                    .map((file) => path.resolve(rootDir, file));

                resolve(files);
            });

            child.on('error', (err) => {
                debug('scanner', `Git discovery failed: ${err.message}`);
                resolve([]);
            });
        } catch (error) {
            debug('scanner', `Git discovery failed: ${(error as Error).message}`);
            resolve([]);
        }
    });
};


export const getRepoFingerprint = async (dir: string): Promise<string> => {
    try {
        const { stdout: head } = await execAsync('git rev-parse HEAD', { cwd: dir });

        try {
            const { stdout: root } = await execAsync('git rev-parse --show-toplevel', { cwd: dir });
            const indexPath = path.join(root.trim(), '.git', 'index');
            const fileStats = await stat(indexPath);
            return `${head.trim()}-${fileStats.mtime.getTime()}`;
        } catch {
            return head.trim();
        }
    } catch (error) {
        debug('scanner', `Failed to get repo fingerprint: ${error instanceof Error ? error.message : String(error)}`);
        return '';
    }
};

/**
 * Computes a lightweight fingerprint for a non-git directory.
 *
 * Uses the directory's mtime so the cache invalidates whenever files are
 * added, removed, or the directory itself is modified. This is not as
 * precise as the git fingerprint (e.g. touch-without-edit won't be
 * detected) but prevents stale cache hits on repeated CLI invocations
 * where nothing has changed.
 *
 * @param dir - Absolute path to the directory to fingerprint
 * @returns Fingerprint string, or empty string on error
 */
export const getDirectoryFingerprint = async (dir: string): Promise<string> => {
    try {
        const dirStat = await stat(dir);
        return `dir-${dirStat.mtimeMs}`;
    } catch (error) {
        debug('scanner', `Failed to get directory fingerprint: ${error instanceof Error ? error.message : String(error)}`);
        return '';
    }
};
