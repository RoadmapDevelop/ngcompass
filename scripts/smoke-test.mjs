#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'packages', 'cli', 'dist', 'cli.js');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgCyan: '\x1b[46m',
  black: '\x1b[30m',
};

const paint = (text, ...codes) => `${codes.join('')}${text}${c.reset}`;
const w = (line = '') => process.stdout.write(`${line}\n`);

function runCli(args, cwd = ROOT) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      resolve({
        exitCode: code ?? 0,
        stdout,
        stderr,
        combined: stdout + stderr,
      });
    });

    proc.on('error', (err) => {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: err.message,
        combined: err.message,
      });
    });
  });
}

const VERSION_RE = /v?\d+\.\d+\.\d+/;
const CRASH_RE =
  /\[ngcompass\] (Fatal error|Unexpected error|Unhandled promise rejection)/;

const INIT_TMP = path.join(os.tmpdir(), `ngcompass-smoke-${process.pid}`);
fs.mkdirSync(INIT_TMP, { recursive: true });

const FIXTURE_TMP = path.join(os.tmpdir(), `ngcompass-fixture-${process.pid}`);

async function setupFixture() {
  fs.mkdirSync(path.join(FIXTURE_TMP, 'src'), { recursive: true });

  await runCli(['init', '--cwd', FIXTURE_TMP, '--force']);

  fs.writeFileSync(
    path.join(FIXTURE_TMP, 'src', 'app.component.ts'),
    [
      `import { Component } from '@angular/core';`,
      `@Component({`,
      `    selector: 'app-root',`,
      `    template: '<ul><li *ngFor="let x of items">{{x}}</li></ul>'`,
      `})`,
      `export class AppComponent { items = [1, 2, 3]; }`,
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(FIXTURE_TMP, 'src', 'utils.ts'),
    `export function add(a: number, b: number): number { return a + b; }\n`
  );
}

const ZERO_ANGULAR_TMP = path.join(
  os.tmpdir(),
  `ngcompass-zero-${process.pid}`
);

const BASELINE_TMP = path.join(
  os.tmpdir(),
  `ngcompass-baseline-${process.pid}`
);

const BASELINE_FILE = path.join(BASELINE_TMP, '.ngcompass', 'baseline.json');

const BASELINE_RULE = 'template-prefer-control-flow';

const BASELINE_SOURCES = [
  ['legacy.component.ts', 'app-legacy', 'LegacyComponent'],
  ['widget.component.ts', 'app-widget', 'WidgetComponent'],
];

function writeBaselineComponent(fileName, selector, className) {
  fs.writeFileSync(
    path.join(BASELINE_TMP, 'src', fileName),
    [
      `import { Component } from '@angular/core';`,
      `@Component({`,
      `  selector: '${selector}',`,
      `  template: '<ul><li *ngFor="let x of items">{{ x }}</li></ul>',`,
      `})`,
      `export class ${className} {`,
      `  items = [1, 2, 3];`,
      `}`,
    ].join('\n')
  );
}

async function setupBaselineFixture() {
  fs.mkdirSync(path.join(BASELINE_TMP, 'src'), { recursive: true });

  fs.writeFileSync(
    path.join(BASELINE_TMP, 'ngcompass.config.ts'),
    [
      `import { defineConfig } from '@ngcompass/config';`,
      ``,
      `export default defineConfig({`,
      `  include: ['**/*.ts'],`,
      `  exclude: ['**/node_modules/**'],`,
      `  rules: {`,
      `    '${BASELINE_RULE}': 'error',`,
      `  },`,
      `});`,
    ].join('\n')
  );

  for (const [fileName, selector, className] of BASELINE_SOURCES) {
    writeBaselineComponent(fileName, selector, className);
  }
}

function countBaselinedViolations() {
  const parsed = readJsonFile(BASELINE_FILE);
  let total = 0;
  for (const counts of Object.values(parsed.entries)) {
    for (const count of Object.values(counts)) total += count;
  }
  return total;
}

function countReportedViolations(stdout) {
  return JSON.parse(stdout.trim()).summary.totalViolations;
}

function baselineHasFile(fileName) {
  const entries = readJsonFile(BASELINE_FILE).entries;
  return Object.keys(entries).some((file) => file.endsWith(fileName));
}

const CYCLE_TMP = path.join(os.tmpdir(), `ngcompass-cycle-${process.pid}`);

async function setupCycleFixture() {
  fs.mkdirSync(path.join(CYCLE_TMP, 'src'), { recursive: true });

  await runCli(['init', '--cwd', CYCLE_TMP, '--force']);

  fs.writeFileSync(
    path.join(CYCLE_TMP, 'src', 'alpha.ts'),
    [
      `import { beta } from './beta.js';`,
      `export const alpha = (): number => beta() + 1;`,
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(CYCLE_TMP, 'src', 'beta.ts'),
    [
      `import { alpha } from './alpha.js';`,
      `export const beta = (): number => (alpha ? 2 : 3);`,
    ].join('\n')
  );
}

const FIXTURE_ENTRY = 'src/app.component.ts';

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseJsonStdout(stdout, label) {
  try {
    return { value: JSON.parse(stdout.trim()) };
  } catch {
    return { error: `${label} is not valid JSON: ${stdout.slice(0, 200)}` };
  }
}

const tests = [
  {
    name: '--version → prints version and exits 0',
    args: ['--version'],
    exitCodes: [0],
    stdout: [VERSION_RE],
  },
  {
    name: '--help → shows top-level help with command list',
    args: ['--help'],
    exitCodes: [0],
    stdout: [
      /ngcompass/i,
      /analyze/,
      /rules/,
      /cache/,
      /init/,
      /baseline/,
      /circular/,
      /complexity/,
      /graph/,
      /visualize/,
    ],
  },

  {
    name: 'analyze --help → documents every flag',
    args: ['analyze', '--help'],
    exitCodes: [0],
    stdout: [
      /--format/,
      /--compact/,
      /--quiet/,
      /--force/,
      /--skip-type-check/,
      /--max-workers/,
      /--baseline/,
      /--no-baseline/,
    ],
  },
  {
    name: 'rules --help → shows --preset flag',
    args: ['rules', '--help'],
    exitCodes: [0],
    stdout: [/--preset/],
  },
  {
    name: 'cache --help → lists subcommands',
    args: ['cache', '--help'],
    exitCodes: [0],
    stdout: [/clear|info|path/i],
  },
  {
    name: 'config --help → lists subcommands',
    args: ['config', '--help'],
    exitCodes: [0],
    stdout: [/health/i],
  },
  {
    name: 'baseline --help → lists every subcommand',
    args: ['baseline', '--help'],
    exitCodes: [0],
    stdout: [/create/, /update/, /prune/, /show/],
  },
  {
    name: 'baseline create --help → documents every flag',
    args: ['baseline', 'create', '--help'],
    exitCodes: [0],
    stdout: [
      /--profile/,
      /--path/,
      /--rule/,
      /--force/,
      /--skip-type-check/,
      /--max-workers/,
    ],
  },
  {
    name: 'init --help → shows --force and --cwd flags',
    args: ['init', '--help'],
    exitCodes: [0],
    stdout: [/--force/, /--cwd/],
  },
  {
    name: 'circular --help → documents every flag',
    args: ['circular', '--help'],
    exitCodes: [0],
    stdout: [/--profile/, /--force/, /--format/, /--focus/, /--depth/, /--output/],
  },
  {
    name: 'complexity --help → documents every flag',
    args: ['complexity', '--help'],
    exitCodes: [0],
    stdout: [/--profile/, /--force/, /--min/, /--sort/, /--output/, /--stdout/],
  },
  {
    name: 'graph --help → documents every flag',
    args: ['graph', '--help'],
    exitCodes: [0],
    stdout: [/--profile/, /--force/, /--focus/, /--depth/, /--output/, /--stdout/],
  },
  {
    name: 'visualize --help → documents argument and every flag',
    args: ['visualize', '--help'],
    exitCodes: [0],
    stdout: [/<file>/, /--format/, /--output/, /--stdout/],
  },

  {
    name: 'banner: analyze → ANALYZE label + version + cwd on stdout',
    args: ['analyze', '--skip-type-check', '--quiet'],
    exitCodes: [0, 1],
    stdout: [/ANALYZE/, VERSION_RE],
    notCombined: [CRASH_RE],
  },
  {
    name: 'banner: rules → RULES label + version on stdout',
    args: ['rules'],
    exitCodes: [0],
    stdout: [/RULES/, VERSION_RE],
  },
  {
    name: 'banner: cache info → CACHE label on stdout',
    args: ['cache', 'info'],
    exitCodes: [0],
    stdout: [/CACHE/, VERSION_RE],
  },
  {
    name: 'banner: init → INIT label on stdout',
    args: ['init', '--cwd', INIT_TMP, '--force'],
    exitCodes: [0],
    stdout: [/INIT/, VERSION_RE],
  },
  {
    name: 'banner: circular → CIRCULAR label + version on stdout',
    args: ['circular'],
    exitCodes: [0, 1],
    cwd: FIXTURE_TMP,
    stdout: [/CIRCULAR/, VERSION_RE],
    notCombined: [CRASH_RE],
  },
  {
    name: 'banner: complexity → COMPLEXITY label + version on stdout',
    args: ['complexity'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    stdout: [/COMPLEXITY/, VERSION_RE],
    notCombined: [CRASH_RE],
  },
  {
    name: 'banner: graph → GRAPH label + version on stdout',
    args: ['graph'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    stdout: [/GRAPH/, VERSION_RE],
    notCombined: [CRASH_RE],
  },
  {
    name: 'banner: visualize → VISUALIZE label + version on stdout',
    args: ['visualize', FIXTURE_ENTRY],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    stdout: [/VISUALIZE/, VERSION_RE],
    notCombined: [CRASH_RE],
  },
  {
    name: 'banner: absent for circular --format json',
    args: ['circular', '--format', 'json'],
    exitCodes: [0, 1],
    cwd: FIXTURE_TMP,
    validate: (r) => {
      if (/CIRCULAR/.test(r.stdout)) return 'banner leaked into JSON stdout';
      return null;
    },
  },
  {
    name: 'banner: absent for complexity --stdout',
    args: ['complexity', '--stdout'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    validate: (r) => {
      if (/COMPLEXITY/.test(r.stdout)) return 'banner leaked into JSON stdout';
      return null;
    },
  },
  {
    name: 'banner: absent for graph --stdout',
    args: ['graph', '--stdout'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    validate: (r) => {
      if (/GRAPH/.test(r.stdout)) return 'banner leaked into JSON stdout';
      return null;
    },
  },
  {
    name: 'banner: absent for visualize --stdout',
    args: ['visualize', FIXTURE_ENTRY, '--stdout'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    validate: (r) => {
      if (/VISUALIZE/.test(r.stdout)) return 'banner leaked into JSON stdout';
      return null;
    },
  },
  {
    name: 'banner: absent for --format json (no banner leaking into JSON stdout)',
    args: ['analyze', '--format', 'json', '--skip-type-check'],
    exitCodes: [0, 1],
    validate: (r) => {
      if (/ANALYZE/.test(r.stdout)) return 'banner leaked into JSON stdout';
      return null;
    },
  },
  {
    name: 'banner: absent for --format sarif (no banner leaking into SARIF stdout)',
    args: ['analyze', '--format', 'sarif', '--skip-type-check'],
    exitCodes: [0, 1],
    validate: (r) => {
      if (/ANALYZE/.test(r.stdout)) return 'banner leaked into SARIF stdout';
      return null;
    },
  },

  {
    name: 'analyze → runs without crash',
    args: ['analyze', '--skip-type-check'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
  },
  {
    name: 'analyze --compact → compact output mode',
    args: ['analyze', '--compact', '--skip-type-check'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
  },
  {
    name: 'analyze --quiet → suppresses violation detail',
    args: ['analyze', '--quiet', '--skip-type-check'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
  },
  {
    name: 'analyze --force → bypasses cache',
    args: ['analyze', '--force', '--skip-type-check'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
  },
  {
    name: 'analyze --no-recommendation → suppresses fix suggestions',
    args: ['analyze', '--no-recommendation', '--skip-type-check'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
  },
  {
    name: 'analyze --max-workers 1 → single worker thread',
    args: ['analyze', '--max-workers', '1', '--skip-type-check'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
  },
  {
    name: 'analyze --compact --quiet → combined flags',
    args: ['analyze', '--compact', '--quiet', '--skip-type-check'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
  },
  {
    name: 'analyze --force --quiet --max-workers 2 → combined flags',
    args: [
      'analyze',
      '--force',
      '--quiet',
      '--max-workers',
      '2',
      '--skip-type-check',
    ],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
  },
  {
    name: 'analyze --format json → stdout is valid JSON (object with results array)',
    args: ['analyze', '--format', 'json', '--skip-type-check'],
    exitCodes: [0, 1],
    validate: (r) => {
      if (!r.stdout.trim()) return null;
      try {
        const parsed = JSON.parse(r.stdout.trim());
        if (!parsed || typeof parsed !== 'object')
          return `stdout is not a JSON object, got: ${typeof parsed}`;
        if (!Array.isArray(parsed.results))
          return `JSON output missing 'results' array`;
        return null;
      } catch (e) {
        return `stdout is not valid JSON: ${r.stdout.slice(0, 200)}`;
      }
    },
  },
  {
    name: 'analyze --format sarif → stdout is valid SARIF JSON',
    args: ['analyze', '--format', 'sarif', '--skip-type-check'],
    exitCodes: [0, 1],
    validate: (r) => {
      if (!r.stdout.trim()) return null;
      try {
        const parsed = JSON.parse(r.stdout.trim());
        if (!parsed.$schema) return 'SARIF output missing $schema';
        if (!parsed.$schema.includes('sarif'))
          return `$schema does not reference sarif: ${parsed.$schema}`;
        if (!Array.isArray(parsed.runs))
          return 'SARIF output missing runs array';
        return null;
      } catch {
        return `stdout is not valid SARIF JSON: ${r.stdout.slice(0, 200)}`;
      }
    },
  },
  {
    name: 'analyze --format json --force → fresh JSON analysis',
    args: ['analyze', '--format', 'json', '--force', '--skip-type-check'],
    exitCodes: [0, 1],
    validate: (r) => {
      if (!r.stdout.trim()) return null;
      try {
        JSON.parse(r.stdout.trim());
        return null;
      } catch {
        return `stdout is not valid JSON: ${r.stdout.slice(0, 200)}`;
      }
    },
  },

  {
    name: 'rules → lists all available rules',
    args: ['rules'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
    combined: [/rule/i],
  },
  {
    name: 'rules --preset recommended',
    args: ['rules', '--preset', 'recommended'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'rules --preset strict',
    args: ['rules', '--preset', 'strict'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'rules --preset performance',
    args: ['rules', '--preset', 'performance'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'rules --preset reactivity',
    args: ['rules', '--preset', 'reactivity'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'rules --preset all',
    args: ['rules', '--preset', 'all'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'rules prefer-on-push-component-change-detection → single rule detail',
    args: ['rules', 'prefer-on-push-component-change-detection'],
    exitCodes: [0],
    combined: [/prefer-on-push/i],
    notCombined: [CRASH_RE],
  },
  {
    name: 'rules --preset invalid → exit 1 with error message',
    args: ['rules', '--preset', 'totally-unknown-xyz'],
    exitCodes: [1],
    combined: [/Unknown preset/i],
  },
  {
    name: 'rules non-existent-rule → exit 1 with "not found"',
    args: ['rules', 'this-rule-does-not-exist-abc123'],
    exitCodes: [1],
    combined: [/not found/i],
  },

  {
    name: 'cache info → shows cache statistics',
    args: ['cache', 'info'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'cache path → prints a non-empty path',
    args: ['cache', 'path'],
    exitCodes: [0],
    stdout: [/.+/],
    notCombined: [CRASH_RE],
  },
  {
    name: 'cache clear (default = all types)',
    args: ['cache', 'clear'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'cache clear --type ast',
    args: ['cache', 'clear', '--type', 'ast'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'cache clear --type config',
    args: ['cache', 'clear', '--type', 'config'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'cache clear --type results',
    args: ['cache', 'clear', '--type', 'results'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'cache clear --type all',
    args: ['cache', 'clear', '--type', 'all'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'cache clear --type invalid → exit 1 with error',
    args: ['cache', 'clear', '--type', 'totally-invalid'],
    exitCodes: [1],
    combined: [/Invalid cache type/i],
  },

  {
    name: 'config health → validates active config without crash',
    args: ['config', 'health'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
  },

  {
    name: 'init --cwd <tmpdir> → creates a config file',
    args: ['init', '--cwd', INIT_TMP, '--force'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
    validate: () => {
      const candidates = [
        path.join(INIT_TMP, 'ngcompass.config.json'),
        path.join(INIT_TMP, 'ngcompass.config.ts'),
        path.join(INIT_TMP, 'ngcompass.config.js'),
      ];
      if (candidates.some((f) => fs.existsSync(f))) return null;
      return `no config file created in ${INIT_TMP} (checked: ${candidates.map(path.basename).join(', ')})`;
    },
  },
  {
    name: 'init --force --cwd <tmpdir> → overwrites existing config',
    args: ['init', '--force', '--cwd', INIT_TMP],
    exitCodes: [0],
    notCombined: [CRASH_RE],
  },
  {
    name: 'init (no --force) when config exists → warns "Already exists", exits 0',
    args: ['init', '--cwd', INIT_TMP],
    exitCodes: [0],
    combined: [/already exists/i],
    notCombined: [CRASH_RE],
  },

  {
    name: 'rules --preset security → lists security rules without crash',
    args: ['rules', '--preset', 'security'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
    combined: [/no-bypass-sanitization|template-no-unsafe-bindings/i],
  },
  {
    name: 'rules --preset ssr → lists ssr rules without crash',
    args: ['rules', '--preset', 'ssr'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
    combined: [/no-document-access|prefer-after-render/i],
  },

  {
    name: 'analyze --quiet → suppresses per-file violation block, keeps summary',
    args: ['analyze', '--skip-type-check', '--quiet'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
    cwd: FIXTURE_TMP,
    validate: (r) => {
      if (r.exitCode !== 1) return null;
      if (/\bFAIL\b.*\.ts/.test(r.stdout))
        return '--quiet still shows per-file FAIL block in stdout';
      if (!/violation/.test(r.stdout))
        return '--quiet output is missing the summary "violation" count';
      return null;
    },
  },
  {
    name: 'analyze --no-recommendation → omits » fix suggestions',
    args: ['analyze', '--skip-type-check', '--no-recommendation'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
    cwd: FIXTURE_TMP,
    validate: (r) => {
      if (r.exitCode !== 1) return null;

      if (/»/.test(r.stdout))
        return '--no-recommendation still shows » fix suggestion in stdout';
      return null;
    },
  },
  {
    name: 'analyze --format html → writes ngcompass-report.html to cwd',
    args: ['analyze', '--skip-type-check', '--format', 'html'],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
    cwd: FIXTURE_TMP,
    validate: () => {
      const htmlFile = path.join(FIXTURE_TMP, 'ngcompass-report.html');
      if (!fs.existsSync(htmlFile))
        return `ngcompass-report.html was not created in ${FIXTURE_TMP}`;
      const size = fs.statSync(htmlFile).size;
      if (size < 100)
        return `ngcompass-report.html exists but is suspiciously small (${size} bytes)`;
      return null;
    },
  },
  {
    name: 'analyze --format html --output <custom> → writes to specified path',
    args: [
      'analyze',
      '--skip-type-check',
      '--format',
      'html',
      '--output',
      path.join(FIXTURE_TMP, 'custom-report.html'),
    ],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
    cwd: FIXTURE_TMP,
    validate: () => {
      const htmlFile = path.join(FIXTURE_TMP, 'custom-report.html');
      if (!fs.existsSync(htmlFile)) return `custom-report.html was not created`;
      return null;
    },
  },
  {
    name: 'analyze --rule <id> → runs exactly one rule, filters the rest',
    args: [
      'analyze',
      '--skip-type-check',
      '--rule',
      'template-trackby-required',
    ],
    exitCodes: [0, 1],
    notCombined: [CRASH_RE],
    cwd: FIXTURE_TMP,
    combined: [/1 (check|rule|active)/i],
  },

  {
    name: 'analyze on dir with zero Angular files → exit 0, no crash',
    args: ['analyze', '--skip-type-check'],
    exitCodes: [0],
    notCombined: [CRASH_RE],
    cwd: ZERO_ANGULAR_TMP,
    validate: (r) => {
      if (CRASH_RE.test(r.combined))
        return 'crash detected in zero-Angular-files project';
      return null;
    },
  },

  {
    name: 'circular → exit 0 on a project with no cycles',
    args: ['circular'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    combined: [/No circular dependencies found/i],
  },
  {
    name: 'circular → exit 1 and reports the cycle on a cyclic project',
    args: ['circular'],
    exitCodes: [1],
    cwd: CYCLE_TMP,
    notCombined: [CRASH_RE],
    combined: [/Found 1 circular dependency/i, /alpha\.ts/, /beta\.ts/],
  },
  {
    name: 'circular --format json → stdout is a graph with cycles array',
    args: ['circular', '--format', 'json'],
    exitCodes: [1],
    cwd: CYCLE_TMP,
    validate: (r) => {
      const parsed = parseJsonStdout(r.stdout, 'circular --format json stdout');
      if (parsed.error) return parsed.error;
      const graph = parsed.value;
      if (!Array.isArray(graph.nodes)) return 'JSON output missing nodes array';
      if (!Array.isArray(graph.edges)) return 'JSON output missing edges array';
      if (graph.cycleCount !== 1)
        return `expected cycleCount 1, got ${graph.cycleCount}`;
      if (!Array.isArray(graph.cycles) || graph.cycles.length !== 1)
        return 'JSON output missing the detected cycle';
      return null;
    },
  },
  {
    name: 'circular --focus <file> --depth 1 → still detects the local cycle',
    args: ['circular', '--focus', 'src/alpha.ts', '--depth', '1'],
    exitCodes: [1],
    cwd: CYCLE_TMP,
    notCombined: [CRASH_RE],
    combined: [/alpha\.ts/],
  },
  {
    name: 'circular --focus <unknown> → exit 1 with no-match error',
    args: ['circular', '--focus', 'this-file-does-not-exist-xyz.ts'],
    exitCodes: [1],
    cwd: CYCLE_TMP,
    combined: [/no file in the import graph matches/i],
  },
  {
    name: 'circular --depth <invalid> → exit 1 with validation error',
    args: ['circular', '--depth', 'abc'],
    exitCodes: [1],
    cwd: CYCLE_TMP,
    combined: [/--depth must be a non-negative integer/i],
  },
  {
    name: 'circular --format json --output <path> → writes the graph to a file',
    args: [
      'circular',
      '--format',
      'json',
      '--output',
      path.join(CYCLE_TMP, 'circular-report.json'),
    ],
    exitCodes: [1],
    cwd: CYCLE_TMP,
    notCombined: [CRASH_RE],
    validate: () => {
      const file = path.join(CYCLE_TMP, 'circular-report.json');
      if (!fs.existsSync(file)) return 'circular-report.json was not created';
      const parsed = readJsonFile(file);
      if (parsed.cycleCount !== 1)
        return `exported file has cycleCount ${parsed.cycleCount}, expected 1`;
      return null;
    },
  },

  {
    name: 'complexity → writes ngcompass-complexity.json with a summary',
    args: ['complexity'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    prepare: () =>
      fs.rmSync(path.join(FIXTURE_TMP, 'ngcompass-complexity.json'), {
        force: true,
      }),
    validate: () => {
      const file = path.join(FIXTURE_TMP, 'ngcompass-complexity.json');
      if (!fs.existsSync(file))
        return 'ngcompass-complexity.json was not created';
      const parsed = readJsonFile(file);
      if (!parsed.summary) return 'complexity report missing summary';
      if (!Array.isArray(parsed.files))
        return 'complexity report missing files array';
      if (parsed.summary.functionCount < 1)
        return 'complexity report found no functions in the fixture';
      return null;
    },
  },
  {
    name: 'complexity --stdout → stdout is valid complexity JSON',
    args: ['complexity', '--stdout'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    validate: (r) => {
      const parsed = parseJsonStdout(r.stdout, 'complexity --stdout stdout');
      if (parsed.error) return parsed.error;
      if (!parsed.value.summary) return 'complexity JSON missing summary';
      if (!Array.isArray(parsed.value.files))
        return 'complexity JSON missing files array';
      return null;
    },
  },
  {
    name: 'complexity --sort cyclomatic → ranks by the requested metric',
    args: ['complexity', '--sort', 'cyclomatic', '--stdout'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    validate: (r) => {
      const parsed = parseJsonStdout(r.stdout, 'complexity --sort stdout');
      if (parsed.error) return parsed.error;
      if (parsed.value.sortedBy !== 'cyclomatic')
        return `sortedBy is "${parsed.value.sortedBy}", expected "cyclomatic"`;
      return null;
    },
  },
  {
    name: 'complexity --min <high> → reports nothing matched',
    args: ['complexity', '--min', '9999'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    combined: [/No functions matched/i],
  },
  {
    name: 'complexity --sort <invalid> → exit 1 with validation error',
    args: ['complexity', '--sort', 'totally-invalid'],
    exitCodes: [1],
    cwd: FIXTURE_TMP,
    combined: [/--sort must be/i],
  },
  {
    name: 'complexity --min <invalid> → exit 1 with validation error',
    args: ['complexity', '--min', 'abc'],
    exitCodes: [1],
    cwd: FIXTURE_TMP,
    combined: [/--min must be a non-negative integer/i],
  },
  {
    name: 'complexity --output <custom> → writes to the specified path',
    args: [
      'complexity',
      '--output',
      path.join(FIXTURE_TMP, 'custom-complexity.json'),
    ],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    validate: () => {
      const file = path.join(FIXTURE_TMP, 'custom-complexity.json');
      if (!fs.existsSync(file)) return 'custom-complexity.json was not created';
      return null;
    },
  },

  {
    name: 'graph → writes ngcompass-graph.json with nodes and edges',
    args: ['graph'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    prepare: () =>
      fs.rmSync(path.join(FIXTURE_TMP, 'ngcompass-graph.json'), {
        force: true,
      }),
    validate: () => {
      const file = path.join(FIXTURE_TMP, 'ngcompass-graph.json');
      if (!fs.existsSync(file)) return 'ngcompass-graph.json was not created';
      const parsed = readJsonFile(file);
      if (!Array.isArray(parsed.nodes)) return 'graph export missing nodes';
      if (!Array.isArray(parsed.edges)) return 'graph export missing edges';
      if (parsed.nodeCount < 1) return 'graph export contains no nodes';
      return null;
    },
  },
  {
    name: 'graph --stdout → stdout is a valid graph JSON',
    args: ['graph', '--stdout'],
    exitCodes: [0],
    cwd: CYCLE_TMP,
    validate: (r) => {
      const parsed = parseJsonStdout(r.stdout, 'graph --stdout stdout');
      if (parsed.error) return parsed.error;
      if (!Array.isArray(parsed.value.nodes))
        return 'graph JSON missing nodes array';
      if (parsed.value.edgeCount < 1)
        return 'graph JSON found no edges in a project that has imports';
      return null;
    },
  },
  {
    name: 'graph --focus <file> --depth 1 → scopes the export to the focus',
    args: ['graph', '--focus', 'src/alpha.ts', '--depth', '1', '--stdout'],
    exitCodes: [0],
    cwd: CYCLE_TMP,
    validate: (r) => {
      const parsed = parseJsonStdout(r.stdout, 'graph --focus stdout');
      if (parsed.error) return parsed.error;
      if (parsed.value.focus !== 'src/alpha.ts')
        return `focus is "${parsed.value.focus}", expected "src/alpha.ts"`;
      if (parsed.value.depth !== 1)
        return `depth is ${parsed.value.depth}, expected 1`;
      return null;
    },
  },
  {
    name: 'graph --focus <unknown> → exit 1 with no-match error',
    args: ['graph', '--focus', 'this-file-does-not-exist-xyz.ts'],
    exitCodes: [1],
    cwd: FIXTURE_TMP,
    combined: [/no file in the import graph matches/i],
  },
  {
    name: 'graph --depth <invalid> → exit 1 with validation error',
    args: ['graph', '--depth', 'abc'],
    exitCodes: [1],
    cwd: FIXTURE_TMP,
    combined: [/--depth must be a non-negative integer/i],
  },
  {
    name: 'graph --output <custom> → writes to the specified path',
    args: ['graph', '--output', path.join(FIXTURE_TMP, 'custom-graph.json')],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    validate: () => {
      const file = path.join(FIXTURE_TMP, 'custom-graph.json');
      if (!fs.existsSync(file)) return 'custom-graph.json was not created';
      return null;
    },
  },

  {
    name: 'visualize <file> → writes ngcompass-visualize.html',
    args: ['visualize', FIXTURE_ENTRY],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    prepare: () =>
      fs.rmSync(path.join(FIXTURE_TMP, 'ngcompass-visualize.html'), {
        force: true,
      }),
    validate: () => {
      const file = path.join(FIXTURE_TMP, 'ngcompass-visualize.html');
      if (!fs.existsSync(file))
        return 'ngcompass-visualize.html was not created';
      const size = fs.statSync(file).size;
      if (size < 100)
        return `ngcompass-visualize.html is suspiciously small (${size} bytes)`;
      return null;
    },
  },
  {
    name: 'visualize --format json → writes ngcompass-visualize.json',
    args: ['visualize', FIXTURE_ENTRY, '--format', 'json'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    prepare: () =>
      fs.rmSync(path.join(FIXTURE_TMP, 'ngcompass-visualize.json'), {
        force: true,
      }),
    validate: () => {
      const file = path.join(FIXTURE_TMP, 'ngcompass-visualize.json');
      if (!fs.existsSync(file))
        return 'ngcompass-visualize.json was not created';
      const parsed = readJsonFile(file);
      if (!Array.isArray(parsed.lanes)) return 'unit export missing lanes';
      if (!Array.isArray(parsed.edges)) return 'unit export missing edges';
      return null;
    },
  },
  {
    name: 'visualize --format console → prints the unit summary',
    args: ['visualize', FIXTURE_ENTRY, '--format', 'console'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    combined: [/Unit/, /lanes/],
  },
  {
    name: 'visualize --stdout → stdout is a valid unit JSON',
    args: ['visualize', FIXTURE_ENTRY, '--stdout'],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    validate: (r) => {
      const parsed = parseJsonStdout(r.stdout, 'visualize --stdout stdout');
      if (parsed.error) return parsed.error;
      if (!Array.isArray(parsed.value.lanes))
        return 'unit JSON missing lanes array';
      if (!parsed.value.summary) return 'unit JSON missing summary';
      return null;
    },
  },
  {
    name: 'visualize --output <custom> → writes to the specified path',
    args: [
      'visualize',
      FIXTURE_ENTRY,
      '--output',
      path.join(FIXTURE_TMP, 'custom-unit.html'),
    ],
    exitCodes: [0],
    cwd: FIXTURE_TMP,
    notCombined: [CRASH_RE],
    validate: () => {
      const file = path.join(FIXTURE_TMP, 'custom-unit.html');
      if (!fs.existsSync(file)) return 'custom-unit.html was not created';
      return null;
    },
  },
  {
    name: 'visualize --format <invalid> → exit 1 with unknown-format error',
    args: ['visualize', FIXTURE_ENTRY, '--format', 'totally-invalid'],
    exitCodes: [1],
    cwd: FIXTURE_TMP,
    combined: [/unknown format/i],
  },
  {
    name: 'visualize <missing file> → exit 1 without crashing',
    args: ['visualize', 'src/this-file-does-not-exist-xyz.ts'],
    exitCodes: [1],
    cwd: FIXTURE_TMP,
    combined: [/visualize:/i],
    notCombined: [CRASH_RE],
  },

  {
    name: 'baseline show → exit 1 before any baseline exists',
    args: ['baseline', 'show'],
    exitCodes: [1],
    cwd: BASELINE_TMP,
    combined: [/no baseline file was found/i],
    notCombined: [CRASH_RE],
  },
  {
    name: 'baseline create → writes .ngcompass/baseline.json with counts',
    args: ['baseline', 'create', '--skip-type-check'],
    exitCodes: [0],
    cwd: BASELINE_TMP,
    stdout: [/Baseline written/, /violations? recorded/],
    notCombined: [CRASH_RE],
    validate: () => {
      if (!fs.existsSync(BASELINE_FILE))
        return `baseline was not written to ${BASELINE_FILE}`;

      const parsed = readJsonFile(BASELINE_FILE);
      if (typeof parsed.version !== 'number')
        return 'baseline file is missing a numeric "version"';
      if (!parsed.entries || typeof parsed.entries !== 'object')
        return 'baseline file is missing an "entries" object';
      if (countBaselinedViolations() === 0)
        return 'baseline recorded zero violations - the fixture produced none';
      return null;
    },
  },
  {
    name: 'baseline create (no --force) when one exists → exit 1',
    args: ['baseline', 'create', '--skip-type-check'],
    exitCodes: [1],
    cwd: BASELINE_TMP,
    combined: [/already exists/i],
    notCombined: [CRASH_RE],
  },
  {
    name: 'baseline create --force → overwrites the existing baseline',
    args: ['baseline', 'create', '--force', '--skip-type-check'],
    exitCodes: [0],
    cwd: BASELINE_TMP,
    stdout: [/Baseline written/],
    notCombined: [CRASH_RE],
  },
  {
    name: 'baseline show → BASELINE banner + the hidden violations',
    args: ['baseline', 'show'],
    exitCodes: [0],
    cwd: BASELINE_TMP,
    stdout: [/BASELINE/, VERSION_RE, /hidden across/],
    notCombined: [CRASH_RE],
  },
  {
    name: 'analyze --no-baseline → reports the pre-existing violations',
    args: ['analyze', '--skip-type-check', '--format', 'json', '--no-baseline'],
    exitCodes: [0, 1],
    cwd: BASELINE_TMP,
    notCombined: [CRASH_RE],
    validate: (r) => {
      if (countReportedViolations(r.stdout) === 0)
        return '--no-baseline reported zero violations on a fixture that has them';
      return null;
    },
  },
  {
    name: 'analyze --baseline → suppresses every recorded violation',
    args: ['analyze', '--skip-type-check', '--format', 'json', '--baseline'],
    exitCodes: [0],
    cwd: BASELINE_TMP,
    notCombined: [CRASH_RE],
    validate: (r) => {
      const remaining = countReportedViolations(r.stdout);
      if (remaining !== 0)
        return `--baseline left ${remaining} violation(s) it should have hidden`;
      return null;
    },
  },
  {
    name: 'analyze --baseline --format html → report states the hidden count',
    args: ['analyze', '--skip-type-check', '--baseline', '--format', 'html'],
    exitCodes: [0],
    cwd: BASELINE_TMP,
    notCombined: [CRASH_RE],
    validate: () => {
      const htmlFile = path.join(BASELINE_TMP, 'ngcompass-report.html');
      if (!fs.existsSync(htmlFile))
        return 'ngcompass-report.html was not created';

      const html = fs.readFileSync(htmlFile, 'utf8');
      if (!html.includes('Hidden by baseline'))
        return 'html report omits the baseline stat card';
      if (!html.includes('hidden by baseline'))
        return 'html report headline omits the hidden count';
      if (html.includes('No violations found'))
        return 'html report claims no violations while a baseline is hiding some';
      return null;
    },
  },
  {
    name: 'analyze --baseline → a violation added later is still reported',
    args: ['analyze', '--skip-type-check', '--format', 'json', '--baseline'],
    exitCodes: [0, 1],
    cwd: BASELINE_TMP,
    notCombined: [CRASH_RE],
    prepare: async () => {
      writeBaselineComponent(
        'fresh.component.ts',
        'app-fresh',
        'FreshComponent'
      );
    },
    validate: (r) => {
      if (countReportedViolations(r.stdout) === 0)
        return 'a violation introduced after the baseline was not reported';
      return null;
    },
  },
  {
    name: 'baseline update → absorbs the newly introduced violation',
    args: ['baseline', 'update', '--skip-type-check'],
    exitCodes: [0],
    cwd: BASELINE_TMP,
    stdout: [/Baseline written/],
    notCombined: [CRASH_RE],
    validate: () => {
      if (!baselineHasFile('fresh.component.ts'))
        return 'baseline update did not record src/fresh.component.ts';
      return null;
    },
  },
  {
    name: 'baseline prune → drops entries for files that no longer exist',
    args: ['baseline', 'prune', '--skip-type-check'],
    exitCodes: [0],
    cwd: BASELINE_TMP,
    stdout: [/Baseline written/],
    notCombined: [CRASH_RE],
    prepare: async () => {
      fs.rmSync(path.join(BASELINE_TMP, 'src', 'fresh.component.ts'), {
        force: true,
      });
    },
    validate: () => {
      if (baselineHasFile('fresh.component.ts'))
        return 'baseline prune kept an entry for a deleted file';
      return null;
    },
  },
  {
    name: 'baseline create --path <custom> → writes to the specified path',
    args: [
      'baseline',
      'create',
      '--skip-type-check',
      '--force',
      '--path',
      'custom-baseline.json',
    ],
    exitCodes: [0],
    cwd: BASELINE_TMP,
    stdout: [/Baseline written/],
    notCombined: [CRASH_RE],
    validate: () => {
      const custom = path.join(BASELINE_TMP, 'custom-baseline.json');
      if (!fs.existsSync(custom)) return 'custom-baseline.json was not created';
      return null;
    },
  },
  {
    name: 'analyze --baseline <missing path> → exit 1 with a clear error',
    args: ['analyze', '--skip-type-check', '--baseline', 'does-not-exist.json'],
    exitCodes: [1],
    cwd: BASELINE_TMP,
    combined: [/no baseline file was found/i],
    notCombined: [CRASH_RE],
  },
];

async function runTests() {
  if (!fs.existsSync(CLI)) {
    w(paint(`\n  ✗  CLI not found at:`, c.red, c.bold));
    w(paint(`     ${CLI}`, c.dim));
    w('');
    w(paint('  Build it first:', c.cyan));
    w(paint('     pnpm build', c.cyan, c.bold));
    w('');
    process.exit(1);
  }

  await setupFixture();
  await setupCycleFixture();
  await setupBaselineFixture();

  fs.mkdirSync(path.join(ZERO_ANGULAR_TMP, 'src'), { recursive: true });
  await runCli(['init', '--cwd', ZERO_ANGULAR_TMP, '--force']);
  fs.writeFileSync(
    path.join(ZERO_ANGULAR_TMP, 'src', 'helpers.ts'),
    `export const add = (a: number, b: number) => a + b;\n`
  );

  w('');
  w(
    `  ${paint(' SMOKE ', c.bgCyan, c.black, c.bold)}  ${paint(`${tests.length} test cases`, c.bold)}`
  );
  w(paint(`  ${CLI}`, c.dim));
  w('');

  const results = [];

  for (const test of tests) {
    if (test.prepare) await test.prepare();

    const { exitCode, stdout, stderr, combined } = await runCli(
      test.args,
      test.cwd ?? ROOT
    );

    const failures = [];
    const accepted = test.exitCodes ?? [0];

    if (!accepted.includes(exitCode)) {
      failures.push(`exit ${exitCode} not in [${accepted.join(', ')}]`);
    }

    for (const re of test.stdout ?? []) {
      if (!re.test(stdout)) failures.push(`stdout missing /${re.source}/`);
    }
    for (const re of test.stderr ?? []) {
      if (!re.test(stderr)) failures.push(`stderr missing /${re.source}/`);
    }
    for (const re of test.combined ?? []) {
      if (!re.test(combined)) failures.push(`output missing /${re.source}/`);
    }
    for (const re of test.notCombined ?? []) {
      if (re.test(combined))
        failures.push(`output must NOT contain /${re.source}/`);
    }

    if (test.validate && failures.length === 0) {
      const msg = await test.validate({ exitCode, stdout, stderr, combined });
      if (msg) failures.push(msg);
    }

    results.push({ test, exitCode, stdout, stderr, failures });

    const ok = failures.length === 0;
    const icon = ok ? paint(' ❯ ', c.green) : paint(' ✗ ', c.red, c.bold);
    const label = ok ? paint(test.name, c.dim) : paint(test.name, c.bold);
    const exitNote = ok ? '' : paint(`  (exit ${exitCode})`, c.yellow);

    w(`  ${icon}${label}${exitNote}`);

    if (!ok) {
      for (const f of failures) {
        w(paint(`       → ${f}`, c.red));
      }
    }
  }

  const passed = results.filter((r) => r.failures.length === 0).length;
  const failed = results.length - passed;

  w('');
  w(paint('  ─────────────────────────────────────────────────', c.dim));
  w('');

  if (failed === 0) {
    w(
      `  ${paint(' PASS ', c.bgGreen, c.black, c.bold)}  ${paint(`All ${passed} smoke tests passed`, c.green, c.bold)}`
    );
  } else {
    w(
      `  ${paint(' FAIL ', c.bgRed, c.black, c.bold)}  ${paint(`${failed} failed`, c.red, c.bold)}  ${paint(`· ${passed} passed`, c.green)}`
    );
    w('');
    w(paint('  Failed:', c.bold));
    for (const r of results.filter((r) => r.failures.length > 0)) {
      w(`    ${paint('✗ ' + r.test.name, c.red)}`);
      for (const f of r.failures) {
        w(paint(`        → ${f}`, c.dim));
      }
      if (r.stderr.trim()) {
        w(paint(`        stderr: ${r.stderr.trim().split('\n')[0]}`, c.gray));
      }
    }
  }

  w('');

  for (const dir of [
    INIT_TMP,
    FIXTURE_TMP,
    ZERO_ANGULAR_TMP,
    CYCLE_TMP,
    BASELINE_TMP,
  ]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  w(paint(`\n  Fatal error in smoke runner: ${err.message}`, c.red));
  process.exit(1);
});
