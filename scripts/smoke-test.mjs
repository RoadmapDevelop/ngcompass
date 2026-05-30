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
    stdout: [/ngcompass/i, /analyze/, /rules/, /cache/, /init/],
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
    name: 'init --help → shows --force and --cwd flags',
    args: ['init', '--help'],
    exitCodes: [0],
    stdout: [/--force/, /--cwd/],
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

  for (const dir of [INIT_TMP, FIXTURE_TMP, ZERO_ANGULAR_TMP]) {
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
