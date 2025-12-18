#!/usr/bin/env node
// ==============================================================================
// * MINIFICATION TOOL
// ? Minifies bundle.js using Terser with Shelly-optimized settings.
// Output: dist/main.js (production-ready)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// ----------------------------------------------------------
// * CONFIGURATION
// ? Paths configurable via environment variables
// ----------------------------------------------------------
const ROOT = path.join(__dirname, '..');
const BUNDLE_PATH = process.env.BUNDLE_PATH || path.join(ROOT, 'dist', 'bundle.js');
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(ROOT, 'dist', 'main.js');

// Terser options - Shelly-safe settings
const TERSER_OPTIONS = {
  ecma: 5,
  compress: {
    passes: 3,
    pure_getters: true,
    unsafe: false,           // ! Disabled - can break code patterns
    unsafe_comps: false,     // ! Disabled - comparison optimizations
    unsafe_math: false,      // ! Disabled - math optimizations
    unsafe_proto: false,     // ! Disabled - prototype optimizations
    booleans_as_integers: false,
    drop_console: false,
    drop_debugger: true,
    evaluate: true,
    hoist_funs: true,
    hoist_vars: false,
    if_return: true,
    inline: false,           // ! CRITICAL: Disabled - prevents Terser from reusing module-level
                             // ! variable names for inline temps, which caused ST_KEYS collision
    join_vars: true,
    loops: true,
    negate_iife: false,      // ! Disabled - IIFE negation breaks mJS
    properties: true,
    reduce_vars: true,
    sequences: true,
    side_effects: true,
    toplevel: true,
    unused: true
  },
  mangle: {
    toplevel: false,
    properties: false
    // ! CRITICAL: Don't mangle top-level declarations.
    // ! Shelly mJS has a scoping bug where callback parameters leak and shadow
    // ! outer-scope variables. By keeping top-level names (like math functions r1, r2, ri)
    // ! unchanged, minified callback params (a, b, c) can't shadow them.
  },
  output: {
    comments: false,
    beautify: false,
    semicolons: true
  }
};

// ----------------------------------------------------------
// * MAIN
// ----------------------------------------------------------
async function main() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    console.error('Input file not found: ' + BUNDLE_PATH);
    console.error('Run "npm run build:concat" first.');
    process.exit(1);
  }

  const input = fs.readFileSync(BUNDLE_PATH, 'utf-8');
  console.log('Input size: ' + input.length + ' bytes');

  try {
    const result = await minify(input, TERSER_OPTIONS);

    if (result.error) {
      console.error('Terser error:', result.error);
      process.exit(1);
    }

    fs.writeFileSync(OUTPUT_PATH, result.code);
    console.log('Output size: ' + result.code.length + ' bytes');
    console.log('Compression: ' + ((1 - result.code.length / input.length) * 100).toFixed(1) + '%');
    console.log('Build path:  ' + OUTPUT_PATH);
  } catch (err) {
    console.error('Minification failed:', err);
    process.exit(1);
  }
}

main();
