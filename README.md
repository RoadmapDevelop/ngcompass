# ngcompass

Angular static analysis tool for architecture, performance, SSR, and code quality.

## Features

- Deep AST analysis of Angular components, templates, and services
- Pluggable rule system with built-in presets (recommended, strict, performance, reactivity)
- Incremental analysis with smart caching
- Multiple output formats: console, JSON, HTML
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
| `--format <fmt>` | Output format: `console` (default), `json`, `ui` |
| `--compact` | ESLint-style compact output |
| `--output <path>` | Write the `ui` HTML report to a file |
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

- Node.js >= 18
- pnpm >= 8

## License

MIT
