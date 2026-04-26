#!/usr/bin/env node

/**
 * Coverage Threshold Checker
 *
 * Validates that code coverage meets minimum thresholds.
 * Exits with code 1 if any threshold is not met.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Coverage thresholds (must match vitest.config.ts) — Beta baselines
const thresholds = {
    lines: 40,
    functions: 40,
    branches: 25,
    statements: 40,
};

// Module-specific thresholds (optional overrides) — Beta baselines
const moduleThresholds = {
    'packages/scanner': {
        lines: 40,
        functions: 40,
        branches: 25,
        statements: 40,
    },
    'packages/common': {
        lines: 40,
        functions: 40,
        branches: 25,
        statements: 40,
    },
    'packages/cache': {
        lines: 40,
        functions: 40,
        branches: 25,
        statements: 40,
    },
    'packages/config': {
        lines: 40,
        functions: 40,
        branches: 25,
        statements: 40,
    },
    'packages/reporters': {
        lines: 40,
        functions: 40,
        branches: 25,
        statements: 40,
    },
    'packages/cli': {
        lines: 40,
        functions: 40,
        branches: 25,
        statements: 40,
    },
};

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
};

function colorize(text, color) {
    return `${color}${text}${colors.reset}`;
}

function writeLine(line = '') {
    process.stdout.write(`${line}\n`);
}

function readCoverageReport() {
    const coveragePath = path.join(__dirname, '../coverage/coverage-summary.json');

    if (!fs.existsSync(coveragePath)) {
        console.error(colorize('❌ Coverage report not found', colors.red));
        console.error(colorize(`Expected at: ${coveragePath}`, colors.gray));
        console.error(colorize('\nRun: pnpm test:coverage', colors.cyan));
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(coveragePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(colorize('❌ Failed to read coverage report', colors.red));
        console.error(colorize(error.message, colors.gray));
        process.exit(1);
    }
}

function checkThreshold(actual, threshold, metric) {
    if (actual < threshold) {
        return {
            passed: false,
            message: `${metric}: ${colorize(actual.toFixed(2) + '%', colors.red)} < ${colorize(threshold + '%', colors.yellow)} ${colorize('✗', colors.red)}`,
        };
    }
    return {
        passed: true,
        message: `${metric}: ${colorize(actual.toFixed(2) + '%', colors.green)} ≥ ${colorize(threshold + '%', colors.gray)} ${colorize('✓', colors.green)}`,
    };
}

function checkCoverage() {
    writeLine(colorize('\n📊 Coverage Threshold Check\n', colors.bold));

    const coverageReport = readCoverageReport();
    const total = coverageReport.total;

    let failures = [];
    let passes = [];

    // Check global thresholds
    writeLine(colorize('Global Coverage:', colors.bold));

    for (const [metric, threshold] of Object.entries(thresholds)) {
        const actual = total[metric].pct;
        const result = checkThreshold(actual, threshold, metric.padEnd(12));

        writeLine(`  ${result.message}`);

        if (result.passed) {
            passes.push(`global.${metric}`);
        } else {
            failures.push(`Global ${metric}: ${actual.toFixed(2)}% < ${threshold}%`);
        }
    }

    // Check module-specific thresholds
    if (Object.keys(moduleThresholds).length > 0) {
        writeLine(colorize('\n\nModule-Specific Coverage:', colors.bold));

        for (const [modulePath, moduleThresh] of Object.entries(moduleThresholds)) {
            const moduleKey = Object.keys(coverageReport).find(key =>
                key.includes(modulePath.replace(/\\/g, '/'))
            );

            if (!moduleKey) {
                writeLine(colorize(`\n  ${modulePath}: No coverage data found`, colors.yellow));
                continue;
            }

            writeLine(colorize(`\n  ${modulePath}:`, colors.cyan));
            const moduleData = coverageReport[moduleKey];

            for (const [metric, threshold] of Object.entries(moduleThresh)) {
                const actual = moduleData[metric]?.pct ?? 0;
                const result = checkThreshold(actual, threshold, `    ${metric.padEnd(12)}`);

                writeLine(`  ${result.message}`);

                if (result.passed) {
                    passes.push(`${modulePath}.${metric}`);
                } else {
                    failures.push(`${modulePath} ${metric}: ${actual.toFixed(2)}% < ${threshold}%`);
                }
            }
        }
    }

    // Summary
    writeLine(colorize('\n\n─────────────────────────────────────', colors.gray));

    if (failures.length === 0) {
        writeLine(colorize('✅ All coverage thresholds met!', colors.green + colors.bold));
        writeLine(colorize(`\n   Lines:      ${total.lines.pct.toFixed(2)}%`, colors.green));
        writeLine(colorize(`   Functions:  ${total.functions.pct.toFixed(2)}%`, colors.green));
        writeLine(colorize(`   Branches:   ${total.branches.pct.toFixed(2)}%`, colors.green));
        writeLine(colorize(`   Statements: ${total.statements.pct.toFixed(2)}%`, colors.green));
        writeLine(colorize(`\n   Total checks passed: ${passes.length}\n`, colors.gray));
        process.exit(0);
    } else {
        writeLine(colorize('❌ Coverage thresholds not met:', colors.red + colors.bold));
        writeLine();
        failures.forEach(failure => {
            writeLine(colorize(`   • ${failure}`, colors.red));
        });
        writeLine(colorize(`\n   Failures: ${failures.length}`, colors.red));
        writeLine(colorize(`   Passes:   ${passes.length}`, colors.gray));
        writeLine(colorize('\n   Run tests with coverage to improve:', colors.cyan));
        writeLine(colorize('   pnpm test:coverage\n', colors.cyan));
        process.exit(1);
    }
}

// Run the check
checkCoverage();
