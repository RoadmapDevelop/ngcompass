/**
 * @fileoverview
 * Provides the AnalysisContext abstraction for ngcompass.
 *
 * This module facilitates deterministic, memoized access to file system resources
 * and abstract syntax tree (AST) artifacts, ensuring peak performance during
 * analysis by minimizing redundant I/O and parsing operations.
 *
 * Implementation Strategy:
 * - Memoization: Caches raw file content, TypeScript Programs, Template ASTs, and Style ASTs.
 * - Resource Management: Implements an explicit eviction mechanism to control heap usage.
 * - Determinism: Ensures the same file path always yields consistent artifacts across a run.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { LRUCache } from "lru-cache";
import { parseTs, parseHtml, parseCss, extractTemplateFromProgram } from "@ngcompass/ast";
import type { TemplateAst, StyleAst } from "@ngcompass/common";
import type { Program } from "oxc-parser";

/**
 * Supported style sheet extensions for CSS/SCSS analysis.
 */
const CSS_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);

/**
 * The maximum capacity for the Least Recently Used (LRU) file cache.
 * Configured to balance memory footprint and I/O efficiency.
 */
const FILE_CACHE_MAX = 128;

/**
 * Encapsulates the state and logic required for analyzing a set of source files.
 * Provides unified access to file content and parsed metadata with internal memoization.
 */
export interface AnalysisContext {
    readonly rootDir: string;
    readonly readFile: (filePath: string) => Promise<string>;
    readonly getProgram: (filePath: string) => Promise<Program>;
    readonly getTemplate: (filePath: string) => Promise<TemplateAst | undefined>;
    readonly getStyle: (filePath: string) => Promise<StyleAst | undefined>;
    /**
     * Purges all cached artifacts associated with the specified file path.
     *
     * This method is critical for memory governance in large-scale repositories.
     * It should be invoked immediately upon completion of a file's analysis tasks
     * to release references to raw strings and AST structures, enabling garbage
     * collection.
     *
     * @param filePath The path of the file to evict from internal caches.
     */
    readonly evict: (filePath: string) => void;
}

/**
 * Instantiates an AnalysisContext provider with integrated memoization logic.
 *
 * @param rootDir The base directory used to resolve relative file transitions.
 * @returns A stateful AnalysisContext instance.
 */
export const createAnalysisContext = (rootDir: string): AnalysisContext => {
    const fileCache = new LRUCache<string, Promise<string>>({ max: FILE_CACHE_MAX });
    const programCache  = new Map<string, Promise<Program>>();
    const templateCache = new Map<string, Promise<TemplateAst | undefined>>();
    const styleCache    = new Map<string, Promise<StyleAst | undefined>>();

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
            const promise = Promise.resolve<StyleAst | undefined>(undefined);
            styleCache.set(filePath, promise);
            return promise;
        }

        const promise = (async (): Promise<StyleAst | undefined> => {
            const content = await readFileCached(filePath);
            const result = parseCss(content, filePath);
            return result as StyleAst;
        })();

        styleCache.set(filePath, promise);
        return promise;
    };

    const evict = (filePath: string): void => {
        fileCache.delete(filePath);
        programCache.delete(filePath);
        templateCache.delete(filePath);
        styleCache.delete(filePath);
    };

    return { rootDir, readFile: readFileCached, getProgram, getTemplate, getStyle, evict };
};

/**
 * Performs a sanitized file system read operation.
 *
 * Handles relative-to-root path resolution and provides structured error
 * reporting in the event of I/O failures.
 *
 * @param rootDir The project root directory.
 * @param filePath The path of the target file.
 * @returns A promise resolving to the file contents in UTF-8.
 * @throws Error signaling I/O failure or accessibility issues.
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
 * Disambiguates and retrieves template content from various source formats.
 *
 * Supports both external HTML templates and inline templates embedded within
 * TypeScript decorators. Correctly identifies the start offset for accurate
 * positional mapping of findings.
 *
 * @param filePath The file path containing the template reference.
 * @param readFileCached Memoized file loading provider.
 * @param getProgram Memoized AST program provider.
 * @returns A ResolvedTemplate structure or null if no template is identified.
 */
const resolveTemplateContent = async (
    filePath: string,
    readFileCached: (p: string) => Promise<string>,
    getProgram: (p: string) => Promise<Program>
): Promise<ResolvedTemplate | null> => {
    const ext = path.extname(filePath);

    if (ext === ".html") {
        const content = await readFileCached(filePath);
        return { content, startOffset: 0 };
    }

    if (ext === ".ts") {
        const program = await getProgram(filePath);
        const extracted = extractTemplateFromProgram(program);
        return extracted.content ? extracted : null;
    }

    return null;
};

