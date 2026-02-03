import { ConfigIssue } from "@ngcompass/common";
import { VALID_RULE_SEVERITIES } from "../constants.js";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig } from "../types.js";

export function validateRules(
    config: ValidatedConfig,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    // Skip "no rules" warning if extends is present (rules come from preset)
    const hasExtends = config.extends && (
        (typeof config.extends === 'string' && config.extends.length > 0) ||
        (Array.isArray(config.extends) && config.extends.length > 0)
    );

    if (!config.rules || Object.keys(config.rules).length === 0) {
        if (!hasExtends) {
            issues.push({
                ...MESSAGES.NO_RULES_CONFIGURED(),
                path: [...basePath, "rules"]
            });
        }
    }

    for (const [ruleName, ruleConfig] of Object.entries(config.rules || {})) {
        if (!ruleName || ruleName.trim() === "") {
            issues.push({
                ...MESSAGES.EMPTY_RULE_NAME(),
                path: [...basePath, "rules"]
            });
            continue;
        }

        if (
            typeof ruleConfig === "object" &&
            ruleConfig !== null &&
            "severity" in ruleConfig
        ) {
            const rule = ruleConfig as { severity?: string; options?: unknown };
            if (
                rule.severity &&
                !VALID_RULE_SEVERITIES.includes(rule.severity)
            ) {
                issues.push({
                    ...MESSAGES.INVALID_RULE_SEVERITY(ruleName, rule.severity),
                    path: [...basePath, "rules", ruleName, "severity"]
                });
            }
        }
    }

    return { issues };
}
