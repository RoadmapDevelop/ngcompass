import type {
  InfrastructureError,
  InfrastructureErrorType,
} from './models/infrastructure-error.js';

export class AnalyzerError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AnalyzerError';

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
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

    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

export const createInfrastructureError = (
  type: InfrastructureErrorType,
  fields: Omit<InfrastructureError, 'type' | 'timestamp'>
): InfrastructureError =>
  Object.freeze({ type, timestamp: Date.now(), ...fields });

export class InfrastructureErrorCollector {
  private readonly _errors: InfrastructureError[] = [];

  record(error: InfrastructureError): void {
    this._errors.push(error);
  }

  get errors(): ReadonlyArray<InfrastructureError> {
    return this._errors;
  }

  get hasFatalErrors(): boolean {
    return this._errors.some((e) => !e.recoverable);
  }

  get hasAnyErrors(): boolean {
    return this._errors.length > 0;
  }

  forPhase(
    phase: InfrastructureError['phase']
  ): ReadonlyArray<InfrastructureError> {
    return this._errors.filter((e) => e.phase === phase);
  }
}
