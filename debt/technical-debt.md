# Technical Debt - Configuration & Health Checks

This document tracks items that need further implementation or refactoring in the configuration and health check system.

## 🔴 High Priority

- **Unknown Rule Detection**: Currently, we only check for schema validity and severity levels. We need a way to verify if a rule name exists in the actual rule registry.
  - *Dependency*: Rule Registry implementation.
- **Rule Option Validation**: We do not yet validate the `options` object for each rule. Each rule should provide a schema for its options.
  - *Dependency*: Rule-specific JSON schemas or Zod schemas.

## 🟡 Medium Priority

- **Rule Inheritance Validation**: When profiles extend other profiles or the base config, we should ensure rule merging logic doesn't create invalid states.

## ✅ Completed Tasks

- [x] **Empty Rule Name Detection**: Validate that rule names are not empty strings.
- [x] **Consolidated Error Reporting**: Deep validation across all profiles (initial implementation done, then reverted to single-profile focused per user request).
- [x] **Schema Resilience**: Health check continues even if Zod schema validation fails (partial validation).
