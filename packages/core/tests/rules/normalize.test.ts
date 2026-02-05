import { describe, it, expect } from 'vitest';
import { fc } from 'fast-check';
import {
    normalizeRuleConfig,
    isRuleEnabled,
    normalizeAllRules,
} from '../../src/rules/resolution/normalize.js';
import type { RuleConfig, RuleSeverity } from '../../src/rules/types.js';

describe('normalizeRuleConfig (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should normalize shorthand to full format', () => {
            const result = normalizeRuleConfig('error');

            expect(result).toEqual({
                severity: 'error',
                options: {},
            });
        });

        it('should preserve full format', () => {
            const config = {
                severity: 'high' as RuleSeverity,
                options: { maxLength: 100 },
            };

            const result = normalizeRuleConfig(config);

            expect(result).toEqual(config);
        });

        it('should add empty options when missing', () => {
            const config = {
                severity: 'moderate' as RuleSeverity,
            };

            const result = normalizeRuleConfig(config);

            expect(result).toEqual({
                severity: 'moderate',
                options: {},
            });
        });

        it('should handle all severity levels', () => {
            const severities: RuleSeverity[] = ['off', 'low', 'moderate', 'high', 'critical'];

            severities.forEach(severity => {
                const result = normalizeRuleConfig(severity);
                expect(result.severity).toBe(severity);
            });
        });
    });

    describe('Property-based tests', () => {
        it('should always return full format', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('off', 'low', 'moderate', 'high', 'critical'),
                    (severity) => {
                        const result = normalizeRuleConfig(severity);
                        expect('severity' in result).toBe(true);
                        expect('options' in result).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should be idempotent for full configs', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('off', 'low', 'moderate', 'high', 'critical'),
                    fc.record({ maxLength: fc.integer() }),
                    (severity, options) => {
                        const config: RuleConfig = { severity, options };
                        const once = normalizeRuleConfig(config);
                        const twice = normalizeRuleConfig(once);
                        expect(once).toEqual(twice);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate input config', () => {
            const config = {
                severity: 'high' as RuleSeverity,
                options: { test: true },
            };

            const original = JSON.parse(JSON.stringify(config));
            normalizeRuleConfig(config);

            expect(config).toEqual(original);
        });
    });
});

describe('isRuleEnabled (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should return false for "off"', () => {
            expect(isRuleEnabled('off')).toBe(false);
        });

        it('should return true for all other severities', () => {
            expect(isRuleEnabled('low')).toBe(true);
            expect(isRuleEnabled('moderate')).toBe(true);
            expect(isRuleEnabled('high')).toBe(true);
            expect(isRuleEnabled('critical')).toBe(true);
        });

        it('should work with full config', () => {
            expect(isRuleEnabled({ severity: 'off', options: {} })).toBe(false);
            expect(isRuleEnabled({ severity: 'high', options: {} })).toBe(true);
        });
    });

    describe('Property-based tests', () => {
        it('should always return boolean', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('off', 'low', 'moderate', 'high', 'critical'),
                    (severity) => {
                        const result = isRuleEnabled(severity);
                        expect(typeof result).toBe('boolean');
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});

describe('normalizeAllRules (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should normalize all rules in object', () => {
            const rules = {
                'no-console': 'error',
                'no-var': { severity: 'moderate' as RuleSeverity, options: { foo: 'bar' } },
            };

            const result = normalizeAllRules(rules);

            expect(result.size).toBe(2);
            expect(result.get('no-console')).toEqual({
                severity: 'error',
                options: {},
            });
            expect(result.get('no-var')).toEqual({
                severity: 'moderate',
                options: { foo: 'bar' },
            });
        });

        it('should handle empty object', () => {
            const result = normalizeAllRules({});
            expect(result.size).toBe(0);
        });

        it('should preserve all rule names', () => {
            const rules = {
                rule1: 'off',
                rule2: 'low',
                rule3: 'high',
            };

            const result = normalizeAllRules(rules);

            expect(result.has('rule1')).toBe(true);
            expect(result.has('rule2')).toBe(true);
            expect(result.has('rule3')).toBe(true);
        });
    });

    describe('Property-based tests', () => {
        it('should preserve number of rules', () => {
            fc.assert(
                fc.property(
                    fc.dictionary(
                        fc.string(),
                        fc.constantFrom('off', 'low', 'moderate', 'high', 'critical')
                    ),
                    (rules) => {
                        const result = normalizeAllRules(rules);
                        expect(result.size).toBe(Object.keys(rules).length);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should return Map', () => {
            fc.assert(
                fc.property(
                    fc.dictionary(
                        fc.string(),
                        fc.constantFrom('off', 'low', 'moderate', 'high', 'critical')
                    ),
                    (rules) => {
                        const result = normalizeAllRules(rules);
                        expect(result instanceof Map).toBe(true);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate input object', () => {
            const rules = {
                'no-console': 'error',
                'no-var': 'moderate',
            };

            const original = JSON.parse(JSON.stringify(rules));
            normalizeAllRules(rules);

            expect(rules).toEqual(original);
        });
    });
});
