# ngcompass

Command line interface for [ngcompass](../../README.md) - Angular static analysis tool.

## Installation

```bash
npm install -g ngcompass
# or
pnpm add -g ngcompass
```

## Usage

```bash
ngcompass [command] [options]
```

## Commands

### `ngcompass init`

Initialize a new configuration file in the current directory.

```bash
ngcompass init
ngcompass init --force        # Overwrite existing config
ngcompass init --cwd ./app    # Run in a specific directory
```

### `ngcompass analyze`

Run analysis on the project.

```bash
ngcompass analyze
ngcompass analyze --format json
ngcompass analyze --format ui --output report.html
ngcompass analyze --profile strict
ngcompass analyze --rule signal-prefer-model
ngcompass analyze --force     # Bypass cache
ngcompass analyze --compact   # ESLint-style compact output
```

### `ngcompass config health`

Validate the current configuration file for semantic correctness.

```bash
ngcompass config health
ngcompass config health --profile strict
```

### `ngcompass cache`

Manage the analysis cache.

```bash
ngcompass cache info                # Show cache statistics
ngcompass cache path                # Print cache directory
ngcompass cache clear               # Clear all caches
ngcompass cache clear --type ast    # Clear only AST cache
ngcompass cache clear --type results  # Clear only results cache
```

### `ngcompass rules`

List all available rules or inspect a specific one.

```bash
ngcompass rules
ngcompass rules --preset strict
ngcompass rules signal-prefer-model
```

## Global Options

```text
--debug      Enable verbose debug output
--version    Show version
--help       Show help
```

## Requirements

- Node.js >= 18

## License

MIT
