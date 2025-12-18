import path from 'path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // CRITICAL: Enable proper isolation for mock cleanup
    isolate: true,              // Each test file in separate worker
    pool: 'threads',            // Use worker threads for isolation

    // Mock cleanup settings
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '**/*.test.{ts,js}',
        '**/*.spec.ts',
        '**/*.vitest.ts',
        '**/*.config.{ts,js}',
        'coverage/**',
        'dist/**',
        'test/**',
      ],
      thresholds: {
        branches: 90,
        functions: 97,
        lines: 95,
        statements: 95,
      },
    },

    // Include JS and TS test files
    include: ['src/**/*.vitest.ts', 'src/**/*.test.ts', 'src/**/*.test.js', 'test/**/*.test.js'],
    exclude: ['src/**/*.mocha.test.ts', 'src/**/*.rewiremock.test.ts'],
  },
  resolve: {
    alias: {
      // Test utilities only - source uses relative imports
      '$test-utils': path.resolve(__dirname, './test'),
    },
  },
})
