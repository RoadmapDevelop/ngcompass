import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig, ValidationContext } from "../types.js";
import { validateConfigBlock } from "./base.js";

export function validateCrossFields(
    config: ValidatedConfig,
    context: ValidationContext,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    if (config.maxWarnings !== undefined && config.maxWarnings < 0) {
        issues.push({
            ...MESSAGES.NEGATIVE_MAX_WARNINGS(config.maxWarnings),
            path: [...basePath, "maxWarnings"]
        });
    }

    const blockValidation = validateConfigBlock(config, context, basePath);
    issues.push(...blockValidation.issues);

    return { issues };
}
