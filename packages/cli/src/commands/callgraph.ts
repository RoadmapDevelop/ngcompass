import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  analyzeFileCallGraph,
  type CallGraphEdge,
  type CallGraphNode,
  type FileCallGraph,
} from '@ngcompass/engine';
import { getReporter, type Reporter } from '@ngcompass/reporters';
import { exitWithError } from './exit.js';

const DEFAULT_OUTPUT_PATH = 'ngcompass-callgraph.json';
const CONSOLE_FUNCTION_LIMIT = 30;
const CONSOLE_CALL_LIMIT = 8;
const TS_LIKE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

interface CallGraphOptions {
  readonly output?: string;
  readonly stdout?: boolean;
}

export function registerCallGraphCommand(program: Command): void {
  program
    .command('callgraph')
    .description(
      'Build an intra-file call graph: functions in a file and the calls between them'
    )
    .argument('<file>', 'Source file to analyze')
    .option(
      '--output <path>',
      `Output path for the JSON file (default: ${DEFAULT_OUTPUT_PATH})`
    )
    .option('--stdout', 'Write JSON to stdout instead of a file')
    .action(async (file: string, rawOptions: CallGraphOptions) => {
      const reporter = getReporter(rawOptions.stdout ? 'json' : 'console', {});
      let exitCode = 0;

      try {
        const absFile = path.resolve(process.cwd(), file);

        if (!TS_LIKE_EXTENSIONS.has(path.extname(absFile).toLowerCase())) {
          reporter.error(
            new Error(`callgraph: "${file}" is not a TypeScript or JavaScript file`)
          );
          exitCode = 1;
          return;
        }

        const graph = await analyzeFileCallGraph(absFile);
        if (!graph) {
          reporter.error(
            new Error(`callgraph: could not read or parse "${file}"`)
          );
          exitCode = 1;
          return;
        }

        const relFile = toRelative(absFile);
        const json = toCallGraphJson(graph, relFile);

        if (rawOptions.stdout) {
          process.stdout.write(json);
          return;
        }

        await writeJsonFile(json, rawOptions.output, reporter);
        printSummary(graph, relFile, reporter);
      } catch (error: unknown) {
        reporter.error(
          error instanceof Error ? error : new Error(String(error))
        );
        exitCode = 1;
      } finally {
        if (exitCode !== 0) {
          exitWithError(exitCode);
        }
      }
    });
}

function ambiguousEdgeCount(edges: readonly CallGraphEdge[]): number {
  let count = 0;
  for (const edge of edges) {
    if (edge.ambiguous) count++;
  }
  return count;
}

function toCallGraphJson(graph: FileCallGraph, relFile: string): string {
  const payload = {
    rootDir: process.cwd(),
    generatedAt: new Date().toISOString(),
    file: relFile,
    summary: {
      functionCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      externalCallCount: graph.externalCalls.length,
      ambiguousEdgeCount: ambiguousEdgeCount(graph.edges),
    },
    nodes: graph.nodes,
    edges: graph.edges,
    externalCalls: graph.externalCalls,
  };

  return JSON.stringify(payload, null, 2) + '\n';
}

async function writeJsonFile(
  json: string,
  outputPath: string | undefined,
  reporter: Reporter
): Promise<void> {
  reporter.step('❯ Writing call graph...');
  const finalPath = path.resolve(
    process.cwd(),
    outputPath ?? DEFAULT_OUTPUT_PATH
  );
  await fs.writeFile(finalPath, json, 'utf8');

  const relPath = path.relative(process.cwd(), finalPath) || finalPath;
  reporter.info(
    `\n${pc.green('✔')} Call graph written to ${pc.cyan(relPath)}\n`
  );
}

function groupOutgoing(
  edges: readonly CallGraphEdge[]
): ReadonlyMap<string, readonly CallGraphEdge[]> {
  const byCaller = new Map<string, CallGraphEdge[]>();
  for (const edge of edges) {
    const existing = byCaller.get(edge.from);
    if (existing) {
      existing.push(edge);
    } else {
      byCaller.set(edge.from, [edge]);
    }
  }
  return byCaller;
}

function externalCountByCaller(
  externalCalls: FileCallGraph['externalCalls']
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const call of externalCalls) {
    if (call.from === null) continue;
    counts.set(call.from, (counts.get(call.from) ?? 0) + 1);
  }
  return counts;
}

function printFunction(
  node: CallGraphNode,
  outgoing: readonly CallGraphEdge[],
  externalCount: number,
  reporter: Reporter
): void {
  reporter.info(
    `\n${pc.cyan(node.name)} ${pc.dim(`[${node.kind} ${node.line}:${node.column}]`)}`
  );

  const shown = outgoing.slice(0, CONSOLE_CALL_LIMIT);
  for (const edge of shown) {
    const tag = edge.ambiguous ? pc.yellow(' (ambiguous)') : '';
    reporter.info(`  → ${edge.callName} ${pc.dim(`${edge.line}:${edge.column}`)}${tag}`);
  }

  const remaining = outgoing.length - shown.length;
  if (remaining > 0) reporter.info(pc.dim(`  …and ${remaining} more internal calls`));
  if (externalCount > 0) reporter.info(pc.dim(`  ${externalCount} external call(s)`));
}

function printSummary(
  graph: FileCallGraph,
  relFile: string,
  reporter: Reporter
): void {
  if (graph.nodes.length === 0) {
    reporter.info(`No functions found in ${pc.cyan(relFile)}.`);
    return;
  }

  reporter.info(
    `${pc.bold('Call graph')} — ${graph.nodes.length} functions, ` +
      `${graph.edges.length} internal calls, ${graph.externalCalls.length} external calls ` +
      `in ${pc.cyan(relFile)}`
  );

  const outgoing = groupOutgoing(graph.edges);
  const externalCounts = externalCountByCaller(graph.externalCalls);
  const shown = graph.nodes.slice(0, CONSOLE_FUNCTION_LIMIT);
  for (const node of shown) {
    printFunction(
      node,
      outgoing.get(node.id) ?? [],
      externalCounts.get(node.id) ?? 0,
      reporter
    );
  }

  const remainingFns = graph.nodes.length - shown.length;
  if (remainingFns > 0) {
    reporter.info(pc.dim(`\n…and ${remainingFns} more functions`));
  }
}

function toRelative(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return (rel || file).replace(/\\/g, '/');
}
