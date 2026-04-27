import * as fs from "node:fs";
import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig, ValidationContext } from "../types.js";

/**
 * Constants for path security and validation logic.
 */
const PATH_RULES = {
    TRAVERSAL: "..",
    SENSITIVE_DIRS: ["/etc/", "\\etc\\", "/var/", "\\var\\"],
    CACHE_ROOT: "node_modules",
    STANDARD_CACHE_SUBDIR: ".cache"
} as const;

/**
 * Validates filesystem paths within the configuration to ensure security,
 * existence, and correct permissions.
 *
 * @param config - The composed configuration object.
 * @param context - Validation context providing abstraction for FS and Path utilities.
 * @param basePath - Structural breadcrumbs for issue reporting.
 * @returns A validation result containing issues related to invalid or insecure paths.
 */
export function validatePaths(
    config: ValidatedConfig,
    context: ValidationContext,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];
    const resolveFromCwd = (targetPath: string): string =>
        context.path.isAbsolute(targetPath)
            ? targetPath
            : context.path.resolve(context.cwd ?? process.cwd(), targetPath);

    /**
     * Integrity: Output Path
     * Validates that the output directory is secure, exists, and is writable.
     */
    if (config.outputPath) {
        const { outputPath } = config;
        const path = [...basePath, "outputPath"];

        /**
         * Security: Path Traversal & System Directories
         * Prevents escaping the project root or writing to sensitive system areas.
         */
        if (outputPath.includes(PATH_RULES.TRAVERSAL)) {
            issues.push({ ...MESSAGES.OUTPUT_PATH_TRAVERSAL(outputPath), path });
        }

        const isSystemDir = PATH_RULES.SENSITIVE_DIRS.some(dir => outputPath.includes(dir));
        if (isSystemDir) {
            issues.push({ ...MESSAGES.OUTPUT_PATH_SYSTEM_DIR(outputPath), path });
        }

        /**
         * Filesystem: Existence and Permissions
         * Verifies that the parent directory exists and the process has write access.
         */
        const dir = context.path.dirname(resolveFromCwd(outputPath));
        if (!context.fs.existsSync(dir)) {
            issues.push({ ...MESSAGES.OUTPUT_PATH_NOT_FOUND(dir), path });
        } else {
            try {
                context.fs.accessSync(dir, fs.constants.W_OK);
            } catch {
                issues.push({ ...MESSAGES.OUTPUT_PATH_NOT_WRITABLE(dir), path });
            }
        }
    }

    /**
     * Integrity: Cache Configuration
     * Validates cache location to prevent pollution of node_modules or missing directories.
     */
    if (config.cache && typeof config.cache === "object" && config.cache.enabled) {
        const { location } = config.cache;

        if (location) {
            const path = [...basePath, "cache", "location"];
            const isInNodeModules = location.includes(PATH_RULES.CACHE_ROOT);
            const isStandardCache = location.includes(`${PATH_RULES.CACHE_ROOT}/${PATH_RULES.STANDARD_CACHE_SUBDIR}`);

            if (isInNodeModules && !isStandardCache) {
                issues.push({ ...MESSAGES.CACHE_IN_NODE_MODULES(location), path });
            }

            const cacheDir = context.path.dirname(resolveFromCwd(location));
            if (!context.fs.existsSync(cacheDir)) {
                issues.push({ ...MESSAGES.CACHE_PARENT_NOT_FOUND(cacheDir), path });
            }
        }
    }

    /**
     * Integrity: Parser Options
     * Ensures that TypeScript-specific project files and root directories exist.
     */
    if (config.parserOptions) {
        const { project, tsconfigRootDir } = config.parserOptions;

        const resolvedProject = project ? resolveFromCwd(project) : undefined;
        const resolvedTsconfigRootDir = tsconfigRootDir ? resolveFromCwd(tsconfigRootDir) : undefined;

        if (resolvedProject && !context.fs.existsSync(resolvedProject)) {
            issues.push({
                ...MESSAGES.TSCONFIG_PROJECT_NOT_FOUND(project!),
                path: [...basePath, "parserOptions", "project"]
            });
        }

        if (resolvedTsconfigRootDir && !context.fs.existsSync(resolvedTsconfigRootDir)) {
            issues.push({
                ...MESSAGES.TSCONFIG_ROOT_NOT_FOUND(tsconfigRootDir!),
                path: [...basePath, "parserOptions", "tsconfigRootDir"]
            });
        }
    }

    return { issues };
}
