# Changelog

All notable changes to this project will be documented in this file.

## 0.0.1-beta.0 - Unreleased

### Added

- SARIF output for CI code scanning integrations.
- Branded HTML reports with issue, warning, and parse-error iconography.
- HTML reporter regression coverage for branding, escaping, parse errors, and clean scans.
- CI smoke checks for packaged CLI commands, colorless output, initialization, and exit codes.

### Changed

- Release dry-run now builds through the production release path before validating packaged files.
- Documented runtime support now matches package engine requirements.
