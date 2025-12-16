// ==============================================================================
// * ESLINT FLAT CONFIG (TypeScript)
// ? ESLint configuration with Stylistic formatting for Shelly Script project.
// ? Inspired by Anthony Fu's approach - ESLint handles both linting and formatting.
// ==============================================================================


import stylistic from '@stylistic/eslint-plugin'
import importX from 'eslint-plugin-import-x'
import jsdoc from 'eslint-plugin-jsdoc'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'

import type { Linter } from 'eslint'

// ----------------------------------------------------------
// * TYPE DEFINITIONS
// ----------------------------------------------------------
type GlobalValue = 'readonly' | 'writable' | 'off'
type Globals = Record<string, GlobalValue>
type Rules = Linter.RulesRecord

// ----------------------------------------------------------
// * SHELLY ENVIRONMENT GLOBALS
// ? Define Shelly-specific globals to prevent "undefined" errors.
// ? Reference: https://shelly-api-docs.shelly.cloud/gen2/Scripts/ShellyScriptLanguageFeatures
// ----------------------------------------------------------
const shellyGlobals: Globals = {
  // Core Shelly APIs
  Shelly: 'readonly',
  Timer: 'readonly',
  KVS: 'readonly',
  JSON: 'readonly',
  Script: 'readonly', // Script.id, Script.storage

  // Standard JS globals (ES2015)
  console: 'readonly',
  print: 'readonly',

  // Shelly event handlers
  HTTPServer: 'readonly',
  MQTT: 'readonly',
  BLE: 'readonly',
  Webhook: 'readonly',
  Schedule: 'readonly',

  // Virtual components
  Virtual: 'readonly',

  // Networking
  WebSocket: 'readonly',

  // System
  Debug: 'readonly',

  // Crypto (Gen 3/4 only, v1.6.0+)
  AES: 'readonly',
  ArrayBuffer: 'readonly',

  // Data conversion utilities
  btoa: 'readonly', // Binary to base64
  atob: 'readonly', // Base64 to binary
  btoh: 'readonly', // Binary to hex

  // Global state (project-specific)
  STATE: 'writable',
  CONFIG: 'readonly',
  CONSTANTS: 'readonly',
}

// ----------------------------------------------------------
// * SHELLY LANGUAGE RESTRICTIONS
// ? Rules enforcing Shelly Script limitations (see official Shelly docs).
// ? These are NOT SUPPORTED in Shelly's Espruino-based JS engine.
// ----------------------------------------------------------
const shellyLanguageRules: Rules = {
  // ❌ NO ES6 CLASSES - Use function prototypes instead
  // ❌ NO PROMISES/ASYNC - Use callbacks instead
  // ❌ NO DEEPLY NESTED ANONYMOUS FUNCTIONS - Causes device crashes (>2-3 levels)
  // ❌ NO DEFAULT PARAMETERS - Use x = x || default pattern
  // ❌ NO DESTRUCTURING - Use explicit property access
  // ❌ NO SPREAD OPERATOR - Use Object.assign or manual copy
  // ❌ NO TEMPLATE LITERALS - Use string concatenation
  // ❌ NO SHORTHAND PROPERTIES - Use explicit { a: a }
  // ❌ NO ARROW FUNCTIONS - Use function expressions
  'no-restricted-syntax': [
    'error',
    // Forbid arrow functions (ES6, not reliably supported in mJS)
    {
      selector: 'ArrowFunctionExpression',
      message: 'Arrow functions not supported in Shelly - use function() {}',
    },
    // Forbid classes (ES6 not supported)
    {
      selector: 'ClassDeclaration',
      message: 'Classes not supported in Shelly - use functions and objects',
    },
    {
      selector: 'ClassExpression',
      message: 'Classes not supported in Shelly - use functions and objects',
    },
    // Forbid async/await (Promises not supported)
    {
      selector: 'FunctionDeclaration[async=true]',
      message: 'async/await not supported in Shelly - use callbacks instead',
    },
    {
      selector: 'FunctionExpression[async=true]',
      message: 'async/await not supported in Shelly - use callbacks instead',
    },
    {
      selector: 'AwaitExpression',
      message: 'await not supported in Shelly - use callbacks instead',
    },
    // Forbid Promise constructor and methods
    {
      selector: 'NewExpression[callee.name="Promise"]',
      message: 'Promises not supported in Shelly - use callbacks instead',
    },
    {
      selector: 'CallExpression[callee.object.name="Promise"]',
      message: 'Promise methods not supported in Shelly - use callbacks instead',
    },
    // Warn about .then() and .catch() (Promise chains)
    {
      selector: 'CallExpression[callee.property.name="then"]',
      message: 'Promise.then() not supported in Shelly - use callbacks instead',
    },
    {
      selector: 'CallExpression[callee.property.name="catch"]',
      message: 'Promise.catch() not supported in Shelly - use callbacks instead',
    },
    // Forbid generators (not supported)
    {
      selector: 'FunctionDeclaration[generator=true]',
      message: 'Generators not supported in Shelly',
    },
    {
      selector: 'FunctionExpression[generator=true]',
      message: 'Generators not supported in Shelly',
    },
    // Warn about deeply nested anonymous callbacks (risk of crash)
    // This catches anonymous functions inside anonymous functions inside anonymous functions
    {
      selector: 'CallExpression > FunctionExpression > BlockStatement CallExpression > FunctionExpression > BlockStatement CallExpression > FunctionExpression',
      message: 'Deeply nested anonymous callbacks (>2 levels) may crash Shelly - use named functions',
    },
    // Forbid for...of (may not work correctly in all cases)
    {
      selector: 'ForOfStatement',
      message: 'for...of may not work correctly in Shelly - use traditional for loop',
    },
    // Forbid for...in on arrays (use traditional for loop)
    {
      selector: 'ForInStatement',
      message: 'for...in not recommended in Shelly - use traditional for loop with Object.keys()',
    },
    // Forbid default parameters (not supported in mJS)
    {
      selector: 'AssignmentPattern',
      message: 'Default parameters not supported in Shelly - use var x = x || default inside function',
    },
    // Forbid destructuring (not supported in mJS)
    {
      selector: 'ObjectPattern',
      message: 'Object destructuring not supported in Shelly - use explicit property access',
    },
    {
      selector: 'ArrayPattern',
      message: 'Array destructuring not supported in Shelly - use explicit index access',
    },
    // Forbid spread operator (not supported in mJS)
    {
      selector: 'SpreadElement',
      message: 'Spread operator not supported in Shelly - use Object.assign or manual copy',
    },
    {
      selector: 'RestElement',
      message: 'Rest parameters not supported in Shelly - use arguments object',
    },
    // Forbid template literals (not supported in mJS)
    {
      selector: 'TemplateLiteral',
      message: 'Template literals not supported in Shelly - use string concatenation',
    },
    // Forbid tagged template literals
    {
      selector: 'TaggedTemplateExpression',
      message: 'Tagged templates not supported in Shelly - use string concatenation',
    },
    // Forbid computed property names: { [key]: value }
    {
      selector: 'Property[computed=true]',
      message: 'Computed property names not supported in Shelly - use bracket notation after object creation',
    },
    // Forbid method shorthand in objects: { foo() {} }
    {
      selector: 'Property[method=true]',
      message: 'Method shorthand not supported in Shelly - use foo: function() {}',
    },
    // Forbid Symbol
    {
      selector: 'CallExpression[callee.name="Symbol"]',
      message: 'Symbol not supported in Shelly',
    },
    // Forbid new.target
    {
      selector: 'MetaProperty[meta.name="new"]',
      message: 'new.target not supported in Shelly',
    },
  ],

  // Forbid shorthand properties: { a } must be { a: a }
  'object-shorthand': ['error', 'never'],

  // Variables must be declared before use (no hoisting reliance)
  // Note: functions: false because function declarations ARE hoisted within their scope
  // and mutual recursion patterns are common and valid
  'no-use-before-define': ['error', {
    functions: false,
    classes: true,
    variables: true,
  }],

  // ❌ NO ES6+ STATIC METHODS - Use global equivalents or polyfills
  // Number.isFinite → isFinite, Number.isNaN → isNaN, etc.
  'no-restricted-properties': ['error',
    // Number static methods (ES6+)
    {
      object: 'Number',
      property: 'isFinite',
      message: 'Number.isFinite not supported in Shelly - use global isFinite() instead',
    },
    {
      object: 'Number',
      property: 'isNaN',
      message: 'Number.isNaN not supported in Shelly - use global isNaN() instead',
    },
    {
      object: 'Number',
      property: 'isInteger',
      message: 'Number.isInteger not supported in Shelly - use Math.floor(n) === n instead',
    },
    {
      object: 'Number',
      property: 'isSafeInteger',
      message: 'Number.isSafeInteger not supported in Shelly',
    },
    {
      object: 'Number',
      property: 'parseFloat',
      message: 'Number.parseFloat not supported in Shelly - use global parseFloat() instead',
    },
    {
      object: 'Number',
      property: 'parseInt',
      message: 'Number.parseInt not supported in Shelly - use global parseInt() instead',
    },
    // Object static methods (ES6+)
    {
      object: 'Object',
      property: 'values',
      message: 'Object.values not supported in Shelly - use Object.keys(obj).map(k => obj[k])',
    },
    {
      object: 'Object',
      property: 'entries',
      message: 'Object.entries not supported in Shelly - use Object.keys with manual value access',
    },
    {
      object: 'Object',
      property: 'fromEntries',
      message: 'Object.fromEntries not supported in Shelly - build object manually',
    },
    // Array static methods (ES6+)
    {
      object: 'Array',
      property: 'from',
      message: 'Array.from not supported in Shelly - use manual iteration',
    },
    {
      object: 'Array',
      property: 'of',
      message: 'Array.of not supported in Shelly - use array literal []',
    },
    // String methods (ES6+)
    {
      object: 'String',
      property: 'fromCodePoint',
      message: 'String.fromCodePoint not supported in Shelly - use String.fromCharCode',
    },
    // Math methods (ES6+)
    {
      object: 'Math',
      property: 'trunc',
      message: 'Math.trunc not supported in Shelly - use Math.floor for positive, Math.ceil for negative',
    },
    {
      object: 'Math',
      property: 'sign',
      message: 'Math.sign not supported in Shelly - use (n > 0) - (n < 0)',
    },
    {
      object: 'Math',
      property: 'cbrt',
      message: 'Math.cbrt not supported in Shelly - use Math.pow(n, 1/3)',
    },
    {
      object: 'Math',
      property: 'log2',
      message: 'Math.log2 not supported in Shelly - use Math.log(n) / Math.LN2',
    },
    {
      object: 'Math',
      property: 'log10',
      message: 'Math.log10 not supported in Shelly - use Math.log(n) / Math.LN10',
    },
    {
      object: 'Math',
      property: 'hypot',
      message: 'Math.hypot not supported in Shelly - use Math.sqrt(a*a + b*b)',
    },
  ],
}

// ----------------------------------------------------------
// * MEMORY-CONSCIOUS RULES
// ? Custom rules for Shelly's memory-constrained environment (~25KB heap).
// ----------------------------------------------------------
const shellyMemoryRules: Rules = {
  // Prefer 'let' over 'const' - const creates immutable bindings (slight overhead)
  'prefer-const': 'off',

  // Limit nested functions (closures capture scope = memory)
  'max-depth': ['warn', 4],

  // Limit callback nesting to prevent stack issues
  'max-nested-callbacks': ['warn', 3],

  // Encourage shorter variable names in production (but readable in dev)
  'id-length': 'off',

  // Avoid object spread (creates copies)
  'prefer-object-spread': 'off',

  // No unnecessary template literals
  'prefer-template': 'off',

  // Warn about large functions (memory/complexity)
  'max-lines-per-function': ['warn', {
    max: 100,
    skipBlankLines: true,
    skipComments: true,
  }],

  // Limit parameters (simplifies call overhead)
  'max-params': ['warn', 5],
}

// ----------------------------------------------------------
// * STYLISTIC FORMATTING RULES
// ? Code formatting preferences (replaces Prettier).
// ----------------------------------------------------------
const stylisticRules: Rules = {
  // Indentation: 2 spaces
  '@stylistic/indent': ['error', 2],

  // Quotes: single quotes
  '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],

  // No semicolons (Antfu style)
  '@stylistic/semi': ['error', 'never'],

  // Trailing commas for multi-line (better git diffs)
  '@stylistic/comma-dangle': ['error', 'always-multiline'],

  // Spacing
  '@stylistic/space-before-function-paren': ['error', {
    anonymous: 'always',
    named: 'never',
    asyncArrow: 'always',
  }],
  '@stylistic/arrow-spacing': ['error', { before: true, after: true }],
  '@stylistic/block-spacing': ['error', 'always'],
  '@stylistic/comma-spacing': ['error', { before: false, after: true }],
  '@stylistic/key-spacing': ['error', { beforeColon: false, afterColon: true }],
  '@stylistic/object-curly-spacing': ['error', 'always'],
  '@stylistic/array-bracket-spacing': ['error', 'never'],

  // Brace style
  '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],

  // Line breaks
  '@stylistic/eol-last': ['error', 'always'],
  '@stylistic/no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1, maxBOF: 0 }],

  // Operators
  '@stylistic/operator-linebreak': ['error', 'before'],

  // Arrow functions
  '@stylistic/arrow-parens': ['error', 'always'],

  // Member expressions
  '@stylistic/member-delimiter-style': ['error', {
    multiline: { delimiter: 'none' },
    singleline: { delimiter: 'semi' },
  }],
}

// ----------------------------------------------------------
// * TYPESCRIPT RULES
// ? Type-aware linting rules.
// ----------------------------------------------------------
const typescriptRules: Rules = {
  // Allow unused vars with underscore prefix
  '@typescript-eslint/no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  }],

  // Allow explicit any when necessary (Shelly APIs often lack types)
  '@typescript-eslint/no-explicit-any': 'off',

  // Require return types on functions (documentation)
  '@typescript-eslint/explicit-function-return-type': ['warn', {
    allowExpressions: true,
    allowTypedFunctionExpressions: true,
  }],

  // Consistent type definitions
  '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],

  // Prefer type imports
  '@typescript-eslint/consistent-type-imports': ['error', {
    prefer: 'type-imports',
    disallowTypeAnnotations: false,
  }],
}

// ----------------------------------------------------------
// * IMPORT RULES
// ? Import sorting and organization.
// ----------------------------------------------------------
const importRules: Rules = {
  // Sort imports
  'import-x/order': ['error', {
    groups: [
      'builtin',   // Node builtins (fs, path, etc.)
      'external',  // npm packages
      'internal',  // $alias imports
      ['parent', 'sibling', 'index'],  // Relative imports (./, ../)
      'type',      // type imports (grouped at end)
    ],
    pathGroups: [
      {
        pattern: '$**',
        group: 'internal',
        position: 'after',
      },
    ],
    pathGroupsExcludedImportTypes: ['type'],
    'newlines-between': 'always',
    alphabetize: { order: 'asc', caseInsensitive: true },
    warnOnUnassignedImports: false,
  }],

  // No default exports (prefer named exports)
  'import-x/no-default-export': 'off',

  // Ensure imports exist
  'import-x/no-unresolved': 'off', // Handled by TypeScript
}

// ----------------------------------------------------------
// * JSDOC RULES
// ? Documentation validation for JSDoc comments.
// ----------------------------------------------------------
const jsdocRules: Rules = {
  // Require JSDoc for public functions (warn only)
  'jsdoc/require-jsdoc': ['warn', {
    require: {
      FunctionDeclaration: true,
      MethodDefinition: false,
      ClassDeclaration: false,
    },
    checkGetters: false,
    checkSetters: false,
  }],

  // Validate JSDoc syntax
  'jsdoc/check-syntax': 'error',
  'jsdoc/check-types': 'error',
  'jsdoc/valid-types': 'error',

  // Ensure @param names match function parameters
  'jsdoc/check-param-names': 'error',

  // Ensure tag names are valid - allow custom tags for state documentation
  'jsdoc/check-tag-names': ['error', {
    definedTags: [
      'category',   // For grouping functions
      'internal',   // For internal-only functions
      'mutates',    // Documents state mutations
      'sideeffect', // Documents side effects (relay, timers, etc.)
      'reads',      // Documents state reads
    ],
  }],

  // Allow @return (JSDoc standard) - don't force @returns
  'jsdoc/require-returns': 'off',

  // Description requirements (warn only - not all functions need verbose docs)
  'jsdoc/require-description': 'off',
  'jsdoc/require-param-description': 'off',
  'jsdoc/require-returns-description': 'off',

  // Type requirements (useful for plain JS)
  'jsdoc/require-param-type': 'warn',
  'jsdoc/require-returns-type': 'warn',

  // Alignment and formatting
  'jsdoc/check-alignment': 'error',
  'jsdoc/check-indentation': 'off', // Too strict for our style

  // Empty tags
  'jsdoc/empty-tags': 'error',

  // No undefined types (warn - Shelly types may not be defined)
  'jsdoc/no-undefined-types': 'off',
}

// ----------------------------------------------------------
// * SONARJS RULES
// ? Code quality and cognitive complexity rules.
// ? Exclusions for legitimately complex control functions.
// ----------------------------------------------------------
const sonarjsRules: Rules = {
  // Cognitive complexity - warn on high complexity
  // Excluded functions are control logic that is inherently complex
  'sonarjs/cognitive-complexity': ['warn', 15],

  // Duplicate code detection
  'sonarjs/no-identical-functions': 'warn',
  'sonarjs/no-duplicated-branches': 'error',

  // Code smells
  'sonarjs/no-collapsible-if': 'warn',
  'sonarjs/no-redundant-jump': 'error',
  'sonarjs/no-same-line-conditional': 'error',

  // Collection operations
  'sonarjs/no-collection-size-mischeck': 'error',

  // Boolean simplification
  'sonarjs/prefer-single-boolean-return': 'warn',

  // Switch statements
  'sonarjs/no-small-switch': 'warn',
  'sonarjs/no-all-duplicated-branches': 'error',
}

// ----------------------------------------------------------
// * GENERAL CODE QUALITY RULES
// ----------------------------------------------------------
const codeQualityRules: Rules = {
  // Prefer === over ==
  'eqeqeq': ['error', 'always', { null: 'ignore' }],

  // No var (use let/const)
  'no-var': 'error',

  // Disallow console in production (but allow in Shelly scripts)
  'no-console': 'off',

  // Prevent common mistakes
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-empty': ['error', { allowEmptyCatch: true }],

  // Require error handling
  'no-throw-literal': 'error',

  // Cyclomatic complexity
  'complexity': ['warn', 15],
}

// ==============================================================================
// * MAIN CONFIG EXPORT
// ==============================================================================

export default tseslint.config(
  // ----------------------------------------------------------
  // * IGNORE PATTERNS
  // ----------------------------------------------------------
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'logs/**',
      'src/test-utils/**', // Test utilities run in Node.js, not Shelly
    ],
  },

  // ----------------------------------------------------------
  // * JAVASCRIPT SOURCE FILES (Shelly Device Code)
  // ? src/**/*.js files use ES modules for testing (Vitest).
  // ? import/export stripped during build concatenation.
  // ----------------------------------------------------------
  {
    files: ['src/**/*.js'],

    languageOptions: {
      ecmaVersion: 2015, // ES2015 for let/const (transpiled to ES5 by minifier)
      sourceType: 'module', // ES modules for testing, stripped in build
      globals: shellyGlobals,
    },

    plugins: {
      '@stylistic': stylistic,
      'jsdoc': jsdoc,
      'sonarjs': sonarjs,
    },

    rules: {
      ...stylisticRules,
      ...shellyLanguageRules,
      ...shellyMemoryRules,
      ...codeQualityRules,
      ...jsdocRules,
      ...sonarjsRules,

      // JS-specific overrides
      'no-var': 'off', // Allow var in Shelly scripts (let/const may have issues)

      // Disable unused-vars for source files - they're concatenated, not modules
      // Functions defined in one file are used in another after concatenation
      'no-unused-vars': 'off',
    },
  },

  // ----------------------------------------------------------
  // * JAVASCRIPT TEST FILES
  // ? Test files run in Node.js, not Shelly - relax restrictions.
  // ----------------------------------------------------------
  {
    files: ['src/**/*.test.js', 'test/**/*.test.js'],

    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },

    plugins: {
      '@stylistic': stylistic,
      'jsdoc': jsdoc,
    },

    rules: {
      ...stylisticRules,
      ...codeQualityRules,

      // Relax Shelly restrictions for tests (run in Node.js)
      'no-restricted-syntax': 'off',
      'no-restricted-properties': 'off',
      'object-shorthand': 'off',
      'max-depth': 'off',
      'max-nested-callbacks': 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
      'complexity': 'off',

      // Relax JSDoc for tests (not needed)
      'jsdoc/require-jsdoc': 'off',

      // Disable SonarJS in tests (complexity is fine in test code)
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/no-collapsible-if': 'off',
      'sonarjs/no-duplicated-branches': 'off',
    },
  },

  // ----------------------------------------------------------
  // * TYPESCRIPT TOOLS (Node.js)
  // ? Tools run in Node.js - TypeScript with relaxed restrictions.
  // ----------------------------------------------------------
  {
    files: ['tools/**/*.ts'],

    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tools/tsconfig.json'],
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },

    plugins: {
      '@stylistic': stylistic,
      '@typescript-eslint': tseslint.plugin,
      'import-x': importX,
      'jsdoc': jsdoc,
      'sonarjs': sonarjs,
    },

    rules: {
      ...stylisticRules,
      ...typescriptRules,
      ...importRules,
      ...codeQualityRules,
      ...sonarjsRules,

      // TypeScript handles types, so JSDoc type rules are not needed
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',

      // Relax for tools (run in Node.js)
      'no-console': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-properties': 'off',
      'object-shorthand': 'off',
      'max-nested-callbacks': 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
      'max-depth': 'off',
      'complexity': 'off',
    },
  },

  // ----------------------------------------------------------
  // * CONFIG FILES (TypeScript, Node.js)
  // ? Config files like vitest.config.ts, eslint.config.ts
  // ----------------------------------------------------------
  {
    files: ['*.config.ts', '*.config.js'],

    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: null, // No type-aware linting for config files
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },

    plugins: {
      '@stylistic': stylistic,
      '@typescript-eslint': tseslint.plugin,
      'import-x': importX,
    },

    rules: {
      ...stylisticRules,
      ...importRules,
      ...codeQualityRules,

      // Relax for config files
      'no-restricted-syntax': 'off',
      'no-restricted-properties': 'off',
      'object-shorthand': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
)
