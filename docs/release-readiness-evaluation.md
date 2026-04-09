# Public Release Readiness Evaluation

Based on an analysis of the repository (`npm run test`, `npm run lint`, and code architecture), the project is **not quite ready** for a public "v1.0.0" release, but it is very close.

If you were to release this to `npm` today, users would run into a few friction points. Here is a breakdown of what is required before launching to the public.

## 1. CI/CD Failures (Blocker)
You currently have broken tests and broken linting on the main branch. If a user clones the repository to contribute, the build will fail immediately.
*   **Failed Tests**: `packages/scanner/tests/gitignore.test.ts` is failing. Inside this file, `vi.hoisted` is being used to mock `fs/promises`.
    *   *Error*: "returns content when file exists" and "creates active filter if gitignore exists" are both failing. The mock `mockReadFile.mockResolvedValue` is returning empty or failing.
*   **Failed Linting**: Running `npm run lint` completely crashes the turbo pipeline with exit code 1.

## 2. Package Publishing Config (Blocker)
You have a great monorepo, but the `package.json` files are missing critical metadata for a public `npm` registry release.
*   Your packages currently use `"version": "0.0.1"`.
*   There are no `"repository"`, `"bugs"`, or `"homepage"` fields in the `package.json` files for the individual packages. When users find the tool on npmjs.com, they won't have a link back to your GitHub repo to file issues.
*   You are missing a `.npmignore` or `"files"` array configuration that prevents source `.ts` files and tests from being bundled into the final npm tarball.

## 3. The CLI UX & Onboarding (Critical)
When developers install a new tool like `eslint` or `prettier`, they expect a zero-config or wizard-based initialization.
*   **Initialization**: Is there an `npx @ngcompass/cli init` command that generates an `ngcompass.config.ts` file for them? If it relies on them manually reading the docs and creating the file, adoption will suffer.
*   **Default Preset**: The CLI needs to run successfully out of the box with zero configuration by automatically applying a generic "recommended" preset.

## 4. Documentation (Critical)
A linter is only as good as its documentation.
*   **Rule Docs**: Every rule you've created (e.g., `signal-prefer-computed`, `rxjs-no-subscribe-in-component`) needs a dedicated markdown file explaining:
    1. What the rule does.
    2. *Why* it exists (the architectural argument).
    3. An example of `Bad Code` and `Good Code`.
*   Without this, developers will just get annoyed and disable the rules because they don't understand the "why".

## 5. Peer Dependencies (Minor)
In your `@ngcompass/ast` and other packages, `typescript` is listed as a peer dependency:
```json
"peerDependencies": {
    "typescript": "catalog:"
}
```
`catalog:` is a `pnpm` specific workspace feature. If someone tries to install `@ngcompass/cli` using `npm install -D @ngcompass/cli`, npm might throw a peer dependency resolution error because it doesn't understand `catalog:`. You must ensure this is resolved to a real semver range (e.g. `">= 5.0.0"`) during the build/publish step.

---

### Recommended Action Plan for Release
1.  **Fix the CI/CD Pipeline:** Fix the `vi.hoisted` mock in `gitignore.test.ts` and resolve the ESLint errors.
2.  **Fix `pnpm` workspace publishing:** Ensure `catalog:` and `workspace:*` dependencies are rewritten to actual semver versions during `tsup` build before publishing.
3.  **Create Rule Documentation:** Generate a `docs/rules/` directory with `Bad/Good` code examples for every rule.
4.  **Add `init` command:** Build a setup wizard or ensure it works with zero configuration.
5.  **Publish Alpha:** Release `v0.1.0-alpha.0` and test it internally before officially declaring `v1.0.0`.
