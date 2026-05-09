<div align="center">
  <h1>ngcompass</h1>
  <p><strong>Angular-aware static analysis for architecture, performance, SSR, security, and code quality.</strong></p>
  <p>
    <a href="https://www.npmjs.com/package/ngcompass"><img src="https://img.shields.io/npm/v/ngcompass/beta?label=beta&color=ec4899&style=flat-square" alt="npm beta"></a>
    <img src="https://img.shields.io/badge/Angular-v15%2B-dd0031?style=flat-square" alt="Angular v15+">
    <img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square" alt="Node.js 20+">
    <img src="https://img.shields.io/badge/license-MIT-6366f1?style=flat-square" alt="MIT License">
  </p>
</div>

## Overview

ngcompass is a command-line static analysis tool built for Angular projects. It reads TypeScript, Angular templates, styles, and project configuration without running the application, then reports issues that generic TypeScript linters often miss.

It is designed for teams that want a clearer view of Angular-specific risks: component architecture, rendering performance, SSR compatibility, Signals and RxJS patterns, template safety, and modern Angular API adoption.

## Highlights

| Area | What ngcompass helps find |
|---|---|
| Architecture | Circular dependencies, boundary violations, and fragile component relationships |
| Performance | Missing `OnPush`, expensive template expressions, missing `trackBy`, and inefficient bindings |
| SSR | Browser-only APIs in universal code, hydration risks, and render lifecycle pitfalls |
| Security | Unsafe template bindings and sanitizer bypasses |
| Reactivity | RxJS subscription issues, Signals misuse, and migration opportunities |
| Code quality | Deprecated patterns, focused tests, and modern Angular API improvements |

## Installation

Install the beta CLI globally:

```bash
npm install -g ngcompass@beta
```

Or add it to a project:

```bash
npm install --save-dev ngcompass@beta
```

Using pnpm:

```bash
pnpm add -D ngcompass@beta
```

> ngcompass is currently in beta. Install with `@beta` to opt in to the prerelease channel.

## Quick Start

```bash
cd my-angular-app
ngcompass init
ngcompass analyze
```

Generate a self-contained visual report:

```bash
ngcompass analyze --format ui
```

Run through a project-local install:

```bash
npx ngcompass analyze
pnpm exec ngcompass analyze
```

## Output Formats

| Command | Output |
|---|---|
| `ngcompass analyze` | Default terminal report |
| `ngcompass analyze --format console --compact` | Compact one-line issue output |
| `ngcompass analyze --format html --output report.html` | Self-contained HTML report |
| `ngcompass analyze --format ui` | Interactive HTML report alias |
| `ngcompass analyze --format json > results.json` | Machine-readable JSON |
| `ngcompass analyze --format sarif > results.sarif` | SARIF for GitHub Code Scanning |

## Configuration

Create a configuration file:

```bash
ngcompass init
```

This generates `ngcompass.config.ts`:

```ts
import { defineConfig } from '@ngcompass/config';

export default defineConfig({
  extends: 'ngcompass:recommended',

  include: ['src/**/*.ts', 'src/**/*.html'],

  exclude: [
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '**/*.d.ts',
    '**/*.spec.ts',
    '**/*.test.ts',
  ],

  profiles: {
    ci: {
      outputFormat: 'json',
      maxWarnings: 0,
    },
  },
});
```

### Presets

| Preset | Purpose |
|---|---|
| `ngcompass:recommended` | Balanced default for most Angular projects |
| `ngcompass:strict` | Stronger enforcement for mature codebases |
| `ngcompass:performance` | Rendering and change-detection checks |
| `ngcompass:reactivity` | Signals and RxJS correctness |
| `ngcompass:security` | Security-focused Angular checks |
| `ngcompass:ssr` | Server rendering and hydration safety |
| `ngcompass:all` | Every built-in rule at its default severity |

Override individual rules in the same config:

```ts
export default defineConfig({
  extends: ['ngcompass:recommended', 'ngcompass:performance'],
  rules: {
    'prefer-on-push-component-change-detection': 'error',
    'no-document-access': 'warn',
  },
});
```

## Commands

| Command | Description |
|---|---|
| `ngcompass init` | Create `ngcompass.config.ts` |
| `ngcompass analyze` | Run analysis |
| `ngcompass rules` | List available rules |
| `ngcompass rules <name>` | Inspect one rule |
| `ngcompass config health` | Validate configuration |
| `ngcompass cache info` | Show cache status |
| `ngcompass cache clear` | Clear cached analysis data |
| `ngcompass cache path` | Print the cache directory |

### Analyze Options

| Option | Description |
|---|---|
| `--format <fmt>` | `console`, `json`, `sarif`, `html`, or `ui` |
| `--output <path>` | Output path for HTML/UI reports |
| `--compact` | Use compact issue output |
| `-q, --quiet` | Show summary counts only |
| `--no-recommendation` | Hide fix recommendations |
| `--rule <id>` | Run one rule in isolation |
| `--force` | Ignore cached results |
| `-p, --profile <name>` | Run a named config profile |
| `--max-workers <n>` | Limit worker threads |
| `--type-aware-chunk-size <n>` | Tune type-aware batch size |
| `--skip-type-check` | Skip rules that require TypeScript type checking |

## CI

ngcompass exits with code `0` when analysis passes and a non-zero code when configured violations are found.

```yaml
- name: Run ngcompass
  run: ngcompass analyze --format sarif > results.sarif

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

## Caching

ngcompass caches file discovery, execution plans, AST work, rule results, and full analysis output. Warm runs can reuse unchanged work instead of parsing and analyzing the entire project again.

```bash
ngcompass cache info
ngcompass cache clear
ngcompass analyze --force
```

## Monorepo

| Package | Responsibility |
|---|---|
| [`ngcompass`](packages/cli) | CLI entry point |
| [`@ngcompass/config`](packages/config) | Config loading, validation, profiles, and health checks |
| [`@ngcompass/scanner`](packages/scanner) | File discovery and filtering |
| [`@ngcompass/rules`](packages/rules) | Built-in rules, presets, and rule registry |
| [`@ngcompass/planner`](packages/planner) | Incremental execution planning |
| [`@ngcompass/engine`](packages/engine) | Rule execution and analysis orchestration |
| [`@ngcompass/ast`](packages/ast) | TypeScript, template, and style parsing helpers |
| [`@ngcompass/cache`](packages/cache) | Memory and disk cache services |
| [`@ngcompass/reporters`](packages/reporters) | Console, JSON, SARIF, and HTML reporters |
| [`@ngcompass/common`](packages/common) | Shared types and utilities |
| [`@ngcompass/site`](packages/site) | Documentation site |

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Additional workspace checks:

```bash
pnpm smoke
pnpm validate:packages
pnpm prerelease:check
```

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- Angular v15 or later
- pnpm for repository development

## Beta Notes

- Rule names, messages, and report layout may change before `1.0`.
- Template analysis is best-effort for highly dynamic templates.
- Validate ngcompass against your project before making it a required CI gate.

## License

MIT. See [LICENSE](./LICENSE).
