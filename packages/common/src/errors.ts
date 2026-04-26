/**
 * Custom error types
 */

export class AnalyzerError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'AnalyzerError';
    // Capture stack trace if available (V8/Node.js specific)
    if ('captureStackTrace' in Error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

export class ConfigurationError extends AnalyzerError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class ParseError extends AnalyzerError {
  constructor(
    message: string,
    public readonly filePath: string
  ) {
    super(`Parse error in ${filePath}: ${message}`, 'PARSE_ERROR');
    this.name = 'ParseError';
  }
}

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
 * Unlike ParseError (which is collected and surfaced as a warning),
 * RuleExecutionError indicates a bug in the rule itself and is re-thrown
 * so the caller can decide whether to fail loudly or skip the rule.
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
    // Preserve original cause for stack traces
    if (cause instanceof Error && 'stack' in cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

// ============================================================
// INFRASTRUCTURE ERROR MODEL (RFC §7.5)
// ============================================================

/**
 * Categories of infrastructure failures that can occur during analysis.
 *
 *  ParseError        — AST parsing failed for a source file
 *  IOError           — File read / write failed
 *  WorkerCrash       — A worker thread exited with a non-zero code
 *  CacheCorruption   — A cached entry could not be deserialized
 *  SerializationError — stableSerialize() threw (indicates a rule authoring bug)
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
 * recoverable: true  → the pipeline can continue (file is skipped / cold rebuild)
 * recoverable: false → the pipeline cannot produce correct results and should abort
 *                      and should abort the current run.
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
 * Factory that stamps a timestamp and freezes the error object.
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
 * Passed through the pipeline so callers can inspect failures at the end
 * after execution completes.
 */
export class InfrastructureErrorCollector {
  private readonly _errors: InfrastructureError[] = [];

  record(error: InfrastructureError): void {
    this._errors.push(error);
  }

  get errors(): ReadonlyArray<InfrastructureError> {
    return this._errors;
  }

  get hasFatalErrors(): boolean {
    return this._errors.some(e => !e.recoverable);
  }

  get hasAnyErrors(): boolean {
    return this._errors.length > 0;
  }

  /** Returns only errors in a specific phase. */
  forPhase(phase: InfrastructureError['phase']): ReadonlyArray<InfrastructureError> {
    return this._errors.filter(e => e.phase === phase);
  }
}
