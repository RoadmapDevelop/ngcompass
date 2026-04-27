import { ConfigIssue } from "@ngcompass/common";
import { VALID_RULE_SEVERITIES } from "../constants.js";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig } from "../types.js";

/**
 * Validates the 'rules' configuration object.
 *
 * This function checks for the presence of rules (considering inheritance 
 * via presets), ensures rule names are valid, and verifies that rule 
 * severities match the allowed system values.
 *
 * @param config - The composed configuration object to validate.
 * @param basePath - The structural path used for pinpointing issues in error reports.
 * @returns A validation result containing issues related to rule configuration.
 */
export function validateRules(
    config: ValidatedConfig,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    /**
     * Inheritance Context: Extends Check
     * Rules may be inherited from presets. If 'extends' is populated, 
     * we do not flag an empty 'rules' object as an error.
     */
    const hasExtends = Array.isArray(config.extends)
        ? config.extends.length > 0
        : !!config.extends && config.extends.length > 0;

    const rules = config.rules || {};
    const ruleEntries = Object.entries(rules);
    const hasExplicitRules = ruleEntries.length > 0;

    /**
     * Constraint: Minimum Rule Configuration
     * Ensures that the engine has at least one source of truth for rules
     * (either local definitions or an external preset).
     */
    if (!hasExplicitRules && !hasExtends) {
        issues.push({
            ...MESSAGES.NO_RULES_CONFIGURED(),
            path: [...basePath, "rules"]
        });
    }

    /**
     * Iterative Check: Rule Definitions
     * Inspects each rule for structural validity and severity compliance.
     */
    for (const [ruleName, ruleConfig] of ruleEntries) {
        /**
         * Syntax: Rule Name Integrity
         * Rule keys must be non-empty strings.
         */
        if (!ruleName || ruleName.trim() === "") {
            issues.push({
                ...MESSAGES.EMPTY_RULE_NAME(),
                path: [...basePath, "rules"]
            });
            continue;
        }

        /**
         * Syntax: Severity Validation
         * If the rule is defined as an object with a severity, it must 
         * match one of the system-defined valid severities.
         */
        if (typeof ruleConfig === "object" && ruleConfig !== null) {
            const rule = ruleConfig as { severity?: string; options?: unknown };
            const { severity } = rule;

            if (severity && !VALID_RULE_SEVERITIES.includes(severity)) {
                issues.push({
                    ...MESSAGES.INVALID_RULE_SEVERITY(ruleName, severity),
                    path: [...basePath, "rules", ruleName, "severity"]
                });
            }
        }
    }

    return { issues };
}