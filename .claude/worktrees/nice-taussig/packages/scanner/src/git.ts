/**
 * @fileoverview
 * Facilitates interaction with Git for efficient file discovery and repository state analysis.
 *
 * Utilizes low-level Git commands to discover tracked and untracked files while
 * respecting ignore configurations. Provides utilities for computing repository
 * fingerprints and directory-level state snapshots.
 */
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
 * Discovers all tracked and untracked file paths using git-ls-files.
 *
 * Executes a Git process to retrieve a comprehensive list of files within the
 * specified working tree, excluding those matching standard ignore patterns.
 *
 * @param rootDir - The absolute path to the repository root directory.
 * @returns A promise resolving to an array of absolute file paths.
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


/**
 * Computes a unique fingerprint for the current repository state.
 *
 * @param dir - The directory to analyze.
 * @returns A promise resolving to a state fingerprint string.
 */
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
 * Computes a robust fingerprint for a directory by analyzing its direct children.
 *
 * Captures relevant metadata including entry count, latest modification time,
 * and aggregate size to detect state changes efficiently.
 *
 * @param dir - The absolute path to the directory.
 * @returns A promise resolving to a fingerprint string.
 */
export const getDirectoryFingerprint = async (dir: string): Promise<string> => {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        const statResults = await Promise.allSettled(
            entries.map((entry: { name: any; }) => stat(path.join(dir, entry.name)))
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
        return `dir-${entries.length}-${statSuccessCount}-${totalSize}-${latestMtime}`;
    } catch (error) {
        debug('scanner', `Failed to get directory fingerprint: ${error instanceof Error ? error.message : String(error)}`);
        return '';
    }
};
