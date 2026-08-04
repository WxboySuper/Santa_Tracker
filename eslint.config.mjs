import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jest from 'eslint-plugin-jest';
import testingLibrary from 'eslint-plugin-testing-library';

export default [
  {
    ignores: [
      '**/build/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ...react.configs.flat.recommended,
    files: ['**/*.{jsx,tsx}'],
    settings: { react: { version: 'detect' } },
  },
  {
    ...react.configs.flat['jsx-runtime'],
    files: ['**/*.{jsx,tsx}'],
    rules: {
      ...react.configs.flat['jsx-runtime'].rules,
      'react/prop-types': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['server/**/*.js', 'scripts/**/*.js', '*.js', '*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    ...jest.configs['flat/recommended'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      // Tests use require() legitimately for jest.mock factories and
      // jest.isolateModules fresh-module loading, which static imports defeat.
      '@typescript-eslint/no-require-imports': 'off',
      // Data-driven it.each/loop tests intentionally branch assertions on the test
      // input (e.g. "expectedError ? expect(error) : expect(success)"). Rewriting
      // those to be unconditional weakens the assertions.
      'jest/no-conditional-expect': 'off',
      // Assertion helpers that call expect() internally.
      'jest/expect-expect': ['error', {
        assertFunctionNames: [
          'expect',
          'expectRegistryValidationError',
          'expectBeforeSendToDrop',
          'expectBeforeSendToKeep',
          'expectCopyVerification',
          'expectCopyResult',
          'expectOutlookTypeEmpty',
          'assertGatedRoutesAbsent',
          'assertNavigationHidden',
        ],
      }],
    },
  },
  {
    files: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    ...testingLibrary.configs['flat/react'],
    rules: {
      ...testingLibrary.configs['flat/react'].rules,
      'react/display-name': 'off',
      // Mandates naming every render() result "view"; multiple renders in one test
      // scope then cannot be named. Stylistic only, so leave it off.
      'testing-library/render-result-naming-convention': 'off',
    },
  },
  {
    files: ['e2e/**/*.{js,ts}'],
    rules: {
      'jest/expect-expect': 'off',
      'testing-library/prefer-screen-queries': 'off',
      'testing-library/no-conditional-expect': 'off',
    },
  },
];
