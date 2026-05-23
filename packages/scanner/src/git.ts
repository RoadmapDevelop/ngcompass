/**
 * @fileoverview
 * Git-backed file discovery and repository fingerprinting.
 *
 * `git ls-files` is dramatically faster than recursive globbing on large
 * repositories because Git already maintains its own file index. We spawn
 * the binary directly (no shell) so paths with special characters and
 * Windows whitespace work without quoting.
 *
 * Fingerprinting helpers (`getRepoFingerprint`, `getDirectoryFingerprint`)
 * produce stable strings the scanner's cache layer uses to detect whether
 * the discovered file list is still valid.
 */

import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { debug } from '@ngcompass/common';

/** Returns `true` when `dir` is inside a Git working tree. */
export const isGitRepo = async (dir: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const child = spawn('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir });
        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
    });
};

/**
 * Discovers every tracked + untracked-but-not-ignored file via
 * `git ls-files`. Resolves to an empty array when the command fails or the
 * repo is empty; both cases trigger a glob-based fallback in the caller.
 */
export const executeGitDiscovery = async (rootDir: string): Promise<string[]> => {
    return new Promise((resolve) => {
        try {
            const child = spawn('git', ['ls-files', '-c', '-o', '--exclude-standard'], {
                cwd: rootDir,
            });

            const stdoutChunks: string[] = [];
            const stderrChunks: string[] = [];

            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (chunk: string) => stdoutChunks.push(chunk));

            child.stderr.setEncoding('utf8');
            child.stderr.on('data', (chunk: string) => stderrChunks.push(chunk));

            child.on('close', (code) => {
                if (code !== 0) {
                    const stderr = stderrChunks.join('').trim();
                    debug(
                        'scanner',
                        `git ls-files exited with code ${code}${stderr ? `: ${stderr}` : ''}`,
                    );
                    resolve([]);
                    return;
                }

                const files = stdoutChunks
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
 * Computes a fingerprint that changes whenever the working tree's tracked
 * content changes. Falls back to a HEAD-only digest when the `.git/index`
 * stat fails (e.g. permission denied on CI runners).
 */
export const getRepoFingerprint = async (dir: string): Promise<string> => {
    const head = await runGitForOutput(['rev-parse', 'HEAD'], dir);
    if (!head) return '';

    const root = await runGitForOutput(['rev-parse', '--show-toplevel'], dir);
    if (!root) return head;

    try {
        const indexPath = path.join(root, '.git', 'index');
        const fileStats = await stat(indexPath);
        return `${head}-${fileStats.mtime.getTime()}`;
    } catch (err) {
        debug(
            'scanner',
            `Could not stat .git/index, falling back to HEAD-only fingerprint: ${err instanceof Error ? err.message : String(err)}`,
        );
        return head;
    }
};

/**
 * Computes a fingerprint by sampling the immediate children of `dir`
 * (count + size sum + latest mtime). Cheaper than `getRepoFingerprint` and
 * used when the directory isn't a Git repo.
 */
export const getDirectoryFingerprint = async (dir: string): Promise<string> => {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        const statResults = await Promise.allSettled(
            entries.map((entry) => stat(path.join(dir, entry.name))),
        );

        let totalSize = 0;
        let latestMtime = 0;
        let statSuccessCount = 0;

        for (const result of statResults) {
            if (result.status !== 'fulfilled') continue;
            totalSize += result.value.size;
            if (result.value.mtimeMs > latestMtime) latestMtime = result.value.mtimeMs;
            statSuccessCount++;
        }
        return `dir-${entries.length}-${statSuccessCount}-${totalSize}-${latestMtime}`;
    } catch (error) {
        debug(
            'scanner',
            `Failed to get directory fingerprint: ${error instanceof Error ? error.message : String(error)}`,
        );
        return '';
    }
};

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Runs `git <args>` in `cwd` and returns the trimmed stdout, or an empty
 * string when the command fails. Spawns the binary directly to avoid shell
 * quoting issues.
 */
function runGitForOutput(args: ReadonlyArray<string>, cwd: string): Promise<string> {
    return new Promise((resolve) => {
        const child = spawn('git', [...args], { cwd });
        const out: string[] = [];
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => out.push(chunk));
        child.on('close', (code) => resolve(code === 0 ? out.join('').trim() : ''));
        child.on('error', () => resolve(''));
    });
}
