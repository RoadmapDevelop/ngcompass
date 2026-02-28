import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig, ValidationContext } from "../types.js";
import { validateConfigBlock } from "./base.js";

export function validateProfiles(
    config: ValidatedConfig,
    context: ValidationContext
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    if (!config.profiles || typeof config.profiles !== "object") {
        return { issues };
    }

    const profiles = config.profiles as Record<string, any>;
    const profileNames = Object.keys(profiles);

    if (profileNames.length === 0) {
        issues.push({
            ...MESSAGES.PROFILE_EMPTY(),
            path: ["profiles"]
        });
        return { issues };
    }

    for (const [profileName, profile] of Object.entries(profiles)) {
        if (typeof profile !== "object" || profile === null) continue;

        const blockValidation = validateConfigBlock(profile, context, ["profiles", profileName]);
        issues.push(...blockValidation.issues);

        if (
            profile.outputFormat === "html" &&
            (profile.autoFix || profile.autoFixOnSave)
        ) {
            issues.push({
                ...MESSAGES.PROFILE_HTML_OUTPUT_CI(profileName),
                path: ["profiles", profileName, "outputFormat"]
            });
        }
    }

    const visited = new Set<string>();
    const detectCircular = (name: string, chain: string[] = []): boolean => {
        if (visited.has(name)) return true;
        visited.add(name);

        const profile = profiles[name];
        if (profile && typeof profile === "object" && "extends" in profile) {
            const parent = profile.extends;
            if (chain.includes(parent)) {
                issues.push({
                    ...MESSAGES.PROFILE_CIRCULAR_INHERITANCE([
                        ...chain,
                        name,
                        parent,
                    ]),
                    path: ["profiles", name, "extends"]
                });
                return true;
            }
            return detectCircular(parent, [...chain, name]);
        }
        return false;
    };

    profileNames.forEach((name) => detectCircular(name));

    return { issues };
}

