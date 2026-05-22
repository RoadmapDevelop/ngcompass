/**
 * @fileoverview
 * Cache-package constants.
 *
 * `CACHE_VERSION` is re-exported from `@ngcompass/common` so the value lives
 * in exactly one place — bumping the canonical constant invalidates every
 * downstream cache key without a second edit here.
 *
 * `SCHEMA_VERSION` and the derived `CACHE_KEY_PREFIX` are cache-specific:
 * they describe the on-disk serialization format used by drivers and are
 * not exposed to other packages.
 */

export { CACHE_VERSION } from '@ngcompass/common';
import { CACHE_VERSION } from '@ngcompass/common';

/** On-disk serialization format version; bump when driver layouts change. */
export const SCHEMA_VERSION = 1;

/**
 * Prefix injected into every cache key so that an upgrade of either the tool
 * (`CACHE_VERSION`) or the on-disk schema (`SCHEMA_VERSION`) invalidates the
 * entire cache automatically.
 *
 * Format: `v{CACHE_VERSION}-s{SCHEMA_VERSION}`.
 */
export const CACHE_KEY_PREFIX = `v${CACHE_VERSION}-s${SCHEMA_VERSION}`;
