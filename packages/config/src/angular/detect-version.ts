import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  formatAngularVersion,
  parseAngularVersion,
  type AngularVersionTuple,
} from '@ngcompass/common';
import type { AngularVersionDetection } from '../models/index.js';

const NODE_MODULES_DIR = 'node_modules';
const ANGULAR_CORE_PACKAGE = '@angular/core';
const PACKAGE_MANIFEST = 'package.json';
const RANGE_PREFIX_PATTERN = /^(?:[\^~]|>=?\s*|=\s*)/;
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
] as const;

export function detectAngularVersion(
  rootDir: string,
  explicit: string | undefined
): AngularVersionDetection {
  if (explicit !== undefined) {
    const configured = parseAngularVersion(explicit);
    if (configured) {
      return { version: formatAngularVersion(configured), source: 'config' };
    }
  }

  const installed = findInstalledVersion(rootDir);
  if (installed) {
    return { version: formatAngularVersion(installed), source: 'installed' };
  }

  const declared = findDeclaredVersion(rootDir);
  if (declared) {
    return { version: formatAngularVersion(declared), source: 'declared' };
  }

  return {
    version: null,
    source: 'unknown',
    reason: `Could not determine the Angular version: no installed ${ANGULAR_CORE_PACKAGE} and no usable version range in ${PACKAGE_MANIFEST}`,
  };
}

function findInstalledVersion(rootDir: string): AngularVersionTuple | null {
  return walkUp(rootDir, (dir) => {
    const manifestPath = path.join(
      dir,
      NODE_MODULES_DIR,
      ANGULAR_CORE_PACKAGE,
      PACKAGE_MANIFEST
    );
    const manifest = readJsonObject(manifestPath);
    if (!manifest) return null;

    const version = readStringField(manifest, 'version');
    return version === null ? null : parseAngularVersion(version);
  });
}

function findDeclaredVersion(rootDir: string): AngularVersionTuple | null {
  return walkUp(rootDir, (dir) => {
    const manifest = readJsonObject(path.join(dir, PACKAGE_MANIFEST));
    if (!manifest) return null;

    const specifier = readAngularCoreSpecifier(manifest);
    if (specifier === null) return null;

    const stripped = specifier.trim().replace(RANGE_PREFIX_PATTERN, '').trim();
    return parseAngularVersion(stripped);
  });
}

function readAngularCoreSpecifier(
  manifest: Record<string, unknown>
): string | null {
  for (const field of DEPENDENCY_FIELDS) {
    const deps = manifest[field];
    if (!isPlainObject(deps)) continue;

    const specifier = deps[ANGULAR_CORE_PACKAGE];
    if (typeof specifier === 'string') return specifier;
  }
  return null;
}

function walkUp(
  startDir: string,
  probe: (dir: string) => AngularVersionTuple | null
): AngularVersionTuple | null {
  let current = path.resolve(startDir);

  for (;;) {
    const found = probe(current);
    if (found) return found;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return isPlainObject(parsed) ? parsed : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringField(
  source: Record<string, unknown>,
  key: string
): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}
