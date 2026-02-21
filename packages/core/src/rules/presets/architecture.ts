import type { PresetConfig } from '../types.js';

/**
 * Architecture Preset
 *
 * Rules related to component/directive structure, naming conventions,
 * and architectural patterns like Standalone and Dependency Injection.
 */
export const architecturePreset: PresetConfig = {
    name: 'ngcompass:architecture',
    description: 'Rules for project architecture and naming conventions',
    rules: {
        'prefer-standalone': 'moderate',
        'use-inject': 'moderate',
        'component-selector': 'moderate',
        'directive-selector': 'moderate',
        'component-class-suffix': 'moderate',
        'directive-class-suffix': 'moderate',
        'pipe-class-suffix': 'moderate',
        'service-class-suffix': 'moderate',
        'guard-class-suffix': 'moderate',
        'implements-on-destroy': 'moderate',
    },
};
