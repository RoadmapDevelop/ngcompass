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