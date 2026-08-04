import { describe, expect, it, beforeEach } from 'vitest';
import type {
  NormalizedAnalyzerConfig,
  RuleMetadata,
} from '@ngcompass/common';
import { decideVersionGate } from '../src/resolution/angular-version.js';
import { resolveRules } from '../src/resolution/resolver.js';
import { registerAllBuiltinRules } from '../src/registry/register-all.js';
import { resetGlobalRegistry } from '../src/registry/rule-registry.js';

const GATED_RULE = 'signal-prefer-model';
const UNGATED_RULE = 'no-bypass-sanitization';

function buildMetadata(minAngularVersion?: string): RuleMetadata {
  return {
    name: 'test-rule',
    description: 'test',
    category: 'modern-api',
    dependencyType: 'component',
    requires: { tsAst: true },
    minAngularVersion,
  };
}

function buildConfig(
  angularVersion: string | null,
  rules: NormalizedAnalyzerConfig['rules']
): NormalizedAnalyzerConfig {
  return {
    extends: ['ngcompass:all'],
    rules,
    angularVersion,
    cache: {
      enabled: false,
      location: '.ngcompass-cache',
      strategy: 'memory',
      ttl: 0,
    },
    maxWorkers: 1,
    outputFormat: 'json',
    failOnSeverity: 'error',
    maxWarnings: 10,
  };
}

describe('decideVersionGate', () => {
  it('runs a rule that declares no floor', () => {
    expect(decideVersionGate(buildMetadata(), '15.0', false)).toBe('run');
  });

  it('skips a rule whose floor is above the detected version', () => {
    expect(decideVersionGate(buildMetadata('17.2'), '17.1', false)).toBe(
      'skip'
    );
  });

  it('runs a rule whose floor equals the detected version', () => {
    expect(decideVersionGate(buildMetadata('17.2'), '17.2', false)).toBe('run');
  });

  it('runs every floored rule when the version is unknown', () => {
    expect(decideVersionGate(buildMetadata('17.2'), null, false)).toBe('run');
  });

  it('runs a floored rule the user configured explicitly', () => {
    expect(decideVersionGate(buildMetadata('17.2'), '15.0', true)).toBe('run');
  });

  it('reports an unparseable floor instead of skipping the rule', () => {
    expect(decideVersionGate(buildMetadata('^17.2'), '15.0', false)).toBe(
      'invalid-floor'
    );
  });
});

describe('resolveRules version gating', () => {
  beforeEach(() => {
    resetGlobalRegistry();
    registerAllBuiltinRules();
  });

  it('drops preset rules that require a newer Angular', async () => {
    const result = await resolveRules(buildConfig('15.0', {}), process.cwd());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rules.has(GATED_RULE)).toBe(false);
    expect(result.data.metadata.skippedByVersion).toContain(GATED_RULE);
  });

  it('keeps rules without a floor at any Angular version', async () => {
    const result = await resolveRules(buildConfig('15.0', {}), process.cwd());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rules.has(UNGATED_RULE)).toBe(true);
    expect(result.data.metadata.skippedByVersion).not.toContain(UNGATED_RULE);
  });

  it('keeps a floored rule the user named explicitly', async () => {
    const result = await resolveRules(
      buildConfig('15.0', { [GATED_RULE]: 'error' }),
      process.cwd()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rules.has(GATED_RULE)).toBe(true);
    expect(result.data.metadata.skippedByVersion).not.toContain(GATED_RULE);
  });

  it('skips nothing when the Angular version is unknown', async () => {
    const result = await resolveRules(buildConfig(null, {}), process.cwd());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.metadata.skippedByVersion).toEqual([]);
    expect(result.data.rules.has(GATED_RULE)).toBe(true);
  });

  it('skips nothing on a recent Angular version', async () => {
    const result = await resolveRules(buildConfig('20.0', {}), process.cwd());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.metadata.skippedByVersion).toEqual([]);
  });

  it('drops progressively more rules on older Angular versions', async () => {
    const onFifteen = await resolveRules(
      buildConfig('15.0', {}),
      process.cwd()
    );
    const onSeventeenTwo = await resolveRules(
      buildConfig('17.2', {}),
      process.cwd()
    );

    expect(onFifteen.ok && onSeventeenTwo.ok).toBe(true);
    if (!onFifteen.ok || !onSeventeenTwo.ok) return;

    expect(
      onFifteen.data.metadata.skippedByVersion.length
    ).toBeGreaterThan(onSeventeenTwo.data.metadata.skippedByVersion.length);
  });
});
