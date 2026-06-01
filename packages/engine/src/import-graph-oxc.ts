import { promises as fs } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { debug, type ParserOptions } from '@ngcompass/common';
import { parseTs } from '@ngcompass/ast';
import type { ImportGraphResult } from './project-context-builder.js';

export interface OxcGraphOptions {
  readonly rootDir: string;
  readonly parserOptions?: ParserOptions;
  readonly concurrency?: number;
  readonly onProgress?: (parsed: number, total: number) => void;
}

interface AliasEntry {
  readonly prefix: string;
  readonly suffix: string;
  readonly hasWildcard: boolean;
  readonly baseDir: string;
  readonly targets: ReadonlyArray<{
    readonly raw: string;
    readonly prefix: string;
    readonly suffix: string;
    readonly hasWildcard: boolean;
  }>;
}

interface ResolutionContext {
  readonly projectFiles: ReadonlySet<string>;
  readonly aliases: ReadonlyArray<AliasEntry>;
  readonly baseUrl: string | undefined;
}

const DEFAULT_CONCURRENCY = 32;
const PROGRESS_BATCH = 100;

export async function buildImportGraphOxc(
  files: ReadonlyArray<string>,
  options: OxcGraphOptions
): Promise<ImportGraphResult> {
  const start = performance.now();

  const projectFiles = new Set<string>();
  for (const f of files) {
    projectFiles.add(normalizePath(path.resolve(options.rootDir, f)));
  }

  const { baseUrl, paths } = loadTsconfigAliases(
    options.rootDir,
    options.parserOptions
  );
  const aliases = compileAliases(paths, baseUrl ?? options.rootDir);
  const resolution: ResolutionContext = { projectFiles, aliases, baseUrl };

  const tsLikeFiles: string[] = [];
  for (const file of projectFiles) {
    if (isTsLike(file)) tsLikeFiles.push(file);
  }

  const importGraph = new Map<string, Set<string>>();
  for (const file of tsLikeFiles) importGraph.set(file, new Set());

  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  let cursor = 0;
  let completed = 0;
  const total = tsLikeFiles.length;

  const worker = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= total) return;
      const file = tsLikeFiles[idx];

      const specifiers = await readAndExtractSpecifiers(file);
      const edges = importGraph.get(file)!;
      for (const specifier of specifiers) {
        const resolved = resolveSpecifier(specifier, file, resolution);
        if (resolved && resolved !== file) edges.add(resolved);
      }

      completed++;
      if (options.onProgress && completed % PROGRESS_BATCH === 0) {
        options.onProgress(completed, total);
      }
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (options.onProgress) options.onProgress(total, total);

  debug(
    'engine',
    `Oxc import graph built in ${(performance.now() - start).toFixed(2)}ms` +
      ` — ${total} files, ${countEdges(importGraph)} edges,` +
      ` ${aliases.length} path aliases`
  );

  return {
    importGraph,
    projectFiles,
    rootDir: options.rootDir,
  };
}

async function readAndExtractSpecifiers(file: string): Promise<string[]> {
  let content: string;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch {
    return [];
  }

  let program: { body?: ReadonlyArray<unknown> };
  try {
    program = parseTs(content, file).program as unknown as {
      body?: ReadonlyArray<unknown>;
    };
  } catch {
    return [];
  }

  const specifiers: string[] = [];
  const body = program.body;
  if (!Array.isArray(body)) return specifiers;

  for (const statement of body) {
    extractSpecifier(statement, specifiers);
  }

  return specifiers;
}

function extractSpecifier(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as {
    type?: string;
    source?: { value?: unknown };
    importKind?: string;
    exportKind?: string;
  };

  if (n.importKind === 'type' || n.exportKind === 'type') {
    return;
  }

  if (
    (n.type === 'ImportDeclaration' ||
      n.type === 'ExportNamedDeclaration' ||
      n.type === 'ExportAllDeclaration') &&
    n.source &&
    typeof n.source.value === 'string'
  ) {
    out.push(n.source.value);
  }
}

function resolveSpecifier(
  specifier: string,
  fromFile: string,
  ctx: ResolutionContext
): string | undefined {
  if (
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier === '.' ||
    specifier === '..'
  ) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    return tryExtensions(base, ctx.projectFiles);
  }

  if (path.isAbsolute(specifier)) {
    return tryExtensions(specifier, ctx.projectFiles);
  }

  for (const alias of ctx.aliases) {
    const targets = applyAlias(specifier, alias);
    for (const target of targets) {
      const candidate = tryExtensions(target, ctx.projectFiles);
      if (candidate) return candidate;
    }
  }

  if (ctx.baseUrl) {
    const candidate = tryExtensions(
      path.resolve(ctx.baseUrl, specifier),
      ctx.projectFiles
    );
    if (candidate) return candidate;
  }

  return undefined;
}

function applyAlias(specifier: string, alias: AliasEntry): string[] {
  if (!alias.hasWildcard) {
    if (specifier !== alias.prefix) return [];
    return alias.targets.map((t) =>
      normalizePath(path.resolve(alias.baseDir, t.raw))
    );
  }

  if (!specifier.startsWith(alias.prefix)) return [];
  if (alias.suffix && !specifier.endsWith(alias.suffix)) return [];
  if (specifier.length < alias.prefix.length + alias.suffix.length) return [];

  const captured = specifier.slice(
    alias.prefix.length,
    specifier.length - alias.suffix.length
  );

  return alias.targets.map((t) => {
    const filled = t.hasWildcard
      ? t.prefix + captured + t.suffix
      : t.prefix;
    return normalizePath(path.resolve(alias.baseDir, filled));
  });
}

const EXTENSIONS: ReadonlyArray<string> = ['.ts', '.tsx', '.d.ts'];

function tryExtensions(
  basePath: string,
  projectFiles: ReadonlySet<string>
): string | undefined {
  const normalized = normalizePath(basePath);

  if (projectFiles.has(normalized)) return normalized;

  for (const ext of EXTENSIONS) {
    const withExt = normalized + ext;
    if (projectFiles.has(withExt)) return withExt;
  }

  if (normalized.endsWith('.js')) {
    const tsVariant = normalized.slice(0, -3) + '.ts';
    if (projectFiles.has(tsVariant)) return tsVariant;
    const tsxVariant = normalized.slice(0, -3) + '.tsx';
    if (projectFiles.has(tsxVariant)) return tsxVariant;
  }

  for (const ext of EXTENSIONS) {
    const indexPath = normalizePath(path.join(normalized, 'index' + ext));
    if (projectFiles.has(indexPath)) return indexPath;
  }

  return undefined;
}

function loadTsconfigAliases(
  rootDir: string,
  parserOptions: ParserOptions | undefined
): { baseUrl: string | undefined; paths: Record<string, string[]> } {
  const tsconfigRootDir = parserOptions?.tsconfigRootDir
    ? path.resolve(rootDir, parserOptions.tsconfigRootDir)
    : rootDir;
  const configPath = parserOptions?.project
    ? path.resolve(tsconfigRootDir, parserOptions.project)
    : ts.findConfigFile(tsconfigRootDir, ts.sys.fileExists, 'tsconfig.json');

  if (!configPath) return { baseUrl: undefined, paths: {} };

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) return { baseUrl: undefined, paths: {} };

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    tsconfigRootDir
  );

  const compilerOptions = parsed.options;
  const baseUrl = compilerOptions.baseUrl
    ? normalizePath(path.resolve(compilerOptions.baseUrl))
    : undefined;
  const paths = (compilerOptions.paths ?? {}) as Record<string, string[]>;

  return { baseUrl, paths };
}

function compileAliases(
  paths: Record<string, string[]>,
  baseDir: string
): AliasEntry[] {
  const entries: AliasEntry[] = [];

  for (const pattern of Object.keys(paths)) {
    const targets = paths[pattern];
    if (!Array.isArray(targets) || targets.length === 0) continue;

    const wildcardIdx = pattern.indexOf('*');
    const hasWildcard = wildcardIdx !== -1;
    const prefix = hasWildcard ? pattern.slice(0, wildcardIdx) : pattern;
    const suffix = hasWildcard ? pattern.slice(wildcardIdx + 1) : '';

    const compiledTargets = targets.map((t) => {
      const tWildcardIdx = t.indexOf('*');
      const tHasWildcard = tWildcardIdx !== -1;
      return {
        raw: t,
        prefix: tHasWildcard ? t.slice(0, tWildcardIdx) : t,
        suffix: tHasWildcard ? t.slice(tWildcardIdx + 1) : '',
        hasWildcard: tHasWildcard,
      };
    });

    entries.push({
      prefix,
      suffix,
      hasWildcard,
      baseDir,
      targets: compiledTargets,
    });
  }

  entries.sort((a, b) => b.prefix.length - a.prefix.length);
  return entries;
}

function isTsLike(file: string): boolean {
  return (
    (file.endsWith('.ts') || file.endsWith('.tsx')) && !file.endsWith('.d.ts')
  );
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function countEdges(graph: ReadonlyMap<string, ReadonlySet<string>>): number {
  let total = 0;
  for (const set of graph.values()) total += set.size;
  return total;
}
