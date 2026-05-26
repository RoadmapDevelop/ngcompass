import process from 'node:process';

export interface ReporterOutput {
  write(line: string): void;
  error(line: string): void;
}

export const processOutput: ReporterOutput = {
  write(line: string): void {
    process.stdout.write(line + '\n');
  },

  error(line: string): void {
    process.stderr.write(line + '\n');
  },
};

export interface TestOutput {
  readonly output: ReporterOutput;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
}

export function createTestOutput(): TestOutput {
  const lines: string[] = [];
  const errors: string[] = [];

  const output: ReporterOutput = {
    write(line: string): void {
      lines.push(line);
    },
    error(line: string): void {
      errors.push(line);
    },
  };

  return { output, lines, errors };
}
