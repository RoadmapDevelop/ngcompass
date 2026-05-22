/**
 * @fileoverview
 * Memoized file-system and AST accessor for a single analysis run.
 *
 * Every cache is LRU-bounded so the engine cannot accumulate ASTs / file
 * contents past a known budget when running over very large monorepos. The
 * file-content tier is kept small (raw text is cheap to re-read); program /
 * template / style tiers carry more weight per entry, so their caps are
 * sized accordingly.
 *
 * `evict(filePath)` is the per-file release point — invoked by the
 * orchestrator once every task targeting that file has completed.
 * `dispose()` is the run-level release point — invoked after a type-aware
 * chunk finishes so the next chunk starts with a clean heap.
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { LRUCache } from 'lru-cache';
import { extractTemplateFromProgram, parseCss, parseHtml, parseTs } from '@ngcompass/ast';
import type { StyleAst, TemplateAst } from '@ngcompass/common';
import type { Program } from 'oxc-parser';

/** Style-sheet extensions whose contents are passed to the CSS parser. */
const CSS_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);

const FILE_CACHE_MAX = 128;
const PROGRAM_CACHE_MAX = 64;
const TEMPLATE_CACHE_MAX = 64;
const STYLE_CACHE_MAX = 64;

/** Operational surface used by the engine to read files and obtain parsed artifacts. */
export interface AnalysisContext {
    readonly rootDir: string;
    readonly readFile: (filePath: string) => Promise<string>;
    readonly getProgram: (filePath: string) => Promise<Program>;
    readonly getTemplate: (filePath: string) => Promise<TemplateAst | undefined>;
    readonly getStyle: (filePath: string) => Promise<StyleAst | undefined>;
    /**
     * Releases every cached artifact tied to `filePath`. Call this once all
     * tasks targeting the file have produced their results so the underlying
     * AST / string buffers can be reclaimed by the garbage collector.
     */
    readonly evict: (filePath: string) => void;
    /** Releases every cached artifact owned by this context. */
    readonly dispose: () => void;
}

/**
 * Builds a memoized {@link AnalysisContext} rooted at `rootDir`.
 *
 * @param rootDir - Project root used to resolve relative paths.
 * @returns A fully wired analysis context.
 */
export const createAnalysisContext = (rootDir: string): AnalysisContext => {
    const fileCache     = new LRUCache<string, Promise<string>>({ max: FILE_CACHE_MAX });
    const programCache  = new LRUCache<string, Promise<Program>>({ max: PROGRAM_CACHE_MAX });
    const templateCache = new LRUCache<string, Promise<TemplateAst | undefined>>({ max: TEMPLATE_CACHE_MAX });
    const styleCache    = new LRUCache<string, Promise<StyleAst | undefined>>({ max: STYLE_CACHE_MAX });

    const readFileCached = (filePath: string): Promise<string> => {
        const cached = fileCache.get(filePath);
        if (cached) return cached;
        const promise = readFileSafe(rootDir, filePath);
        fileCache.set(filePath, promise);
        return promise;
    };

    const getProgram = (filePath: string): Promise<Program> => {
        const cached = programCache.get(filePath);
        if (cached) return cached;
        const promise = readFileCached(filePath).then((content) => parseTs(content, filePath).program);
        programCache.set(filePath, promise);
        return promise;
    };

    const getTemplate = (filePath: string): Promise<TemplateAst | undefined> => {
        const cached = templateCache.get(filePath);
        if (cached) return cached;
        const promise = resolveTemplate(filePath, readFileCached, getProgram);
        templateCache.set(filePath, promise);
        return promise;
    };

    const getStyle = (filePath: string): Promise<StyleAst | undefined> => {
        const cached = styleCache.get(filePath);
        if (cached) return cached;

        const ext = path.extname(filePath).toLowerCase();
        if (!CSS_EXTENSIONS.has(ext)) {
            const promise = Promise.resolve<StyleAst | undefined>(undefined);
            styleCache.set(filePath, promise);
            return promise;
        }

        const promise = readFileCached(filePath).then((content) =>
            parseCss(content, filePath) as StyleAst,
        );
        styleCache.set(filePath, promise);
        return promise;
    };

    const evict = (filePath: string): void => {
        fileCache.delete(filePath);
        programCache.delete(filePath);
        templateCache.delete(filePath);
        styleCache.delete(filePath);
    };

    const dispose = (): void => {
        fileCache.clear();
        programCache.clear();
        templateCache.clear();
        styleCache.clear();
    };

    return { rootDir, readFile: readFileCached, getProgram, getTemplate, getStyle, evict, dispose };
};

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Reads `filePath` (resolved against `rootDir`) and re-throws any I/O error
 * with a clearer message. The underlying error message is preserved in the
 * suffix for debugging without overwhelming the report.
 */
const readFileSafe = async (rootDir: string, filePath: string): Promise<string> => {
    try {
        return await readFile(path.resolve(rootDir, filePath), 'utf-8');
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Cannot read file: ${filePath}. ${msg}`);
    }
};

/**
 * Resolves a file path to a parsed template AST, handling both external
 * `.html` files and inline `template: '…'` strings inside a `.ts` component.
 */
const resolveTemplate = async (
    filePath: string,
    readFileCached: (p: string) => Promise<string>,
    getProgram: (p: string) => Promise<Program>,
): Promise<TemplateAst | undefined> => {
    const extracted = await resolveTemplateContent(filePath, readFileCached, getProgram);
    if (!extracted || !extracted.content) return undefined;
    return parseHtml(extracted.content, extracted.startOffset);
};

/** Result of locating a template's content and its position in the source file. */
interface ResolvedTemplate {
    content: string;
    /** Byte offset in the source file where `content[0]` lives. */
    startOffset: number;
}

/**
 * Locates the raw template text for `filePath`. For `.html` files this is the
 * file's content with `startOffset = 0`; for `.ts` files this is the inline
 * `template: '…'` value extracted from the first `@Component` decorator.
 */
const resolveTemplateContent = async (
    filePath: string,
    readFileCached: (p: string) => Promise<string>,
    getProgram: (p: string) => Promise<Program>,
): Promise<ResolvedTemplate | null> => {
    const ext = path.extname(filePath);

    if (ext === '.html') {
        const content = await readFileCached(filePath);
        return { content, startOffset: 0 };
    }

    if (ext === '.ts') {
        const program = await getProgram(filePath);
        const extracted = extractTemplateFromProgram(program);
        return extracted.content ? extracted : null;
    }

    return null;
};
