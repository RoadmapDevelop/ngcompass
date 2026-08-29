import process from 'node:process';
import type { ReporterOutput, TestOutput } from '../models/index.js';
export const processOutput: ReporterOutput = {
  write(line: string): void {
    process.stdout.write(line + '\n');
  },

  error(line: string): void {
    process.stderr.write(line + '\n');
  },
};

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
