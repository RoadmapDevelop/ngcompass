export interface ReporterOutput {
  write(line: string): void;
  error(line: string): void;
}

export interface TestOutput {
  readonly output: ReporterOutput;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
}

export interface SourceReader {
  readLines(filePath: string): string[];
}
