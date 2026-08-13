export interface DiagnosticMessage {
  readonly ruleId: string;
  readonly severity: 1 | 2;
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

export interface FileDiagnosticResult {
  readonly filePath: string;
  readonly messages: readonly DiagnosticMessage[];
  readonly errorCount: number;
  readonly warningCount: number;
}

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}
