import { promises as fs } from 'node:fs';
import { Locator } from '@ngcompass/common';
import { parseTs } from '@ngcompass/ast';
import {
  computeFileCallGraph,
  type FileCallGraph,
} from './call-graph-analyzer.js';

export async function analyzeFileCallGraph(
  absFile: string
): Promise<FileCallGraph | null> {
  let content: string;
  try {
    content = await fs.readFile(absFile, 'utf8');
  } catch {
    return null;
  }

  try {
    const { program } = parseTs(content, absFile);
    return computeFileCallGraph(program, new Locator(content));
  } catch {
    return null;
  }
}
