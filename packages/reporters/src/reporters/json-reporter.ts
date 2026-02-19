/**
 * JsonReporter
 *
 * Emits ESLint-compatible JSON output for CI pipeline integration.
 *
 * Compatible with tools that consume ESLint JSON output:
 *  - GitHub Actions problem matchers
 *  - Reviewdog
 *  - SonarQube ESLint bridge
 *  - VS Code ESLint extension
 *
 * Output format:
 * ```json
 * [
 *   {
 *     "filePath": "/abs/path/to/file.ts",
 *     "messages": [
 *       {
 *         "ruleId": "prefer-on-push-component-change-detection",
 *         "severity": 2,
 *         "message": "Component 'Foo' should use ChangeDetectionStrategy.OnPush",
 *         "line": 5,
 *         "column": 1
 *       }
 *     ],
 *     "errorCount": 1,
 *     "warningCount": 0
 *   }
 * ]
 * ```
 *
 * Severity mapping:
 *  - critical / high / error  → 2 (ESLint error)
 *  - moderate / low / warning → 1 (ESLint warning)
 *  - info                     → 1 (ESLint warning)
 */

import type { Reporter, ResultSummary } from '../types.js';
import type { RuleResult } from '@ngcompass/core';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';

// ============================================
// ESLint JSON TYPES
// ============================================

interface EslintMessage {
    ruleId: string;
    severity: 1 | 2;
    message: string;
    line: number;
    column: number;
}

interface EslintFileResult {
    filePath: string;
    messages: EslintMessage[];
    errorCount: number;
    warningCount: number;
}

// ============================================
// REPORTER
// ============================================

export class JsonReporter implements Reporter {
    constructor(private readonly out: ReporterOutput = processOutput) {}

    report(results: RuleResult[]): void {
        // Group failures by file path
        const byFile = new Map<string, EslintMessage[]>();

        for (const result of results) {
            for (const failure of result.failures) {
                const messages = byFile.get(failure.filePath) ?? [];
                messages.push({
                    ruleId: failure.ruleName,
                    severity: this.toEslintSeverity(failure.severity as string),
                    message: failure.message,
                    line: failure.line,
                    column: failure.column,
                });
                byFile.set(failure.filePath, messages);
            }
        }

        // Build ESLint file result array
        const output: EslintFileResult[] = Array.from(byFile.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([filePath, messages]) => {
                // Sort messages by line/column
                messages.sort((a, b) =>
                    a.line === b.line ? a.column - b.column : a.line - b.line
                );
                return {
                    filePath,
                    messages,
                    errorCount: messages.filter(m => m.severity === 2).length,
                    warningCount: messages.filter(m => m.severity === 1).length,
                };
            });

        this.out.write(JSON.stringify(output, null, 2));
    }

    summary(_stats: ResultSummary): void {
        // No summary for JSON format — consumers parse the JSON array directly
    }

    error(err: Error): void {
        // Emit errors as a JSON object so consumers can detect tool failures
        this.out.error(JSON.stringify({ error: err.message }, null, 2));
    }

    private toEslintSeverity(severity: string): 1 | 2 {
        switch (severity) {
            case 'critical':
            case 'high':
            case 'error':
                return 2;
            default:
                return 1;
        }
    }
}
