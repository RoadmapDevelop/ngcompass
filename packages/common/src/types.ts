/**
 * Core type definitions
 */

/**
 * Severity levels for violations
 */
export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

/**
 * Rule categories for organization
 */
export enum RuleCategory {
    Architecture = 'architecture',
    Performance = 'performance',
    SSR = 'ssr',
    Security = 'security',
    Accessibility = 'accessibility',
    Testing = 'testing',
    CodeSmell = 'code-smell',
    Reactivity = 'reactivity',
    BestPractice = 'best-practice',
}