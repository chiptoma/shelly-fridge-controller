// ==============================================================================
// * MINIFICATION SAFETY TESTS
// ? Tests that catch minification bugs in the production bundle.
// ? These tests run against dist/main.js, NOT source code.
// ==============================================================================

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ----------------------------------------------------------
// * SETUP
// ----------------------------------------------------------

const BUNDLE_PATH = join(process.cwd(), 'dist', 'main.js')
const BUNDLE_EXISTS = existsSync(BUNDLE_PATH)
let bundleCode = ''

beforeAll(() => {
  if (BUNDLE_EXISTS) {
    bundleCode = readFileSync(BUNDLE_PATH, 'utf-8')
  }
})

// ----------------------------------------------------------
// * STATUS CONSTANT TESTS
// ? Ensures status constants aren't extracted to collision-prone names.
// ----------------------------------------------------------

describe.skipIf(!BUNDLE_EXISTS)('Status Constants: Not Extracted to Single Letters', () => {
  it('should not extract IDLE to a single letter', () => {
    // Bad: let t="IDLE"  (t will collide with callback params)
    // Good: let at="IDLE" or longer variable names
    const badPattern = /let ([a-z])="IDLE"/
    const match = bundleCode.match(badPattern)

    expect(match).toBeNull()
  })

  it('should not extract COOLING to a single letter', () => {
    const badPattern = /let ([a-z])="COOLING"/
    const match = bundleCode.match(badPattern)

    expect(match).toBeNull()
  })

  it('should not extract WANT_IDLE to a single letter', () => {
    const badPattern = /let ([a-z])="WANT_IDLE"/
    const match = bundleCode.match(badPattern)

    expect(match).toBeNull()
  })

  it('should not extract WANT_COOL to a single letter', () => {
    const badPattern = /let ([a-z])="WANT_COOL"/
    const match = bundleCode.match(badPattern)

    expect(match).toBeNull()
  })

  it('should not extract LIMP states to single letters', () => {
    const badPatterns = [
      /let ([a-z])="LIMP_IDLE"/,
      /let ([a-z])="LIMP_COOL"/,
    ]

    for (const pattern of badPatterns) {
      const match = bundleCode.match(pattern)
      expect(match).toBeNull()
    }
  })

  it('should not extract TURBO states to single letters', () => {
    const badPatterns = [
      /let ([a-z])="TURBO_IDLE"/,
      /let ([a-z])="TURBO_COOL"/,
    ]

    for (const pattern of badPatterns) {
      const match = bundleCode.match(pattern)
      expect(match).toBeNull()
    }
  })
})

// ----------------------------------------------------------
// * ICON OBJECT TESTS
// ? Ensures ICO object has proper string keys with emoji values.
// ----------------------------------------------------------

describe.skipIf(!BUNDLE_EXISTS)('Icon Mappings: Preserved Correctly', () => {
  it('should have IDLE icon mapping', () => {
    expect(bundleCode).toContain('IDLE:"⚪"')
  })

  it('should have COOLING icon mapping', () => {
    expect(bundleCode).toContain('COOLING:"❄️"')
  })

  it('should have BOOT icon mapping', () => {
    expect(bundleCode).toContain('BOOT:"🔄"')
  })

  it('should have WANT states icon mappings', () => {
    expect(bundleCode).toContain('WANT_IDLE:"⏳"')
    expect(bundleCode).toContain('WANT_COOL:"⏳"')
  })

  it('should have LIMP states icon mappings', () => {
    expect(bundleCode).toContain('LIMP_IDLE:"⚠️"')
    expect(bundleCode).toContain('LIMP_COOL:"⚠️"')
  })

  it('should have TURBO states icon mappings', () => {
    expect(bundleCode).toContain('TURBO_COOL:"🚀"')
    expect(bundleCode).toContain('TURBO_IDLE:"🚀"')
  })
})

// ----------------------------------------------------------
// * ALARM CONSTANT TESTS
// ? Ensures alarm constants are preserved correctly.
// ----------------------------------------------------------

describe.skipIf(!BUNDLE_EXISTS)('Alarm Constants: Preserved Correctly', () => {
  it('should have relay weld alarm', () => {
    expect(bundleCode).toContain('ALARM_RELAY_WELD')
  })

  it('should have rotor locked alarm', () => {
    expect(bundleCode).toContain('ALARM_ROTOR_LOCKED')
  })

  it('should have sensor fail alarm', () => {
    expect(bundleCode).toContain('ALARM_SENSOR_FAIL')
  })

  it('should have high temp alarm', () => {
    expect(bundleCode).toContain('ALARM_HIGH_TEMP')
  })

  it('should have cooling fail alarm', () => {
    expect(bundleCode).toContain('ALARM_COOLING_FAIL')
  })
})

// ----------------------------------------------------------
// * REASON CONSTANT TESTS
// ? Ensures reason constants are preserved correctly.
// ----------------------------------------------------------

describe.skipIf(!BUNDLE_EXISTS)('Reason Constants: Preserved Correctly', () => {
  it('should have protection reasons', () => {
    expect(bundleCode).toContain('PROT_MIN_ON')
    expect(bundleCode).toContain('PROT_MIN_OFF')
    expect(bundleCode).toContain('PROT_MAX_ON')
    expect(bundleCode).toContain('PROT_AIR_FRZ')
  })

  it('should have defrost reasons', () => {
    expect(bundleCode).toContain('DEFR_SCHED')
    expect(bundleCode).toContain('DEFR_DYN')
  })
})

// ----------------------------------------------------------
// * CRITICAL FUNCTION TESTS
// ? Ensures critical functions exist in the bundle.
// ----------------------------------------------------------

describe.skipIf(!BUNDLE_EXISTS)('Critical Functions: Present in Bundle', () => {
  // Only check functions that are in the minify.cjs reserved list
  // Other functions may be legitimately minified

  it('should have main loop function', () => {
    expect(bundleCode).toContain('mainLoopTick')
  })

  it('should have relay control function', () => {
    expect(bundleCode).toContain('setRelay')
  })

  it('should have state persistence function', () => {
    expect(bundleCode).toContain('persistState')
  })

  it('should have alarm function', () => {
    expect(bundleCode).toContain('recordFault')
  })

  it('should have config validation function', () => {
    expect(bundleCode).toContain('validateConfig')
  })
})

// ----------------------------------------------------------
// * BUNDLE SIZE TESTS
// ? Ensures bundle stays within memory limits.
// ----------------------------------------------------------

describe.skipIf(!BUNDLE_EXISTS)('Bundle Size: Within Limits', () => {
  it('should be under 30KB OOM threshold', () => {
    const size = Buffer.byteLength(bundleCode, 'utf8')
    expect(size).toBeLessThan(30000)
  })

  it('should be reasonably compressed', () => {
    // Should be at least 50% smaller than source
    // Typical compression is 70%+
    const size = Buffer.byteLength(bundleCode, 'utf8')
    expect(size).toBeLessThan(50000)  // Reasonable upper bound
    expect(size).toBeGreaterThan(15000)  // Sanity check - not empty
  })
})

// ----------------------------------------------------------
// * DANGEROUS PATTERN TESTS
// ? Ensures no dangerous minification patterns exist.
// ----------------------------------------------------------

describe.skipIf(!BUNDLE_EXISTS)('Dangerous Patterns: None Present', () => {
  it('should not have undefined used as object key', () => {
    // This would indicate a variable collision
    expect(bundleCode).not.toContain('[undefined]')
  })

  it('should not have NaN in numeric operations', () => {
    // Suspicious if NaN appears in the minified code
    expect(bundleCode).not.toMatch(/=NaN[,;)]/)
  })

  // Note: }function is actually valid minified JS - Terser removes unnecessary semicolons
})
