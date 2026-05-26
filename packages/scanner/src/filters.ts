import path from 'node:path';
import { minimatch } from 'minimatch';
import { loadAllGitignoreFilters } from './gitignore.js';
import {
  Err,
  Ok,
  type FilteredFileList,
  type GitignoreFilter,
  type NormalizedOptions,
  type RawFileList,
  type Result,
} from './types.js';

export const deduplicateFiles = (
  files: ReadonlyArray<string>
): ReadonlyArray<string> => Array.from(new Set(files));

export const applyGitignoreFilter = (
  files: ReadonlyArray<string>,
  rootDir: string,
  filter: GitignoreFilter
): ReadonlyArray<string> => files.filter((file) => filter(file, rootDir));

export const applyFilters = async (
  rawFiles: RawFileList,
  options: NormalizedOptions
): Promise<Result<FilteredFileList>> => {
  try {
    let files = rawFiles.files;
    const startCount = files.length;

    if (options.respectGitignore) {
      const filterResult = await loadAllGitignoreFilters(
        options.rootDir,
        files
      );
      if (!filterResult.ok) return filterResult;
      files = applyGitignoreFilter(files, options.rootDir, filterResult.data);
    }

    files = deduplicateFiles(files);

    return Ok({ files, filtered: startCount - files.length });
  } catch (error) {
    return Err(new Error(`Filtering failed: ${(error as Error).message}`));
  }
};

export const filterByExtension = (
  files: ReadonlyArray<string>,
  extensions: ReadonlyArray<string>
): ReadonlyArray<string> => {
  const extSet = new Set(extensions);
  return files.filter((file) => {
    const dotIndex = file.lastIndexOf('.');
    if (dotIndex === -1) return false;

    const slashIndex = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
    if (dotIndex <= slashIndex + 1) return false;
    return extSet.has(file.substring(dotIndex));
  });
};

export const filterByPattern = (
  files: ReadonlyArray<string>,
  pattern: RegExp
): ReadonlyArray<string> => files.filter((file) => pattern.test(file));

export const filterByGlob = (
  files: ReadonlyArray<string>,
  includes: ReadonlyArray<string>,
  ignores: ReadonlyArray<string>,
  rootDir: string
): ReadonlyArray<string> =>
  files.filter((file) => {
    const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
    const isIncluded = includes.some((p) =>
      minimatch(relativePath, p, { dot: true })
    );
    if (!isIncluded) return false;
    const isIgnored = ignores.some((p) =>
      minimatch(relativePath, p, { dot: true })
    );
    return !isIgnored;
  });
