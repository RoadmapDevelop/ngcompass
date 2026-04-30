<div align="center">
  <img src="./assets/logo-small.png" alt="ngcompass logo" width="120" />
  <h1>ngcompass</h1>
  <p><strong>Static analysis for Angular — catch architecture problems, performance issues, and code quality violations before they reach production.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@ngcompass/cli"><img src="https://img.shields.io/npm/v/@ngcompass/cli/beta?label=beta&color=ec4899" alt="npm beta"></a>
    <img src="https://img.shields.io/badge/Angular-v15%2B-dd0031" alt="Angular v15+">
    <img src="https://img.shields.io/badge/Node.js-20%2B-339933" alt="Node.js 20+">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
  </p>
</div>

---

## What is ngcompass?

ngcompass is a **command-line static analysis tool** built specifically for Angular projects. It scans your codebase without running it — reading your TypeScript, templates, and configuration files — and reports issues across four key areas:

| Category | What it checks |
|---|---|
| **Architecture** | Module boundaries, circular dependencies, improper component relationships |
| **Performance** | Missing `OnPush`, untracked subscriptions, heavy template expressions |
| **SSR Compatibility** | Browser-only APIs used in universal code, hydration pitfalls |
| **Code Quality** | Deprecated APIs, naming conventions, dead code, missing best practices |

Think of it as **ESLint — but Angular-aware**. It understands the relationship between components, services, templates, and modules at a deeper level than generic TypeScript linters.

---

## Installation

```bash
# npm
npm install -g @ngcompass/cli@beta

# pnpm
pnpm add -g @ngcompass/cli@beta
```

> This is a **beta release**. Install with `@beta` to opt in.

---

## Quick Start

```bash
# 1. Go to your Angular project
cd my-angular-app

# 2. Initialize configuration
ngcompass init

# 3. Run analysis
ngcompass analyze
```

That's it. ngcompass will scan your project and print a report to the terminal.

For a visual report with search, filters, and per-file details, run:

```bash
ngcompass analyze --format ui
```

---

## Output Formats

ngcompass can output results in multiple formats depending on your workflow:

```bash
# Terminal output (default)
ngcompass analyze

# Compact ESLint-style output (great for CI logs)
ngcompass analyze --format console --compact

# Interactive UI report
ngcompass analyze --format ui

# Machine-readable JSON
ngcompass analyze --format json > results.json

# SARIF for GitHub Code Scanning
ngcompass analyze --format sarif > results.sarif
```

The HTML report gives you a full visual breakdown — severity charts, per-file drill-down, search and filter — all in a single self-contained file.

---

## Configuration

Run `ngcompass init` to generate `ngcompass.config.ts` in your project root:

```ts
import { defineConfig } from '@ngcompass/config';

export default defineConfig({
  // Start from a preset: 'ngcompass:recommended' | 'ngcompass:strict' | 'ngcompass:performance'
  extends: 'ngcompass:recommended',

  // Files to scan
  include: ['src/**/*.ts'],
  exclude: ['**/*.spec.ts', '**/*.stories.ts'],

  // Override individual rules
  rules: {
    'no-missing-on-push': 'error',
    'no-ssr-unsafe-globals': 'warn',
  },
});
```

### Presets

| Preset | Description |
|---|---|
| `ngcompass:recommended` | Balanced set of rules for most Angular projects |
| `ngcompass:strict` | Stricter checks including all recommended rules |
| `ngcompass:performance` | Focus on rendering performance and change detection |

---

## Commands

| Command | Description |
|---|---|
| `ngcompass init` | Generate a `ngcompass.config.ts` in the current directory |
| `ngcompass analyze` | Run analysis on the project |
| `ngcompass config health` | Validate the current configuration |
| `ngcompass rules` | List all available rules |
| `ngcompass rules <name>` | Inspect a specific rule |
| `ngcompass cache info` | Show cache status and statistics |
| `ngcompass cache clear` | Clear the analysis cache |
| `ngcompass cache path` | Show the cache directory location |

### Analyze Options

| Option | Description |
|---|---|
| `--format <fmt>` | Output format: `console`, `json`, `sarif`, `html` |
| `--output <path>` | Write HTML report to a specific file path |
| `--compact` | ESLint-style compact one-line-per-issue output |
| `--rule <id>` | Run a single rule in isolation |
| `--force` | Skip cache and re-run full analysis |
| `--profile <name>` | Use a named profile from your config |
| `--debug` | Enable verbose debug output |

---

## CI Integration

ngcompass exits with code `0` on success and non-zero when violations are found. Drop it into any CI pipeline:

```yaml
# GitHub Actions example
- name: Run ngcompass
  run: ngcompass analyze --format sarif > results.sarif

- name: Upload to Code Scanning
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

---

## Caching

ngcompass caches analysis results between runs. Only changed files are re-analyzed, making subsequent runs significantly faster on large codebases.

```bash
ngcompass cache info    # see what's cached
ngcompass cache clear   # reset the cache
ngcompass analyze --force  # skip cache for this run
```

---

## Packages

ngcompass is a monorepo. All packages are published under the `@ngcompass` scope:

| Package | Description |
|---|---|
| [`@ngcompass/cli`](packages/cli) | The CLI tool — this is what you install |
| [`@ngcompass/engine`](packages/engine) | Rule execution engine |
| [`@ngcompass/rules`](packages/rules) | Built-in rule collection |
| [`@ngcompass/ast`](packages/ast) | AST parsers and visitors |
| [`@ngcompass/scanner`](packages/scanner) | File system scanning |
| [`@ngcompass/planner`](packages/planner) | Incremental execution planner |
| [`@ngcompass/cache`](packages/cache) | Caching layer |
| [`@ngcompass/reporters`](packages/reporters) | Output formatters (console, JSON, SARIF, HTML) |
| [`@ngcompass/config`](packages/config) | Config loading and validation |
| [`@ngcompass/common`](packages/common) | Shared types and utilities |

---

## Requirements

- **Node.js** `^20.19.0` or `>=22.12.0`
- **Angular** v15 or later

---

## Known Limitations (Beta)

- Rule names, messages, and report layout may change before `1.0`
- Template parsing is best-effort — highly dynamic templates may not be fully understood
- SARIF output targets code scanning ingestion and may omit some visual details
- Validate against your project before enforcing ngcompass as a required CI gate

---

## License

MIT — see [LICENSE](./LICENSE)
