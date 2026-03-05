/**
 * Analysis Context
 *
 * Memoized, deterministic accessors for file content and parser artifacts.
 * Extracted from orchestrator.ts for reuse by both the main thread and worker threads.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { parseTs, parseHtml, parseCss, extractTemplateFromProgram } from "@ngcompass/ast";
import type { TemplateAst, StyleAst } from "@ngcompass/common";
import type { Program } from "oxc-parser";

/** CSS / SCSS file extensions that `parseCss` can handle via Lightning CSS. */
const CSS_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);


/**
 * Memoized, deterministic accessors for file and parser artifacts.
 */
export interface AnalysisContext {
    readonly rootDir: string;
    readonly readFile: (filePath: string) => Promise<string>;
    readonly getProgram: (filePath: string) => Promise<Program>;
    readonly getTemplate: (filePath: string) => Promise<TemplateAst | undefined>;
    readonly getStyle: (filePath: string) => Promise<StyleAst | undefined>;
}

/**
 * Creates an analysis context with memoized file reads and parsing.
 *
 * Each cache key is the file path; once a file is read or parsed, the result
 * is reused for all subsequent requests within the same analysis run.
 *
 * @param rootDir - Root directory for resolving file paths
 * @returns AnalysisContext
 */
export const createAnalysisContext = (rootDir: string): AnalysisContext => {
    const fileCache = new Map<string, Promise<string>>();
    const programCache = new Map<string, Promise<Program>>();
    const templateCache = new Map<string, Promise<TemplateAst | undefined>>();
    const styleCache = new Map<string, Promise<StyleAst | undefined>>();

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

        const promise = (async () => {
            const content = await readFileCached(filePath);
            return parseTs(content, filePath).program;
        })();

        programCache.set(filePath, promise);
        return promise;
    };

    const getTemplate = (filePath: string): Promise<TemplateAst | undefined> => {
        const cached = templateCache.get(filePath);
        if (cached) return cached;

        const promise = (async () => {
            const extracted = await resolveTemplateContent(filePath, readFileCached, getProgram);
            if (!extracted || !extracted.content) return undefined;
            // Pass templateStartOffset so rules can convert template-relative
            // offsets to file-absolute offsets for correct line/column reporting.
            return parseHtml(extracted.content, extracted.startOffset);
        })();

        templateCache.set(filePath, promise);
        return promise;
    };

    const getStyle = (filePath: string): Promise<StyleAst | undefined> => {
        const cached = styleCache.get(filePath);
        if (cached) return cached;

        const ext = path.extname(filePath).toLowerCase();
        if (!CSS_EXTENSIONS.has(ext)) {
            // Non-CSS file (e.g. a .ts component with inline styles):
            // style analysis is not yet supported for inline extraction.
            const promise = Promise.resolve<StyleAst | undefined>(undefined);
            styleCache.set(filePath, promise);
            return promise;
        }

        // ENGINE-003: Wire @ngcompass/ast's parseCss for real style analysis.
        const promise = (async (): Promise<StyleAst | undefined> => {
            const content = await readFileCached(filePath);
            const result = parseCss(content, filePath);
            // CssResult already matches the StyleAst interface shape.
            return result as StyleAst;
        })();

        styleCache.set(filePath, promise);
        return promise;
    };

    return { rootDir, readFile: readFileCached, getProgram, getTemplate, getStyle };
};

/**
 * Reads a file relative to rootDir, throwing on any I/O failure.
 *
 * ENGINE-004: Previously swallowed errors and returned `''`, causing rules
 * to silently analyse an empty string (false negative). Now re-throws so the
 * `InfrastructureErrorCollector` in the batch runner can surface the error.
 *
 * @param rootDir  - Root directory
 * @param filePath - File path (relative or absolute)
 * @returns File contents
 * @throws Error if the file cannot be read (e.g. permissions, deleted mid-scan)
 */
const readFileSafe = async (rootDir: string, filePath: string): Promise<string> => {
    try {
        return await readFile(path.resolve(rootDir, filePath), "utf-8");
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Cannot read file: ${filePath}. ${msg}`);
    }
};

/** Result from resolving a template's content and position in the source. */
interface ResolvedTemplate {
    content: string;
    /** Byte offset in the source file where `content[0]` lives. */
    startOffset: number;
}

/**
 * Resolves template content and its position from either an HTML file or an
 * inline template in a TypeScript file.
 *
 * For external `.html` files `startOffset` is always `0` — the HTML file IS
 * the template, so its parser offsets are already file-absolute.
 *
 * For inline templates inside `.ts` files `startOffset` is the byte position
 * of the first content character in the TypeScript source (after the opening
 * quote or backtick). This value is forwarded into `parseHtml()` so the
 * resulting `HtmlParserResult.templateStartOffset` can be used by template
 * rules to report accurate line/column numbers.
 *
 * @param filePath       - Template path or TS path
 * @param readFileCached - Memoized file read
 * @param getProgram     - Memoized program parse
 * @returns Resolved template or null if not applicable
 */
const resolveTemplateContent = async (
    filePath: string,
    readFileCached: (p: string) => Promise<string>,
    getProgram: (p: string) => Promise<Program>
): Promise<ResolvedTemplate | null> => {
    const ext = path.extname(filePath);

    if (ext === ".html") {
        // External template — offsets are file-absolute, startOffset = 0
        const content = await readFileCached(filePath);
        return { content, startOffset: 0 };
    }

    if (ext === ".ts") {
        const program = await getProgram(filePath);
        const extracted = extractTemplateFromProgram(program);
        // extractTemplateFromProgram returns { content, startOffset } where
        // startOffset is the byte position in the .ts file after the opening quote.
        return extracted.content ? extracted : null;
    }

    return null;
};

