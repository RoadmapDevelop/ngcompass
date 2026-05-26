import fs from 'node:fs/promises';
import path from 'node:path';
import { debug, type InitResult } from '@ngcompass/common';
import { DEFAULT_CONFIG } from '../schemas/defaults.js';

const CONFIG_FILENAME = 'ngcompass.config.ts';
const ANGULAR_WORKSPACE_FILENAME = 'angular.json';

export interface InitOptions {
  cwd?: string;
  force?: boolean;
}

export interface ConfigTemplateOptions {
  readonly include?: ReadonlyArray<string>;
  readonly exclude?: ReadonlyArray<string>;
}

export const renderConfigTemplate = (
  options: ConfigTemplateOptions = {}
): string => {
  const include = options.include ?? DEFAULT_CONFIG.include;
  const exclude = options.exclude ?? DEFAULT_CONFIG.exclude;
  const includes = include.map((p) => `    '${p}',`).join('\n');
  const excludes = exclude.map((p) => `    '${p}',`).join('\n');

  return `import { defineConfig } from '@ngcompass/config';

export default defineConfig({
  extends: 'ngcompass:recommended',

  include: [
${includes}
  ],

  exclude: [
${excludes}
  ],

  profiles: {
    ci: {
      outputFormat: 'json',
      maxWarnings: 0,
    },
  },
});
`;
};

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    debug('init', `Path does not exist or is inaccessible: ${targetPath}`);
    debug('init', formatError(error));
    return false;
  }
};

export async function detectAngularWorkspaceIncludes(
  cwd: string
): Promise<ReadonlyArray<string> | undefined> {
  const workspacePath = path.join(cwd, ANGULAR_WORKSPACE_FILENAME);
  const raw = await readOptionalFile(workspacePath);
  if (!raw) return undefined;

  const workspace = parseJsonRecord(raw, workspacePath);
  if (!workspace) return undefined;

  const projects = readRecordProperty(workspace, 'projects');
  if (!projects) return undefined;

  const roots = readAngularProjectSourceRoots(projects);
  if (roots.length === 0) return undefined;

  return buildSourceRootIncludes(roots);
}

export async function initConfig(
  options: InitOptions = {}
): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const filePath = path.join(cwd, CONFIG_FILENAME);

  if (!options.force && (await pathExists(filePath))) {
    return { success: false, filePath, alreadyExists: true };
  }

  const include = await detectAngularWorkspaceIncludes(cwd);
  await fs.writeFile(filePath, renderConfigTemplate({ include }), 'utf-8');
  return { success: true, filePath };
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    debug(
      'init',
      `Angular workspace detection skipped for ${filePath}: ${formatError(error)}`
    );
    return undefined;
  }
}

function parseJsonRecord(
  raw: string,
  filePath: string
): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : undefined;
  } catch (error) {
    debug(
      'init',
      `Angular workspace detection skipped for ${filePath}: ${formatError(error)}`
    );
    return undefined;
  }
}

function readAngularProjectSourceRoots(
  projects: Record<string, unknown>
): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();

  for (const project of Object.values(projects)) {
    const sourceRoot = readProjectSourceRoot(project);
    if (!sourceRoot || seen.has(sourceRoot)) continue;
    seen.add(sourceRoot);
    roots.push(sourceRoot);
  }

  return roots.sort((a, b) => a.localeCompare(b));
}

function readProjectSourceRoot(project: unknown): string | undefined {
  if (!isRecord(project)) return undefined;

  const sourceRoot = project['sourceRoot'];
  if (typeof sourceRoot === 'string' && sourceRoot.trim() !== '') {
    return normalizeProjectPath(sourceRoot);
  }

  const root = project['root'];
  if (typeof root === 'string' && root.trim() !== '') {
    return normalizeProjectPath(root);
  }

  return undefined;
}

function buildSourceRootIncludes(
  sourceRoots: ReadonlyArray<string>
): string[] {
  const includes: string[] = [];
  for (const root of sourceRoots) {
    includes.push(`${root}/**/*.ts`);
    includes.push(`${root}/**/*.html`);
  }
  return includes;
}

function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function readRecordProperty(
  value: Record<string, unknown>,
  property: string
): Record<string, unknown> | undefined {
  const child = value[property];
  return isRecord(child) ? child : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
