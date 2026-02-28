import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation } from "../types.js";

export function validateDeprecatedFields(
    rawConfig: unknown,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];
    const config = rawConfig as any;

    if ("cacheLocation" in config && config.cacheLocation) {
        issues.push({
            ...MESSAGES.DEPRECATED_CACHE_LOCATION(),
            path: [...basePath, "cacheLocation"]
        });
    }

    if ("concurrency" in config && config.concurrency) {
        issues.push({
            ...MESSAGES.DEPRECATED_CONCURRENCY(),
            path: [...basePath, "concurrency"]
        });
    }

    return { issues };
}

