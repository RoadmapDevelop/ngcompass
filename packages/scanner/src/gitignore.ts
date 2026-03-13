import ignore, { type Ignore } from 'ignore';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { GitignoreFilter, Result, Option } from './types.js';
import { Ok, Err } from './types.js';
import { debug } from '@ngcompass/common';

/**
 * Loads .gitignore content from a directory.
 *
 * Side effect: File system I/O
 * Returns Option type (null if not found)
 *
 * @param rootDir - Directory to search for .gitignore
 * @returns Gitignore content or null
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
 * Creates a gitignore filter function from gitignore content.
 *
 * Higher-order function: Returns a filter function.
 * Pure (except for the returned function's use of 'ignore' library).
 *
 * @param gitignoreContent - Content of .gitignore file
 * @returns Filter function that checks if file should be ignored
 */
export const createGitignoreFilter = (gitignoreContent: string): GitignoreFilter => {
    const ig: Ignore = ignore().add(gitignoreContent);

    return (file: string, rootDir: string): boolean => {
        const relative = path.relative(rootDir, file);
        return !ig.ignores(relative);
    };
};

/**
 * Creates a no-op filter (accepts all files).
 *
 * Pure function - returns a filter that always returns true.
 *
 * @returns Filter function that accepts all files
 */
export const createPassThroughFilter = (): GitignoreFilter => () => true;

/**
 * Loads gitignore and creates filter in one step.
 *
 * Combines I/O and filter creation.
 * Returns Result type for error handling.
 *
 * @param rootDir - Directory to load .gitignore from
 * @returns Result containing filter function or error
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
 * Each `.gitignore` file is applied relative to its own directory — exactly
 * as Git itself does — so a pattern `dist/` inside `src/.gitignore` only
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
        // Collect every ancestor directory from rootDir down to each file.
        // We deduplicate via a Set so each directory is only stat-ed once.
        const dirsToCheck = new Set<string>();
        dirsToCheck.add(rootDir);

        for (const filePath of filePaths) {
            let current = path.dirname(filePath);
            // Walk up toward rootDir, stopping when we leave its subtree.
            while (current.startsWith(rootDir) && current !== path.dirname(rootDir)) {
                dirsToCheck.add(current);
                if (current === rootDir) break;
                current = path.dirname(current);
            }
        }

        // Load each directory's .gitignore (if present) and build a per-dir
        // `ignore` instance so patterns are relative to that directory.
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

        // Composite filter: a file is excluded if ANY directory-level rules
        // (where the file lives inside that directory) match it.
        const compositeFilter: GitignoreFilter = (filePath: string): boolean => {
            for (const { dir, ig } of dirFilters) {
                // Only apply this dir's rules if the file lives inside it.
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
