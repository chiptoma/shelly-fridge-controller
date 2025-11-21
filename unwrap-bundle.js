#!/usr/bin/env node
/**
 * Post-processor to unwrap IIFE bundle for Shelly compatibility
 * Shelly requires plain JavaScript with no module wrappers
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || 'script.tmp.js';
const outputFile = process.argv[3] || 'script.js';

try {
  let code = fs.readFileSync(inputFile, 'utf8');

  // Remove IIFE wrapper: (()=>{...})(); or (() => {...})();
  // Handle both minified and non-minified formats

  // Extract sourcemap comment if present
  let sourcemapComment = '';
  const sourcemapMatch = code.match(/(\/\/# sourceMappingURL=.*)\s*$/);
  if (sourcemapMatch) {
    sourcemapComment = sourcemapMatch[1];
    code = code.replace(/(\/\/# sourceMappingURL=.*)\s*$/, '').trim();
  }

  const trimmed = code.trim();

  // Check for IIFE pattern with regex to handle variations
  // Match both arrow functions: (()=>{...})() and regular functions: (function(){...})()
  const arrowIifePattern = /^\(\s*\(\s*\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*\(\s*\)\s*;?\s*$/;
  const functionIifePattern = /^\(\s*function\s*\(\s*\)\s*\{([\s\S]*)\}\s*\)\s*\(\s*\)\s*;?\s*$/;

  let match = trimmed.match(arrowIifePattern) || trimmed.match(functionIifePattern);

  if (match) {
    code = match[1]; // Extract the content between the IIFE wrapper
    // Re-add sourcemap comment if it was present
    if (sourcemapComment) {
      code = code + '\n' + sourcemapComment;
    }
    console.log('✅ Unwrapped IIFE bundle');
  } else {
    console.log('⚠️  No IIFE wrapper found, keeping code as-is');
  }

  fs.writeFileSync(outputFile, code, 'utf8');

  const stats = fs.statSync(outputFile);
  const sizeKB = (stats.size / 1024).toFixed(2);
  console.log(`📦 Output: ${outputFile} (${sizeKB}KB)`);

} catch (error) {
  console.error('❌ Error unwrapping bundle:', error.message);
  process.exit(1);
}
