import * as path from 'node:path';
import { FileType } from './types.js';

export interface ComponentNode {
    tsPath: string;
    templatePath?: string;
    stylePaths: string[];
    specPath?: string;
    type: FileType;
}

/**
 * A graph of component dependencies (template, styles, specs).
 * Built in a single pass to avoid repeated directory scans.
 */
export class ComponentDependencyGraph {
    private graph = new Map<string, ComponentNode>();

    /**
     * Builds the graph from a list of files.
     * O(N) complexity where N is the number of files.
     */
    build(files: ReadonlyArray<string>): void {
        this.graph.clear();

        // 1. Group files by directory (O(N))
        const byDirectory = new Map<string, string[]>();

        for (const file of files) {
            const dir = path.dirname(file);
            const existing = byDirectory.get(dir);
            if (existing) {
                existing.push(file);
            } else {
                byDirectory.set(dir, [file]);
            }
        }

        // 2. Build graph (O(N))
        for (const [dir, dirFiles] of byDirectory) {
            // Optimization: Set for O(1) existence checks within directory
            const dirFileSet = new Set(dirFiles);
            const components = dirFiles.filter(f => f.endsWith('.component.ts'));

            for (const comp of components) {
                const baseName = path.basename(comp, '.component.ts');
                const baseNamePath = path.join(dir, baseName);

                // Template candidates: base.component.html, base.html
                const templateCandidates = [
                    `${baseNamePath}.component.html`,
                    `${baseNamePath}.html`,
                ];

                const templatePath = templateCandidates.find(t => dirFileSet.has(t));

                // Style candidates: base.component.{css,scss,sass,less}
                // We scan the dirFiles to find matches since we can't easily guess extensions in order
                const stylePaths = dirFiles.filter(f => {
                    if (!f.startsWith(baseNamePath)) return false;
                    // Check strict extension match to avoid prefix issues
                    const ext = path.extname(f);

                    // Must match base name exactly (e.g. 'foo.component.css' matches 'foo.component.ts')
                    // or be related? Usually it's foo.component.scss
                    // The standard CLI generates foo.component.ts and foo.component.scss

                    if (f === `${baseNamePath}.component${ext}` || f === `${baseNamePath}${ext}`) {
                        return /\.(css|scss|sass|less)$/.test(ext);
                    }
                    return false;
                });

                const specPath = dirFileSet.has(`${baseNamePath}.component.spec.ts`)
                    ? `${baseNamePath}.component.spec.ts`
                    : dirFileSet.has(`${baseNamePath}.spec.ts`)
                        ? `${baseNamePath}.spec.ts`
                        : undefined;

                const node: ComponentNode = {
                    tsPath: comp,
                    templatePath,
                    stylePaths,
                    specPath,
                    type: 'component',
                };

                this.graph.set(comp, node);
            }
        }
    }

    /**
     * Gets resources for a given component file.
     * O(1) lookup.
     */
    getResources(tsPath: string): ComponentNode | undefined {
        return this.graph.get(tsPath);
    }
}

