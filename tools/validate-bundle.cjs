#!/usr/bin/env node
// ==============================================================================
// BUNDLE VALIDATION TOOL
// Validates the minified bundle for correctness after Terser processing.
// Catches minification errors before deployment to device.
// ==============================================================================

const fs = require('fs')
const path = require('path')
const vm = require('vm')

// ----------------------------------------------------------
// CONFIGURATION
// Paths configurable via environment variables
// ----------------------------------------------------------

const ROOT = path.join(__dirname, '..')
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(ROOT, 'dist', 'main.js')

// Size thresholds (bytes)
// The actual OOM limit is peak RUNTIME memory, not script file size.
// These are sanity checks, not hard limits.
// Tested: 30.1KB bundle runs fine with 23KB peak runtime memory.
const MAX_SIZE = 50000        // 50 KB - Sanity check threshold
const WARN_SIZE = 35000       // 35 KB - Warning threshold

// Required patterns that MUST exist in bundle
const REQUIRED_PATTERNS = [
  // Status constants must be full strings, not extracted to single letters
  { pattern: /IDLE/, name: 'Status: IDLE constant' },
  { pattern: /COOLING/, name: 'Status: COOLING constant' },
  { pattern: /WANT_IDLE/, name: 'Status: WANT_IDLE constant' },
  { pattern: /WANT_COOL/, name: 'Status: WANT_COOL constant' },

  // Icon object must have string keys with emojis
  { pattern: /IDLE:"⚪"/, name: 'Icon: IDLE emoji mapping' },
  { pattern: /COOLING:"❄️"/, name: 'Icon: COOLING emoji mapping' },
  { pattern: /BOOT:"🔄"/, name: 'Icon: BOOT emoji mapping' },

  // Critical functions (preserved because mangle.toplevel=false in minify.cjs)
  { pattern: /mainLoopTick/, name: 'Function: mainLoopTick' },
  { pattern: /setRelay/, name: 'Function: setRelay' },
  { pattern: /persistState/, name: 'Function: persistState' },
  { pattern: /recordFault/, name: 'Function: recordFault' },
]

// Dangerous patterns that indicate minification bugs
const DANGEROUS_PATTERNS = [
  // Single-letter status constant extraction (the bug we fixed)
  {
    pattern: /let ([a-z])="(IDLE|COOLING|WANT_IDLE|WANT_COOL|LIMP_IDLE|LIMP_COOL|TURBO_)"/,
    name: 'DANGER: Status constant extracted to single letter',
    description: 'Terser extracted a status constant to a single-letter variable which will collide with callback parameters',
  },
  // Undefined in status lookups
  {
    pattern: /\[undefined\]/,
    name: 'DANGER: Undefined used as object key',
    description: 'An undefined value is being used as an object key, likely a variable collision',
  },
]

// ----------------------------------------------------------
// VALIDATION FUNCTIONS
// ----------------------------------------------------------

function validateSyntax(code) {
  try {
    vm.createScript(code)
    return { valid: true }
  } catch (err) {
    return { valid: false, error: err.message }
  }
}

function validateSize(code) {
  const size = Buffer.byteLength(code, 'utf8')
  const warnings = []

  if (size > MAX_SIZE) {
    return {
      valid: false,
      error: `Bundle size ${size} bytes exceeds maximum ${MAX_SIZE} bytes (OOM risk)`,
      size,
    }
  }

  if (size > WARN_SIZE) {
    warnings.push(`Bundle size ${size} bytes is close to limit ${MAX_SIZE} bytes`)
  }

  return { valid: true, size, warnings }
}

function validateRequiredPatterns(code) {
  const missing = []

  for (const { pattern, name } of REQUIRED_PATTERNS) {
    if (!pattern.test(code)) {
      missing.push(name)
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  }
}

function validateDangerousPatterns(code) {
  const found = []

  for (const { pattern, name, description } of DANGEROUS_PATTERNS) {
    const match = code.match(pattern)
    if (match) {
      found.push({ name, description, match: match[0] })
    }
  }

  return {
    valid: found.length === 0,
    found,
  }
}

function validateInVM(code) {
  // Create minimal Shelly-like context
  const context = vm.createContext({
    Shelly: {
      call: () => {},
      getComponentStatus: () => ({}),
      getUptimeMs: () => 1000,
      emitEvent: () => {},
    },
    Timer: {
      set: () => 1,
      clear: () => {},
    },
    MQTT: {
      publish: () => {},
      subscribe: () => {},
    },
    print: () => {},
    Date: global.Date,
    Math: global.Math,
    JSON: global.JSON,
    Object: global.Object,
    Array: global.Array,
    console: { log: () => {}, error: () => {} },
  })

  try {
    vm.runInContext(code, context, { timeout: 5000 })
    return { valid: true }
  } catch (err) {
    return { valid: false, error: err.message }
  }
}

// ----------------------------------------------------------
// MAIN
// ----------------------------------------------------------

function main() {
  console.log('Bundle Validation')
  console.log('─'.repeat(50))

  // Check file exists
  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error('✗ Bundle not found: ' + OUTPUT_PATH)
    console.error('  Run "npm run build" first.')
    process.exit(1)
  }

  const code = fs.readFileSync(OUTPUT_PATH, 'utf-8')
  let hasErrors = false
  let hasWarnings = false

  // 1. Syntax validation
  console.log('\n1. Syntax Check')
  const syntax = validateSyntax(code)
  if (syntax.valid) {
    console.log('   ✓ Valid JavaScript syntax')
  } else {
    console.error('   ✗ Syntax error:', syntax.error)
    hasErrors = true
  }

  // 2. Size validation
  console.log('\n2. Size Check')
  const size = validateSize(code)
  console.log(`   Size: ${size.size} bytes (${(size.size / 1024).toFixed(2)} KB)`)
  if (size.valid) {
    console.log(`   ✓ Under ${MAX_SIZE} byte limit`)
    if (size.warnings) {
      for (const w of size.warnings) {
        console.log(`   ⚠ ${w}`)
        hasWarnings = true
      }
    }
  } else {
    console.error(`   ✗ ${size.error}`)
    hasErrors = true
  }

  // 3. Required patterns
  console.log('\n3. Required Patterns')
  const required = validateRequiredPatterns(code)
  if (required.valid) {
    console.log(`   ✓ All ${REQUIRED_PATTERNS.length} required patterns found`)
  } else {
    console.error('   ✗ Missing patterns:')
    for (const m of required.missing) {
      console.error(`     - ${m}`)
    }
    hasErrors = true
  }

  // 4. Dangerous patterns
  console.log('\n4. Minification Safety')
  const dangerous = validateDangerousPatterns(code)
  if (dangerous.valid) {
    console.log('   ✓ No dangerous patterns detected')
  } else {
    console.error('   ✗ Dangerous patterns found:')
    for (const d of dangerous.found) {
      console.error(`     - ${d.name}`)
      console.error(`       ${d.description}`)
      console.error(`       Match: "${d.match}"`)
    }
    hasErrors = true
  }

  // 5. VM execution test
  console.log('\n5. VM Execution Test')
  const vmResult = validateInVM(code)
  if (vmResult.valid) {
    console.log('   ✓ Bundle executes without errors')
  } else {
    console.error('   ✗ Execution error:', vmResult.error)
    hasErrors = true
  }

  // Summary
  console.log('\n' + '─'.repeat(50))
  if (hasErrors) {
    console.error('VALIDATION FAILED')
    process.exit(1)
  } else if (hasWarnings) {
    console.log('VALIDATION PASSED (with warnings)')
  } else {
    console.log('VALIDATION PASSED')
  }
}

main()
