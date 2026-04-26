import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig, ValidationContext } from "../types.js";
import { validateConfigBlock } from "./base.js";

/**
 * Validates the 'profiles' section of the configuration. This includes 
 * individual block validation for each profile, format-specific constraints, 
 * and detection of circular inheritance chains.
 *
 * @param config - The composed configuration object.
 * @param context - Validation context providing access to environmental data.
 * @returns A validation result containing issues found within the profiles.
 */
export function validateProfiles(
    config: ValidatedConfig,
    context: ValidationContext
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    /**
     * Guard: Profiles Existence
     * Ensures the profiles field is a valid object before proceeding with 
     * key-based iteration.
     */
    if (!config.profiles || typeof config.profiles !== "object") {
        return { issues };
    }

    const profiles = config.profiles as Record<string, any>;
    const profileNames = Object.keys(profiles);

    /**
     * Constraint: Collection Content
     * A 'profiles' object that exists but is empty is considered a configuration error.
     */
    if (profileNames.length === 0) {
        issues.push({
            ...MESSAGES.PROFILE_EMPTY(),
            path: ["profiles"]
        });
        return { issues };
    }

    /**
     * Iterative Check: Individual Profile Logic
     * Validates each profile as a standalone ConfigBlock and checks 
     * for incompatible property combinations.
     */
    for (const [profileName, profile] of Object.entries(profiles)) {
        if (!profile || typeof profile !== "object") {
            continue;
        }

        /**
         * Delegation: Base Block Validation
         * Reuses standard block validation for common fields (workers, cache, etc.)
         */
        const { issues: blockIssues } = validateConfigBlock(profile, context, ["profiles", profileName]);
        issues.push(...blockIssues);

    }

    /**
     * Integrity: Circular Inheritance Detection
     * Traverses the 'extends' chain of each profile to ensure no recursive 
     * loops exist, which would cause infinite resolution cycles.
     */
    const visited = new Set<string>();

    const detectCircular = (name: string, chain: string[] = []): void => {
        if (visited.has(name)) {
            return;
        }

        const profile = profiles[name];
        const hasParent = profile && typeof profile === "object" && "extends" in profile;

        if (hasParent) {
            const parent = profile.extends;

            if (chain.includes(parent)) {
                issues.push({
                    ...MESSAGES.PROFILE_CIRCULAR_INHERITANCE([...chain, name, parent]),
                    path: ["profiles", name, "extends"]
                });
                return;
            }

            detectCircular(parent, [...chain, name]);
        }

        visited.add(name);
    };

    profileNames.forEach((name) => detectCircular(name));

    return { issues };
}
