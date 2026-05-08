import * as path from 'node:path';
import { readFile } from 'node:fs/promises';
import { FileType } from './types.js';

const TEMPLATE_URL_RE = /templateUrl\s*:\s*['"`]([^'"`\n]+)['"`]/;
const STYLE_URL_RE = /\bstyleUrl(?!s)\s*:\s*['"`]([^'"`\n]+)['"`]/;
const STYLE_URLS_RE = /\bstyleUrls\s*:\s*\[([^\]]+)\]/;
const STYLE_STR_RE = /['"`]([^'"`\n]+\.(?:css|scss|sass|less))['"`]/g;

async function extractTemplateUrl(tsPath: string, dir: string, fileSet: Set<string>): Promise<string | undefined> {
    try {
        const content = await readFile(tsPath, 'utf-8');
        const match = TEMPLATE_URL_RE.exec(content);
        if (!match) return undefined;
        const resolved = path.resolve(dir, match[1]);
        return fileSet.has(resolved) ? resolved : undefined;
    } catch {
        return undefined;
    }
}

async function extractStyleUrls(tsPath: string, dir: string, fileSet: Set<string>): Promise<string[]> {
    try {
        const content = await readFile(tsPath, 'utf-8');
        const results: string[] = [];

        const singleMatch = STYLE_URL_RE.exec(content);
        if (singleMatch) {
            const resolved = path.resolve(dir, singleMatch[1]);
            if (fileSet.has(resolved)) results.push(resolved);
        }

        const arrayMatch = STYLE_URLS_RE.exec(content);
        if (arrayMatch) {
            STYLE_STR_RE.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = STYLE_STR_RE.exec(arrayMatch[1])) !== null) {
                const resolved = path.resolve(dir, m[1]);
                if (fileSet.has(resolved)) results.push(resolved);
            }
        }

        return results;
    } catch {
        return [];
    }
}

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
     * Falls back to decorator-based templateUrl/styleUrls extraction when
     * convention-based discovery finds no template or styles.
     */
    async build(files: ReadonlyArray<string>): Promise<void> {
        this.graph.clear();
        const fileSet = new Set(files);

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

                // Template: convention first, then templateUrl decorator fallback
                const templateCandidates = [
                    `${baseNamePath}.component.html`,
                    `${baseNamePath}.html`,
                ];
                let templatePath = templateCandidates.find(t => dirFileSet.has(t));
                if (!templatePath) {
                    templatePath = await extractTemplateUrl(comp, dir, fileSet);
                }

                // Styles: convention first, then styleUrls/styleUrl decorator fallback
                let stylePaths = dirFiles.filter(f => {
                    if (!f.startsWith(baseNamePath)) return false;
                    const ext = path.extname(f);
                    if (f === `${baseNamePath}.component${ext}` || f === `${baseNamePath}${ext}`) {
                        return /\.(css|scss|sass|less)$/.test(ext);
                    }
                    return false;
                });
                if (stylePaths.length === 0) {
                    stylePaths = await extractStyleUrls(comp, dir, fileSet);
                }

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

