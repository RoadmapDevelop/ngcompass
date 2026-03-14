/**
 * @fileoverview
 * Facilitates the resolution and evaluation of .gitignore configurations.
 *
 * Provides utilities for loading ignore patterns from the file system and
 * constructing composite filters that adhere to Git's hierarchical ignore
 * semantics.
 */
import ignore, { type Ignore } from 'ignore';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { GitignoreFilter, Result, Option } from './types.js';
import { Ok, Err } from './types.js';
import { debug } from '@ngcompass/common';

/**
 * Retrieves the raw content of a .gitignore file from a specified directory.
 *
 * @param rootDir - The directory in which to search for the .gitignore file.
 * @returns A promise resolving to the file content, or null if not found.
 */
export const loadGitignore = async (rootDir: string): Promise<Option<string>> => {
    const gitignorePath = path.join(rootDir, '.gitignore');

    try {
        const content = await readFile(gitignorePath, 'utf-8');
        return content;
    } catch (error) {
        debug('scanner', `Failed to load .gitignore from ${rootDir}`);
        return null;
    }
};

/**
 * Constructs a gitignore evaluator function from raw ignore patterns.
 *
 * @param gitignoreContent - The raw content of a .gitignore configuration.
 * @returns An evaluator function that determines if a file path is ignored.
 */
export const createGitignoreFilter = (gitignoreContent: string): GitignoreFilter => {
    const ig: Ignore = ignore().add(gitignoreContent);

    return (file: string, rootDir: string): boolean => {
        const relative = path.relative(rootDir, file);
        return !ig.ignores(relative);
    };
};

/**
 * Constructs a pass-through filter that accepts all file paths.
 *
 * @returns An evaluator function that invariably returns true.
 */
export const createPassThroughFilter = (): GitignoreFilter => () => true;

/**
 * Loads a .gitignore configuration and constructs an evaluator function.
 *
 * @param rootDir - The directory from which to load the configuration.
 * @returns A promise resolving to a Result containing the evaluator function.
 */
export const loadAndCreateGitignoreFilter = async (
    rootDir: string
): Promise<Result<GitignoreFilter>> => {
    try {
        const content = await loadGitignore(rootDir);

        if (!content) {
            return Ok(createPassThroughFilter());
        }

        const filter = createGitignoreFilter(content);
        return Ok(filter);
    } catch (error) {
        return Err(new Error(`Failed to load .gitignore: ${(error as Error).message}`));
    }
};

/**
 * Builds a composite gitignore filter by collecting every `.gitignore` file
 * that lies between `rootDir` and the directories of the supplied file paths.
 *
 * Each `.gitignore` file is applied relative to its own directory β€” exactly
 * as Git itself does β€” so a pattern `dist/` inside `src/.gitignore` only
 * ignores `src/dist/`, not the repo root `dist/`.
 *
 * This is more correct than loading only the root `.gitignore` for projects
 * that use per-package or per-directory ignore rules (monorepos, etc.).
 *
 * @param rootDir   - Scan root directory (absolute path)
 * @param filePaths - File paths discovered so far (used to find relevant dirs)
 * @returns Composite filter or a pass-through if no `.gitignore` files found
 */
export const loadAllGitignoreFilters = async (
    rootDir: string,
    filePaths: ReadonlyArray<string>
): Promise<Result<GitignoreFilter>> => {
    try {
        const dirsToCheck = new Set<string>();
        dirsToCheck.add(rootDir);

        for (const filePath of filePaths) {
            let current = path.dirname(filePath);
            while (current.startsWith(rootDir) && current !== path.dirname(rootDir)) {
                dirsToCheck.add(current);
                if (current === rootDir) break;
                current = path.dirname(current);
            }
        }

        type DirIgnore = { readonly dir: string; readonly ig: Ignore };
        const dirFilters: DirIgnore[] = [];

        for (const dir of dirsToCheck) {
            const content = await loadGitignore(dir);
            if (content) {
                dirFilters.push({ dir, ig: ignore().add(content) });
            }
        }

        if (dirFilters.length === 0) {
            return Ok(createPassThroughFilter());
        }

        const compositeFilter: GitignoreFilter = (filePath: string): boolean => {
            for (const { dir, ig } of dirFilters) {
                const rel = path.relative(dir, filePath).replace(/\\/g, '/');
                if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
                    if (ig.ignores(rel)) return false;
                }
            }
            return true;
        };

        return Ok(compositeFilter);
    } catch (error) {
        return Err(new Error(`Failed to load gitignore filters: ${(error as Error).message}`));
    }
};
