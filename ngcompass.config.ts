
/**
 * Compass Configuration
 */
export default {
    extends: [],
    rules: {
        'prefer-on-push-component-change-detection': 'high',
        'template-no-call-expression': 'high'
    },
    include: ['**/*.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.spec.ts', '**/*.test.ts']
};
