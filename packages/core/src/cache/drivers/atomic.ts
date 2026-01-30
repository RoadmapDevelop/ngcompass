import writeFileAtomic from 'write-file-atomic';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AsyncDriver, DiskDriverConfig } from './types.js';

/**
 * Creates a storage driver that writes each key as a separate file.
 * Uses write-file-atomic for safe writes.
 * Ideal for storing distributed analysis results (one file per hash).
 */
export const createAtomicDriver = <T>(
    config: DiskDriverConfig
): AsyncDriver<T> => {
    const cacheDir = config.path;

    const getFilePath = (key: string): string => path.join(cacheDir, `${key}.json`);

    const ensureDir = async (): Promise<void> => {
        try {
            await fs.mkdir(cacheDir, { recursive: true });
        } catch {
            // Ignore if exists
        }
    };

    // Ensure directory exists on initialization
    // Note: This is floating promise, typically acceptable for init
    ensureDir();

    return {
        get: async (key: string): Promise<T | undefined> => {
            try {
                const filePath = getFilePath(key);
                const data = await fs.readFile(filePath, 'utf-8');
                return JSON.parse(data) as T;
            } catch {
                return undefined;
            }
        },

        set: async (key: string, value: T): Promise<void> => {
            await ensureDir();
            const filePath = getFilePath(key);
            await writeFileAtomic(filePath, JSON.stringify(value));
        },

        has: async (key: string): Promise<boolean> => {
            try {
                await fs.access(getFilePath(key));
                return true;
            } catch {
                return false;
            }
        },

        delete: async (key: string): Promise<void> => {
            try {
                await fs.unlink(getFilePath(key));
            } catch {
                // Ignore
            }
        },

        clear: async (): Promise<void> => {
            try {
                await fs.rm(cacheDir, { recursive: true, force: true });
                await ensureDir();
            } catch {
                // Ignore
            }
        }
    };
};
