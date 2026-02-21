import { PresetConfig } from "../types";

/**
 * All Rules Preset
 *
 * Includes every available rule in the system.
 * Useful for strict projects or discovering new rules.
 */
export const allPreset: PresetConfig = {
    name: 'ngcompass:all',
    description: 'All available rules enabled',
    rules: {
        // ── P0: Migration Blockers ──────────────────────────
        'prefer-on-push-component-change-detection': 'critical',
        'prefer-standalone': 'low',
        'prefer-signal-inputs': 'moderate',
        'template-no-call-expression': 'high',
        'template-prefer-control-flow': 'high',

        // ── P1: High-ROI Quick Wins ─────────────────────────
        'rxjs-no-nested-subscribe': 'high',
        'template-use-track-by-function': 'moderate',
        'no-input-rename': 'moderate',
        'component-selector': 'moderate',
        'directive-selector': 'high',
        'rxjs-prefer-takeuntil': 'high',

        // ── Phase 1: P2 — Migration Support ─────────────────
        'prefer-signal-queries': 'moderate',
        'use-inject': 'moderate',
        'no-attribute-decorator': 'low',
        'template-no-negated-async': 'moderate',
        'rxjs-no-create': 'high',

        // ── Phase 1: P3 — Code Quality & Safety ─────────────
        'implements-on-destroy': 'high',
        'no-output-native': 'high',
        'no-conflicting-lifecycle': 'high',
        'template-no-duplicate-attributes': 'high',
        'no-empty-lifecycle-method': 'moderate',

        // ── Phase 1: P4 — Naming & Conventions ──────────────
        'component-class-suffix': 'moderate',
        'directive-class-suffix': 'moderate',
        'no-output-on-prefix': 'low',
        'no-output-rename': 'moderate',

        // ── Phase 2: Priority 1 — Critical Gaps ─────────────
        'prefer-signal-outputs': 'moderate',
        'no-inner-html': 'high',
        'no-bypass-security-trust': 'high',

        // ── Phase 2: Priority 2 — Naming Conventions ────────
        'pipe-class-suffix': 'moderate',
        'service-class-suffix': 'moderate',
        'guard-class-suffix': 'moderate',

        // ── Phase 2: Priority 3 — Template Coverage ─────────
        'template-no-any-cast': 'high',
        'template-no-inline-styles': 'low',
        'prefer-async-pipe': 'low',

        // ── Phase 2: Priority 4 — Signal Modernisation ──────
        'prefer-computed': 'low',
        'no-ngonchanges-for-derived-state': 'moderate',

        // ── Phase 2: Priority 5 — RxJS Safety ───────────────
        'rxjs-no-async-subscribe': 'high',
        'rxjs-no-subject-value': 'moderate',
    },
};
