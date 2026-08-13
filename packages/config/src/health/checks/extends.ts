import { createRequire } from 'node:module';
import nodePath from 'node:path';
import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type {
  ConfigBlockValidation,
  ValidatedConfig,
} from '../../models/index.js';

function isSkippable(preset: string): boolean {
  if (preset.startsWith('.')) return true;
  if (nodePath.isAbsolute(preset)) return true;
  if (preset.includes(':')) return true;
  return false;
}

function tryResolve(preset: string, cwd: string): string | null {
  try {
    const anchorFile = nodePath.join(cwd, '__resolve_anchor__.cjs');
    const requireFn = createRequire(anchorFile);
    return requireFn.resolve(preset);
  } catch {
    return null;
  }
}

export function validateExtendsChain(
  config: ValidatedConfig,
  basePath: (string | number)[],
  cwd: string
): ConfigBlockValidation {
  const issues: ConfigIssue[] = [];

  if (!config.extends) return { issues };

  const isArray = Array.isArray(config.extends);
  const extendsList: unknown[] = isArray
    ? (config.extends as unknown[])
    : [config.extends];

  for (let i = 0; i < extendsList.length; i++) {
    const preset = extendsList[i];

    if (typeof preset !== 'string' || preset.trim() === '') continue;
    if (isSkippable(preset)) continue;

    if (tryResolve(preset, cwd) !== null) continue;

    const issuePath: (string | number)[] = [...basePath, 'extends'];
    if (isArray) issuePath.push(i);

    issues.push({
      ...MESSAGES.EXTENDS_NOT_FOUND(preset),
      path: issuePath,
    });
  }

  return { issues };
}
