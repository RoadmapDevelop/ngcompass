import { describe, it, expect } from 'vitest';
import { fc } from 'fast-check';
import {
    mergeRuleConfig,
    mergeRulesConfigs,
    applyOverrides,
} from '../../src/rules/resolution/merger.js';
import type { RuleConfig, RuleSeverity } from '../../src/rules/types.js';

describe('mergeRuleConfig (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should override severity', () => {
            const base: RuleConfig = 'moderate';
            const override: RuleConfig = 'high';

            const result = mergeRuleConfig(base, override);

            expect(result.severity).toBe('high');
        });

        it('should merge options', () => {
            const base: RuleConfig = {
                severity: 'moderate',
                options: { foo: 'bar', shared: 'base' },
            };
            const override: RuleConfig = {
                severity: 'high',
                options: { baz: 'qux', shared: 'override' },
            };

            const result = mergeRuleConfig(base, override);

            expect(result).toEqual({
                severity: 'high',
                options: {
                    foo: 'bar',
                    baz: 'qux',
                    shared: 'override',
                },
            });
        });

        it('should handle shorthand override', () => {
            const base: RuleConfig = {
                severity: 'moderate',
                options: { foo: 'bar' },
            };
            const override: RuleConfig = 'off';

            const result = mergeRuleConfig(base, override);

            expect(result).toEqual({
                severity: 'off',
                options: { foo: 'bar' }, // Preserved
            });
        });

        it('should handle both shorthand', () => {
            const base: RuleConfig = 'low';
            const override: RuleConfig = 'high';

            const result = mergeRuleConfig(base, override);

            expect(result).toEqual({
                severity: 'high',
                options: {},
            });
        });
    });

    describe('Property-based tests', () => {
        it('should always use override severity', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('off', 'low', 'moderate', 'high', 'critical'),
                    fc.constantFrom('off', 'low', 'moderate', 'high', 'critical'),
                    (baseSeverity, overrideSeverity) => {
                        const result = mergeRuleConfig(baseSeverity, overrideSeverity);
                        expect(result.severity).toBe(overrideSeverity);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate inputs', () => {
            const base = {
                severity: 'moderate' as RuleSeverity,
                options: { test: true },
            };
            const override = {
                severity: 'high' as RuleSeverity,
                options: { other: false },
            };

            const originalBase = JSON.parse(JSON.stringify(base));
            const originalOverride = JSON.parse(JSON.stringify(override));

            mergeRuleConfig(base, override);

            expect(base).toEqual(originalBase);
            expect(override).toEqual(originalOverride);
        });
    });
});

describe('mergeRulesConfigs (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should merge multiple configs with precedence', () => {
            const configs = [
                { 'no-console': 'low', 'no-var': 'moderate' },
                { 'no-console': 'high', 'prefer-const': 'low' },
                { 'no-console': 'off' },
            ];

            const result = mergeRulesConfigs(configs);

            expect(result.get('no-console')?.severity).toBe('off'); // Last wins
            expect(result.get('no-var')?.severity).toBe('moderate');
            expect(result.get('prefer-const')?.severity).toBe('low');
        });

        it('should handle empty array', () => {
            const result = mergeRulesConfigs([]);
            expect(result.size).toBe(0);
        });

        it('should handle single config', () => {
            const configs = [{ 'no-console': 'high' }];
            const result = mergeRulesConfigs(configs);

            expect(result.size).toBe(1);
            expect(result.get('no-console')?.severity).toBe('high');
        });

        it('should merge options from multiple sources', () => {
            const configs = [
                {
                    'rule1': {
                        severity: 'moderate' as RuleSeverity,
                        options: { a: 1, b: 2 },
                    },
                },
                {
                    'rule1': {
                        severity: 'high' as RuleSeverity,
                        options: { b: 3, c: 4 },
                    },
                },
            ];

            const result = mergeRulesConfigs(configs);
            const rule = result.get('rule1');

            expect(rule?.severity).toBe('high');
            expect(rule?.options).toEqual({ a: 1, b: 3, c: 4 });
        });
    });

    describe('Property-based tests', () => {
        it('should preserve all rule names', () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.dictionary(
                            fc.string(),
                            fc.constantFrom('off', 'low', 'moderate', 'high', 'critical')
                        ),
                        { minLength: 1, maxLength: 5 }
                    ),
                    (configs) => {
                        const result = mergeRulesConfigs(configs);
                        const allRules = new Set(
                            configs.flatMap(c => Object.keys(c))
                        );
                        expect(result.size).toBe(allRules.size);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate input configs', () => {
            const configs = [
                { 'no-console': 'low' },
                { 'no-var': 'moderate' },
            ];

            const original = JSON.parse(JSON.stringify(configs));
            mergeRulesConfigs(configs);

            expect(configs).toEqual(original);
        });
    });
});

describe('applyOverrides (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should override existing rules', () => {
            const base = new Map([
                ['no-console', { severity: 'moderate' as RuleSeverity, options: {} }],
                ['no-var', { severity: 'low' as RuleSeverity, options: {} }],
            ]);
            const overrides = {
                'no-console': 'off',
            };

            const result = applyOverrides(base, overrides);

            expect(result.get('no-console')?.severity).toBe('off');
            expect(result.get('no-var')?.severity).toBe('low');
        });

        it('should add new rules', () => {
            const base = new Map([
                ['no-console', { severity: 'moderate' as RuleSeverity, options: {} }],
            ]);
            const overrides = {
                'prefer-const': 'high',
            };

            const result = applyOverrides(base, overrides);

            expect(result.size).toBe(2);
            expect(result.get('prefer-const')?.severity).toBe('high');
        });

        it('should merge options', () => {
            const base = new Map([
                [
                    'rule1',
                    {
                        severity: 'moderate' as RuleSeverity,
                        options: { foo: 'bar', keep: true },
                    },
                ],
            ]);
            const overrides = {
                rule1: {
                    severity: 'high' as RuleSeverity,
                    options: { foo: 'baz', new: 'value' },
                },
            };

            const result = applyOverrides(base, overrides);
            const rule = result.get('rule1');

            expect(rule?.severity).toBe('high');
            expect(rule?.options).toEqual({
                foo: 'baz',
                keep: true,
                new: 'value',
            });
        });

        it('should handle empty overrides', () => {
            const base = new Map([
                ['no-console', { severity: 'moderate' as RuleSeverity, options: {} }],
            ]);

            const result = applyOverrides(base, {});

            expect(result).toEqual(base);
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate base map', () => {
            const base = new Map([
                ['no-console', { severity: 'moderate' as RuleSeverity, options: {} }],
            ]);
            const originalSize = base.size;

            applyOverrides(base, { 'new-rule': 'high' });

            expect(base.size).toBe(originalSize);
        });

        it('should not mutate overrides object', () => {
            const base = new Map();
            const overrides = { 'no-console': 'high' };
            const original = JSON.parse(JSON.stringify(overrides));

            applyOverrides(base, overrides);

            expect(overrides).toEqual(original);
        });
    });
});
