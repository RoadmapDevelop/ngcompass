'use strict';

const DEFAULT_INCLUDE = ['**/*.ts', '**/*.html'];
const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/*.spec.ts',
  '**/*.test.ts',
];

function renderConfigTemplate(include, exclude) {
  const inc = (include ?? DEFAULT_INCLUDE).map((p) => `    '${p}',`).join('\n');
  const exc = (exclude ?? DEFAULT_EXCLUDE).map((p) => `    '${p}',`).join('\n');
  return `import { defineConfig } from '@ngcompass/config';

export default defineConfig({
  extends: 'ngcompass:recommended',

  include: [
${inc}
  ],

  exclude: [
${exc}
  ],

  profiles: {
    ci: {
      outputFormat: 'json',
      maxWarnings: 0,
    },
  },
});
`;
}

function normalizeProjectPath(value) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function readJsonObject(tree, filePath, logger) {
  const buffer = tree.read(filePath);
  if (!buffer) return undefined;
  try {
    const value = JSON.parse(buffer.toString('utf-8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return value;
  } catch (err) {
    logger.debug(`Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

function resolveNxProjectSourceRoot(tree, projectPath, logger) {
  const config = readJsonObject(tree, `/${projectPath}/project.json`, logger);
  if (config) {
    const sr = config['sourceRoot'];
    if (typeof sr === 'string' && sr.trim() !== '') {
      return normalizeProjectPath(sr);
    }
  }
  return normalizeProjectPath(`${projectPath}/src`);
}

function detectWorkspaceIncludes(tree, logger) {
  const workspace = readJsonObject(tree, '/angular.json', logger);
  if (!workspace) return undefined;

  const projects = workspace['projects'];
  if (typeof projects !== 'object' || projects === null || Array.isArray(projects)) return undefined;

  const seen = new Set();
  const roots = [];

  for (const project of Object.values(projects)) {
    let sourceRoot;

    if (typeof project === 'object' && project !== null && !Array.isArray(project)) {
      const sr = project['sourceRoot'];
      const r = project['root'];
      if (typeof sr === 'string' && sr.trim() !== '') {
        sourceRoot = normalizeProjectPath(sr);
      } else if (typeof r === 'string' && r.trim() !== '') {
        sourceRoot = normalizeProjectPath(r);
      }
    } else if (typeof project === 'string' && project.trim() !== '') {
      sourceRoot = resolveNxProjectSourceRoot(tree, project.trim(), logger);
    }

    if (!sourceRoot || seen.has(sourceRoot)) continue;
    seen.add(sourceRoot);
    roots.push(sourceRoot);
  }

  if (roots.length === 0) return undefined;

  roots.sort((a, b) => a.localeCompare(b));

  const includes = [];
  for (const root of roots) {
    includes.push(`${root}/**/*.ts`);
    includes.push(`${root}/**/*.html`);
  }
  return includes;
}

function writeConfigFile(tree, force, logger) {
  const configPath = '/ngcompass.config.ts';

  if (!force && tree.exists(configPath)) {
    logger.info('ngcompass.config.ts already exists, skipping.');
    return;
  }

  const include = detectWorkspaceIncludes(tree, logger);
  const content = renderConfigTemplate(include, undefined);

  if (tree.exists(configPath)) {
    tree.overwrite(configPath, content);
  } else {
    tree.create(configPath, content);
  }
}

function insertNpmScript(tree, logger) {
  const pkg = readJsonObject(tree, '/package.json', logger);
  if (!pkg) {
    logger.warn('No package.json found; skipping script insertion.');
    return;
  }

  if (!pkg.scripts || typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts)) {
    pkg.scripts = {};
  }

  if (pkg.scripts['lint:ngcompass']) return;

  pkg.scripts['lint:ngcompass'] = 'ngcompass analyze';
  tree.overwrite('/package.json', JSON.stringify(pkg, null, 2) + '\n');
}

function ngAdd(options) {
  return (tree, context) => {
    writeConfigFile(tree, options.force ?? false, context.logger);

    if (!(options.skipScript ?? false)) {
      insertNpmScript(tree, context.logger);
    }

    return tree;
  };
}

exports.ngAdd = ngAdd;
