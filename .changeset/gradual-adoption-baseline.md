---
'@ngcompass/baseline': minor
'@ngcompass/reporters': minor
'@ngcompass/common': minor
'@ngcompass/config': minor
'ngcompass': minor
---

Add baseline support for gradual adoption.

`ngcompass baseline create` records the violations that already exist in a codebase, so `ngcompass analyze` reports only newly introduced ones. The baseline stores a count per file and rule, which survives line shifts and reformatting, and is committed to git.

```bash
ngcompass baseline create
```

```ts
export default {
  baseline: { enabled: true },
};
```

New commands: `baseline create`, `baseline update`, `baseline prune`, `baseline show`. New analyze flags: `--baseline [path]` and `--no-baseline`.

Adopt one rule at a time with `ngcompass baseline update --rule <id>` — entries for rules outside the run are left untouched.

Note for existing users enabling a baseline: `maxWarnings` counts warnings **after** the baseline is applied, so already-recorded warnings no longer consume the budget. A config health check flags a large `maxWarnings` once a baseline is in use.
