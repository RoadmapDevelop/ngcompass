#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = path.resolve(__dirname, '..', 'packages');

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function readPkg(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
}

function getPublishablePackages() {
  return fs
    .readdirSync(PACKAGES_DIR)
    .map((name) => path.join(PACKAGES_DIR, name, 'package.json'))
    .filter((p) => fs.existsSync(p))
    .map(readPkg)
    .filter((pkg) => pkg.private !== true && pkg.name && pkg.version);
}

const packages = getPublishablePackages();

if (packages.length === 0) {
  console.error(`${c.red}No publishable packages found.${c.reset}`);
  process.exit(1);
}

console.log(
  `${c.cyan}Promoting ${packages.length} packages to "latest" dist-tag...${c.reset}\n`
);

let failed = 0;
for (const pkg of packages) {
  const spec = `${pkg.name}@${pkg.version}`;
  process.stdout.write(
    `  ${c.dim}→${c.reset} npm dist-tag add ${spec} latest ... `
  );
  try {
    execSync(`npm dist-tag add ${spec} latest`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(`${c.green}ok${c.reset}`);
  } catch (err) {
    failed++;
    console.log(`${c.red}FAILED${c.reset}`);
    console.error(
      `${c.dim}    ${err.stderr?.toString().trim() || err.message}${c.reset}`
    );
  }
}

console.log('');
if (failed === 0) {
  console.log(
    `${c.green}All ${packages.length} packages now point "latest" at their current version.${c.reset}`
  );
  process.exit(0);
} else {
  console.error(
    `${c.red}${failed} package(s) failed to promote. See errors above.${c.reset}`
  );
  process.exit(1);
}
