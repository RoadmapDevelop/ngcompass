import * as fs from 'node:fs/promises';
import { debug, stableSerialize, type ResolvedRule } from '@ngcompass/common';
import {
  computeHash,
  type CacheKeyContext,
  type MetaCache,
} from '@ngcompass/cache';

import type { TaskInputs } from '../models/index.js';

const HASH_BATCH_SIZE = 500;

export const warmupHashCache = async (
  filePaths: ReadonlyArray<string>,
  metaCache: MetaCache,
  hashCache: Map<string, string>
): Promise<void> => {
  for (let i = 0; i < filePaths.length; i += HASH_BATCH_SIZE) {
    const batch = filePaths.slice(i, i + HASH_BATCH_SIZE);

    await Promise.all(
      batch.map(async (filePath) => {
        if (hashCache.has(filePath)) return;
        try {
          const stats = await fs.stat(filePath);
          const cachedMeta = await metaCache.get(filePath);
          if (
            cachedMeta &&
            cachedMeta.mtime === stats.mtimeMs &&
            cachedMeta.size === stats.size
          ) {
            hashCache.set(filePath, cachedMeta.hash);
            return;
          }
          const hash = await hashFile(filePath);
          hashCache.set(filePath, hash);
          await metaCache.set(filePath, {
            mtime: stats.mtimeMs,
            size: stats.size,
            hash,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          debug(
            'planner',
            `Hash cache warmup skipped ${filePath}: ${message}`
          );
        }
      })
    );
  }

  if (metaCache.flush) await metaCache.flush();
};

export const hashFile = async (
  filePath: string,
  cache?: Map<string, string>
): Promise<string> => {
  const cached = cache?.get(filePath);
  if (cached) return cached;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const hash = computeHash(content);
    cache?.set(filePath, hash);
    return hash;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debug('planner', `Failed to hash file: ${filePath}. Error: ${message}`);
    return '';
  }
};

export const hashFiles = async (
  filePaths: ReadonlyArray<string>,
  cache?: Map<string, string>
): Promise<string> => {
  if (filePaths.length === 0) return '';
  const entries = await Promise.all(
    filePaths.map(async (p) => `${p}:${await hashFile(p, cache)}`)
  );
  entries.sort();
  return computeHash(entries.join('|'));
};

export const hashFileStats = async (filePath: string): Promise<string> => {
  try {
    const stats = await fs.stat(filePath);
    return computeHash(`${filePath}::${stats.size}::${stats.mtimeMs}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debug('planner', `Failed to stat file: ${filePath}. Error: ${message}`);
    return '';
  }
};

export const hashRules = (rules: ReadonlyArray<ResolvedRule>): string => {
  const rulesData = rules
    .map((rule) => ({
      name: rule.name,
      severity: rule.severity,
      options: rule.options,
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return computeHash(stableSerialize(rulesData));
};

export const calculateFileHash = (
  inputs: TaskInputs,
  applicableRules: ReadonlyArray<ResolvedRule>
): string => {
  const parts: string[] = [];
  parts.push(inputs.typescript.hash);
  if (inputs.template) parts.push(inputs.template.hash);
  if (inputs.styles) {
    const styleHashes = inputs.styles.map((s) => s.hash).sort();
    parts.push(...styleHashes);
  }
  if (inputs.spec) parts.push(inputs.spec.hash);
  parts.push(hashRules(applicableRules));
  return computeHash(parts.join('::'));
};

export const hashTaskInputs = async (inputs: TaskInputs): Promise<string> => {
  const filePaths: string[] = [inputs.typescript.path];
  if (inputs.template) filePaths.push(inputs.template.path);
  if (inputs.styles) filePaths.push(...inputs.styles.map((s) => s.path));
  if (inputs.spec) filePaths.push(inputs.spec.path);
  return hashFiles(filePaths);
};

export const calculateTaskId = (
  ruleName: string,
  inputs: TaskInputs,
  options: Readonly<Record<string, unknown>>,
  ctx?: CacheKeyContext
): string => {
  const parts: string[] = [];
  if (ctx) {
    parts.push(ctx.toolVersion);
    parts.push(ctx.ruleRegistryHash);
  }
  parts.push(ruleName);
  parts.push(inputs.typescript.path);
  parts.push(inputs.typescript.hash);
  if (inputs.template) parts.push(inputs.template.hash);
  if (inputs.styles?.length) {
    parts.push(
      inputs.styles
        .map((s) => s.hash)
        .sort()
        .join('::')
    );
  }
  if (inputs.spec) parts.push(inputs.spec.hash);
  parts.push(stableSerialize(options));
  return computeHash(parts.join('::'));
};

export const calculateGlobalHash = async (
  files: ReadonlyArray<string>,
  rules: ReadonlyMap<string, ResolvedRule>,
  hashCache: Map<string, string>,
  ctx?: CacheKeyContext
): Promise<string> => {
  const fileEntries: string[] = [];
  for (let i = 0; i < files.length; i += HASH_BATCH_SIZE) {
    const batch = files.slice(i, i + HASH_BATCH_SIZE);
    const batchEntries = await Promise.all(
      batch.map(
        async (f) =>
          `${f}:${hashCache.get(f) ?? (await hashFile(f, hashCache))}`
      )
    );
    fileEntries.push(...batchEntries);
  }
  fileEntries.sort();

  const parts: string[] = [];
  parts.push(...fileEntries);
  parts.push(hashRules(Array.from(rules.values())));

  if (ctx) {
    parts.push(`tool:${ctx.toolVersion}`);
    parts.push(`parser:${ctx.parserVersion}`);
    parts.push(`registry:${ctx.ruleRegistryHash}`);
    parts.push(`platform:${ctx.platform}`);
  }

  return computeHash(parts.join('||'));
};
