import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { debug } from '@ngcompass/common';
import { Err, Ok, type GitignoreFilter, type Result } from './types.js';

export const loadGitignore = async (
  rootDir: string
): Promise<string | null> => {
  const gitignorePath = path.join(rootDir, '.gitignore');
  try {
    return await readFile(gitignorePath, 'utf-8');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    debug('scanner', `Failed to load .gitignore from ${rootDir}: ${msg}`);
    return null;
  }
};

export const createGitignoreFilter = (
  gitignoreContent: string
): GitignoreFilter => {
  const ig: Ignore = ignore().add(gitignoreContent);
  return (file: string, rootDir: string): boolean => {
    const relative = path.relative(rootDir, file);
    return !ig.ignores(relative);
  };
};

export const createPassThroughFilter = (): GitignoreFilter => () => true;

export const loadAndCreateGitignoreFilter = async (
  rootDir: string
): Promise<Result<GitignoreFilter>> => {
  try {
    const content = await loadGitignore(rootDir);
    if (!content) return Ok(createPassThroughFilter());
    return Ok(createGitignoreFilter(content));
  } catch (error) {
    return Err(
      new Error(`Failed to load .gitignore: ${(error as Error).message}`)
    );
  }
};

export const loadAllGitignoreFilters = async (
  rootDir: string,
  filePaths: ReadonlyArray<string>
): Promise<Result<GitignoreFilter>> => {
  try {
    const dirsToCheck = collectAncestorDirectories(rootDir, filePaths);
    const dirFilters: ReadonlyArray<{
      readonly dir: string;
      readonly ig: Ignore;
    }> = await loadIgnoreFiles(dirsToCheck);

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
    return Err(
      new Error(`Failed to load gitignore filters: ${(error as Error).message}`)
    );
  }
};

function collectAncestorDirectories(
  rootDir: string,
  filePaths: ReadonlyArray<string>
): ReadonlySet<string> {
  const dirs = new Set<string>([rootDir]);
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;

  for (const filePath of filePaths) {
    let current = path.dirname(filePath);

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

async function loadIgnoreFiles(
  dirs: ReadonlySet<string>
): Promise<ReadonlyArray<{ readonly dir: string; readonly ig: Ignore }>> {
  const result: { dir: string; ig: Ignore }[] = [];
  for (const dir of dirs) {
    const content = await loadGitignore(dir);
    if (content) result.push({ dir, ig: ignore().add(content) });
  }
  return result;
}
