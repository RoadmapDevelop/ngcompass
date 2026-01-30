# Angular Analyzer

Advanced static analysis tool for Angular applications focusing on architecture, performance, SSR, security, and code quality.

## Project Status

🚧 **Under active development** - Phase 0 complete

## Features (Planned)

- ✅ Architecture analysis (circular dependencies, layering)
- ✅ Performance optimization detection
- ✅ SSR compatibility checking
- ✅ Security vulnerability detection
- ✅ Accessibility auditing
- ✅ Code smell detection
- ✅ Parallel processing with caching
- ✅ Auto-fixing capabilities
- ✅ IDE integration (VS Code)

## Development

This is a monorepo managed with pnpm workspaces.

### Setup
```bash
pnpm install
```

### Commands
```bash
pnpm run build        # Build all packages
pnpm run test         # Run all tests
pnpm run lint         # Lint codebase
pnpm run dev          # Watch mode for development
```

### Packages

- `@ngcompass/common` - Shared types and utilities
- `@ngcompass/core` - Analysis engine
- `@ngcompass/rules` - Rule implementations
- `@ngcompass/cli` - Command-line interface
- `@ngcompass/reporters` - Output formatters
- `@ngcompass/testing` - Testing utilities

## License

MIT