/**
 * @fileoverview
 * `.gitignore` resolution and composite filter construction.
 *
 * Loads ignore patterns from every `.gitignore` between `rootDir` and the
 * deepest directory present in the scanned file list, then builds a single
 * predicate that applies each ignore file relative to its own directory —
 * matching Git's hierarchical semantics. Monorepo projects with per-package
 * ignore rules depend on this composite behaviour.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { debug } from '@ngcompass/common';
import { Err, Ok, type GitignoreFilter, type Result } from './types.js';

/**
 * Reads the raw content of a `.gitignore` in `rootDir`, or returns `null`
 * when no file exists / cannot be read. Read errors are logged with the
 * underlying message so silent failures are diagnosable.
 */
export const loadGitignore = async (rootDir: string): Promise<string | null> => {
    const gitignorePath = path.join(rootDir, '.gitignore');
    try {
        return await readFile(gitignorePath, 'utf-8');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        debug('scanner', `Failed to load .gitignore from ${rootDir}: ${msg}`);
        return null;
    }
};

/**
 * Builds a {@link GitignoreFilter} from raw `.gitignore` text. Paths are
 * tested relative to `rootDir` (Git's contract).
 */
export const createGitignoreFilter = (gitignoreContent: string): GitignoreFilter => {
    const ig: Ignore = ignore().add(gitignoreContent);
    return (file: string, rootDir: string): boolean => {
        const relative = path.relative(rootDir, file);
        return !ig.ignores(relative);
    };
};

/** Pass-through filter used when no `.gitignore` files are found. */
export const createPassThroughFilter = (): GitignoreFilter => () => true;

/**
 * Single-directory convenience that wraps {@link loadGitignore} and
 * {@link createGitignoreFilter}. Falls back to a pass-through filter when
 * the directory has no `.gitignore`.
 */
export const loadAndCreateGitignoreFilter = async (
    rootDir: string,
): Promise<Result<GitignoreFilter>> => {
    try {
        const content = await loadGitignore(rootDir);
        if (!content) return Ok(createPassThroughFilter());
        return Ok(createGitignoreFilter(content));
    } catch (error) {
        return Err(new Error(`Failed to load .gitignore: ${(error as Error).message}`));
    }
};

/**
 * Builds a composite filter that walks every `.gitignore` between `rootDir`
 * and the supplied file paths.
 *
 * Each ignore file is applied relative to its own directory — Git's actual
 * behaviour — so a pattern like `dist/` in `src/.gitignore` only ignores
 * `src/dist/`, not the repo-root `dist/`.
 *
 * @param rootDir   - Scan root (absolute path).
 * @param filePaths - File paths discovered so far; used to enumerate the
 *                    directories the walker should visit.
 */
export const loadAllGitignoreFilters = async (
    rootDir: string,
    filePaths: ReadonlyArray<string>,
): Promise<Result<GitignoreFilter>> => {
    try {
        const dirsToCheck = collectAncestorDirectories(rootDir, filePaths);
        const dirFilters: ReadonlyArray<{ readonly dir: string; readonly ig: Ignore }> =
            await loadIgnoreFiles(dirsToCheck);

        if (dirFilters.length === 0) return Ok(createPassThroughFilter());

        const compositeFilter: GitignoreFilter = (filePath: string): boolean => {
            for (const { dir, ig } of dirFilters) {
                const rel = path.relative(dir, filePath).replace(/\\/g, '/');
                if (!rel.startsWith('..') && !path.isAbsolute(rel) && ig.ignores(rel)) {
                    return false;
                }
            }
            return true;
        };
        return Ok(compositeFilter);
    } catch (error) {
        return Err(new Error(`Failed to load gitignore filters: ${(error as Error).message}`));
    }
};

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Collects every ancestor directory of `filePaths` that lies inside
 * `rootDir` (inclusive). Uses an explicit separator guard so a sibling like
 * `${rootDir}-suffix` does not match the root prefix.
 */
function collectAncestorDirectories(
    rootDir: string,
    filePaths: ReadonlyArray<string>,
): ReadonlySet<string> {
    const dirs = new Set<string>([rootDir]);
    const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;

    for (const filePath of filePaths) {
        let current = path.dirname(filePath);
        // Walk up the tree, but only across directories that are strictly
        // inside rootDir. `current === rootDir` is the terminating case.
        while (current === rootDir || current.startsWith(rootWithSep)) {
            dirs.add(current);
            if (current === rootDir) break;
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }
    }
    return dirs;
}

/** Loads a `.gitignore` from every directory and bundles the results. */
async function loadIgnoreFiles(
    dirs: ReadonlySet<string>,
): Promise<ReadonlyArray<{ readonly dir: string; readonly ig: Ignore }>> {
    const result: { dir: string; ig: Ignore }[] = [];
    for (const dir of dirs) {
        const content = await loadGitignore(dir);
        if (content) result.push({ dir, ig: ignore().add(content) });
    }
    return result;
}
