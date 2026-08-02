#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgCyan: '\x1b[46m',
  black: '\x1b[30m',
};
const paint = (text, ...codes) => `${codes.join('')}${text}${c.reset}`;
const w = (line = '') => process.stdout.write(`${line}\n`);

const REQUIRED_FIELDS = ['name', 'version', 'description', 'license'];

const CLI_PACKAGE_NAME = 'ngcompass';
const CLI_BIN_NAME = 'ngcompass';
const EXPECTED_CLI_COMMANDS = [
  'init',
  'analyze',
  'config',
  'cache',
  'rules',
  'circular',
  'graph',
  'complexity',
  'visualize',
];

function registersCommand(bundle, commandName) {
  return new RegExp(`command\\(["']${commandName}(?=["' ])`).test(bundle);
}

function validateCliCommands(dir, pkg) {
  if (pkg.name !== CLI_PACKAGE_NAME) return [];

  const binPath = pkg.bin?.[CLI_BIN_NAME];
  if (typeof binPath !== 'string') return [];

  const fullBinPath = path.join(dir, binPath);
  if (!fs.existsSync(fullBinPath)) return [];

  const bundle = fs.readFileSync(fullBinPath, 'utf8');

  return EXPECTED_CLI_COMMANDS.filter(
    (name) => !registersCommand(bundle, name)
  ).map(
    (name) =>
      `shipped CLI bundle (${binPath}) does not register the "${name}" command`
  );
}

function getPublishablePackages() {
  return fs
    .readdirSync(PACKAGES_DIR)
    .map((name) => ({
      name,
      dir: path.join(PACKAGES_DIR, name),
      pkgPath: path.join(PACKAGES_DIR, name, 'package.json'),
    }))
    .filter(({ pkgPath }) => fs.existsSync(pkgPath))
    .map(({ name, dir, pkgPath }) => ({
      name,
      dir,

      pkg: JSON.parse(fs.readFileSync(pkgPath, 'utf8').replace(/^﻿/, '')),
    }))
    .filter(({ pkg }) => pkg.private !== true);
}

function getPackedFiles(pkgDir) {
  try {
    const output = execSync('npm pack --dry-run --json', {
      cwd: pkgDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(output);

    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    return (entry?.files ?? []).map((f) => f.path ?? f);
  } catch (err) {
    return { error: err.message };
  }
}

function validatePackage({ name, dir, pkg }) {
  const failures = [];

  for (const field of REQUIRED_FIELDS) {
    if (!pkg[field]) failures.push(`missing required field: "${field}"`);
  }

  const hasMain = pkg.main || pkg.exports;
  if (!hasMain) {
    failures.push('no "main" or "exports" entry point defined');
  } else {
    const mainPath =
      typeof pkg.main === 'string' ? path.join(dir, pkg.main) : null;
    if (mainPath && !fs.existsSync(mainPath)) {
      failures.push(`"main" points to non-existent file: ${pkg.main}`);
    }
  }

  if (pkg.bin) {
    for (const [binName, binPath] of Object.entries(pkg.bin)) {
      const fullBinPath = path.join(dir, binPath);
      if (!fs.existsSync(fullBinPath)) {
        failures.push(`bin["${binName}"] → "${binPath}" does not exist`);
      }
    }
  }

  const distDir = path.join(dir, 'dist');
  if (!fs.existsSync(distDir)) {
    failures.push('dist/ directory is missing — run "pnpm build" first');
  } else {
    const distFiles = fs.readdirSync(distDir);
    if (distFiles.length === 0) {
      failures.push('dist/ directory is empty — run "pnpm build" first');
    }
  }

  const packed = getPackedFiles(dir);

  if (packed.error) {
    failures.push(`npm pack --dry-run failed: ${packed.error}`);
  } else {
    const BAD_PATTERNS = [
      {
        re: /^src\/.*(?<!\.d)\.ts$/,
        label: 'TypeScript source file (non-declaration)',
      },
      { re: /\.spec\.(ts|js)$/, label: 'spec/test file' },
      { re: /^tests?\//, label: 'test directory' },
      { re: /tsconfig.*\.json$/, label: 'tsconfig' },
    ];

    for (const file of packed) {
      for (const { re, label } of BAD_PATTERNS) {
        if (re.test(file)) {
          failures.push(`tarball includes ${label}: ${file}`);
        }
      }
    }

    if (fs.existsSync(distDir)) {
      const hasDistFile = packed.some((f) => f.startsWith('dist/'));
      if (!hasDistFile) {
        failures.push(
          'tarball does not include any dist/ files — check "files" field in package.json'
        );
      }
    }
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.devDependencies,
  };
  for (const dep of Object.keys(allDeps ?? {})) {
    if (!dep.startsWith('@ngcompass/')) continue;
    const siblingName = dep.replace('@ngcompass/', '');
    const siblingDir = path.join(PACKAGES_DIR, siblingName);
    if (!fs.existsSync(siblingDir)) {
      failures.push(
        `dependency "${dep}" has no sibling package at packages/${siblingName}/`
      );
    }
  }

  failures.push(...validateCliCommands(dir, pkg));

  return failures;
}

function run() {
  w('');
  w(
    `  ${paint(' PKG VALIDATE ', c.bgCyan, c.black, c.bold)}  ${paint('Pre-publish package validation', c.bold)}`
  );
  w(paint(`  ${ROOT}`, c.dim));
  w('');

  const packages = getPublishablePackages();

  if (packages.length === 0) {
    w(paint('  No publishable packages found (all marked private?)', c.yellow));
    process.exit(0);
  }

  const results = [];

  for (const pkg of packages) {
    const failures = validatePackage(pkg);
    results.push({ name: pkg.pkg.name ?? pkg.name, failures });

    const ok = failures.length === 0;
    const icon = ok ? paint(' ❯ ', c.green) : paint(' ✗ ', c.red, c.bold);
    const label = ok
      ? paint(
          `${pkg.pkg.name ?? pkg.name}  ${paint(pkg.pkg.version ?? '', c.dim)}`,
          c.dim
        )
      : paint(
          `${pkg.pkg.name ?? pkg.name}  ${paint(pkg.pkg.version ?? '', c.dim)}`,
          c.bold
        );

    w(`  ${icon}${label}`);

    if (!ok) {
      for (const f of failures) {
        w(paint(`       → ${f}`, c.red));
      }
    }
  }

  const passed = results.filter((r) => r.failures.length === 0).length;
  const failed = results.length - passed;

  w('');
  w(paint('  ─────────────────────────────────────────────────', c.dim));
  w('');

  if (failed === 0) {
    w(
      `  ${paint(' PASS ', c.bgGreen, c.black, c.bold)}  ${paint(`All ${passed} packages are ship-ready`, c.green, c.bold)}`
    );
  } else {
    w(
      `  ${paint(' FAIL ', c.bgRed, c.black, c.bold)}  ${paint(`${failed} package(s) failed`, c.red, c.bold)}  ${paint(`· ${passed} passed`, c.green)}`
    );
    w('');
    w(paint('  Failed packages:', c.bold));
    for (const r of results.filter((r) => r.failures.length > 0)) {
      w(`    ${paint('✗ ' + r.name, c.red)}`);
      for (const f of r.failures) {
        w(paint(`        → ${f}`, c.dim));
      }
    }
    w('');
    w(paint('  Fix the issues above before publishing.', c.yellow));
  }

  w('');
  process.exit(failed > 0 ? 1 : 0);
}

run();
