/**
 * @fileoverview
 * Public surface of the configuration health-check subsystem.
 *
 * Re-exports the orchestrator, the runtime context factory, the typed
 * descriptors, the message catalogue, the severity vocabulary, and every
 * individual check. Callers should depend on this barrel and never reach
 * into nested files directly.
 */

export * from './checks/index.js';
export * from './constants.js';
export * from './context.js';
export * from './messages.js';
export * from './types.js';
export * from './validator.js';
