/**
 * @fileoverview
 * Component dependency graph.
 *
 * Builds a one-pass map from each `*.component.ts` file to its associated
 * template, styles, and spec files. The graph populates with directory-grouped
 * data in `O(N)` so the task-builder can later answer "what resources does
 * component X own?" in `O(1)` without re-scanning the filesystem.
 *
 * Convention discovery is tried first; when the conventional filenames are
 * absent the builder falls back to regex-based extraction of `templateUrl` /
 * `styleUrls` references from the decorator (see `decorator-references.ts`).
 */

import * as path from 'node:path';
import { extractStyleUrls, extractTemplateUrl } from './decorator-references.js';
import type { FileType } from './types.js';

/** One component cluster: the TypeScript file and its associated resources. */
export interface ComponentNode {
    tsPath: string;
    templatePath?: string;
    stylePaths: string[];
    specPath?: string;
    type: FileType;
}

/**
 * Single-pass map from component `*.component.ts` paths to their cluster
 * resources. Used by the task-builder to avoid repeated directory scans.
 */
export class ComponentDependencyGraph {
    private readonly graph = new Map<string, ComponentNode>();

    /**
     * Rebuilds the graph from the given list of project files.
     *
     * Falls back to decorator-based `templateUrl` / `styleUrls` extraction
     * when convention-based filenames aren't present in the directory.
     */
    async build(files: ReadonlyArray<string>): Promise<void> {
        this.graph.clear();
        const fileSet = new Set(files);

        // 1. Group files by directory in O(N).
        const byDirectory = new Map<string, string[]>();
        for (const file of files) {
            const dir = path.dirname(file);
            const existing = byDirectory.get(dir);
            if (existing) existing.push(file);
            else byDirectory.set(dir, [file]);
        }

        // 2. Build a node per `*.component.ts`.
        for (const [dir, dirFiles] of byDirectory) {
            const dirFileSet = new Set(dirFiles);
            const components = dirFiles.filter((f) => f.endsWith('.component.ts'));

            for (const comp of components) {
                const baseName = path.basename(comp, '.component.ts');
                const baseNamePath = path.join(dir, baseName);

                const templatePath = await resolveTemplate(comp, dir, baseNamePath, dirFileSet, fileSet);
                const stylePaths = await resolveStyles(comp, dir, baseNamePath, dirFiles, fileSet);
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

    /**
     * Returns the cluster resources for the given `*.component.ts` path, or
     * `undefined` if the component is not in the graph.
     */
    getResources(tsPath: string): ComponentNode | undefined {
        return this.graph.get(tsPath);
    }
}

// ── Internal resolvers ────────────────────────────────────────────────────

/** Resolves a component's template via convention, then decorator fallback. */
async function resolveTemplate(
    comp: string,
    dir: string,
    baseNamePath: string,
    dirFileSet: Set<string>,
    fileSet: Set<string>,
): Promise<string | undefined> {
    const candidates = [`${baseNamePath}.component.html`, `${baseNamePath}.html`];
    const convention = candidates.find((t) => dirFileSet.has(t));
    if (convention) return convention;
    return extractTemplateUrl(comp, dir, fileSet);
}

/** Resolves a component's style files via convention, then decorator fallback. */
async function resolveStyles(
    comp: string,
    dir: string,
    baseNamePath: string,
    dirFiles: string[],
    fileSet: Set<string>,
): Promise<string[]> {
    const conventional = dirFiles.filter((f) => {
        if (!f.startsWith(baseNamePath)) return false;
        const ext = path.extname(f);
        if (f === `${baseNamePath}.component${ext}` || f === `${baseNamePath}${ext}`) {
            return /\.(css|scss|sass|less)$/.test(ext);
        }
        return false;
    });
    if (conventional.length > 0) return conventional;
    return extractStyleUrls(comp, dir, fileSet);
}

/** Resolves a component's spec via conventional filenames. */
function resolveSpec(baseNamePath: string, dirFileSet: Set<string>): string | undefined {
    const candidates = [`${baseNamePath}.component.spec.ts`, `${baseNamePath}.spec.ts`];
    return candidates.find((c) => dirFileSet.has(c));
}
