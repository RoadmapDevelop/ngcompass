
/**
 * Compass Configuration
 */
export default {
    extends: [],
    rules: {
        'component-selector': {
            severity: 'warning',
            options: { prefix: 'tui', type: 'element' }
        },
        'directive-selector': {
            severity: 'warning',
            options: { prefix: 'tui', type: 'attribute' }
        },
        'prefer-on-push-component-change-detection': 'high',
        'template-no-call-expression': 'high'
    },
    include: ['**/*.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.spec.ts', '**/*.test.ts']
};
