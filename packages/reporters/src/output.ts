import process from 'node:process';

export interface ReporterOutput {
    write(line: string): void;
    error(line: string): void;
}

export const processOutput: ReporterOutput = {
    write: (line) => process.stdout.write(line + '\n'),
    error: (line) => process.stderr.write(line + '\n'),
};

export interface TestOutput {
    readonly output: ReporterOutput;
    readonly lines: string[];
    readonly errors: string[];
}

export function createTestOutput(): TestOutput {
    const lines: string[] = [];
    const errors: string[] = [];
    return {
        output: {
            write: (line) => { lines.push(line); },
            error: (line) => { errors.push(line); },
        },
        lines,
        errors,
    };
}
