import { exec } from 'node:child_process';
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


export const executeGitDiscovery = async (
    rootDir: string
): Promise<string[]> => {
    try {

        const { stdout } = await execAsync('git ls-files -c -o --exclude-standard', {
            cwd: rootDir,
            maxBuffer: 10 * 1024 * 1024,
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
