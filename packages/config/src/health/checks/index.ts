/**
 * @fileoverview
 * Barrel for the configuration health checks.
 *
 * Each named export is a stateless function that takes a validated config
 * (plus a context where needed) and returns a `ConfigBlockValidation`. The
 * validator composes them and isolates failures so a crash in one check does
 * not silence the others.
 */

export * from './base.js';
export * from './cross-fields.js';
export * from './deprecated.js';
export * from './extends.js';
export * from './globs.js';
export * from './paths.js';
export * from './profiles.js';
export * from './rules.js';
