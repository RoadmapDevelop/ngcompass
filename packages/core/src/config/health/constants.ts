export const SEVERITY_LEVELS: Record<string, number> = {
    info: 0,
    low: 1,
    moderate: 2,
    high: 3,
    critical: 4,
};

export const VALID_SEVERITIES = Object.keys(SEVERITY_LEVELS);
export const VALID_RULE_SEVERITIES = [...VALID_SEVERITIES, "off"];
