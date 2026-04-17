/**
 * Plugin Loader — unit tests
 *
 * Covers:
 *  - Empty plugin list is a no-op
 *  - Valid plugin (no manifest) registers successfully
 *  - Invalid plugin structure is skipped with a warning
 *  - Unresolvable plugin reference throws an aggregate error
 *  - Plugin with satisfied version range registers
 *  - Plugin with unsatisfied version range throws
 *  - Plugin requiring a disabled capability throws
 *  - Multiple plugins — partial failures are collected and thrown together
 *  - isValidPlugin edge cases (null, missing name, missing handler)
 *  - expandCaretRange / checkVersionRange via manifest compatibility
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPlugins, type EngineCapabilities } from '../src/plugin-loader.js';
import type { RuleRegistry, RulePlugin } from '@ngcompass/common';
import { PACKAGE_VERSION } from '@ngcompass/common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegistry(): RuleRegistry & { registered: RulePlugin[] } {
    const registered: RulePlugin[] = [];
    return {
        registered,
        register(plugin: RulePlugin) { registered.push(plugin); },
        // Satisfy the RuleRegistry interface minimally
        get: (name: string) => registered.find(p => p.name === name),
        getAll: () => registered,
        has: (name: string) => registered.some(p => p.name === name),
    } as any;
}

function makePlugin(overrides: Partial<RulePlugin> = {}): RulePlugin {
    return {
        name: 'test-rule',
        handler: { handle: vi.fn() },
        ...overrides,
    } as unknown as RulePlugin;
}

/** Returns a temp file URL that exports the given plugin(s) via dynamic import. */
async function createTempPluginModule(
    plugin: RulePlugin | RulePlugin[],
): Promise<string> {
    // We use data: URL imports for zero-filesystem side effects.
    const serialized = JSON.stringify(plugin);
    // data: URLs don't work with dynamic import in Node.js for JSON.
    // Instead, write to a real temp module that re-exports an object.
    // For tests we intercept via vi.mock at the module level.
    return serialized; // placeholder — see individual tests below
}

const DEFAULT_CAPS: EngineCapabilities = {
    typeCheckingEnabled: false,
    templateASTEnabled: true,
    cssASTEnabled: true,
};

// ---------------------------------------------------------------------------
// Empty plugin list
// ---------------------------------------------------------------------------

describe('loadPlugins — empty list', () => {
    it('returns immediately without touching the registry', async () => {
        const registry = makeRegistry();
        await loadPlugins([], '/project', registry);
        expect(registry.registered).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Unresolvable plugin reference
// ---------------------------------------------------------------------------

describe('loadPlugins — resolution failure', () => {
    it('throws an aggregate error when a plugin cannot be imported', async () => {
        const registry = makeRegistry();
        await expect(
            loadPlugins(['@totally/nonexistent-plugin-xyz-abc'], '/tmp', registry),
        ).rejects.toThrow(/Plugin Load Failure/);
    });

    it('includes the failing plugin specifier in the error message', async () => {
        const registry = makeRegistry();
        try {
            await loadPlugins(['@totally/nonexistent-plugin-xyz-abc'], '/tmp', registry);
        } catch (err) {
            expect((err as Error).message).toContain('@totally/nonexistent-plugin-xyz-abc');
        }
    });

    it('collects errors from multiple plugins before throwing once', async () => {
        const registry = makeRegistry();
        try {
            await loadPlugins(
                ['@nonexistent/plugin-a', '@nonexistent/plugin-b'],
                '/tmp',
                registry,
            );
            expect.fail('Expected loadPlugins to throw');
        } catch (err) {
            const msg = (err as Error).message;
            expect(msg).toContain('@nonexistent/plugin-a');
            expect(msg).toContain('@nonexistent/plugin-b');
        }
    });
});

// ---------------------------------------------------------------------------
// Version range helpers (tested through validateManifestCompatibility internals)
// We exercise them indirectly by loading a plugin with a manifest.
// ---------------------------------------------------------------------------

describe('loadPlugins — version range validation', () => {
    const currentVersion = PACKAGE_VERSION.replace(/^v/, '');

    it('accepts a wildcard range (*)', async () => {
        const registry = makeRegistry();
        const plugin = makePlugin({
            name: 'wildcard-rule',
            manifest: {
                name: 'wildcard-rule',
                version: '1.0.0',
                engineVersionRange: '*',
            } as any,
        });

        // Dynamically create a module that exports the plugin via a data URL workaround:
        // We patch the import by making the plugin path resolve to a real temp file.
        const { writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const tmpFile = join(tmpdir(), `test-plugin-wildcard-${Date.now()}.mjs`);
        writeFileSync(tmpFile, `export default ${JSON.stringify({ name: plugin.name, manifest: plugin.manifest })};\n`);

        // Because the handler won't serialise to JSON, write a proper module
        writeFileSync(
            tmpFile,
            `export default { name: '${plugin.name}', manifest: ${JSON.stringify(plugin.manifest)}, handler: { handle: () => null } };\n`,
        );

        await expect(loadPlugins([tmpFile], '/tmp', registry, DEFAULT_CAPS)).resolves.not.toThrow();
        expect(registry.registered).toHaveLength(1);
    });

    it('accepts a caret range that satisfies the current version', async () => {
        const [major] = currentVersion.split('.').map(Number);
        const range = `^${major}.0.0`;

        const { writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const tmpFile = join(tmpdir(), `test-plugin-caret-${Date.now()}.mjs`);
        writeFileSync(
            tmpFile,
            `export default { name: 'caret-rule', manifest: { name: 'caret-rule', version: '1.0.0', engineVersionRange: '${range}' }, handler: { handle: () => null } };\n`,
        );

        const registry = makeRegistry();
        await expect(loadPlugins([tmpFile], '/tmp', registry, DEFAULT_CAPS)).resolves.not.toThrow();
        expect(registry.registered).toHaveLength(1);
    });

    it('rejects a range that does not include the current version', async () => {
        // Use a version that is certainly in the far future
        const { writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const tmpFile = join(tmpdir(), `test-plugin-badver-${Date.now()}.mjs`);
        writeFileSync(
            tmpFile,
            `export default { name: 'future-rule', manifest: { name: 'future-rule', version: '999.0.0', engineVersionRange: '>=999.0.0' }, handler: { handle: () => null } };\n`,
        );

        const registry = makeRegistry();
        await expect(loadPlugins([tmpFile], '/tmp', registry, DEFAULT_CAPS)).rejects.toThrow(
            /Plugin Load Failure/,
        );
    });
});

// ---------------------------------------------------------------------------
// Capability checks
// ---------------------------------------------------------------------------

describe('loadPlugins — capability validation', () => {
    async function writeTmpPlugin(name: string, capabilities: Record<string, boolean>): Promise<string> {
        const { writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const tmpFile = join(tmpdir(), `test-plugin-caps-${name}-${Date.now()}.mjs`);
        writeFileSync(
            tmpFile,
            `export default { name: '${name}', manifest: { name: '${name}', version: '1.0.0', engineVersionRange: '*', capabilities: ${JSON.stringify(capabilities)} }, handler: { handle: () => null } };\n`,
        );
        return tmpFile;
    }

    it('rejects a plugin requiring typeCheckingEnabled when it is disabled', async () => {
        const tmpFile = await writeTmpPlugin('type-check-rule', { requiresTypeInfo: true });
        const registry = makeRegistry();
        const caps: EngineCapabilities = { ...DEFAULT_CAPS, typeCheckingEnabled: false };
        await expect(loadPlugins([tmpFile], '/tmp', registry, caps)).rejects.toThrow(/Plugin Load Failure/);
    });

    it('accepts a plugin requiring typeCheckingEnabled when it is enabled', async () => {
        const tmpFile = await writeTmpPlugin('type-check-rule-ok', { requiresTypeInfo: true });
        const registry = makeRegistry();
        const caps: EngineCapabilities = { ...DEFAULT_CAPS, typeCheckingEnabled: true };
        await expect(loadPlugins([tmpFile], '/tmp', registry, caps)).resolves.not.toThrow();
    });

    it('rejects a plugin requiring templateAST when it is disabled', async () => {
        const tmpFile = await writeTmpPlugin('template-rule', { requiresTemplateAST: true });
        const registry = makeRegistry();
        const caps: EngineCapabilities = { ...DEFAULT_CAPS, templateASTEnabled: false };
        await expect(loadPlugins([tmpFile], '/tmp', registry, caps)).rejects.toThrow(/Plugin Load Failure/);
    });

    it('rejects a plugin requiring cssAST when it is disabled', async () => {
        const tmpFile = await writeTmpPlugin('css-rule', { requiresCssAST: true });
        const registry = makeRegistry();
        const caps: EngineCapabilities = { ...DEFAULT_CAPS, cssASTEnabled: false };
        await expect(loadPlugins([tmpFile], '/tmp', registry, caps)).rejects.toThrow(/Plugin Load Failure/);
    });
});

// ---------------------------------------------------------------------------
// Invalid plugin structure
// ---------------------------------------------------------------------------

describe('loadPlugins — invalid plugin structure', () => {
    async function writeTmpRaw(name: string, exported: string): Promise<string> {
        const { writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const tmpFile = join(tmpdir(), `test-plugin-invalid-${name}-${Date.now()}.mjs`);
        writeFileSync(tmpFile, `export default ${exported};\n`);
        return tmpFile;
    }

    it('skips a plugin that exports null without throwing', async () => {
        const tmpFile = await writeTmpRaw('null-plugin', 'null');
        const registry = makeRegistry();
        await expect(loadPlugins([tmpFile], '/tmp', registry)).resolves.not.toThrow();
        expect(registry.registered).toHaveLength(0);
    });

    it('skips a plugin with an empty name without throwing', async () => {
        const tmpFile = await writeTmpRaw('empty-name', `{ name: '', handler: { handle: () => null } }`);
        const registry = makeRegistry();
        await expect(loadPlugins([tmpFile], '/tmp', registry)).resolves.not.toThrow();
        expect(registry.registered).toHaveLength(0);
    });

    it('skips a plugin missing a handler without throwing', async () => {
        const tmpFile = await writeTmpRaw('no-handler', `{ name: 'some-rule' }`);
        const registry = makeRegistry();
        await expect(loadPlugins([tmpFile], '/tmp', registry)).resolves.not.toThrow();
        expect(registry.registered).toHaveLength(0);
    });

    it('skips a plugin whose handler.handle is not a function', async () => {
        const tmpFile = await writeTmpRaw('bad-handler', `{ name: 'bad-rule', handler: { handle: 'not-a-function' } }`);
        const registry = makeRegistry();
        await expect(loadPlugins([tmpFile], '/tmp', registry)).resolves.not.toThrow();
        expect(registry.registered).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Array export (plugin bundle)
// ---------------------------------------------------------------------------

describe('loadPlugins — array exports', () => {
    it('registers all valid rules from an array export', async () => {
        const { writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const tmpFile = join(tmpdir(), `test-plugin-array-${Date.now()}.mjs`);
        writeFileSync(
            tmpFile,
            `export default [
              { name: 'rule-a', handler: { handle: () => null } },
              { name: 'rule-b', handler: { handle: () => null } },
            ];\n`,
        );

        const registry = makeRegistry();
        await loadPlugins([tmpFile], '/tmp', registry);
        expect(registry.registered).toHaveLength(2);
        expect(registry.registered.map(r => r.name)).toEqual(['rule-a', 'rule-b']);
    });

    it('registers only the valid rules from a mixed-validity array export', async () => {
        const { writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const tmpFile = join(tmpdir(), `test-plugin-mixed-${Date.now()}.mjs`);
        writeFileSync(
            tmpFile,
            `export default [
              { name: 'valid-rule', handler: { handle: () => null } },
              { name: '', handler: { handle: () => null } },
              null,
            ];\n`,
        );

        const registry = makeRegistry();
        await loadPlugins([tmpFile], '/tmp', registry);
        expect(registry.registered).toHaveLength(1);
        expect(registry.registered[0].name).toBe('valid-rule');
    });
});
