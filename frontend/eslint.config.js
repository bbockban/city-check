import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import sortPlugin from 'eslint-plugin-sort-keys-fix';
import unicornPlugin from 'eslint-plugin-unicorn';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    plugins: {
      'unicorn': unicornPlugin,
      'sort-keys-fix': sortPlugin,
      'react': reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      '@stylistic': stylistic,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'array-bracket-newline': [
        'error',
        'consistent',
      ],
      'arrow-body-style': [
        2,
        'as-needed',
      ],
      'arrow-parens': [
        'error',
        'always',
      ],
      'arrow-spacing': 'error',
      camelcase: 0,
      'class-methods-use-this': 0,
      'comma-dangle': [
        2,
        'always-multiline',
      ],
      'default-param-last': 0,
      'global-require': 0,
      'import/imports-first': 0,
      'import/newline-after-import': 0,
      'import/no-cycle': 0,
      'import/no-duplicates': 0,
      'import/no-dynamic-require': 0,
      'import/no-extraneous-dependencies': 0,
      'import/no-named-as-default': 0,
      'import/no-unresolved': 0,
      'import/no-webpack-loader-syntax': 0,
      'import/prefer-default-export': 0,
      'quotes': ['error', 'single'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/jsx-quotes': [
        'error',
        'prefer-double',
      ],
      '@stylistic/comma-spacing': [
        'error',
        {
          before: false,
          after: true,
        },
      ],
      '@stylistic/object-curly-newline': [
        'error',
        {
          ObjectExpression: { multiline: true, minProperties: 4 },
          ObjectPattern: { multiline: true, minProperties: 4 },
          ImportDeclaration: { multiline: true, minProperties: 4 },
          ExportDeclaration: { multiline: true, minProperties: 4 },
        },
      ],
      '@stylistic/object-curly-spacing': [
        'error',
        'always',
        {
          arraysInObjects: true,
          objectsInObjects: true,
        },
      ],
      '@stylistic/key-spacing': [
        'error',
        {
          beforeColon: false,
          afterColon: true,
          mode: 'strict',
        },
      ],
      '@stylistic/no-multi-spaces': [
        'error',
        {
          ignoreEOLComments: false,
        },
      ],
      '@stylistic/space-infix-ops': [
        'error',
        {
          int32Hint: false,
        },
      ],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1, maxBOF: 0 }],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/padded-blocks': ['error', 'never'],
      '@stylistic/space-in-parens': ['error', 'never'],
      '@stylistic/space-before-function-paren': ['error', 'always'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],
      'react/jsx-tag-spacing': [
        'error',
        {
          closingSlash: 'never',
          beforeSelfClosing: 'always',
          afterOpening: 'never',
          beforeClosing: 'never',
        },
      ],
      'react/jsx-curly-brace-presence': [
        'error',
        {
          props: 'never',
          children: 'never',
          propElementValues: 'always',
        },
      ],
      'react/jsx-curly-spacing': [
        'error',
        {
          when: 'never',
          children: true,
          attributes: true,
          spacing: {
            objectLiterals: 'never',
          },
        },
      ],
      'react/jsx-max-props-per-line': [
        'error',
        {
          maximum: 1,
          when: 'multiline',
        },
      ],
      'react/jsx-closing-bracket-location': [
        'error',
        {
          nonEmpty: 'tag-aligned',
          selfClosing: 'tag-aligned',
        },
      ],
      'react/jsx-curly-newline': [
        'error',
        {
          multiline: 'consistent',
          singleline: 'forbid',
        },
      ],
      'react/jsx-closing-tag-location': ['error'],
      'jsx-a11y/aria-props': 2,
      'jsx-a11y/mouse-events-have-key-events': 2,
      'jsx-a11y/role-has-required-aria-props': 2,
      'jsx-a11y/role-supports-aria-props': 2,
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/control-has-associated-label': 'error',
      'jsx-a11y/label-has-associated-control': [
        'error',
        {
          assert: 'both',
          depth: 3,
        },
      ],
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'max-len': 0,
      'newline-per-chained-call': 0,
      'no-confusing-arrow': 0,
      'no-console': 1,
      'no-extra-boolean-cast': 'off',
      'no-return-assign': [
        2,
        'except-parens',
      ],
      'no-shadow': 'off',
      'no-tabs': ['error', { allowIndentationTabs: true }],
      'no-unused-vars': 'off',
      'no-use-before-define': 0,
      'padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          next: [
            'block-like',
            'for',
            'while',
            'multiline-const',
            'function',
            'return',
          ],
          prev: '*',
        },
      ],
      'no-multiple-empty-lines': [
        'error',
        {
          max: 1,
          maxEOF: 1,
          maxBOF: 0,
        },
      ],
      'prefer-template': 2,
      'quote-props': 0,
      'react/button-has-type': 0,
      'react/forbid-prop-types': 0,
      'react/function-component-definition': [
        2,
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      'react/jsx-filename-extension': 0,
      'react/jsx-first-prop-new-line': [
        2,
        'multiline',
      ],
      'react/jsx-no-constructed-context-values': 0,
      'react/jsx-no-target-blank': 0,
      'react/jsx-one-expression-per-line': 0,
      'react/jsx-props-no-spreading': 0,
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/no-unescaped-entities': 'off',
      'react/require-default-props': 0,
      'react/require-extension': 0,
      'react/self-closing-comp': 0,
      'require-yield': 0,
      'semi': 'error',
      'sort-keys': [
        'error',
        'asc',
      ],
      'sort-keys-fix/sort-keys-fix': 'warn',
      'space-before-blocks': 'error',
      'unicorn/catch-error-name': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/explicit-length-check': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-thenable': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
)
