import * as fs from 'node:fs';
import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type {
  ConfigBlockValidation,
  ValidatedConfig,
  ValidationContext,
} from '../../models/index.js';

const TRAVERSAL_TOKEN = '..';
const SENSITIVE_DIRS = ['/etc/', '\\etc\\', '/var/', '\\var\\'];
const PATH_SEPARATOR_RE = /[\\/]/;

function containsNodeModulesSegment(location: string): boolean {
  return location.split(PATH_SEPARATOR_RE).includes('node_modules');
}

function isUnderNodeModulesCache(location: string): boolean {
  const segments = location.split(PATH_SEPARATOR_RE);
  const idx = segments.indexOf('node_modules');
  return idx !== -1 && segments[idx + 1] === '.cache';
}

export function validatePaths(
  config: ValidatedConfig,
  context: ValidationContext,
  basePath: (string | number)[] = []
): ConfigBlockValidation {
  const issues: ConfigIssue[] = [];

  const resolveFromCwd = (targetPath: string): string =>
    context.path.isAbsolute(targetPath)
      ? targetPath
      : context.path.resolve(context.cwd, targetPath);

  if (config.outputPath) {
    const { outputPath } = config;
    const path = [...basePath, 'outputPath'];

    if (outputPath.includes(TRAVERSAL_TOKEN)) {
      issues.push({ ...MESSAGES.OUTPUT_PATH_TRAVERSAL(outputPath), path });
    }

    if (SENSITIVE_DIRS.some((dir) => outputPath.includes(dir))) {
      issues.push({ ...MESSAGES.OUTPUT_PATH_SYSTEM_DIR(outputPath), path });
    }

    const dir = context.path.dirname(resolveFromCwd(outputPath));
    if (!context.fs.existsSync(dir)) {
      issues.push({ ...MESSAGES.OUTPUT_PATH_NOT_FOUND(dir), path });
    } else {
      try {
        context.fs.accessSync(dir, fs.constants.W_OK);
      } catch {
        issues.push({ ...MESSAGES.OUTPUT_PATH_NOT_WRITABLE(dir), path });
      }
    }
  }

  if (
    config.cache &&
    typeof config.cache === 'object' &&
    config.cache.enabled
  ) {
    const { location } = config.cache;
    if (location) {
      const path = [...basePath, 'cache', 'location'];

      if (
        containsNodeModulesSegment(location) &&
        !isUnderNodeModulesCache(location)
      ) {
        issues.push({ ...MESSAGES.CACHE_IN_NODE_MODULES(location), path });
      }

      const cacheDir = context.path.dirname(resolveFromCwd(location));
      if (!context.fs.existsSync(cacheDir)) {
        issues.push({ ...MESSAGES.CACHE_PARENT_NOT_FOUND(cacheDir), path });
      }
    }
  }

  if (config.parserOptions) {
    const { project, tsconfigRootDir } = config.parserOptions;

    if (project) {
      const resolved = resolveFromCwd(project);
      if (!context.fs.existsSync(resolved)) {
        issues.push({
          ...MESSAGES.TSCONFIG_PROJECT_NOT_FOUND(project),
          path: [...basePath, 'parserOptions', 'project'],
        });
      }
    }

    if (tsconfigRootDir) {
      const resolved = resolveFromCwd(tsconfigRootDir);
      if (!context.fs.existsSync(resolved)) {
        issues.push({
          ...MESSAGES.TSCONFIG_ROOT_NOT_FOUND(tsconfigRootDir),
          path: [...basePath, 'parserOptions', 'tsconfigRootDir'],
        });
      }
    }
  }

  return { issues };
}
