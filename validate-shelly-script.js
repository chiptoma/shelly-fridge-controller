#!/usr/bin/env node

/**
 * Validation script for Shelly-compatible output
 * Ensures script.js is properly bundled and ready for deployment
 */

const fs = require('fs');
const path = require('path');

const SHELLY_MAX_SIZE_KB = 100; // Shelly device script size limit
const scriptPath = path.join(__dirname, 'script.js');

console.log('🔍 Validating Shelly script output...\n');

// Check 1: File exists
if (!fs.existsSync(scriptPath)) {
  console.error('❌ FAIL: script.js not found');
  console.error('   Run: npm run build:fast\n');
  process.exit(1);
}

const content = fs.readFileSync(scriptPath, 'utf8');

// Check 2: File is not empty
if (!content || content.trim().length === 0) {
  console.error('❌ FAIL: script.js is empty');
  process.exit(1);
}

// Check 3: File size
const sizeBytes = Buffer.byteLength(content, 'utf8');
const sizeKB = sizeBytes / 1024;

console.log(`📦 File size: ${sizeKB.toFixed(2)}KB`);

if (sizeKB > SHELLY_MAX_SIZE_KB) {
  console.error(`❌ FAIL: File too large (${sizeKB.toFixed(2)}KB > ${SHELLY_MAX_SIZE_KB}KB)`);
  console.error('   Shelly devices have a script size limit\n');
  process.exit(1);
}

// Check 4: No unresolved ES6 imports/exports
if (content.match(/\bimport\s+/m) || content.match(/\bexport\s+/m)) {
  console.error('❌ FAIL: Unresolved import/export statements found');
  console.error('   All modules must be bundled\n');
  process.exit(1);
}

// Check 5: No unbundled require() calls
// Allow require in commented code, but not in actual code
const lines = content.split('\n');
const codeLines = lines.filter(line => {
  const trimmed = line.trim();
  return !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
});
const codeContent = codeLines.join('\n');

if (codeContent.includes('require(')) {
  console.error('❌ FAIL: Unbundled require() calls found');
  console.error('   All dependencies must be bundled\n');
  process.exit(1);
}

// Check 6: Contains Shelly API calls (sanity check)
const hasShellyCall = content.includes('Shelly.call') || content.includes('Shelly.getComponentStatus');
const hasTimerSet = content.includes('Timer.set');

if (!hasShellyCall) {
  console.warn('⚠️  WARNING: No Shelly API calls found (Shelly.call, Shelly.getComponentStatus)');
  console.warn('   This may not be a valid Shelly script\n');
}

if (!hasTimerSet) {
  console.warn('⚠️  WARNING: No Timer.set call found');
  console.warn('   Control loop may not be initialized\n');
}

// Check 7: Basic syntax check (no try-catch, just regex)
const syntaxErrors = [];

// Check for common syntax issues
if ((content.match(/\{/g) || []).length !== (content.match(/\}/g) || []).length) {
  syntaxErrors.push('Mismatched curly braces {}');
}

if ((content.match(/\(/g) || []).length !== (content.match(/\)/g) || []).length) {
  syntaxErrors.push('Mismatched parentheses ()');
}

if ((content.match(/\[/g) || []).length !== (content.match(/\]/g) || []).length) {
  syntaxErrors.push('Mismatched square brackets []');
}

if (syntaxErrors.length > 0) {
  console.error('❌ FAIL: Syntax errors detected:');
  syntaxErrors.forEach(err => console.error(`   - ${err}`));
  console.error('');
  process.exit(1);
}

// Check 8: Contains initialization code
const hasInit = content.includes('controlLoop') || content.includes('function init');

if (!hasInit) {
  console.warn('⚠️  WARNING: No initialization code found');
  console.warn('   Script may not have entry point\n');
}

// All checks passed
console.log('✅ All validation checks passed');
console.log(`   Size: ${sizeKB.toFixed(2)}KB / ${SHELLY_MAX_SIZE_KB}KB`);
console.log(`   Shelly API: ${hasShellyCall ? 'Found' : 'Not found'}`);
console.log(`   Timer setup: ${hasTimerSet ? 'Found' : 'Not found'}`);
console.log('   No syntax errors detected');
console.log('\n🚀 Script is ready for Shelly deployment\n');

process.exit(0);
