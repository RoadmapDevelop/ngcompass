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