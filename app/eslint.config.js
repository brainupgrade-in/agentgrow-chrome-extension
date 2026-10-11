import tseslint from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...tseslint.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
