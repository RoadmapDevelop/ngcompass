import { glob } from 'tinyglobby';
import { Err, Ok, type Result } from '@ngcompass/common';
import { describeError } from './error-message.js';
import type { ExpandedPatterns, RawFileList } from './models/index.js';

export const executeGlob = async (
  patterns: ExpandedPatterns,
  rootDir: string,
  options: { readonly followSymlinks: boolean; readonly dot: boolean }
): Promise<Result<RawFileList>> => {
  try {
    const files = await glob([...patterns.include], {
      cwd: rootDir,
      ignore: [...patterns.ignore],
      absolute: true,
      followSymbolicLinks: options.followSymlinks,
      onlyFiles: true,
      dot: options.dot,
    });
    return Ok({ files });
  } catch (error) {
    return Err(new Error(`Glob execution failed: ${describeError(error)}`));
  }
};

export const patternsLikelyHaveMatches = (
  patterns: ExpandedPatterns
): boolean => {
  if (patterns.include.length === 0) return false;
  if (patterns.include.every((p) => p.startsWith('!'))) return false;
  return true;
};
