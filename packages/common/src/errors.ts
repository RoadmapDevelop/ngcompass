/**
 * @fileoverview
 * Error hierarchy and infrastructure-error model.
 *
 * Defines typed analyzer exceptions for unrecoverable programmer-level
 * failures, plus data-shaped infrastructure errors for recoverable pipeline
 * failures that should be reported without throwing. This keeps package
 * boundaries explicit: library layers describe failures as values while the
 * CLI decides how loudly to fail.
 */

/**
 * Base error for analyzer-specific exceptions.
 *
 * @param message - Human-readable failure message.
 * @param code - Optional stable machine-readable error code.
 */
export class AnalyzerError extends Error {
    constructor(message: string, public readonly code?: string) {
        super(message);
        this.name = 'AnalyzerError';
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Error raised for invalid analyzer configuration.
 *
 * @param message - Validation or normalization failure message.
 */
export class ConfigurationError extends AnalyzerError {
    constructor(message: string) {
        super(message, 'CONFIG_ERROR');
        this.name = 'ConfigurationError';
    }
}

/**
 * Error raised when a source file cannot be parsed.
 *
 * @param message - Parser failure message.
 * @param filePath - Path to the file that failed to parse.
 */
export class ParseError extends AnalyzerError {
    constructor(
        message: string,
        public readonly filePath: string
    ) {
        super(`Parse error in ${filePath}: ${message}`, 'PARSE_ERROR');
        this.name = 'ParseError';
    }
}

/**
 * Error raised for rule registration or rule-level validation failures.
 *
 * @param message - Rule failure message.
 * @param ruleId - Stable rule identifier.
 */
export class RuleError extends AnalyzerError {
    constructor(
        message: string,
        public readonly ruleId: string
    ) {
        super(`Error in rule '${ruleId}': ${message}`, 'RULE_ERROR');
        this.name = 'RuleError';
    }
}

/**
 * Thrown when a rule handler crashes during execution.
 *
 * Unlike parse errors, which are collected and surfaced as warnings,
 * rule execution errors indicate a bug in the rule itself and are re-thrown
 * so the caller can decide whether to fail loudly or skip the rule.
 *
 * @param ruleName - Name of the rule whose handler crashed.
 * @param filePath - File being analyzed when the handler crashed.
 * @param cause - Original thrown value.
 */
export class RuleExecutionError extends AnalyzerError {
    constructor(
        public readonly ruleName: string,
        public readonly filePath: string,
        cause: unknown
    ) {
        const causeMessage = cause instanceof Error ? cause.message : String(cause);
        super(
            `Rule "${ruleName}" crashed on ${filePath}: ${causeMessage}`,
            'RULE_EXECUTION_ERROR'
        );
        this.name = 'RuleExecutionError';
        // Preserve the original stack so rule authors can debug the source failure.
        if (cause instanceof Error) {
            this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
        }
    }
}

// ============================================================
// INFRASTRUCTURE ERROR MODEL
// ============================================================

/**
 * Categories of infrastructure failures that can occur during analysis.
 */
export type InfrastructureErrorType =
    | 'ParseError'
    | 'IOError'
    | 'WorkerCrash'
    | 'CacheCorruption'
    | 'SerializationError'
    | 'RuleExecutionError';

/**
 * Structured record of an infrastructure failure.
 *
 * Recoverable errors let the pipeline continue by skipping a file or
 * rebuilding cold; non-recoverable errors mean the current run cannot produce
 * trustworthy results.
 */
export interface InfrastructureError {
    readonly type: InfrastructureErrorType;
    readonly filePath?: string;
    readonly cause: string;
    readonly timestamp: number;
    readonly recoverable: boolean;
    readonly phase: 'config' | 'planner' | 'engine';
    readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Creates an immutable infrastructure error with a current timestamp.
 *
 * @param type - Infrastructure failure category.
 * @param fields - Error fields excluding generated `type` and `timestamp`.
 * @returns A frozen infrastructure error record.
 */
export function createInfrastructureError(
    type: InfrastructureErrorType,
    fields: Omit<InfrastructureError, 'type' | 'timestamp'>
): InfrastructureError {
    return Object.freeze({ type, timestamp: Date.now(), ...fields });
}

/**
 * Per-run accumulator of infrastructure errors.
 *
 * The collector is threaded through config, planner, and engine layers so
 * callers can inspect all pipeline failures after execution completes.
 */
export class InfrastructureErrorCollector {
    private readonly _errors: InfrastructureError[] = [];

    /**
     * Records an infrastructure error for the current run.
     *
     * @param error - Error value to append.
     */
    record(error: InfrastructureError): void {
        this._errors.push(error);
    }

    /** All recorded infrastructure errors in insertion order. */
    get errors(): ReadonlyArray<InfrastructureError> {
        return this._errors;
    }

    /** Whether any recorded error requires aborting the current run. */
    get hasFatalErrors(): boolean {
        return this._errors.some(e => !e.recoverable);
    }

    /** Whether at least one infrastructure error was recorded. */
    get hasAnyErrors(): boolean {
        return this._errors.length > 0;
    }

    /**
     * Returns only errors recorded for a specific pipeline phase.
     *
     * @param phase - Pipeline phase to select.
     * @returns Matching errors in insertion order.
     */
    forPhase(phase: InfrastructureError['phase']): ReadonlyArray<InfrastructureError> {
        return this._errors.filter(e => e.phase === phase);
    }
}
