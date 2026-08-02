import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import pc from 'picocolors';
import type { FileUnitGraph, UnitLane } from '@ngcompass/common';
import { computeFileUnit } from '@ngcompass/engine';
import { getReporter, renderUnitDiagram, type Reporter } from '@ngcompass/reporters';
import { exitWithError } from './exit.js';

const DEFAULT_BASE_NAME = 'ngcompass-visualize';
const CONSOLE_BOX_LIMIT = 12;
const FORMATS: ReadonlySet<string> = new Set(['html', 'json', 'console']);

const STATUS_NOTES: ReadonlyMap<string, string> = new Map([
  ['inline', 'inline'],
  ['declared-missing', 'declared but missing'],
  ['unparseable', 'unparseable'],
]);

interface VisualizeOptions {
  readonly format?: string;
  readonly output?: string;
  readonly stdout?: boolean;
}

export function registerVisualizeCommand(program: Command): void {
  program
    .command('visualize')
    .description(
      'Visualize one file as a unit: its template, styles, spec and dependencies'
    )
    .argument('<file>', 'Source file to visualize')
    .option('--format <fmt>', 'Reporter format: html | json | console', 'html')
    .option('--output <path>', `Output path (default: ${DEFAULT_BASE_NAME}.{html,json})`)
    .option('--stdout', 'Write JSON to stdout instead of a file')
    .action(async (file: string, rawOptions: VisualizeOptions) => {
      const format = rawOptions.stdout ? 'json' : (rawOptions.format ?? 'html');
      const reporter = getReporter(rawOptions.stdout ? 'json' : 'console', {});
      let exitCode = 0;

      try {
        if (!FORMATS.has(format)) {
          reporter.error(new Error(`visualize: unknown format "${format}"`));
          exitCode = 1;
          return;
        }

        const result = await computeFileUnit(path.resolve(process.cwd(), file));
        if (!result.ok) {
          reporter.error(
            new Error(`visualize: ${result.error.kind} for "${file}"`)
          );
          exitCode = 1;
          return;
        }

        exitCode = await emit(result.data, format, rawOptions, reporter);
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

async function emit(
  graph: FileUnitGraph,
  format: string,
  options: VisualizeOptions,
  reporter: Reporter
): Promise<number> {
  const json = toUnitJson(graph);

  if (options.stdout) {
    process.stdout.write(json);
    return 0;
  }

  printSummary(graph, reporter);

  if (format === 'console') return 0;

  const isHtml = format === 'html';
  const body = isHtml ? renderUnitDiagram(graph) : json;
  const extension = isHtml ? '.html' : '.json';
  await writeOutput(body, options.output, extension, reporter);
  return 0;
}

function toUnitJson(graph: FileUnitGraph): string {
  const payload = {
    rootDir: process.cwd(),
    generatedAt: new Date().toISOString(),
    entryFile: toRelative(graph.entryFile),
    className: graph.className,
    summary: {
      laneCount: graph.lanes.length,
      boxCount: graph.lanes.reduce((sum, lane) => sum + lane.boxes.length, 0),
      edgeCount: graph.edges.length,
    },
    lanes: graph.lanes,
    edges: graph.edges,
  };

  return JSON.stringify(payload, null, 2) + '\n';
}

async function writeOutput(
  body: string,
  outputPath: string | undefined,
  extension: string,
  reporter: Reporter
): Promise<void> {
  reporter.step('❯ Writing unit diagram...');
  const finalPath = path.resolve(
    process.cwd(),
    outputPath ?? `${DEFAULT_BASE_NAME}${extension}`
  );
  await fs.writeFile(finalPath, body, 'utf8');

  const relPath = path.relative(process.cwd(), finalPath) || finalPath;
  reporter.info(`\n${pc.green('✔')} Written to ${pc.cyan(relPath)}\n`);
}

function laneHeading(lane: UnitLane): string {
  const note = STATUS_NOTES.get(lane.status);
  const suffix = note ? pc.yellow(` (${note})`) : '';
  return `\n${pc.bold(lane.kind)} ${pc.cyan(lane.label)}${suffix}`;
}

function printLane(lane: UnitLane, reporter: Reporter): void {
  reporter.info(laneHeading(lane));

  if (lane.boxes.length === 0) {
    reporter.info(pc.dim('  (no symbols)'));
    return;
  }

  const shown = lane.boxes.slice(0, CONSOLE_BOX_LIMIT);
  for (const box of shown) {
    const at = box.line === 0 ? '' : pc.dim(` ${box.line}:${box.column}`);
    reporter.info(`  ${box.name}${at}`);
  }

  const remaining = lane.boxes.length - shown.length;
  if (remaining > 0) reporter.info(pc.dim(`  …and ${remaining} more`));
}

function printSummary(graph: FileUnitGraph, reporter: Reporter): void {
  const boxCount = graph.lanes.reduce((sum, lane) => sum + lane.boxes.length, 0);
  reporter.info(
    `${pc.bold('Unit')} ${pc.cyan(graph.className ?? toRelative(graph.entryFile))} — ` +
      `${graph.lanes.length} lanes, ${boxCount} symbols, ${graph.edges.length} edges`
  );

  for (const lane of graph.lanes) printLane(lane, reporter);
  reporter.info('');
}

function toRelative(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return (rel || file).replace(/\\/g, '/');
}
