const CONFIG_PATH = '/ngcompass.config.ts';
const PACKAGE_JSON_PATH = '/package.json';
const LINT_SCRIPT_NAME = 'lint:ngcompass';
const LINT_SCRIPT_COMMAND = 'ngcompass analyze';
const DEFAULT_INCLUDE = ['**/*.ts', '**/*.html'];
const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/*.spec.ts',
  '**/*.test.ts',
];

function ngAdd(options = {}) {
  return (tree) => {
    writeConfig(tree, options);
    if (!options.skipScript) writePackageScript(tree);
    return tree;
  };
}

function writeConfig(tree, options) {
  if (tree.exists(CONFIG_PATH) && !options.force) return;
  const config = renderConfigTemplate(resolveIncludePatterns(tree));
  if (tree.exists(CONFIG_PATH)) {
    tree.overwrite(CONFIG_PATH, config);
    return;
  }
  tree.create(CONFIG_PATH, config);
}

function writePackageScript(tree) {
  if (!tree.exists(PACKAGE_JSON_PATH)) return;
  const raw = tree.read(PACKAGE_JSON_PATH);
  if (!raw) return;
  const pkg = JSON.parse(raw.toString('utf-8'));
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return;
  const scripts =
    pkg.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)
      ? pkg.scripts
      : {};
  if (typeof scripts[LINT_SCRIPT_NAME] !== 'string') {
    scripts[LINT_SCRIPT_NAME] = LINT_SCRIPT_COMMAND;
  }
  pkg.scripts = scripts;
  tree.overwrite(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, 2)}\n`);
}

function resolveIncludePatterns(tree) {
  if (!tree.exists('/angular.json')) return DEFAULT_INCLUDE;
  const raw = tree.read('/angular.json');
  if (!raw) return DEFAULT_INCLUDE;
  try {
    const workspace = JSON.parse(raw.toString('utf-8'));
    const roots = readAngularSourceRoots(workspace);
    return roots.length > 0 ? buildIncludePatterns(roots) : DEFAULT_INCLUDE;
  } catch {
    return DEFAULT_INCLUDE;
  }
}

function readAngularSourceRoots(workspace) {
  if (!isRecord(workspace) || !isRecord(workspace.projects)) return [];
  const roots = [];
  const seen = new Set();
  for (const project of Object.values(workspace.projects)) {
    const sourceRoot = readProjectSourceRoot(project);
    if (!sourceRoot || seen.has(sourceRoot)) continue;
    seen.add(sourceRoot);
    roots.push(sourceRoot);
  }
  return roots.sort((a, b) => a.localeCompare(b));
}

function readProjectSourceRoot(project) {
  if (!isRecord(project)) return undefined;
  if (typeof project.sourceRoot === 'string' && project.sourceRoot.trim()) {
    return normalizePath(project.sourceRoot);
  }
  if (typeof project.root === 'string' && project.root.trim()) {
    return normalizePath(project.root);
  }
  return undefined;
}

function normalizePath(value) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function buildIncludePatterns(sourceRoots) {
  const patterns = [];
  for (const root of sourceRoots) {
    patterns.push(`${root}/**/*.ts`);
    patterns.push(`${root}/**/*.html`);
  }
  return patterns;
}

function renderConfigTemplate(include = DEFAULT_INCLUDE) {
  const includes = include.map((pattern) => `    '${pattern}',`).join('\n');
  const excludes = DEFAULT_EXCLUDE.map((pattern) => `    '${pattern}',`).join('\n');
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
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

exports.ngAdd = ngAdd;
