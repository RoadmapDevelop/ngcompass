/**
 * Environment Fingerprint
 *
 * Computes a deterministic, hermetic fingerprint representing all non-file
 * inputs that influence analysis correctness.
 *
 * Design: pure functions, explicit dependencies, no module-level mutable state.
 * The fingerprint is computed once at startup and stored in CacheContext —
 * callers receive it via explicit parameter, never via a global singleton.
 *
 * Fingerprint components (all declared, none implicit):
 *   toolVersion       — CACHE_VERSION constant
 *   schemaVersion     — SCHEMA_VERSION integer
 *   nodeVersion       — major.minor of process.versions.node
 *   platform          — process.platform
 *   arch              — process.arch
 *   typescriptVersion — resolved from typescript/package.json
 *   oxcParserVersion  — resolved from oxc-parser/package.json
 *   htmlParserVersion — resolved from angular-html-parser/package.json
 *   cssParserVersion  — resolved from lightningcss/package.json
 *   ruleRegistryFp    — SHA-256 of sorted registered rule names
 *
 * Any change to any component causes a cache miss on all persistent caches —
 * no manual cache clearing required.
 */

import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { debug } from '@ngcompass/common';
import { CACHE_VERSION, SCHEMA_VERSION } from './constants.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * All environment inputs that influence cache correctness.
 * Exposed so callers can log or display individual fields (observability).
 */
export interface EnvFingerprintComponents {
    readonly toolVersion: string;
    readonly schemaVersion: number;
    /** Node major.minor — patch omitted (ABI-stable within minor series) */
    readonly nodeVersion: string;
    readonly platform: string;
    readonly arch: string;
    readonly typescriptVersion: string;
    readonly oxcParserVersion: string;
    readonly htmlParserVersion: string;
    readonly cssParserVersion: string;
    /** SHA-256 of sorted registered rule names */
    readonly ruleRegistryFp: string;
}

/**
 * Computed fingerprint + its source components.
 * Stored in CacheContext and passed explicitly wherever it is needed.
 */
export interface EnvFingerprint {
    /** SHA-256 hex digest — used as cache key prefix */
    readonly value: string;
    /** Raw inputs — used for diagnostics / cache info output */
    readonly components: EnvFingerprintComponents;
}

// ─── Internal pure helpers ────────────────────────────────────────────────────

/**
 * Reads `version` from a package.json without throwing.
 * Returns 'unknown' when the package is absent or unresolvable.
 */
const readPackageVersion = (packageName: string): string => {
    try {
        const req = createRequire(import.meta.url);
        const pkg = req(`${packageName}/package.json`) as { version?: string };
        return pkg.version ?? 'unknown';
    } catch {
        return 'unknown';
    }
};

/**
 * Extracts major.minor from a semver string.
 * "20.11.1" → "20.11"
 *
 * Patch is excluded because Node patch releases are ABI-stable — V8
 * serialization format does not change within a major.minor series.
 */
const toMajorMinor = (version: string): string => {
    const [major = '0', minor = '0'] = version.replace(/^v/, '').split('.');
    return `${major}.${minor}`;
};

/**
 * Stable JSON: recursively sorts object keys so identical objects always
 * produce the same string regardless of property insertion order.
 */
const stableJson = (value: unknown): string => {
    const normalize = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(normalize);
        if (v !== null && typeof v === 'object') {
            const sorted: Record<string, unknown> = {};
            for (const k of Object.keys(v as object).sort()) {
                sorted[k] = normalize((v as Record<string, unknown>)[k]);
            }
            return sorted;
        }
        return v;
    };
    return JSON.stringify(normalize(value));
};

/** SHA-256 hex digest of a UTF-8 string. */
const sha256 = (input: string): string =>
    crypto.createHash('sha256').update(input, 'utf8').digest('hex');

// ─── Rule registry fingerprint ────────────────────────────────────────────────

/**
 * Computes a deterministic fingerprint of the rule registry.
 *
 * Captures: rule additions, removals, and renames (name-set changes).
 * Does NOT capture inline logic changes to an existing rule without a rename.
 * For that guarantee, bump SCHEMA_VERSION when shipping rule logic changes.
 *
 * Imported lazily to avoid circular deps at module-load time and to ensure
 * all registerNewEngineRule side-effect imports have run first.
 */
const computeRuleRegistryFp = async (): Promise<string> => {
    try {
        const { getGlobalRegistry } = await import('../rules/registry/rule-registry.js');
        const ruleNames = [...getGlobalRegistry().getRuleNames()].sort();

        if (ruleNames.length === 0) return sha256('empty-registry');

        const fp = sha256(ruleNames.join('\n'));
        debug('env-fingerprint', `Rule registry fp: ${fp.slice(0, 8)}… (${ruleNames.length} rules)`);
        return fp;
    } catch (err) {
        debug('env-fingerprint', `Rule registry fp error: ${String(err)}`);
        return sha256('registry-error');
    }
};

// ─── Component assembly ───────────────────────────────────────────────────────

const gatherComponents = async (): Promise<EnvFingerprintComponents> => {
    const ruleRegistryFp = await computeRuleRegistryFp();

    return {
        toolVersion: CACHE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        nodeVersion: toMajorMinor(process.versions.node),
        platform: process.platform,
        arch: process.arch,
        typescriptVersion: readPackageVersion('typescript'),
        oxcParserVersion: readPackageVersion('oxc-parser'),
        htmlParserVersion: readPackageVersion('angular-html-parser'),
        cssParserVersion: readPackageVersion('lightningcss'),
        ruleRegistryFp,
    };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes the environment fingerprint.
 *
 * Call once at startup; store the result in CacheContext; pass it explicitly
 * to all cache key builders. Do not call in hot paths.
 *
 * The returned `value` is a SHA-256 hex digest that changes whenever any
 * environment input changes, automatically invalidating all keyed caches.
 */
export const computeEnvFingerprint = async (): Promise<EnvFingerprint> => {
    const components = await gatherComponents();
    const value = sha256(stableJson(components as unknown as Record<string, unknown>));

    debug('env-fingerprint', `Env fingerprint: ${value.slice(0, 16)}…`);
    debug('env-fingerprint', `  tool:   ${components.toolVersion} (schema v${components.schemaVersion})`);
    debug('env-fingerprint', `  node:   ${components.nodeVersion} ${components.platform}/${components.arch}`);
    debug('env-fingerprint', `  ts:     ${components.typescriptVersion}`);
    debug('env-fingerprint', `  oxc:    ${components.oxcParserVersion}`);
    debug('env-fingerprint', `  html:   ${components.htmlParserVersion}`);
    debug('env-fingerprint', `  css:    ${components.cssParserVersion}`);
    debug('env-fingerprint', `  rules:  ${components.ruleRegistryFp.slice(0, 8)}…`);

    return { value, components };
};

/**
 * Builds an env-scoped cache key: `<fingerprintValue>::<originalKey>`.
 *
 * The `::` separator cannot appear in SHA-256 hex digests, so prefixed keys
 * are always distinguishable from un-prefixed ones.
 *
 * Pure function — same inputs always produce the same output, no side effects.
 */
export const buildEnvScopedKey = (fingerprint: EnvFingerprint, originalKey: string): string =>
    `${fingerprint.value}::${originalKey}`;
