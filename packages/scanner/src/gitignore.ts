/**
 * Gitignore Handling
 *
 * Higher-order functions for creating gitignore filters.
 * Uses functional patterns: HOF, pure functions, composition.
 */

import ignore, { type Ignore } from 'ignore';
import fs from 'node:fs/promises';
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
        const content = await fs.readFile(gitignorePath, 'utf-8');
        return content;
    } catch (error) {
        // .gitignore doesn't exist or can't be read
        debug('scanner', `Failed to load .gitignore from ${rootDir}: ${error instanceof Error ? error.message : String(error)}`);
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

    // Return a filter function (closure over ig)
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
            // No .gitignore found, return pass-through filter
            return Ok(createPassThroughFilter());
        }

        const filter = createGitignoreFilter(content);
        return Ok(filter);
    } catch (error) {
        return Err(new Error(`Failed to load .gitignore: ${(error as Error).message}`));
    }
};
