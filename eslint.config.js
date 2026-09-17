import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import designTokens from './eslint-rules/design-tokens.js';

export default tseslint.config([
  {
    ignores: ['dist', 'node_modules', 'src/assets'],
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  /*
   * "Tokens, not values", enforced. Scoped to the layer that renders: the
   * shared component layer and the screens built on it. theme.css is where a
   * raw value is allowed to exist, and it is CSS, which this linter does not
   * read.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'design-tokens': designTokens },
    rules: {
      'design-tokens/no-raw-values': 'error',
    },
  },

  /*
   * The lint rules themselves are plain JS run by ESLint under Node, not part
   * of the typechecked app.
   */
  {
    files: ['eslint-rules/**/*.js', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
]);
