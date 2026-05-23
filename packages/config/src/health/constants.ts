/**
 * @fileoverview
 * Shared constants for the configuration health-check pipeline.
 *
 * The accepted rule severity vocabulary is kept in lockstep with the
 * `SeveritySchema` in `../schemas/schema.ts`. Any change here must be
 * mirrored there or schema validation and semantic validation will
 * disagree on what counts as a valid severity.
 */

/**
 * Severities accepted by individual rule entries.
 *
 * Mirrors the union accepted by `RuleDefinitionSchema` in the Zod schema:
 * - `'warn'` / `'error'` enable the rule at the given severity.
 * - `'off'` disables the rule.
 */
export const VALID_RULE_SEVERITIES: readonly string[] = ['warn', 'error', 'off'];
