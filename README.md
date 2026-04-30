# ngcompass

Angular static analysis tool for architecture, performance, SSR, and code quality.

## Features

- Deep AST analysis of Angular components, templates, and services
- Pluggable rule system with built-in presets (recommended, strict, performance, reactivity)
- Incremental analysis with smart caching
- Multiple output formats: console, JSON, SARIF, HTML
- Fast execution powered by SWC and OXC parsers

## Installation

```bash
npm install -g @ngcompass/cli
# or
pnpm add -g @ngcompass/cli
```

## Quick Start

```bash
# Initialize configuration
ngcompass init

# Run analysis
ngcompass analyze

# Check configuration health
ngcompass config health
```

## Commands

| Command | Description |
|---|---|
| `ngcompass init` | Initialize a new `ngcompass.config.ts` in the current directory |
| `ngcompass analyze` | Run analysis on the project |
| `ngcompass config health` | Validate the current configuration |
| `ngcompass cache info` | Show cache status and statistics |
| `ngcompass cache clear` | Clear cached results |
| `ngcompass cache path` | Show the cache directory location |
| `ngcompass rules [name]` | List all rules or inspect a specific rule |

## Global Options

| Option | Description |
|---|---|
| `--debug` | Enable verbose debug output |
| `--version` | Show version number |
| `--help` | Show help |

## Analyze Options

| Option | Description |
|---|---|
| `-p, --profile <name>` | Select a configuration profile from `profiles` in `ngcompass.config.*` |
| `--force` | Force re-execution, ignoring cache |
| `--format <fmt>` | Output format: `console` (default), `json`, `sarif`, `html`, `ui` |
| `--compact` | ESLint-style compact output |
| `--output <path>` | Write the `html` / `ui` report to a file |
| `--rule <id>` | Run a single rule in isolation |

## Configuration

Run `ngcompass init` to generate a `ngcompass.config.ts` file. Example:

```ts
import { defineConfig } from '@ngcompass/config';

export default defineConfig({
  extends: 'ngcompass:recommended',
  include: ['src/**/*.ts'],
  exclude: ['**/*.spec.ts'],
});
```

## Output Examples

Write machine-readable JSON for automation:

```bash
ngcompass analyze --format json > ngcompass-results.json
```

Write SARIF for GitHub Code Scanning or other SARIF consumers:

```bash
ngcompass analyze --format sarif > ngcompass.sarif
```

Write a branded HTML report:

```bash
ngcompass analyze --format html --output ngcompass-report.html
```

Use ngcompass in CI and fail on violations:

```bash
ngcompass analyze --format console --compact
```

The CLI exits with `0` when analysis completes without errors and exits non-zero when errors are found or the command cannot run successfully.

## Known Limitations

- Beta releases may change rule names, rule messages, and report layout before `1.0`.
- Angular support should be validated against your project before enforcing ngcompass as a required CI gate.
- Template parsing and static analysis are best-effort; dynamic template construction and highly indirect patterns may not be fully understood.
- SARIF output is intended for code scanning ingestion and may not include every visual detail from the HTML report.
- HTML reports are static files and do not currently include live filtering backed by a server.

## Packages

This is a monorepo. Published packages:

| Package | Description |
|---|---|
| [`@ngcompass/cli`](packages/cli) | CLI tool |
| [`@ngcompass/rules`](packages/rules) | Built-in rule collection |
| [`@ngcompass/engine`](packages/engine) | Rule execution engine |
| [`@ngcompass/ast`](packages/ast) | AST parsers and visitors |
| [`@ngcompass/config`](packages/config) | Config loading and validation |
| [`@ngcompass/scanner`](packages/scanner) | File system scanning |
| [`@ngcompass/planner`](packages/planner) | Incremental execution planner |
| [`@ngcompass/cache`](packages/cache) | Caching layer |
| [`@ngcompass/reporters`](packages/reporters) | Output formatters |
| [`@ngcompass/common`](packages/common) | Shared types and utilities |

## Requirements

- Node.js ^20.19.0 or >=22.12.0
- pnpm >= 8

## License

MIT
