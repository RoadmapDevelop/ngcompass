import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { stat, readdir } from 'node:fs/promises';
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
 * Computes a robust fingerprint for a non-git directory by statting its
 * first-level children.
 *
 * Unlike a plain directory mtime (which only updates when entries are
 * added/removed, not when file contents change on some OSes), this
 * fingerprint captures:
 *   - Total number of direct children (entry count)
 *   - Latest child mtime  (detects modifications)
 *   - Total size of direct children (detects content changes)
 *
 * The operation is deliberately limited to the first level so it stays
 * O(N) in directory entries rather than O(total files).
 *
 * @param dir - Absolute path to the directory to fingerprint
 * @returns Fingerprint string, or empty string on error
 */
export const getDirectoryFingerprint = async (dir: string): Promise<string> => {
    try {
        const entries = await readdir(dir, { withFileTypes: true });

        // Stat each direct child concurrently to capture mtime, size, and
        // presence changes. A single inaccessible entry is silently skipped.
        const statResults = await Promise.allSettled(
            entries.map(entry => stat(path.join(dir, entry.name)))
        );

        let totalSize = 0;
        let latestMtime = 0;
        let statSuccessCount = 0;

        for (const result of statResults) {
            if (result.status === 'fulfilled') {
                totalSize += result.value.size;
                if (result.value.mtimeMs > latestMtime) {
                    latestMtime = result.value.mtimeMs;
                }
                statSuccessCount++;
            }
        }

        // Fingerprint encodes: entry count, successful stats, total size,
        // latest mtime — any file addition, removal, modification, or size
        // change produces a different string.
        return `dir-${entries.length}-${statSuccessCount}-${totalSize}-${latestMtime}`;
    } catch (error) {
        debug('scanner', `Failed to get directory fingerprint: ${error instanceof Error ? error.message : String(error)}`);
        return '';
    }
};
