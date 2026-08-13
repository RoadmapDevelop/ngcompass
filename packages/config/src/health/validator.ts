import { defu } from 'defu';
import type { AstCache } from '@ngcompass/cache';
import type { ConfigIssue, ConfigValidationResult } from '@ngcompass/common';

import { AnalyzerConfigSchema } from '../validation/schema.js';
import {
  validateCrossFields,
  validateDeprecatedFields,
  validateExtendsChain,
  validateGlobPatterns,
  validatePaths,
  validateProfiles,
  validateRules,
} from './checks/index.js';
import { createDefaultContext } from './context.js';
import { enrichIssueLocations } from './enricher.js';
import type {
  ValidationContext,
  WritableIssue,
} from '../models/index.js';
import type { ValidatedConfig } from '../validation/schema.js';

const ERROR_CODES = {
  CHECK_FAILED: 'check-failed',
  PROFILE_NOT_FOUND: 'error-profile-not-found',
} as const;

const BUILTIN_PRESETS = new Set([
  'recommended',
  'strict',
  'performance',
  'reactivity',
  'all',
]);

interface BlockValidationOptions {
  config: unknown;
  context: ValidationContext;
  basePath?: (string | number)[];
  filePath?: string;
  fileContent?: string;
  astCache?: AstCache;
  contentHash?: string;
}

interface BlockValidationResult {
  issues: ConfigIssue[];
  validated?: ValidatedConfig;
}

interface CheckDescriptor {
  name: string;
  run: () => ConfigIssue[];
}

function parseSchema(
  config: unknown,
  basePath: (string | number)[],
  filePath: string | undefined
): { issues: ConfigIssue[]; validated: ValidatedConfig; success: boolean } {
  const result = AnalyzerConfigSchema.safeParse(config);

  if (!result.success) {
    const issues: ConfigIssue[] = result.error.issues.map((issue) => ({
      code: issue.code.replace(/_/g, '-'),
      message: issue.message,
      path: [...basePath, ...issue.path] as (string | number)[],
      severity: 'error' as const,
      file: filePath,
    }));
    return { issues, validated: config as ValidatedConfig, success: false };
  }

  return { issues: [], validated: result.data, success: true };
}

function runSemanticChecks(
  validated: ValidatedConfig,
  config: unknown,
  context: ValidationContext,
  basePath: (string | number)[],
  filePath: string | undefined
): ConfigIssue[] {
  const checks: CheckDescriptor[] = [
    {
      name: 'cross-fields',
      run: () => validateCrossFields(validated, context, basePath).issues,
    },
    {
      name: 'glob-patterns',
      run: () => validateGlobPatterns(validated, basePath).issues,
    },
    {
      name: 'paths',
      run: () => validatePaths(validated, context, basePath).issues,
    },
    { name: 'rules', run: () => validateRules(validated, basePath).issues },
    {
      name: 'extends-chain',
      run: () => validateExtendsChain(validated, basePath, context.cwd).issues,
    },
    {
      name: 'profiles',
      run: () => validateProfiles(validated, context).issues,
    },
    {
      name: 'deprecated',
      run: () => validateDeprecatedFields(config, basePath).issues,
    },
  ];

  const allIssues: ConfigIssue[] = [];
  for (const check of checks) {
    try {
      allIssues.push(...check.run());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      allIssues.push({
        code: ERROR_CODES.CHECK_FAILED,
        message: `Check "${check.name}" encountered an unexpected error: ${message}`,
        path: basePath,
        severity: 'error' as const,
        file: filePath,
      });
    }
  }
  return allIssues;
}

async function attachFileLocations(
  issues: ConfigIssue[],
  filePath: string,
  fileContent: string | undefined,
  astCache: AstCache | undefined,
  contentHash: string | undefined
): Promise<void> {
  if (fileContent) {
    await enrichIssueLocations(
      issues,
      fileContent,
      filePath,
      astCache,
      contentHash
    );
    return;
  }
  for (const issue of issues as WritableIssue[]) {
    if (!issue.file) issue.file = filePath;
  }
}

function deduplicateIssues(issues: ConfigIssue[]): ConfigIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const pathKey = issue.path ? issue.path.join('.') : '';
    const key = `${issue.code}:${issue.message}:${pathKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortIssuesBySeverity(issues: ConfigIssue[]): ConfigIssue[] {
  return [...issues].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'error' ? -1 : 1;
  });
}

function hasErrors(issues: ConfigIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

function buildValidationResult(
  issues: ConfigIssue[],
  finalConfig: ValidatedConfig | undefined
): ConfigValidationResult {
  const unique = sortIssuesBySeverity(deduplicateIssues(issues));
  const valid = !hasErrors(unique);
  return {
    config: valid ? finalConfig : undefined,
    report: { valid, issues: unique },
  };
}

function resolveProfiles(rawConfig: unknown): Record<string, unknown> {
  if (!rawConfig || typeof rawConfig !== 'object') return {};
  const profiles = (rawConfig as Record<string, unknown>).profiles;
  if (!profiles || typeof profiles !== 'object') return {};
  return profiles as Record<string, unknown>;
}

function buildProfileNotFoundResult(
  profile: string,
  availableProfiles: Record<string, unknown>,
  filePath: string | undefined
): ConfigValidationResult {
  const available = Object.keys(availableProfiles).join(', ');
  const stripped = profile.replace(/^ngcompass:/, '');
  const looksLikePreset = BUILTIN_PRESETS.has(stripped);
  const presetHint = looksLikePreset
    ? ` "${profile}" is a built-in preset, not a config profile. Use 'extends: "ngcompass:${stripped}"' in your config instead.`
    : '';
  return {
    config: undefined,
    report: {
      valid: false,
      issues: [
        {
          code: ERROR_CODES.PROFILE_NOT_FOUND,
          message: `Profile "${profile}" not found. Available: [${available}]${presetHint}`,
          path: ['profiles', profile],
          severity: 'error',
          file: filePath,
        },
      ],
    },
  };
}

async function validateBlock(
  options: BlockValidationOptions
): Promise<BlockValidationResult> {
  const {
    config,
    context,
    basePath = [],
    filePath,
    fileContent,
    astCache,
    contentHash,
  } = options;

  const {
    issues: schemaIssues,
    validated,
    success,
  } = parseSchema(config, basePath, filePath);
  const semanticIssues = runSemanticChecks(
    validated,
    config,
    context,
    basePath,
    filePath
  );
  const allIssues = [...schemaIssues, ...semanticIssues];

  if (filePath) {
    await attachFileLocations(
      allIssues,
      filePath,
      fileContent,
      astCache,
      contentHash
    );
  }

  return { issues: allIssues, validated: success ? validated : undefined };
}

export async function validateConfiguration(
  rawConfig: unknown,
  context: ValidationContext = createDefaultContext(),
  filePath?: string,
  fileContent?: string,
  astCache?: AstCache,
  contentHash?: string
): Promise<ConfigValidationResult> {
  const baseOptions = { context, filePath, fileContent, astCache, contentHash };
  const availableProfiles = resolveProfiles(rawConfig);

  if (context.profile) {
    const profileConfig = availableProfiles[context.profile];
    if (!profileConfig) {
      return buildProfileNotFoundResult(
        context.profile,
        availableProfiles,
        filePath
      );
    }

    const baseResult = await validateBlock({
      ...baseOptions,
      config: rawConfig,
    });

    const merged = defu(
      profileConfig as Record<string, unknown>,
      rawConfig as Record<string, unknown>
    );
    const profileResult = await validateBlock({
      ...baseOptions,
      config: merged,
      basePath: ['profiles', context.profile],
    });

    return buildValidationResult(
      [...baseResult.issues, ...profileResult.issues],
      profileResult.validated
    );
  }

  const { issues, validated } = await validateBlock({
    ...baseOptions,
    config: rawConfig,
  });
  return buildValidationResult(issues, validated);
}
