/**
 * Resource Discovery
 *
 * Pure functions for discovering related files (templates, styles, specs)
 * using convention-based detection (no parsing).
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import type { TaskInputs, FileInput } from "./types.js";
import { getBaseName, isComponentFile } from "./file-type.js";
import { debug } from "@ngcompass/common";

const STYLE_EXTENSIONS = [".css", ".scss", ".sass", ".less"] as const;

/**
 * Discovers all related resources for a TypeScript file.
 *
 * @param tsFilePath - TypeScript file path (absolute)
 * @param needsTsAst - Whether TypeScript input requires AST
 * @param needsHtmlAst - Whether template input requires AST
 * @param needsCssAst - Whether styles inputs require AST
 * @param needsSpecAst - Whether spec input requires AST
 * @param directoryCache - Optional directory listing cache
 * @returns TaskInputs with all discovered resources
 */
export const discoverResources = async (
    tsFilePath: string,
    needsTsAst: boolean,
    needsHtmlAst: boolean,
    needsCssAst: boolean,
    needsSpecAst: boolean,
    directoryCache?: Map<string, string[]>
): Promise<TaskInputs> => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    const files = await listDirectory(dir, directoryCache);

    const typescript: FileInput = buildFileInput(tsFilePath, needsTsAst);

    const template = findTemplateFile(dir, baseName, files, needsHtmlAst);
    const styles = findStyleFiles(tsFilePath, dir, baseName, files, needsCssAst);
    const spec = findSpecFile(dir, baseName, files, needsSpecAst);

    return {
        typescript,
        template,
        styles: styles.length > 0 ? styles : undefined,
        spec,
    };
};

/**
 * Checks if any resource file exists for the given TypeScript file.
 *
 * @param tsFilePath - TypeScript file path
 * @param resourceType - Type of resource to check
 * @param directoryCache - Optional directory listing cache
 * @returns true if resource exists
 */
export const resourceExists = async (
    tsFilePath: string,
    resourceType: "template" | "style" | "spec",
    directoryCache?: Map<string, string[]>
): Promise<boolean> => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    const files = await listDirectory(dir, directoryCache);

    if (resourceType === "template") {
        return hasTemplateFile(baseName, files);
    }

    if (resourceType === "style") {
        if (!isComponentFile(tsFilePath)) return false;
        return hasAnyStyleFile(baseName, files);
    }

    return hasSpecFile(baseName, files);
};

/**
 * Gets all style file paths for a component.
 *
 * @param tsFilePath - Component TypeScript file path
 * @param directoryCache - Optional directory listing cache
 * @returns Array of style file paths
 */
export const getStyleFiles = async (
    tsFilePath: string,
    directoryCache?: Map<string, string[]>
): Promise<ReadonlyArray<string>> => {
    if (!isComponentFile(tsFilePath)) return [];

    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    const files = await listDirectory(dir, directoryCache);
    return STYLE_EXTENSIONS.flatMap((ext) => {
        const name = styleFileName(baseName, ext);
        return files.includes(name) ? [path.join(dir, name)] : [];
    });
};

/**
 * Gets the template file path for a component.
 *
 * @param tsFilePath - Component TypeScript file path
 * @param directoryCache - Optional directory listing cache
 * @returns Template file path or null if not found
 */
export const getTemplateFile = async (
    tsFilePath: string,
    directoryCache?: Map<string, string[]>
): Promise<string | null> => {
    if (!isComponentFile(tsFilePath)) return null;

    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    const files = await listDirectory(dir, directoryCache);
    const name = templateFileName(baseName);

    return files.includes(name) ? path.join(dir, name) : null;
};

/**
 * Gets the spec file path.
 *
 * @param tsFilePath - TypeScript file path
 * @param directoryCache - Optional directory listing cache
 * @returns Spec file path or null if not found
 */
export const getSpecFile = async (
    tsFilePath: string,
    directoryCache?: Map<string, string[]>
): Promise<string | null> => {
    const dir = path.dirname(tsFilePath);
    const baseName = getBaseName(tsFilePath);

    const files = await listDirectory(dir, directoryCache);
    const name = specFileName(baseName);

    return files.includes(name) ? path.join(dir, name) : null;
};

/**
 * Lists directory entries, using cache when available.
 *
 * @param dir - Directory path
 * @param directoryCache - Optional cache
 * @returns Directory entries
 */
const listDirectory = async (dir: string, directoryCache?: Map<string, string[]>): Promise<string[]> => {
    const cached = directoryCache?.get(dir);
    if (cached) return cached;

    try {
        const files = await readdir(dir);
        directoryCache?.set(dir, files);
        return files;
    } catch (error) {
        debug(
            "planner",
            `Failed to read directory: ${dir}. Error: ${error instanceof Error ? error.message : String(error)}`
        );
        return [];
    }
};

/**
 * Builds a FileInput for a discovered resource.
 *
 * @param filePath - Absolute file path
 * @param needsAst - Whether AST is required
 * @returns FileInput
 */
const buildFileInput = (filePath: string, needsAst: boolean): FileInput => {
    return { path: filePath, needsAst, hash: "" };
};

/**
 * Computes the conventional template filename.
 *
 * @param baseName - Base name of component file
 * @returns Template filename
 */
const templateFileName = (baseName: string): string => `${baseName}.component.html`;

/**
 * Computes the conventional style filename.
 *
 * @param baseName - Base name of component file
 * @param ext - Style file extension
 * @returns Style filename
 */
const styleFileName = (baseName: string, ext: string): string => `${baseName}.component${ext}`;

/**
 * Computes the conventional spec filename.
 *
 * @param baseName - Base name of TypeScript file
 * @returns Spec filename
 */
const specFileName = (baseName: string): string => `${baseName}.spec.ts`;

/**
 * Checks if the template file exists in a directory listing.
 *
 * @param baseName - Base name
 * @param files - Directory listing
 * @returns true if present
 */
const hasTemplateFile = (baseName: string, files: ReadonlyArray<string>): boolean => {
    return files.includes(templateFileName(baseName));
};

/**
 * Checks if any style file exists in a directory listing.
 *
 * @param baseName - Base name
 * @param files - Directory listing
 * @returns true if at least one style file exists
 */
const hasAnyStyleFile = (baseName: string, files: ReadonlyArray<string>): boolean => {
    return STYLE_EXTENSIONS.some((ext) => files.includes(styleFileName(baseName, ext)));
};

/**
 * Checks if the spec file exists in a directory listing.
 *
 * @param baseName - Base name
 * @param files - Directory listing
 * @returns true if present
 */
const hasSpecFile = (baseName: string, files: ReadonlyArray<string>): boolean => {
    return files.includes(specFileName(baseName));
};

/**
 * Finds the template input for a file.
 *
 * @param dir - Directory path
 * @param baseName - Base name
 * @param files - Directory listing
 * @param needsAst - Whether AST is required
 * @returns FileInput or undefined
 */
const findTemplateFile = (
    dir: string,
    baseName: string,
    files: ReadonlyArray<string>,
    needsAst: boolean
): FileInput | undefined => {
    const name = templateFileName(baseName);
    return files.includes(name) ? buildFileInput(path.join(dir, name), needsAst) : undefined;
};

/**
 * Finds style inputs for a file.
 *
 * @param tsFilePath - TypeScript file path
 * @param dir - Directory path
 * @param baseName - Base name
 * @param files - Directory listing
 * @param needsAst - Whether AST is required
 * @returns Style inputs
 */
const findStyleFiles = (
    tsFilePath: string,
    dir: string,
    baseName: string,
    files: ReadonlyArray<string>,
    needsAst: boolean
): FileInput[] => {
    if (!isComponentFile(tsFilePath)) return [];

    const styles: FileInput[] = [];

    for (const ext of STYLE_EXTENSIONS) {
        const name = styleFileName(baseName, ext);
        if (files.includes(name)) {
            styles.push(buildFileInput(path.join(dir, name), needsAst));
        }
    }

    return styles;
};

/**
 * Finds the spec input for a file.
 *
 * @param dir - Directory path
 * @param baseName - Base name
 * @param files - Directory listing
 * @param needsAst - Whether AST is required
 * @returns FileInput or undefined
 */
const findSpecFile = (
    dir: string,
    baseName: string,
    files: ReadonlyArray<string>,
    needsAst: boolean
): FileInput | undefined => {
    const name = specFileName(baseName);
    return files.includes(name) ? buildFileInput(path.join(dir, name), needsAst) : undefined;
};
