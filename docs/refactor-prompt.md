# Package Folder Structure

ngcompass organizes each package by capability. A package has one small public interface in `src/index.ts`; its implementation folders own cohesive behavior and are private to that package.

## Convention

```text
packages/<name>/
├── src/
│   ├── index.ts
│   ├── <capability>/
│   │   └── <implementation>.ts
│   └── models/
│       └── <shared-domain-type>.ts
└── tests/
    └── <capability>/
```

- Create a capability folder only when two or more files share one responsibility.
- Name folders after behavior: `execution`, `loading`, `resource-discovery`, and `formatting` are preferred over `services`, `helpers`, or `shared`.
- Keep package-private types with their capability. Put only cross-capability domain types in `models/`.
- Keep tests in `tests/`, mirroring the source capability they exercise.
- Cross-package imports use package names. Package consumers import only from its `src/index.ts` public interface.
- Relative imports use the `.js` extension under Node16 module resolution.

## Package Map

| Package | Capability folders |
| --- | --- |
| `common` | `ast`, `models`, `utils` |
| `ast` | `analyzers`, `ast`, `models`, `parsers` |
| `cache` | `caches`, `drivers`, `models`, `runtime`; `hashing.ts` and `filesystem.ts` remain at the package root until related files are added |
| `scanner` | `discovery`, `models`; `filters.ts`, `normalize.ts`, and `stats.ts` remain at the package root until related files are added |
| `config` | `angular`, `health`, `loading`, `models`, `validation`; `init.ts` and `plugin-loader.ts` remain at the package root until related files are added |
| `planner` | `incremental-analysis`, `models`, `plan-building`, `resource-discovery`, `task-identity`; `worker.ts` remains at the package root until related files are added |
| `engine` | `analysis`, `callgraph`, `complexity`, `context`, `execution`, `models`, `project-graph`, `visualize` |
| `reporters` | `formatting`, `models`, `reporters` |
| `rules` | `execution`, `models`, `presets`, `registry`, `resolution`, `rules` |
| `cli` | `bin`, `commands`, `models`; `spinner.ts` remains at the package root until related files are added |

## Refactor Constraints

- The change must preserve each package's public interface and package export paths.
- Worker entry points can move internally, but the build configuration must continue to emit their established public output names.
- Do not add new dependencies or combine unrelated features merely to reduce folder count.
- Update architecture and contributor documentation whenever a folder name changes.
- Verify the refactor with `pnpm typecheck` and `pnpm test`.
