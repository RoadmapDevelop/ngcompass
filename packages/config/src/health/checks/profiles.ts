import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type {
  ConfigBlockValidation,
  ValidatedConfig,
  ValidationContext,
} from '../types.js';
import { validateConfigBlock } from './base.js';

function readExtends(profile: unknown): string | undefined {
  if (!profile || typeof profile !== 'object') return undefined;
  const value = (profile as { extends?: unknown }).extends;
  return typeof value === 'string' ? value : undefined;
}

function detectCycleFrom(
  start: string,
  profiles: Record<string, unknown>,
  visited: Set<string>,
  issues: ConfigIssue[]
): void {
  const chain: string[] = [];
  let current: string | undefined = start;

  while (current !== undefined) {
    if (visited.has(current)) return;
    if (chain.includes(current)) {
      issues.push({
        ...MESSAGES.PROFILE_CIRCULAR_INHERITANCE([...chain, current]),
        path: ['profiles', chain[0], 'extends'],
      });
      for (const name of chain) visited.add(name);
      return;
    }

    chain.push(current);
    current = readExtends(profiles[current]);
  }

  for (const name of chain) visited.add(name);
}

export function validateProfiles(
  config: ValidatedConfig,
  context: ValidationContext
): ConfigBlockValidation {
  const issues: ConfigIssue[] = [];

  if (!config.profiles || typeof config.profiles !== 'object') {
    return { issues };
  }

  const profiles = config.profiles;
  const profileNames = Object.keys(profiles);

  if (profileNames.length === 0) {
    issues.push({ ...MESSAGES.PROFILE_EMPTY, path: ['profiles'] });
    return { issues };
  }

  for (const [profileName, profile] of Object.entries(profiles)) {
    if (!profile || typeof profile !== 'object') continue;
    const { issues: blockIssues } = validateConfigBlock(profile, context, [
      'profiles',
      profileName,
    ]);
    issues.push(...blockIssues);
  }

  const visited = new Set<string>();
  for (const name of profileNames) {
    detectCycleFrom(name, profiles as Record<string, unknown>, visited, issues);
  }

  return { issues };
}
