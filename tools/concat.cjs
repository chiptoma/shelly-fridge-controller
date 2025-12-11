#!/usr/bin/env node
// ==============================================================================
// * CONCATENATION BUILD TOOL
// ? Concatenates all source files in dependency order into a single bundle.
// ? Strips ES module import/export statements (used only for testing).
// ? Output: dist/bundle.js (unminified, for debugging)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const order = require('./concat-order.cjs');

// ----------------------------------------------------------
// * CONFIGURATION
// ----------------------------------------------------------
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUTPUT = path.join(DIST, 'bundle.js');

// ----------------------------------------------------------
// * ES MODULE STRIPPING
// ? Removes import/export statements that are only used for testing.
// ----------------------------------------------------------
function stripEsModules(content) {
  // Remove import statements (single and multi-line)
  // e.g., import { ST, RSN } from './constants.js'
  // e.g., import { foo,
  //         bar } from './module.js'
  content = content.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

  // Remove default imports
  // e.g., import foo from './module.js'
  content = content.replace(/^import\s+\w+\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

  // Remove namespace imports
  // e.g., import * as foo from './module.js'
  content = content.replace(/^import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

  // Remove side-effect imports
  // e.g., import './module.js'
  content = content.replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

  // Remove export statements
  // e.g., export { ST, RSN, ALM, ICO }
  content = content.replace(/^export\s+\{[^}]*\}\s*;?\s*$/gm, '');

  // Remove named exports
  // e.g., export function foo() {}
  // e.g., export let bar = ...
  // e.g., export const baz = ...
  content = content.replace(/^export\s+(function|let|const|var)\s+/gm, '$1 ');

  // Remove default exports
  // e.g., export default foo
  content = content.replace(/^export\s+default\s+[^;]+;?\s*$/gm, '');

  // Clean up multiple blank lines left by stripping
  content = content.replace(/\n{3,}/g, '\n\n');

  return content;
}

// ----------------------------------------------------------
// * MAIN
// ----------------------------------------------------------
function main() {
  // Ensure dist/ exists
  if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
  }

  // Check all files exist
  const missing = [];
  for (const file of order) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    console.error('Missing source files:');
    missing.forEach(f => console.error('  - ' + f));
    process.exit(1);
  }

  // Concatenate
  const parts = [];

  // Add header comment
  parts.push('/**');
  parts.push(' * SHELLY PLUS 1PM - ADVANCED FRIDGE CONTROLLER');
  parts.push(' * Auto-generated from modular source files.');
  parts.push(' * DO NOT EDIT - modify src/ files instead.');
  parts.push(' */');
  parts.push('');

  for (const file of order) {
    const fullPath = path.join(ROOT, file);
    let content = fs.readFileSync(fullPath, 'utf-8');

    // Strip ES module syntax
    content = stripEsModules(content);

    // Add file marker (removed in minification)
    parts.push('// --- ' + file + ' ---');
    parts.push(content.trim());
    parts.push('');
  }

  const output = parts.join('\n');
  fs.writeFileSync(OUTPUT, output);

  console.log('Concatenated ' + order.length + ' files -> dist/bundle.js');
  console.log('Size: ' + output.length + ' bytes');
}

main();
