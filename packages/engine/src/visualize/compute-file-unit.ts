import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Err, Locator, Ok, debug, type Result } from '@ngcompass/common';
import { analyzeTemplate, parseHtml, parseTs } from '@ngcompass/ast';
import {
  type SpecInput,
  type StyleInput,
  type TemplateInput,
  analyzeFileUnitGraph,
} from './file-unit-analyzer.js';
import {
  type DiscoveredFile,
  discoverSpec,
  discoverStyles,
  discoverTemplate,
  resolveEntryFile,
} from './unit-discovery.js';
import type { FileUnitGraph, VisualizeError } from './unit-graph.js';

function toLabel(filePath: string | null, fallback: string): string {
  if (!filePath) return fallback;
  return path.basename(filePath);
}

function buildTemplateInput(found: DiscoveredFile): TemplateInput | null {
  if (found.status === 'absent') return null;

  const label = toLabel(found.filePath, 'inline template');
  if (found.content === null) {
    return {
      status: found.status,
      filePath: found.filePath,
      label,
      analysis: null,
      locator: null,
    };
  }

  try {
    const parsed = parseHtml(found.content);
    return {
      status: found.status,
      filePath: found.filePath,
      label,
      analysis: analyzeTemplate(parsed),
      locator: new Locator(found.content),
    };
  } catch (error: unknown) {
    debug('engine', `Visualize could not parse template ${label}: ${String(error)}`);
    return {
      status: 'unparseable',
      filePath: found.filePath,
      label,
      analysis: null,
      locator: null,
    };
  }
}

function buildStyleInputs(found: readonly DiscoveredFile[]): StyleInput[] {
  const inputs: StyleInput[] = [];
  for (const style of found) {
    if (style.status === 'absent') continue;
    inputs.push({
      status: style.status,
      filePath: style.filePath,
      label: toLabel(style.filePath, 'inline styles'),
      content: style.content,
    });
  }
  return inputs;
}

function buildSpecInput(found: DiscoveredFile): SpecInput | null {
  if (found.status === 'absent' || found.filePath === null) return null;

  const label = toLabel(found.filePath, 'spec');
  if (found.content === null) {
    return {
      status: found.status,
      filePath: found.filePath,
      label,
      program: null,
      locator: null,
    };
  }

  try {
    const { program } = parseTs(found.content, found.filePath);
    return {
      status: found.status,
      filePath: found.filePath,
      label,
      program,
      locator: new Locator(found.content),
    };
  } catch (error: unknown) {
    debug('engine', `Visualize could not parse spec ${label}: ${String(error)}`);
    return {
      status: 'unparseable',
      filePath: found.filePath,
      label,
      program: null,
      locator: null,
    };
  }
}

export async function computeFileUnit(
  inputFile: string
): Promise<Result<FileUnitGraph, VisualizeError>> {
  const entryFile = await resolveEntryFile(inputFile);

  let source: string;
  try {
    source = await fs.readFile(entryFile, 'utf8');
  } catch (error: unknown) {
    return Err({
      kind: 'EntryUnreadable',
      file: entryFile,
      detail: String(error),
    });
  }

  let program;
  try {
    program = parseTs(source, entryFile).program;
  } catch (error: unknown) {
    return Err({
      kind: 'EntryUnparseable',
      file: entryFile,
      detail: String(error),
    });
  }

  const [template, styles, spec] = await Promise.all([
    discoverTemplate(entryFile, source),
    discoverStyles(entryFile, source),
    discoverSpec(entryFile),
  ]);

  return Ok(
    analyzeFileUnitGraph({
      entryFile,
      entryLabel: path.basename(entryFile),
      program,
      locator: new Locator(source),
      template: buildTemplateInput(template),
      styles: buildStyleInputs(styles),
      spec: buildSpecInput(spec),
    })
  );
}
