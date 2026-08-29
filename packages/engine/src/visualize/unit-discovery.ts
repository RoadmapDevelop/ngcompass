import { promises as fs } from 'node:fs';
import path from 'node:path';
import { debug } from '@ngcompass/common';
import { extractStyleUrls, extractTemplateUrl } from '@ngcompass/planner';
import type { DiscoveredFile } from '../models/index.js';
const SPEC_SUFFIX = '.spec';
const TEMPLATE_EXTENSION = '.html';
const STYLE_EXTENSIONS: readonly string[] = ['.scss', '.css', '.sass', '.less'];
const TS_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.cts'];

const INLINE_TEMPLATE_RE = /\btemplate\s*:\s*`([\s\S]*?)`/;
const INLINE_STYLES_RE = /\bstyles\s*:\s*\[?\s*`([\s\S]*?)`/;

async function readIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error: unknown) {
    debug('engine', `Visualize could not read ${filePath}: ${String(error)}`);
    return null;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error: unknown) {
    debug('engine', `Visualize found no file at ${filePath}: ${String(error)}`);
    return false;
  }
}

function stripExtension(filePath: string): string {
  return filePath.slice(0, filePath.length - path.extname(filePath).length);
}

export async function resolveEntryFile(inputFile: string): Promise<string> {
  const extension = path.extname(inputFile).toLowerCase();
  const withoutExtension = stripExtension(inputFile);

  if (TS_EXTENSIONS.includes(extension)) {
    if (!withoutExtension.endsWith(SPEC_SUFFIX)) return inputFile;
    const anchor = withoutExtension.slice(0, -SPEC_SUFFIX.length) + extension;
    return (await exists(anchor)) ? anchor : inputFile;
  }

  if (extension === TEMPLATE_EXTENSION || STYLE_EXTENSIONS.includes(extension)) {
    for (const candidate of TS_EXTENSIONS) {
      const anchor = withoutExtension + candidate;
      if (await exists(anchor)) return anchor;
    }
  }

  return inputFile;
}

async function fromDeclaredPath(declared: string): Promise<DiscoveredFile> {
  const content = await readIfPresent(declared);
  if (content === null) {
    return { filePath: declared, status: 'declared-missing', content: null };
  }
  return { filePath: declared, status: 'parsed', content };
}

async function fromConvention(candidate: string): Promise<DiscoveredFile> {
  const content = await readIfPresent(candidate);
  if (content === null) {
    return { filePath: null, status: 'absent', content: null };
  }
  return { filePath: candidate, status: 'parsed', content };
}

function inlineMatch(source: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(source);
  return match ? match[1] : undefined;
}

export async function discoverTemplate(
  entryFile: string,
  entrySource: string
): Promise<DiscoveredFile> {
  const directory = path.dirname(entryFile);
  const declared = await extractTemplateUrl(entryFile, directory);
  if (declared) return fromDeclaredPath(declared);

  const inline = inlineMatch(entrySource, INLINE_TEMPLATE_RE);
  if (inline !== undefined) {
    return { filePath: null, status: 'inline', content: inline };
  }

  return fromConvention(stripExtension(entryFile) + TEMPLATE_EXTENSION);
}

export async function discoverStyles(
  entryFile: string,
  entrySource: string
): Promise<readonly DiscoveredFile[]> {
  const directory = path.dirname(entryFile);
  const declared = await extractStyleUrls(entryFile, directory);
  if (declared.length > 0) {
    return Promise.all(declared.map(fromDeclaredPath));
  }

  const inline = inlineMatch(entrySource, INLINE_STYLES_RE);
  if (inline !== undefined) {
    return [{ filePath: null, status: 'inline', content: inline }];
  }

  const base = stripExtension(entryFile);
  for (const extension of STYLE_EXTENSIONS) {
    const found = await fromConvention(base + extension);
    if (found.status === 'parsed') return [found];
  }

  return [];
}

export async function discoverSpec(entryFile: string): Promise<DiscoveredFile> {
  const extension = path.extname(entryFile);
  const candidate = stripExtension(entryFile) + SPEC_SUFFIX + extension;
  return fromConvention(candidate);
}
