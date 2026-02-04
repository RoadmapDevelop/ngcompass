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

// Coverage thresholds (must match vitest.config.ts)
const thresholds = {
    lines: 90,
    functions: 90,
    branches: 85,
    statements: 90,
};

// Module-specific thresholds (optional overrides)
const moduleThresholds = {
    'packages/core/src/scanner': {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
    },
    'packages/common': {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
    },
    'packages/core/src/cache': {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
    },
    'packages/core/src/config': {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
    },
    'packages/reporters': {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
    },
    'packages/cli': {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
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
    console.log(colorize('\n📊 Coverage Threshold Check\n', colors.bold));

    const coverageReport = readCoverageReport();
    const total = coverageReport.total;

    let failures = [];
    let passes = [];

    // Check global thresholds
    console.log(colorize('Global Coverage:', colors.bold));

    for (const [metric, threshold] of Object.entries(thresholds)) {
        const actual = total[metric].pct;
        const result = checkThreshold(actual, threshold, metric.padEnd(12));

        console.log(`  ${result.message}`);

        if (result.passed) {
            passes.push(`global.${metric}`);
        } else {
            failures.push(`Global ${metric}: ${actual.toFixed(2)}% < ${threshold}%`);
        }
    }

    // Check module-specific thresholds
    if (Object.keys(moduleThresholds).length > 0) {
        console.log(colorize('\n\nModule-Specific Coverage:', colors.bold));

        for (const [modulePath, moduleThresh] of Object.entries(moduleThresholds)) {
            const moduleKey = Object.keys(coverageReport).find(key =>
                key.includes(modulePath.replace(/\\/g, '/'))
            );

            if (!moduleKey) {
                console.log(colorize(`\n  ${modulePath}: No coverage data found`, colors.yellow));
                continue;
            }

            console.log(colorize(`\n  ${modulePath}:`, colors.cyan));
            const moduleData = coverageReport[moduleKey];

            for (const [metric, threshold] of Object.entries(moduleThresh)) {
                const actual = moduleData[metric]?.pct ?? 0;
                const result = checkThreshold(actual, threshold, `    ${metric.padEnd(12)}`);

                console.log(`  ${result.message}`);

                if (result.passed) {
                    passes.push(`${modulePath}.${metric}`);
                } else {
                    failures.push(`${modulePath} ${metric}: ${actual.toFixed(2)}% < ${threshold}%`);
                }
            }
        }
    }

    // Summary
    console.log(colorize('\n\n─────────────────────────────────────', colors.gray));

    if (failures.length === 0) {
        console.log(colorize('✅ All coverage thresholds met!', colors.green + colors.bold));
        console.log(colorize(`\n   Lines:      ${total.lines.pct.toFixed(2)}%`, colors.green));
        console.log(colorize(`   Functions:  ${total.functions.pct.toFixed(2)}%`, colors.green));
        console.log(colorize(`   Branches:   ${total.branches.pct.toFixed(2)}%`, colors.green));
        console.log(colorize(`   Statements: ${total.statements.pct.toFixed(2)}%`, colors.green));
        console.log(colorize(`\n   Total checks passed: ${passes.length}\n`, colors.gray));
        process.exit(0);
    } else {
        console.log(colorize('❌ Coverage thresholds not met:', colors.red + colors.bold));
        console.log();
        failures.forEach(failure => {
            console.log(colorize(`   • ${failure}`, colors.red));
        });
        console.log(colorize(`\n   Failures: ${failures.length}`, colors.red));
        console.log(colorize(`   Passes:   ${passes.length}`, colors.gray));
        console.log(colorize('\n   Run tests with coverage to improve:', colors.cyan));
        console.log(colorize('   pnpm test:coverage\n', colors.cyan));
        process.exit(1);
    }
}

// Run the check
checkCoverage();
