import { describe, it, expect } from 'vitest';
import { resolveRules, getEnabledRules } from '../../src/rules/resolution/resolver.js';
import type { ValidatedConfig } from '@ngcompass/common';

describe('resolveRules (Integration)', () => {
    describe('Simple config without extends', () => {
        it('should resolve rules from config only', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                rules: {
                    'no-console': 'high',
                    'no-var': 'moderate',
                    'prefer-const': 'off',
                },
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.rules.size).toBe(3);
                expect(result.data.rules.get('no-console')?.severity).toBe('high');
                expect(result.data.rules.get('no-var')?.severity).toBe('moderate');
                expect(result.data.rules.get('prefer-const')?.severity).toBe('off');

                expect(result.data.metadata.totalRules).toBe(3);
                expect(result.data.metadata.enabledRules).toBe(2);
                expect(result.data.metadata.disabledRules).toBe(1);
            }
        });

        it('should handle empty rules', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                rules: {},
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.rules.size).toBe(0);
            }
        });
    });

    describe('Config with single extends', () => {
        it('should resolve rules from recommended preset', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                extends: 'recommended',
                rules: {},
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.rules.size).toBeGreaterThan(0);
                expect(result.data.metadata.presetsLoaded).toContain('recommended');

                // Check some expected rules from recommended
                expect(result.data.rules.has('no-console')).toBe(true);
                expect(result.data.rules.has('no-debugger')).toBe(true);
                expect(result.data.rules.has('no-var')).toBe(true);
            }
        });

        it('should override preset rules with user config', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                extends: 'recommended',
                rules: {
                    'no-console': 'off', // Override
                },
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.rules.get('no-console')?.severity).toBe('off');
                // Other preset rules should still be there
                expect(result.data.rules.has('no-var')).toBe(true);
            }
        });
    });

    describe('Config with nested extends (strict extends recommended)', () => {
        it('should resolve nested extends chain', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                extends: 'strict',
                rules: {},
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.metadata.presetsLoaded).toContain('recommended');
                expect(result.data.metadata.presetsLoaded).toContain('strict');

                // Strict should override recommended
                expect(result.data.rules.get('no-console')?.severity).toBe('high'); // From strict
                expect(result.data.rules.get('no-debugger')?.severity).toBe('critical'); // From strict
            }
        });

        it('should allow user config to override nested extends', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                extends: 'strict',
                rules: {
                    'no-console': 'low', // Override strict's "high"
                },
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.rules.get('no-console')?.severity).toBe('low');
            }
        });
    });

    describe('Config with multiple extends', () => {
        it('should resolve multiple presets in order', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                extends: ['recommended', 'strict'],
                rules: {},
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.metadata.presetsLoaded).toContain('recommended');
                expect(result.data.metadata.presetsLoaded).toContain('strict');

                // Last preset (strict) should win
                expect(result.data.rules.get('no-console')?.severity).toBe('high');
            }
        });
    });

    describe('Rule metadata attachment', () => {
        it('should attach metadata to resolved rules', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                rules: {
                    'no-console': 'high',
                },
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                const rule = result.data.rules.get('no-console');
                expect(rule).toBeDefined();
                expect(rule?.metadata).toBeDefined();
                expect(rule?.metadata.name).toBe('no-console');
                expect(rule?.metadata.dependencyType).toBeDefined();
                expect(rule?.metadata.requires).toBeDefined();
            }
        });

        it('should skip unknown rules', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                rules: {
                    'no-console': 'high',
                    'unknown-rule': 'high', // Not in registry
                },
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.rules.has('no-console')).toBe(true);
                expect(result.data.rules.has('unknown-rule')).toBe(false);
                expect(result.data.rules.size).toBe(1);
            }
        });
    });

    describe('Metadata calculation', () => {
        it('should calculate correct metadata', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                rules: {
                    'no-console': 'high',
                    'no-var': 'moderate',
                    'prefer-const': 'off',
                },
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.metadata.totalRules).toBe(3);
                expect(result.data.metadata.enabledRules).toBe(2);
                expect(result.data.metadata.disabledRules).toBe(1);
                expect(result.data.metadata.resolutionTime).toBeGreaterThan(0);
                expect(result.data.metadata.presetsLoaded).toEqual([]);
            }
        });

        it('should track preset loading', async () => {
            const config: ValidatedConfig = {
                include: ['**/*.ts'],
                exclude: [],
                failOnSeverity: 'high',
                extends: ['recommended', 'strict'],
                rules: {},
            };

            const result = await resolveRules(config);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data.metadata.presetsLoaded.length).toBe(2);
            }
        });
    });
});

describe('getEnabledRules (Pure Function)', () => {
    it('should filter out disabled rules', () => {
        const resolvedRules = new Map([
            [
                'no-console',
                {
                    name: 'no-console',
                    severity: 'high' as const,
                    options: {},
                    metadata: {} as any,
                },
            ],
            [
                'no-var',
                {
                    name: 'no-var',
                    severity: 'off' as const,
                    options: {},
                    metadata: {} as any,
                },
            ],
            [
                'prefer-const',
                {
                    name: 'prefer-const',
                    severity: 'moderate' as const,
                    options: {},
                    metadata: {} as any,
                },
            ],
        ]);

        const enabled = getEnabledRules(resolvedRules);

        expect(enabled.size).toBe(2);
        expect(enabled.has('no-console')).toBe(true);
        expect(enabled.has('prefer-const')).toBe(true);
        expect(enabled.has('no-var')).toBe(false);
    });

    it('should return empty map when all rules disabled', () => {
        const resolvedRules = new Map([
            [
                'no-console',
                {
                    name: 'no-console',
                    severity: 'off' as const,
                    options: {},
                    metadata: {} as any,
                },
            ],
        ]);

        const enabled = getEnabledRules(resolvedRules);

        expect(enabled.size).toBe(0);
    });

    it('should not mutate input map', () => {
        const resolvedRules = new Map([
            [
                'no-console',
                {
                    name: 'no-console',
                    severity: 'off' as const,
                    options: {},
                    metadata: {} as any,
                },
            ],
        ]);

        const originalSize = resolvedRules.size;
        getEnabledRules(resolvedRules);

        expect(resolvedRules.size).toBe(originalSize);
    });
});
