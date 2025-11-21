module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).js',
    '**/?(*.)+(spec|test).ts'
  ],

  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.js',
    'src/**/*.ts',
    '!src/main.js',
    '!src/main.ts',
    '!src/**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/__mocks__/**'
  ],

  // Coverage thresholds (90% minimum)
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },

  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov'
  ],

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true,

  // Module directories
  moduleDirectories: ['node_modules', 'src'],

  // Transform files with Babel/TypeScript
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'babel-jest'
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],

  // Path alias mappings (must match tsconfig.json paths)
  moduleNameMapper: {
    '^\\$types$': '<rootDir>/src/types/index.ts',
    '^\\$types/(.*)$': '<rootDir>/src/types/$1',
    '^@core$': '<rootDir>/src/core/index.ts',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@boot/(.*)$': '<rootDir>/src/boot/$1',
    '^@system$': '<rootDir>/src/system/index.ts',
    '^@system/(.*)$': '<rootDir>/src/system/$1',
    '^@hardware$': '<rootDir>/src/hardware/index.ts',
    '^@hardware/(.*)$': '<rootDir>/src/hardware/$1',
    '^@utils$': '<rootDir>/src/utils/index.ts',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@validation$': '<rootDir>/src/validation/index.ts',
    '^@validation/(.*)$': '<rootDir>/src/validation/$1',
    '^@logging$': '<rootDir>/src/logging/index.ts',
    '^@logging/(.*)$': '<rootDir>/src/logging/$1'
  },

  // TypeScript configuration for ts-jest
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json'
    }
  },

  // Setup files
  setupFilesAfterEnv: [],

  // Test timeout
  testTimeout: 5000,

  // Max workers (run tests in parallel)
  maxWorkers: '50%'
};
