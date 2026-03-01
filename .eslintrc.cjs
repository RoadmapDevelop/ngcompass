module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'common', pattern: 'packages/common/src/*' },
      { type: 'core', pattern: 'packages/core/src/*' },
      { type: 'engine', pattern: 'packages/engine/src/*' },
      { type: 'reporters', pattern: 'packages/reporters/src/*' },
      { type: 'rules', pattern: 'packages/rules/src/*' },
      { type: 'testing', pattern: 'packages/testing/src/*' },
      { type: 'cli', pattern: 'packages/cli/src/*' },
    ]
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/unbound-method': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'boundaries/element-types': ['warn', {
      default: 'disallow',
      rules: [
        { from: 'core',      allow: ['common'] },
        { from: 'reporters', allow: ['common'] },
        { from: 'engine',    allow: ['common'] },
        { from: 'rules',     allow: ['common', 'core', 'engine'] },
        { from: 'testing',   allow: ['common'] },
        { from: 'cli',       allow: ['common', 'core', 'reporters', 'rules'] },
      ]
    }],
    'no-restricted-imports': ['error', {
      patterns: [
        '@ngcompass/*/src/*',
        '@ngcompass/*/dist/*',
      ]
    }]
  },
  ignorePatterns: ['dist', 'node_modules', '*.js'],
};