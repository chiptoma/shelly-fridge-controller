// ==============================================================================
// FEATURES TESTS
// Validates door detection, defrost, turbo, limp, and adaptive hysteresis.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Features', () => {
  let getEffectiveHysteresis, adaptHysteresis
  let checkTurboSwitch, handleTurboMode
  let detectDoorOpen, isDoorPauseActive
  let isScheduledDefrost, checkDefrostTrigger, handleDynamicDefrost
  let handleLimpMode
  let mockS, mockV, mockC, mockST, mockADAPT

  beforeEach(async () => {
    vi.resetModules()

    // Create mock ST constants
    mockST = {
      LIMP_IDLE: 'LIMP_IDLE',
      LIMP_COOL: 'LIMP_COOL',
    }

    // Create mock ADAPT constants
    mockADAPT = {
      DANGER_MULT: 1.5,
      SHORT_MULT: 1.8,
      STABLE_PAD_SEC: 480,
      HIGH_CYCLE_COUNT: 5,
      HIGH_CYCLE_MAX_SEC: 1200,
      LOW_CYCLE_COUNT: 3,
      LOW_CYCLE_MIN_SEC: 1500,
      DANGER_STEP_DEG: 0.3,
      NORMAL_STEP_DEG: 0.2,
      FREEZE_MARGIN_DEG: 0.3,
    }

    // Create mock state
    mockS = {
      adt_hystDeg: 0.5,
      dfr_isActive: false,
      sys_isRelayOn: false,
    }

    // Create mock volatile state
    // defr_dwellTimer is now module-local in features.js
    mockV = {
      trb_isActive: false,
      trb_remSec: 0,
      trb_prevSw: false,
      dor_refDeg: 0,
      dor_refTs: 0,
      dor_pauseRemSec: 0,
      hw_hasPM: true,
      sys_alarm: 'NONE',
      pwr_ghostSec: 0,
      adt_lastDir: null,
      adt_consecCnt: 0,
    }

    // Create mock config
    mockC = {
      sys_loopSec: 5,
      ctl_targetDeg: 4.0,
      cmp_freezeCutDeg: -2.0,
      adt_enable: true,
      adt_hystMinDeg: 0.3,
      adt_hystMaxDeg: 1.5,
      adt_targetMinSec: 300,
      adt_targetMaxSec: 1800,
      trb_enable: true,
      trb_maxTimeSec: 3600,
      trb_targetDeg: -2.0,
      trb_hystDeg: 0.3,
      dor_enable: true,
      dor_rateDegMin: 0.5,
      dor_pauseSec: 180,
      dfr_schedEnable: true,
      dfr_schedHour: 3,
      dfr_schedDurSec: 1800,
      dfr_dynEnable: true,
      dfr_dynTrigDeg: -20.0,
      dfr_dynEndDeg: 0.0,
      dfr_dynDwellSec: 300,
      pwr_enable: true,
      pwr_startMaskSec: 30,
      pwr_runMaxW: 200,
      pwr_runMinW: 20,
      pwr_ghostTripSec: 60,
      lmp_enable: true,
      lmp_onSec: 900,
      lmp_offSec: 1800,
    }

    // Mock global print
    global.print = vi.fn()

    // Mock global Shelly
    global.Shelly = {
      getUptimeMs: vi.fn(() => 0),
      call: vi.fn(),
    }

    // Mock dependencies
    vi.doMock('./constants.js', () => ({ ST: mockST, ADAPT: mockADAPT }))
    vi.doMock('./config.js', () => ({ C: mockC }))
    vi.doMock('./state.js', () => ({ S: mockS, V: mockV, persistState: vi.fn() }))
    vi.doMock('./utils/math.js', () => ({
      r2: vi.fn((v) => Math.round(v * 100) / 100),
    }))

    const module = await import('./features.js')
    getEffectiveHysteresis = module.getEffectiveHysteresis
    adaptHysteresis = module.adaptHysteresis
    checkTurboSwitch = module.checkTurboSwitch
    handleTurboMode = module.handleTurboMode
    detectDoorOpen = module.detectDoorOpen
    isDoorPauseActive = module.isDoorPauseActive
    isScheduledDefrost = module.isScheduledDefrost
    checkDefrostTrigger = module.checkDefrostTrigger
    handleDynamicDefrost = module.handleDynamicDefrost
    handleLimpMode = module.handleLimpMode
  })

  // ----------------------------------------------------------
  // ADAPTIVE HYSTERESIS TESTS
  // ----------------------------------------------------------

  describe('getEffectiveHysteresis', () => {
    it('should return current value within bounds', () => {
      mockS.adt_hystDeg = 0.5
      expect(getEffectiveHysteresis()).toBe(0.5)
    })

    it('should clamp to max when exceeded', () => {
      mockS.adt_hystDeg = 2.0
      expect(getEffectiveHysteresis()).toBe(1.5)
    })

    it('should clamp to min when below', () => {
      mockS.adt_hystDeg = 0.1
      expect(getEffectiveHysteresis()).toBe(0.3)
    })
  })

  describe('adaptHysteresis', () => {
    // Trend-Confirmed Cycle-Time Seeking Algorithm with Cycle Count Signal
    // Mock config: minSec=300s, maxSec=1800s
    // minCycle = 300 * 1.8 = 540s (9 min) → widen below (with confirmation)
    // maxCycle = 1800 + 600 = 2400s (40 min) → tighten above (with confirmation)
    // dangerZone = 300 * 1.5 = 450s (7.5 min) → immediate widen +0.3°
    // HIGH CYCLE: cycleCount >= 5 && totalCycle < 1200s → treat as danger zone
    // Steps: widen +0.2° (confirmed), danger +0.3° (immediate), tighten -0.2°

    it('should widen IMMEDIATELY when below danger zone (<7.5 min)', () => {
      // totalCycle = 200 + 200 = 400s = 6.7 min < 450s (dangerZone)
      // Danger zone bypasses trend confirmation for compressor protection
      mockS.adt_hystDeg = 0.5
      const result = adaptHysteresis(200, 200, 3)
      expect(result).toBe('widen')
      expect(mockS.adt_hystDeg).toBe(0.8) // +0.3 step for danger zone
    })

    it('should widen after trend confirmation (2 consecutive short cycles)', () => {
      // totalCycle = 250 + 250 = 500s > dangerZone (450s), but < minCycle (540s)
      // Needs 2 consecutive triggers for widen
      mockS.adt_hystDeg = 0.5
      // First call - starts tracking
      let result = adaptHysteresis(250, 250, 3)
      expect(result).toBeNull()
      expect(mockV.adt_lastDir).toBe('widen')
      expect(mockV.adt_consecCnt).toBe(1)

      // Second call - confirms and acts
      result = adaptHysteresis(250, 250, 3)
      expect(result).toBe('widen')
      expect(mockS.adt_hystDeg).toBe(0.7) // +0.2 step
    })

    it('should NOT adapt when total cycle is in stable zone (9-40 min)', () => {
      // totalCycle = 720 + 540 = 1260s = 21 min → STABLE (real device profile)
      // Stable zone is 540s to 2400s (wider than before)
      mockS.adt_hystDeg = 1.0
      const result = adaptHysteresis(720, 540, 3) // 12m ON + 9m OFF
      expect(result).toBeNull()
      // Stable zone maintains tracking - doesn't reset direction
    })

    it('should maintain tracking direction through stable zone periods', () => {
      // If tracking widen, stable zone shouldn't reset it
      mockS.adt_hystDeg = 1.0
      mockV.adt_lastDir = 'widen'
      mockV.adt_consecCnt = 1

      // Stable zone cycle (21 min)
      const result = adaptHysteresis(720, 540, 3)
      expect(result).toBeNull()
      expect(mockV.adt_lastDir).toBe('widen') // Maintained, not reset
      expect(mockV.adt_consecCnt).toBe(1)   // Unchanged
    })

    it('should tighten after trend confirmation (2 consecutive long cycles with idle headroom)', () => {
      // maxCycle = 1680s, totalCycle = 2000s > 1680s, avgOff > avgOn (55% OFF, 45% ON)
      // New logic: only tighten when system has idle headroom (avgOff > avgOn)
      mockS.adt_hystDeg = 1.0
      // First call - starts tracking
      let result = adaptHysteresis(900, 1100, 3) // 45% duty, has idle headroom
      expect(result).toBeNull()
      expect(mockV.adt_lastDir).toBe('tighten')
      expect(mockV.adt_consecCnt).toBe(1)

      // Second call - confirms and acts
      result = adaptHysteresis(900, 1100, 3)
      expect(result).toBe('tighten')
      expect(mockS.adt_hystDeg).toBe(0.8) // -0.2 step
    })

    it('should NOT tighten when duty cycle is too high (system struggling)', () => {
      // totalCycle = 2000 + 500 = 2500s > 2400s, but duty = 80% → no action
      mockS.adt_hystDeg = 1.0
      const result = adaptHysteresis(2000, 500, 3) // 80% duty
      expect(result).toBeNull()
    })

    it('should widen immediately on high cycle count (>=5 cycles)', () => {
      // High cycle count indicates short cycling despite averaged data
      // totalCycle = 1000s (16.7 min), but cycleCount = 6 → treat as danger
      mockS.adt_hystDeg = 0.5
      const result = adaptHysteresis(600, 400, 6) // totalCycle = 1000s < 1200s, count >= 5
      expect(result).toBe('widen')
      expect(mockS.adt_hystDeg).toBe(0.8) // +0.3 step (danger zone)
    })

    it('should tighten easier on low cycle count (<=3 cycles) when system has idle headroom', () => {
      // Low cycle count indicates long cycles (efficient), lower maxCycle threshold
      // totalCycle = 1600s (26.7 min), cycleCount = 3 → lower maxCycle to 1500s
      // avgOff > avgOn (62.5% OFF) → system has idle headroom → tighten
      mockS.adt_hystDeg = 1.0
      mockV.adt_lastDir = 'tighten'
      mockV.adt_consecCnt = 1  // Already tracking

      const result = adaptHysteresis(600, 1000, 3) // totalCycle = 1600s, 37.5% duty, idle headroom
      expect(result).toBe('tighten')
      expect(mockS.adt_hystDeg).toBe(0.8) // -0.2 step
    })

    it('should reset tracking when direction changes', () => {
      mockS.adt_hystDeg = 1.0
      // Start tracking tighten
      mockV.adt_lastDir = 'tighten'
      mockV.adt_consecCnt = 1

      // Now get a cycle between danger and min (wants widen tracking)
      // totalCycle = 500s > dangerZone (450s), < minCycle (540s)
      adaptHysteresis(250, 250, 3)
      expect(mockV.adt_lastDir).toBe('widen')
      expect(mockV.adt_consecCnt).toBe(1) // Reset to 1, not 2
    })

    it('should block widen near freeze limit', () => {
      // Short cycle in danger zone, but freeze guard blocks widening
      mockS.adt_hystDeg = 1.4
      mockC.ctl_targetDeg = -1.0
      mockC.cmp_freezeCutDeg = -2.0
      const result = adaptHysteresis(130, 130, 3) // totalCycle = 260s < 360s
      expect(result).toBe('blocked')
    })

    it('should return null during turbo', () => {
      mockV.trb_isActive = true
      const result = adaptHysteresis(200, 500, 3)
      expect(result).toBeNull()
    })

    it('should return null when disabled', () => {
      mockC.adt_enable = false
      const result = adaptHysteresis(200, 500, 3)
      expect(result).toBeNull()
    })

    it('should return null with zero cycles', () => {
      const result = adaptHysteresis(200, 500, 0)
      expect(result).toBeNull()
    })

    // ----------------------------------------------------------
    // BOUNDARY TESTS - MIN/MAX LIMITS
    // ----------------------------------------------------------

    it('should clamp to max when widen exceeds adt_hystMaxDeg', () => {
      // Start at 1.4, max is 1.5, step is 0.2 → would be 1.6 but clamps to 1.5
      mockS.adt_hystDeg = 1.4
      mockC.adt_hystMaxDeg = 1.5
      // Danger zone: totalCycle < 450s triggers immediate widen (+0.3)
      const result = adaptHysteresis(150, 150, 3) // totalCycle = 300s
      expect(result).toBe('widen')
      expect(mockS.adt_hystDeg).toBe(1.5) // Clamped to max, not 1.7
    })

    it('should not widen when already at max', () => {
      // Start at max, short cycle should want to widen but can't
      mockS.adt_hystDeg = 1.5
      mockC.adt_hystMaxDeg = 1.5
      // totalCycle = 500s is above danger (450s) but below min (540s)
      const result = adaptHysteresis(250, 250, 3)
      expect(result).toBeNull() // Can't widen further
      expect(mockS.adt_hystDeg).toBe(1.5) // Unchanged
    })

    it('should clamp to max when confirmed widen exceeds limit', () => {
      // Start at 1.4, confirm widen with normal step (+0.2) → 1.6 clamps to 1.5
      mockS.adt_hystDeg = 1.4
      mockC.adt_hystMaxDeg = 1.5
      mockV.adt_lastDir = 'widen'
      mockV.adt_consecCnt = 1  // One tracking already
      // totalCycle = 500s < minCycle (540s), above danger zone (450s)
      const result = adaptHysteresis(250, 250, 3)
      expect(result).toBe('widen')
      expect(mockS.adt_hystDeg).toBe(1.5) // Clamped to max
    })

    it('should allow tighten to go below min (getEffectiveHysteresis clamps on read)', () => {
      // Start at 0.4, min is 0.3, step is 0.2 → stored becomes 0.2
      // getEffectiveHysteresis will clamp to 0.3 when reading
      mockS.adt_hystDeg = 0.4
      mockC.adt_hystMinDeg = 0.3
      mockV.adt_lastDir = 'tighten'
      mockV.adt_consecCnt = 1
      // Long cycle with idle headroom to trigger tighten
      const result = adaptHysteresis(900, 1100, 2) // 45% duty, has headroom
      expect(result).toBe('tighten')
      expect(mockS.adt_hystDeg).toBe(0.2) // Raw value below min
      // getEffectiveHysteresis would return 0.3 (min)
      expect(getEffectiveHysteresis()).toBe(0.3)
    })

    it('should not enter tighten path when already at min', () => {
      // Guard: S.adt_hystDeg > C.adt_hystMinDeg must be true to tighten
      mockS.adt_hystDeg = 0.3
      mockC.adt_hystMinDeg = 0.3
      // Long cycle with idle headroom
      const result = adaptHysteresis(900, 1100, 2)
      expect(result).toBeNull() // Can't tighten further
      expect(mockS.adt_hystDeg).toBe(0.3) // Unchanged
    })

    it('should return base hysteresis when adaptive disabled and value exceeds max', () => {
      mockC.adt_enable = false
      mockC.ctl_hystDeg = 1.0
      mockS.adt_hystDeg = 2.0 // Above max, but adaptive disabled
      expect(getEffectiveHysteresis()).toBe(1.0) // Returns base config value
    })
  })

  // ----------------------------------------------------------
  // PROPERTY-BASED TESTS (using fast-check)
  // ----------------------------------------------------------

  describe('adaptHysteresis property-based', async () => {
    const fc = await import('fast-check')

    it('should always return valid result type', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 60, max: 3600 }), // avgOn
          fc.integer({ min: 60, max: 3600 }), // avgOff
          fc.integer({ min: 0, max: 10 }),    // cycleCount
          (avgOn, avgOff, cycleCount) => {
            // Reset state for each property test
            mockS.adt_hystDeg = 0.8
            mockV.trb_isActive = false
            mockV.adt_lastDir = null
            mockV.adt_consecCnt = 0

            const result = adaptHysteresis(avgOn, avgOff, cycleCount)
            return (
              result === null
              || result === 'widen'
              || result === 'tighten'
              || result === 'blocked'
            )
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should never exceed max hysteresis', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 60, max: 600 }), // short cycles
          fc.integer({ min: 60, max: 600 }),
          fc.integer({ min: 1, max: 10 }),
          (avgOn, avgOff, cycleCount) => {
            // Reset state
            mockS.adt_hystDeg = 1.4 // Near max
            mockV.trb_isActive = false
            mockV.adt_lastDir = null
            mockV.adt_consecCnt = 0

            adaptHysteresis(avgOn, avgOff, cycleCount)
            return mockS.adt_hystDeg <= mockC.adt_hystMaxDeg
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should never return effective hysteresis below min', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 3600 }), // long cycles
          fc.integer({ min: 1000, max: 3600 }),
          fc.integer({ min: 1, max: 3 }),       // low cycle count
          (avgOn, avgOff, cycleCount) => {
            // Reset state with idle headroom (avgOff > avgOn)
            mockS.adt_hystDeg = 0.4 // Near min
            mockV.trb_isActive = false
            mockV.adt_lastDir = 'tighten'
            mockV.adt_consecCnt = 1 // Need confirmation

            adaptHysteresis(avgOn, avgOff, cycleCount)
            // S.adt_hystDeg can go below min, but getEffectiveHysteresis clamps on read
            return getEffectiveHysteresis() >= mockC.adt_hystMinDeg
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should respect freeze protection margin', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 60, max: 300 }), // very short cycles
          fc.integer({ min: 60, max: 300 }),
          fc.integer({ min: 1, max: 10 }),
          (avgOn, avgOff, cycleCount) => {
            // Set up freeze protection scenario
            mockC.ctl_targetDeg = 2.0
            mockC.cmp_freezeCutDeg = 0.0
            mockS.adt_hystDeg = 1.5 // Wide hysteresis
            mockV.trb_isActive = false
            mockV.adt_lastDir = null
            mockV.adt_consecCnt = 0

            adaptHysteresis(avgOn, avgOff, cycleCount)

            // Lower bound = target - hysteresis
            // Must not cross freeze cut + margin
            const lowerBound = mockC.ctl_targetDeg - mockS.adt_hystDeg
            return lowerBound >= mockC.cmp_freezeCutDeg + mockADAPT.FREEZE_MARGIN_DEG
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  // ----------------------------------------------------------
  // TURBO MODE TESTS
  // ----------------------------------------------------------

  describe('checkTurboSwitch', () => {
    it('should activate on rising edge', () => {
      mockV.trb_prevSw = false
      const result = checkTurboSwitch(true)

      expect(result).toBe(true)
      expect(mockV.trb_isActive).toBe(true)
      expect(mockV.trb_remSec).toBe(3600)
    })

    it('should not activate on high state (no edge)', () => {
      mockV.trb_prevSw = true
      const result = checkTurboSwitch(true)

      expect(result).toBe(false)
      expect(mockV.trb_isActive).toBe(false)
    })

    it('should not activate when disabled', () => {
      mockC.trb_enable = false
      const result = checkTurboSwitch(true)

      expect(result).toBe(false)
    })

    it('should update lastSw state', () => {
      mockV.trb_prevSw = false
      checkTurboSwitch(true)
      expect(mockV.trb_prevSw).toBe(true)
    })
  })

  describe('handleTurboMode', () => {
    it('should return null when not active', () => {
      mockV.trb_isActive = false
      expect(handleTurboMode(5)).toBeNull()
    })

    it('should decrement timer and return override', () => {
      mockV.trb_isActive = true
      mockV.trb_remSec = 600
      const result = handleTurboMode(5)

      expect(mockV.trb_remSec).toBe(595)
      expect(result.target).toBe(-2.0)
      expect(result.hyst).toBe(0.3)
    })

    it('should deactivate when timer expires', () => {
      mockV.trb_isActive = true
      mockV.trb_remSec = 0
      const result = handleTurboMode(5)

      expect(mockV.trb_isActive).toBe(false)
      expect(result).toBeNull()
    })
  })

  // ----------------------------------------------------------
  // DOOR DETECTION TESTS
  // ----------------------------------------------------------

  describe('detectDoorOpen', () => {
    it('should detect rapid temperature rise', () => {
      mockV.dor_refDeg = 4.0
      mockV.dor_refTs = 100
      // Rate = (5.0 - 4.0) / 60 * 60 = 1.0 deg/min > 0.5 threshold
      const result = detectDoorOpen(5.0, 160)

      expect(result).toBe(true)
      // Timer set to 180, then decremented by sys_loopSec (5) = 175
      expect(mockV.dor_pauseRemSec).toBe(175)
    })

    it('should not detect slow temperature change', () => {
      mockV.dor_refDeg = 4.0
      mockV.dor_refTs = 100
      // Rate = (4.1 - 4.0) / 60 * 60 = 0.1 deg/min < 0.5 threshold
      const result = detectDoorOpen(4.1, 160)

      expect(result).toBe(false)
    })

    it('should update reference values', () => {
      mockV.dor_refDeg = 0
      mockV.dor_refTs = 0
      detectDoorOpen(5.0, 100)

      expect(mockV.dor_refDeg).toBe(5.0)
      expect(mockV.dor_refTs).toBe(100)
    })

    it('should decrement timer', () => {
      mockV.dor_pauseRemSec = 60
      detectDoorOpen(5.0, 100)

      expect(mockV.dor_pauseRemSec).toBe(55)
    })

    it('should return false when disabled', () => {
      mockC.dor_enable = false
      const result = detectDoorOpen(10.0, 100)

      expect(result).toBe(false)
    })

    it('should ignore small dt values to prevent false positives', () => {
      // This guards against timer overlap or clock jitter causing false door events.
      // With sys_loopSec = 5, dt must be >= 2.5 seconds.
      mockV.dor_refDeg = 2.0
      mockV.dor_refTs = 100
      // dt = 0.1 seconds (too small), rate would be (2.1 - 2.0) / 0.1 * 60 = 60 deg/min
      // But this should be ignored because dt < sys_loopSec * 0.5 (2.5s)
      const result = detectDoorOpen(2.1, 100.1)

      expect(result).toBe(false)
      expect(mockV.dor_pauseRemSec).toBe(0) // Timer should not be triggered
    })

    it('should accept dt values at minimum threshold', () => {
      // dt = 2.5 seconds (exactly at threshold: sys_loopSec * 0.5)
      // rate = (10.0 - 4.0) / 2.5 * 60 = 144 deg/min > 0.5 threshold
      mockV.dor_refDeg = 4.0
      mockV.dor_refTs = 100
      const result = detectDoorOpen(10.0, 102.5)

      expect(result).toBe(true)
      expect(mockV.dor_pauseRemSec).toBe(175) // 180 - 5 (sys_loopSec)
    })

    // Mutation killers for V.dor_refTs > 0 && V.dor_refDeg !== 0
    it('should skip rate calc when refTs = 0 (kills && to || mutation)', () => {
      // If mutation changes && to ||, this would proceed when only refDeg is set
      mockV.dor_refTs = 0  // Not set
      mockV.dor_refDeg = 4.0  // Set
      mockV.dor_pauseRemSec = 0

      // With refTs=0, rate calculation should be skipped (division by ~0 would error)
      const result = detectDoorOpen(10.0, 100)

      // Should only update refs, not detect door (no rate calc possible)
      expect(result).toBe(false)
      expect(mockV.dor_refTs).toBe(100) // Updated
    })

    it('should skip rate calc when refDeg = 0 (kills && to || mutation)', () => {
      // If mutation changes && to ||, this would proceed when only refTs is set
      mockV.dor_refTs = 100  // Set
      mockV.dor_refDeg = 0  // Not set (or exactly 0°C which is invalid baseline)
      mockV.dor_pauseRemSec = 0

      // With refDeg=0, we don't have a valid baseline
      const result = detectDoorOpen(10.0, 160)

      // Should update refs but not detect (invalid baseline)
      expect(result).toBe(false)
    })
  })

  describe('isDoorPauseActive', () => {
    it('should return true when timer active', () => {
      mockV.dor_pauseRemSec = 100
      expect(isDoorPauseActive()).toBe(true)
    })

    it('should return false when timer expired', () => {
      mockV.dor_pauseRemSec = 0
      expect(isDoorPauseActive()).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // DEFROST TESTS
  // ----------------------------------------------------------

  describe('isScheduledDefrost', () => {
    it('should return true during defrost hour', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 0, 1, 3, 15, 0)) // 3:15 AM
      expect(isScheduledDefrost()).toBe(true)
      vi.useRealTimers()
    })

    it('should return false outside defrost window', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 0, 1, 3, 45, 0)) // 3:45 AM (45*60=2700 > 1800)
      expect(isScheduledDefrost()).toBe(false)
      vi.useRealTimers()
    })

    it('should return false on different hour', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 0, 1, 4, 0, 0))
      expect(isScheduledDefrost()).toBe(false)
      vi.useRealTimers()
    })

    it('should return false when disabled', () => {
      mockC.dfr_schedEnable = false
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 0, 1, 3, 15, 0))
      expect(isScheduledDefrost()).toBe(false)
      vi.useRealTimers()
    })
  })

  describe('checkDefrostTrigger', () => {
    it('should trigger when evap cold enough', () => {
      const result = checkDefrostTrigger(-22.0)

      expect(result).toBe(true)
      expect(mockS.dfr_isActive).toBe(true)
    })

    it('should not trigger when evap too warm', () => {
      const result = checkDefrostTrigger(-15.0)

      expect(result).toBe(false)
      expect(mockS.dfr_isActive).toBe(false)
    })

    it('should not trigger when disabled', () => {
      mockC.dfr_dynEnable = false
      const result = checkDefrostTrigger(-22.0)

      expect(result).toBe(false)
    })

    it('should not trigger during turbo', () => {
      mockV.trb_isActive = true
      const result = checkDefrostTrigger(-22.0)

      expect(result).toBe(false)
    })

    it('should not trigger when already active', () => {
      mockS.dfr_isActive = true
      const result = checkDefrostTrigger(-22.0)

      expect(result).toBe(false)
    })
  })

  describe('handleDynamicDefrost', () => {
    // defr_dwellTimer is now module-local, so tests verify behavior via multiple calls
    beforeEach(() => {
      mockS.dfr_isActive = true
    })

    it('should return true while active and evap cold', () => {
      const result = handleDynamicDefrost(-10.0)
      expect(result).toBe(true)
    })

    it('should return true while dwell accumulating', () => {
      // Evap is warm, dwell timer starts but not complete
      const result = handleDynamicDefrost(1.0) // Above 0.0 threshold
      expect(result).toBe(true)
      expect(mockS.dfr_isActive).toBe(true) // Still active
    })

    it('should complete defrost after dwell via multiple calls', () => {
      // mockC.defr_dynDwellSec = 300, sys_loopSec = 5
      // 60 calls * 5s = 300s = threshold, defrost completes at 60th call (>= condition)
      for (let i = 0; i < 59; i++) {
        handleDynamicDefrost(1.0)
      }
      expect(mockS.dfr_isActive).toBe(true) // Not yet (59 * 5 = 295s < 300s)

      const result = handleDynamicDefrost(1.0) // 60th call = 300s >= threshold
      expect(result).toBe(false)
      expect(mockS.dfr_isActive).toBe(false)
    })

    it('should reset dwell timer if evap cools', () => {
      // Accumulate some dwell time with warm evap
      for (let i = 0; i < 50; i++) {
        handleDynamicDefrost(1.0)
      }
      // Evap cools - timer resets
      handleDynamicDefrost(-5.0)

      // Need full dwell again (>= 300s threshold to complete)
      // 60 calls * 5s = 300s = threshold, completes at 60th call
      for (let i = 0; i < 59; i++) {
        handleDynamicDefrost(1.0)
      }
      expect(mockS.dfr_isActive).toBe(true) // Timer was reset, not complete yet

      handleDynamicDefrost(1.0) // 60th call = 300s = threshold
      expect(mockS.dfr_isActive).toBe(false) // Now complete
    })

    it('should return false when not active', () => {
      mockS.dfr_isActive = false
      const result = handleDynamicDefrost(-10.0)
      expect(result).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // LIMP MODE TESTS
  // ----------------------------------------------------------

  describe('handleLimpMode', () => {
    it('should return ON during ON phase', () => {
      global.Shelly.getUptimeMs.mockReturnValue(500 * 1000) // 500s into 2700s cycle
      const result = handleLimpMode()

      expect(result.wantOn).toBe(true)
      expect(result.status).toBe('LIMP_COOL')
    })

    it('should return OFF during OFF phase', () => {
      global.Shelly.getUptimeMs.mockReturnValue(1000 * 1000) // 1000s into cycle (past 900s on)
      const result = handleLimpMode()

      expect(result.wantOn).toBe(false)
      expect(result.status).toBe('LIMP_IDLE')
    })

    it('should return disabled when not enabled', () => {
      mockC.lmp_enable = false
      const result = handleLimpMode()

      expect(result.wantOn).toBe(false)
      expect(result.detail).toBe('Limp Disabled')
    })

    it('should wrap at cycle boundary', () => {
      // 2700s cycle (900+1800), at 2800s should be 100s into next cycle (ON)
      global.Shelly.getUptimeMs.mockReturnValue(2800 * 1000)
      const result = handleLimpMode()

      expect(result.wantOn).toBe(true)
    })
  })

  // ----------------------------------------------------------
  // MUTATION KILLING TESTS
  // Target: EqualityOperator, ArithmeticOperator boundaries
  // ----------------------------------------------------------

  describe('adaptHysteresis mutation killers', () => {
    it('should trigger high cycle path at exactly 5 cycles (kills > to >= mutation)', () => {
      // HIGH_CYCLE_COUNT = 5, test exactly at boundary
      // If mutation changes >= to >, this would NOT trigger
      mockS.adt_hystDeg = 0.5
      // cycleCount = 5 (exactly at threshold), totalCycle = 1000s < 1200s
      const result = adaptHysteresis(500, 500, 5)
      expect(result).toBe('widen')
      expect(mockS.adt_hystDeg).toBe(0.8) // Danger zone step
    })

    it('should NOT trigger high cycle path at 4 cycles (boundary test)', () => {
      // cycleCount = 4 < 5, should NOT use high cycle logic
      mockS.adt_hystDeg = 0.5
      // totalCycle = 1000s is in stable zone (540-2400s) without high cycle signal
      const result = adaptHysteresis(500, 500, 4)
      expect(result).toBeNull() // Stable zone, no action
    })

    it('should trigger low cycle path at exactly 3 cycles (kills < to <= mutation)', () => {
      // LOW_CYCLE_COUNT = 3, test exactly at boundary
      // Long cycle with headroom should use lowered maxCycle threshold
      mockS.adt_hystDeg = 1.0
      mockV.adt_lastDir = 'tighten'
      mockV.adt_consecCnt = 1
      // cycleCount = 3, totalCycle = 1600s, avgOff > avgOn
      const result = adaptHysteresis(600, 1000, 3)
      expect(result).toBe('tighten')
    })

    it('should NOT trigger low cycle path at 4 cycles (boundary test)', () => {
      // cycleCount = 4 > 3, should NOT use low cycle logic
      mockS.adt_hystDeg = 1.0
      mockV.adt_lastDir = 'tighten'
      mockV.adt_consecCnt = 1
      // Same timing, but 4 cycles uses normal maxCycle (2400s)
      // totalCycle = 1600s < 2400s, so it's in stable zone
      const result = adaptHysteresis(600, 1000, 4)
      expect(result).toBeNull() // Stable zone with normal threshold
    })

    it('should use correct totalCycle calculation (kills * to / mutation)', () => {
      // totalCycle = avgOn + avgOff, not avgOn * avgOff
      mockS.adt_hystDeg = 0.5
      // avgOn=200, avgOff=200 → totalCycle should be 400s (danger zone)
      // If mutation changes + to *, would be 40000s (way over)
      const result = adaptHysteresis(200, 200, 3)
      expect(result).toBe('widen')
      // This only triggers if totalCycle=400s < dangerZone(450s)
    })

    it('should calculate duty correctly with division (kills / to * mutation)', () => {
      // avgOn / totalCycle gives duty ratio
      // avgOn=800, avgOff=200, totalCycle=1000, duty=80%
      // If mutation changes / to *, duty would be 800000 (nonsense)
      mockS.adt_hystDeg = 1.0
      // High duty (80%) should block tightening even with long cycle
      const result = adaptHysteresis(800, 200, 3)
      // With 80% duty, avgOff (200) < avgOn (800), so no tighten
      expect(result).toBeNull()
    })

    it('should decrement hysteresis correctly (kills - to + mutation)', () => {
      // Tighten should subtract 0.1 step, not add
      mockS.adt_hystDeg = 1.0
      mockV.adt_lastDir = 'tighten'
      mockV.adt_consecCnt = 1
      // Long cycle with idle headroom
      const result = adaptHysteresis(900, 1100, 2)
      expect(result).toBe('tighten')
      // Should be 1.0 - 0.2 = 0.8, not 1.0 + 0.2 = 1.2
      expect(mockS.adt_hystDeg).toBe(0.8)
      expect(mockS.adt_hystDeg).toBeLessThan(1.0)
    })
  })
})
