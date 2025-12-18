// ==============================================================================
// ESLINT FLAT CONFIG
// Uses plugin presets with minimal overrides for Shelly Script project.
// ==============================================================================

import stylistic from '@stylistic/eslint-plugin'
import importX from 'eslint-plugin-import-x'
import jsdoc from 'eslint-plugin-jsdoc'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'

import type { Linter } from 'eslint'

type Rules = Linter.RulesRecord

// ----------------------------------------------------------
// SHELLY GLOBALS
// ----------------------------------------------------------

const shellyGlobals: Record<string, 'readonly' | 'writable'> = {
  Shelly: 'readonly', Timer: 'readonly', KVS: 'readonly', JSON: 'readonly', Script: 'readonly',
  console: 'readonly', print: 'readonly', HTTPServer: 'readonly', MQTT: 'readonly', BLE: 'readonly',
  Webhook: 'readonly', Schedule: 'readonly', Virtual: 'readonly', WebSocket: 'readonly',
  Debug: 'readonly', AES: 'readonly', ArrayBuffer: 'readonly',
  btoa: 'readonly', atob: 'readonly', btoh: 'readonly',
  STATE: 'writable', CONFIG: 'readonly', CONSTANTS: 'readonly',
}

// ----------------------------------------------------------
// SHELLY LANGUAGE RESTRICTIONS (mJS doesn't support ES6+)
// ----------------------------------------------------------

const forbiddenSyntax = [
  ['ArrowFunctionExpression', 'Arrow functions not supported - use function() {}'],
  ['ClassDeclaration', 'Classes not supported'], ['ClassExpression', 'Classes not supported'],
  ['FunctionDeclaration[async=true]', 'async not supported'], ['FunctionExpression[async=true]', 'async not supported'],
  ['AwaitExpression', 'await not supported'],
  ['NewExpression[callee.name="Promise"]', 'Promises not supported'],
  ['CallExpression[callee.object.name="Promise"]', 'Promise methods not supported'],
  ['CallExpression[callee.property.name="then"]', '.then() not supported'],
  ['CallExpression[callee.property.name="catch"]', '.catch() not supported'],
  ['FunctionDeclaration[generator=true]', 'Generators not supported'],
  ['FunctionExpression[generator=true]', 'Generators not supported'],
  ['ForOfStatement', 'for...of not supported'], ['ForInStatement', 'for...in not recommended'],
  ['AssignmentPattern', 'Default params not supported'], ['ObjectPattern', 'Destructuring not supported'],
  ['ArrayPattern', 'Destructuring not supported'], ['SpreadElement', 'Spread not supported'],
  ['RestElement', 'Rest params not supported'], ['TemplateLiteral', 'Template literals not supported'],
  ['TaggedTemplateExpression', 'Tagged templates not supported'],
  ['Property[computed=true]', 'Computed properties not supported'],
  ['Property[method=true]', 'Method shorthand not supported'],
  ['CallExpression[callee.name="Symbol"]', 'Symbol not supported'],
  ['MetaProperty[meta.name="new"]', 'new.target not supported'],
  ['CallExpression > FunctionExpression > BlockStatement CallExpression > FunctionExpression > BlockStatement CallExpression > FunctionExpression', 'Deeply nested callbacks may crash'],
].map(function ([s, m]) { return { selector: s, message: m } })

const forbiddenProps = [
  ['Number', 'isFinite', 'Use global isFinite()'], ['Number', 'isNaN', 'Use global isNaN()'],
  ['Number', 'isInteger', 'Use Math.floor(n) === n'], ['Number', 'isSafeInteger', 'Not supported'],
  ['Number', 'parseFloat', 'Use global parseFloat()'], ['Number', 'parseInt', 'Use global parseInt()'],
  ['Object', 'values', 'Use Object.keys().map()'], ['Object', 'entries', 'Use Object.keys()'],
  ['Object', 'fromEntries', 'Build manually'], ['Array', 'from', 'Use iteration'], ['Array', 'of', 'Use []'],
  ['String', 'fromCodePoint', 'Use fromCharCode'],
  ['Math', 'trunc', 'Use floor/ceil'], ['Math', 'sign', 'Use (n>0)-(n<0)'],
  ['Math', 'cbrt', 'Use pow(n,1/3)'], ['Math', 'log2', 'Use log(n)/LN2'],
  ['Math', 'log10', 'Use log(n)/LN10'], ['Math', 'hypot', 'Use sqrt(a*a+b*b)'],
].map(function ([o, p, m]) { return { object: o, property: p, message: m } })

// ----------------------------------------------------------
// STYLISTIC CONFIG (customize preset)
// ----------------------------------------------------------

const stylisticConfig = stylistic.configs.customize({
  indent: 2, quotes: 'single', semi: false, commaDangle: 'always-multiline', braceStyle: '1tbs',
})

// ----------------------------------------------------------
// RULE SETS
// ----------------------------------------------------------

const stylisticOverrides: Rules = {
  '@stylistic/no-multi-spaces': ['error', { ignoreEOLComments: true }],
  '@stylistic/quote-props': 'off',
  '@stylistic/arrow-parens': 'off',
  '@stylistic/max-statements-per-line': 'off',
  '@stylistic/indent-binary-ops': 'off',
  '@stylistic/padded-blocks': 'off',
  '@stylistic/member-delimiter-style': ['error', { multiline: { delimiter: 'none' }, singleline: { delimiter: 'semi' } }],
}

const shellyRules: Rules = {
  'no-restricted-syntax': ['error', ...forbiddenSyntax],
  'no-restricted-properties': ['error', ...forbiddenProps],
  'object-shorthand': ['error', 'never'],
  'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
  'prefer-const': 'off',
  'max-depth': ['warn', 4],
  'max-nested-callbacks': ['warn', 3],
  'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
  'max-params': ['warn', 5],
}

const jsdocRules: Rules = {
  'jsdoc/require-jsdoc': ['warn', { require: { FunctionDeclaration: true } }],
  'jsdoc/check-syntax': 'error',
  'jsdoc/check-types': 'error',
  'jsdoc/valid-types': 'error',
  'jsdoc/check-param-names': 'error',
  'jsdoc/check-tag-names': ['error', { definedTags: ['category', 'internal', 'reads'] }],
  'jsdoc/require-returns': 'off',
  'jsdoc/require-description': ['error', { checkConstructors: false, contexts: ['FunctionDeclaration'] }],
  'jsdoc/require-param-description': 'warn',
  'jsdoc/require-returns-description': 'off',
  'jsdoc/require-param-type': 'warn',
  'jsdoc/require-returns-type': 'warn',
  'jsdoc/check-alignment': 'error',
  'jsdoc/check-indentation': 'off',
  'jsdoc/empty-tags': 'error',
  'jsdoc/no-undefined-types': 'off',
}

const qualityRules: Rules = {
  'eqeqeq': ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'no-console': 'off',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-throw-literal': 'error',
  'complexity': ['warn', 15],
  'sonarjs/cognitive-complexity': ['warn', 15],
  'sonarjs/no-identical-functions': 'warn',
  'sonarjs/no-duplicated-branches': 'error',
  'sonarjs/no-collapsible-if': 'warn',
  'sonarjs/no-redundant-jump': 'error',
  'sonarjs/no-same-line-conditional': 'error',
  'sonarjs/no-collection-size-mischeck': 'error',
  'sonarjs/prefer-single-boolean-return': 'warn',
  'sonarjs/no-small-switch': 'warn',
  'sonarjs/no-all-duplicated-branches': 'error',
}

const tsRules: Rules = {
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'off',
}

const importRules: Rules = {
  'import-x/order': ['error', {
    'groups': ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
    'newlines-between': 'always',
    'alphabetize': { order: 'asc', caseInsensitive: true },
  }],
}

// Disable rules for tests/tools
const relaxedRules: Rules = {
  'no-restricted-syntax': 'off', 'no-restricted-properties': 'off', 'object-shorthand': 'off',
  'max-depth': 'off', 'max-nested-callbacks': 'off', 'max-lines-per-function': 'off',
  'max-params': 'off', 'complexity': 'off',
  'sonarjs/cognitive-complexity': 'off', 'sonarjs/no-identical-functions': 'off',
  'sonarjs/no-collapsible-if': 'off', 'sonarjs/no-duplicated-branches': 'off',
}

// ==============================================================================
// MAIN CONFIG
// ==============================================================================

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'logs/**', 'src/test-utils/**', '.stryker-tmp/**', 'reports/**'] },

  // SOURCE FILES (Shelly Device Code)
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2015, sourceType: 'module', globals: shellyGlobals },
    plugins: { '@stylistic': stylistic, 'jsdoc': jsdoc, 'sonarjs': sonarjs },
    rules: {
      ...stylisticConfig.rules, ...stylisticOverrides, ...shellyRules, ...jsdocRules, ...qualityRules,
      'no-var': 'off', 'no-unused-vars': 'off',
    },
  },

  // TEST FILES (Node.js)
  {
    files: ['src/**/*.test.js', 'test/**/*.test.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'module' },
    plugins: { '@stylistic': stylistic, 'sonarjs': sonarjs },
    rules: { ...stylisticConfig.rules, ...stylisticOverrides, ...qualityRules, ...relaxedRules, 'jsdoc/require-jsdoc': 'off' },
  },

  // TOOLS (TypeScript)
  {
    files: ['tools/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: ['./tools/tsconfig.json'], ecmaVersion: 2020, sourceType: 'module' },
    },
    plugins: { '@stylistic': stylistic, '@typescript-eslint': tseslint.plugin, 'import-x': importX, 'sonarjs': sonarjs },
    rules: { ...stylisticConfig.rules, ...stylisticOverrides, ...qualityRules, ...tsRules, ...importRules, ...relaxedRules },
  },

  // CONFIG FILES
  {
    files: ['*.config.ts', '*.config.js'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: null, ecmaVersion: 2020, sourceType: 'module' },
    },
    plugins: { '@stylistic': stylistic, '@typescript-eslint': tseslint.plugin, 'import-x': importX },
    rules: {
      ...stylisticConfig.rules, ...stylisticOverrides, ...importRules,
      'no-restricted-syntax': 'off', 'no-restricted-properties': 'off',
      'object-shorthand': 'off', '@typescript-eslint/no-unused-vars': 'off',
    },
  },
)
