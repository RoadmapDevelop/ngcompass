import * as path from 'node:path';
import {
  extractStyleUrls,
  extractTemplateUrl,
} from './decorator-references.js';
import type { FileType } from './types.js';

export interface ComponentNode {
  tsPath: string;
  templatePath?: string;
  stylePaths: string[];
  specPath?: string;
  type: FileType;
}

export class ComponentDependencyGraph {
  private readonly graph = new Map<string, ComponentNode>();

  async build(files: ReadonlyArray<string>): Promise<void> {
    this.graph.clear();
    const fileSet = new Set(files);

    const byDirectory = new Map<string, string[]>();
    for (const file of files) {
      const dir = path.dirname(file);
      const existing = byDirectory.get(dir);
      if (existing) existing.push(file);
      else byDirectory.set(dir, [file]);
    }

    for (const [dir, dirFiles] of byDirectory) {
      const dirFileSet = new Set(dirFiles);
      const components = dirFiles.filter((f) => f.endsWith('.component.ts'));

      for (const comp of components) {
        const baseName = path.basename(comp, '.component.ts');
        const baseNamePath = path.join(dir, baseName);

        const templatePath = await resolveTemplate(
          comp,
          dir,
          baseNamePath,
          dirFileSet,
          fileSet
        );
        const stylePaths = await resolveStyles(
          comp,
          dir,
          baseNamePath,
          dirFiles,
          fileSet
        );
        const specPath = resolveSpec(baseNamePath, dirFileSet);

        this.graph.set(comp, {
          tsPath: comp,
          templatePath,
          stylePaths,
          specPath,
          type: 'component',
        });
      }
    }
  }

  getResources(tsPath: string): ComponentNode | undefined {
    return this.graph.get(tsPath);
  }
}

async function resolveTemplate(
  comp: string,
  dir: string,
  baseNamePath: string,
  dirFileSet: Set<string>,
  fileSet: Set<string>
): Promise<string | undefined> {
  const candidates = [`${baseNamePath}.component.html`, `${baseNamePath}.html`];
  const convention = candidates.find((t) => dirFileSet.has(t));
  if (convention) return convention;
  return extractTemplateUrl(comp, dir, fileSet);
}

async function resolveStyles(
  comp: string,
  dir: string,
  baseNamePath: string,
  dirFiles: string[],
  fileSet: Set<string>
): Promise<string[]> {
  const conventional = dirFiles.filter((f) => {
    if (!f.startsWith(baseNamePath)) return false;
    const ext = path.extname(f);
    if (
      f === `${baseNamePath}.component${ext}` ||
      f === `${baseNamePath}${ext}`
    ) {
      return /\.(css|scss|sass|less)$/.test(ext);
    }
    return false;
  });
  if (conventional.length > 0) return conventional;
  return extractStyleUrls(comp, dir, fileSet);
}

function resolveSpec(
  baseNamePath: string,
  dirFileSet: Set<string>
): string | undefined {
  const candidates = [
    `${baseNamePath}.component.spec.ts`,
    `${baseNamePath}.spec.ts`,
  ];
  return candidates.find((c) => dirFileSet.has(c));
}
