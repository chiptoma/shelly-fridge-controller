/**
 * Post-process esbuild output with Terser for more aggressive minification
 *
 * This script applies additional optimizations that esbuild doesn't do:
 * - More aggressive variable name mangling
 * - Property name mangling for internal properties
 * - Dead code elimination
 * - Expression simplification
 */

const { minify } = require('terser');
const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
  console.error('Usage: node terser-minify.js <input> <output>');
  process.exit(1);
}

async function run() {
  const code = fs.readFileSync(inputFile, 'utf8');

  const result = await minify(code, {
    // Compression options - conservative for Shelly compatibility
    compress: {
      passes: 2,              // Fewer passes for stability
      pure_funcs: [],         // Functions with no side effects
      drop_console: false,    // Keep console for Shelly
      drop_debugger: true,    // Remove debugger statements
      dead_code: true,        // Remove unreachable code
      unused: true,           // Remove unused variables
      collapse_vars: false,   // DISABLED - can break Shelly
      reduce_vars: true,      // Optimize variable references
      booleans_as_integers: false, // DISABLED - can confuse Shelly
      evaluate: true,         // Evaluate constant expressions
      inline: false,          // DISABLED - can break callbacks
      join_vars: true,        // Join consecutive var statements
      loops: true,            // Optimize loops
      negate_iife: false,     // DISABLED - can break Shelly parsing
      sequences: false,       // DISABLED - can break Shelly parsing
      side_effects: true,     // Drop pure functions
      switches: true,         // Optimize switch statements
      typeofs: true,          // Optimize typeof comparisons
      unsafe_math: false,     // DISABLED - safety first
      unsafe_methods: false,  // DISABLED - safety first
    },

    // Mangling options
    mangle: {
      // Mangle top-level variable/function names only
      toplevel: true,
      // NO property mangling - too risky for Shelly runtime
    },

    // Output options
    format: {
      comments: false,        // Remove all comments
      ecma: 5,               // ES5 output for Shelly compatibility
      wrap_iife: true,       // Wrap in IIFE
      semicolons: true,      // Use semicolons
    },

    // Source map (disabled for production)
    sourceMap: false,
  });

  if (result.error) {
    console.error('Terser error:', result.error);
    process.exit(1);
  }

  fs.writeFileSync(outputFile, result.code);

  const inputSize = Buffer.byteLength(code, 'utf8');
  const outputSize = Buffer.byteLength(result.code, 'utf8');
  const savings = ((inputSize - outputSize) / inputSize * 100).toFixed(1);

  console.log(`Terser: ${inputSize} -> ${outputSize} bytes (${savings}% reduction)`);
}

run().catch(err => {
  console.error('Terser failed:', err);
  process.exit(1);
});
