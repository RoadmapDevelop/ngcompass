import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import pc from 'picocolors';
import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import type { ParserOptions } from '@ngcompass/common';
import { getReporter, type Reporter } from '@ngcompass/reporters';
import {
  buildImportGraphOxc,
  collectNeighborhood,
  scopeGraphToNodes,
} from '@ngcompass/engine';
import { Spinner } from '../spinner.js';
import { exitWithError } from './exit.js';
import { loadConfigurationStep, discoverFilesStep } from './analyze/steps.js';
import { toJsonGraph } from './circular-export.js';

type ImportGraph = ReadonlyMap<string, ReadonlySet<string>>;

const DEFAULT_DEPTH = 2;
const DEFAULT_OUTPUT_PATH = 'ngcompass-graph.json';
const MAX_AMBIGUOUS_MATCHES = 10;

interface GraphOptions {
  readonly profile?: string;
  readonly force?: boolean;
  readonly output?: string;
  readonly focus?: string;
  readonly depth?: string;
  readonly stdout?: boolean;
}

export function registerGraphCommand(
  program: Command,
  cache: CacheContext
): void {
  program
    .command('graph')
    .description('Export the project dependency graph as JSON')
    .option('-p, --profile <name>', 'Configuration profile to run')
    .option('--force', 'Ignore cached results and re-run all checks')
    .option('--focus <file>', 'Scope the graph to a file and its neighborhood')
    .option(
      '--depth <n>',
      `Neighborhood radius in import hops for --focus (default: ${DEFAULT_DEPTH})`
    )
    .option(
      '--output <path>',
      `Output path for the JSON file (default: ${DEFAULT_OUTPUT_PATH})`
    )
    .option('--stdout', 'Write JSON to stdout instead of a file')
    .action(async (rawOptions: GraphOptions) => {
      const reporter = getReporter(rawOptions.stdout ? 'json' : 'console', {});
      let activeCache: CacheContext | undefined = cache;
      let exitCode = 0;

      try {
        const depth = parseDepth(rawOptions.depth);
        if (depth === undefined) {
          reporter.error(new Error('--depth must be a non-negative integer'));
          exitCode = 1;
          return;
        }

        const stepOptions = {
          profile: rawOptions.profile,
          force: rawOptions.force,
        };

        const configResult = await loadConfigurationStep(
          stepOptions,
          cache,
          reporter
        );
        if (!configResult) {
          exitCode = 1;
          return;
        }

        const { config } = configResult;
        activeCache = createRuntimeCache(config, process.cwd());

        const files = await discoverFilesStep(
          config,
          stepOptions,
          activeCache,
          reporter
        );
        if (!files) {
          exitCode = 1;
          return;
        }

        const fullGraph = await buildGraph(
          files,
          config.parserOptions,
          reporter
        );

        const focusFile = resolveFocus(fullGraph, rawOptions.focus, reporter);
        if (rawOptions.focus && !focusFile) {
          exitCode = 1;
          return;
        }

        const graph = focusFile
          ? scopeGraphToNodes(
              fullGraph,
              collectNeighborhood(fullGraph, focusFile, depth)
            )
          : fullGraph;

        const json = toJsonGraph({
          graph,
          rootDir: process.cwd(),
          focus: focusFile ? toRelative(focusFile) : undefined,
          depth,
          fileCount: files.length,
          generatedAt: new Date(),
        });

        if (rawOptions.stdout) {
          process.stdout.write(json);
        } else {
          await writeJsonFile(json, rawOptions.output, reporter);
        }
      } catch (error: unknown) {
        reporter.error(
          error instanceof Error ? error : new Error(String(error))
        );
        exitCode = 1;
      } finally {
        if (activeCache && activeCache !== cache) {
          await activeCache.flush();
        }
        if (exitCode !== 0) {
          exitWithError(exitCode);
        }
      }
    });
}

function parseDepth(raw: string | undefined): number | undefined {
  if (raw === undefined) return DEFAULT_DEPTH;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

async function buildGraph(
  files: ReadonlyArray<string>,
  parserOptions: ParserOptions | undefined,
  reporter: Reporter
): Promise<ImportGraph> {
  reporter.step('❯ Building project import graph...');

  const spinner = new Spinner(process.stderr);
  spinner.start(`Parsing ${files.length} files and building import graph...`);

  const { importGraph } = await buildImportGraphOxc(files, {
    rootDir: process.cwd(),
    parserOptions,
    onProgress: (done, total) => {
      const pct = ((done / total) * 100).toFixed(0);
      spinner.update(`Parsing files (${done}/${total} — ${pct}%)...`);
    },
  });

  spinner.stop();
  return importGraph;
}

function resolveFocus(
  graph: ImportGraph,
  input: string | undefined,
  reporter: Reporter
): string | undefined {
  if (!input) return undefined;

  const absolute = normalizeSlashes(path.resolve(process.cwd(), input));
  if (graph.has(absolute)) return absolute;

  const needle = normalizeSlashes(input);
  const matches: string[] = [];
  for (const key of graph.keys()) {
    if (key.includes(needle)) matches.push(key);
  }

  if (matches.length === 1) return matches[0];

  if (matches.length === 0) {
    reporter.error(
      new Error(`--focus: no file in the import graph matches "${input}"`)
    );
    return undefined;
  }

  const sample = matches
    .slice(0, MAX_AMBIGUOUS_MATCHES)
    .map((match) => `  ${toRelative(match)}`)
    .join('\n');
  reporter.error(
    new Error(
      `--focus: "${input}" matched ${matches.length} files; be more specific:\n${sample}`
    )
  );
  return undefined;
}

async function writeJsonFile(
  json: string,
  outputPath: string | undefined,
  reporter: Reporter
): Promise<void> {
  reporter.step('❯ Writing dependency graph...');
  const finalPath = path.resolve(
    process.cwd(),
    outputPath ?? DEFAULT_OUTPUT_PATH
  );
  await fs.writeFile(finalPath, json, 'utf8');

  const relPath = path.relative(process.cwd(), finalPath) || finalPath;
  reporter.info(
    `\n${pc.green('✔')} Dependency graph written to ${pc.cyan(relPath)}\n`
  );
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function toRelative(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return normalizeSlashes(rel || file);
}
