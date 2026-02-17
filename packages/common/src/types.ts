/**
 * Core type definitions
 */

/**
 * Severity levels for violations
 */
export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info' | 'warning' | 'error';

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

/**
 * Result type for functional error handling
 */
export type Result<T, E = Error> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: E };

/**
 * Creates a successful result
 */
export const Ok = <T>(data: T): Result<T, never> => ({ ok: true, data });

/**
 * Creates a failed result
 */
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });