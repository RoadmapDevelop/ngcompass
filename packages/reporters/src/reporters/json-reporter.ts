import type { EslintFileResult, EslintMessage, Reporter, ResultSummary, RuleResult, RuleSeverity } from '../types.js';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';

function toEslintSeverity(severity: RuleSeverity): 1 | 2 {
    return severity === 'critical' || severity === 'high' || severity === 'error' ? 2 : 1;
}

function toEslintOutput(results: RuleResult[]): EslintFileResult[] {
    const byFile = new Map<string, EslintMessage[]>();

    for (const result of results) {
        for (const failure of result.failures) {
            let messages = byFile.get(failure.filePath);
            if (!messages) {
                messages = [];
                byFile.set(failure.filePath, messages);
            }
            messages.push({
                ruleId: failure.ruleName,
                severity: toEslintSeverity(failure.severity as RuleSeverity),
                message: failure.message,
                line: failure.line,
                column: failure.column,
            });
        }
    }

    return Array.from(byFile.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([filePath, messages]) => {
            messages.sort((a, b) => a.line !== b.line ? a.line - b.line : a.column - b.column);
            return {
                filePath,
                messages,
                errorCount: messages.filter(m => m.severity === 2).length,
                warningCount: messages.filter(m => m.severity === 1).length,
            };
        });
}

export class JsonReporter implements Reporter {
    constructor(private readonly out: ReporterOutput = processOutput) { }

    report(results: RuleResult[]): void {
        this.out.write(JSON.stringify(toEslintOutput(results), null, 2));
    }

    summary(_stats: ResultSummary): void { }

    error(err: Error): void {
        this.out.error(JSON.stringify({ error: err.message }, null, 2));
    }

    step(_message: string): void { }
    info(_message: string): void { }
    debug(_message: string): void { }
    parseErrors(_errors: { filePath: string; message: string }[]): void { }
}
