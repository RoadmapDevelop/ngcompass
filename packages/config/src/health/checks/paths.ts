import * as fs from "node:fs";
import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig, ValidationContext } from "../types.js";

export function validatePaths(
    config: ValidatedConfig,
    context: ValidationContext,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    if (config.outputPath) {
        const path = [...basePath, "outputPath"];
        if (config.outputPath.includes("..")) {
            issues.push({ ...MESSAGES.OUTPUT_PATH_TRAVERSAL(config.outputPath), path });
        }

        if (
            config.outputPath.includes("/etc/") ||
            config.outputPath.includes("\\etc\\")
        ) {
            issues.push({ ...MESSAGES.OUTPUT_PATH_SYSTEM_DIR(config.outputPath), path });
        }

        const dir = context.path.dirname(config.outputPath);
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

    if (config.cache?.enabled && config.cache?.location) {
        const path = [...basePath, "cache", "location"];
        const isStandardCache = config.cache.location.includes("node_modules/.cache");
        if (!isStandardCache && config.cache.location.includes("node_modules")) {
            issues.push({ ...MESSAGES.CACHE_IN_NODE_MODULES(config.cache.location), path });
        }

        const cacheDir = context.path.dirname(config.cache.location);
        if (!context.fs.existsSync(cacheDir)) {
            issues.push({ ...MESSAGES.CACHE_PARENT_NOT_FOUND(cacheDir), path });
        }
    }

    if (config.parserOptions?.project) {
        if (!context.fs.existsSync(config.parserOptions.project)) {
            issues.push({
                ...MESSAGES.TSCONFIG_PROJECT_NOT_FOUND(config.parserOptions.project),
                path: [...basePath, "parserOptions", "project"]
            });
        }
    }

    if (config.parserOptions?.tsconfigRootDir) {
        if (!context.fs.existsSync(config.parserOptions.tsconfigRootDir)) {
            issues.push({
                ...MESSAGES.TSCONFIG_ROOT_NOT_FOUND(config.parserOptions.tsconfigRootDir),
                path: [...basePath, "parserOptions", "tsconfigRootDir"]
            });
        }
    }

    return { issues };
}

