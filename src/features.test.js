// ==============================================================================
// * FEATURES TESTS
// ? Validates door detection, defrost, turbo, limp, and adaptive hysteresis.
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
      adapt_hystCurrent: 0.5,
      defr_isActive: false,
      sys_relayState: false,
    }

    // Create mock volatile state
    // ? defr_dwellTimer is now module-local in features.js
    mockV = {
      turbo_active: false,
      turbo_remSec: 0,
      turbo_lastSw: false,
      door_refTemp: 0,
      door_refTs: 0,
      door_timer: 0,
      hw_hasPM: true,
      sys_alarm: 'NONE',
      pwr_ghostTimer: 0,
      adapt_lastDir: null,
      adapt_consecCount: 0,
    }

    // Create mock config
    mockC = {
      sys_loopSec: 5,
      ctrl_targetDeg: 4.0,
      comp_freezeCutDeg: -2.0,
      adapt_enable: true,
      adapt_hystMinDeg: 0.3,
      adapt_hystMaxDeg: 1.5,
      adapt_targetMinSec: 300,
      adapt_targetMaxSec: 1800,
      turbo_enable: true,
      turbo_maxTimeSec: 3600,
      turbo_targetDeg: -2.0,
      turbo_hystDeg: 0.3,
      door_enable: true,
      door_rateDegMin: 0.5,
      door_pauseSec: 180,
      defr_schedEnable: true,
      defr_schedHour: 3,
      defr_schedDurSec: 1800,
      defr_dynEnable: true,
      defr_dynTrigDeg: -20.0,
      defr_dynEndDeg: 0.0,
      defr_dynDwellSec: 300,
      pwr_enable: true,
      pwr_startMaskSec: 30,
      pwr_runMaxW: 200,
      pwr_runMinW: 20,
      pwr_ghostTripSec: 60,
      limp_enable: true,
      limp_onSec: 900,
      limp_offSec: 1800,
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
  // * ADAPTIVE HYSTERESIS TESTS
  // ----------------------------------------------------------

  describe('getEffectiveHysteresis', () => {
    it('should return current value within bounds', () => {
      mockS.adapt_hystCurrent = 0.5
      expect(getEffectiveHysteresis()).toBe(0.5)
    })

    it('should clamp to max when exceeded', () => {
      mockS.adapt_hystCurrent = 2.0
      expect(getEffectiveHysteresis()).toBe(1.5)
    })

    it('should clamp to min when below', () => {
      mockS.adapt_hystCurrent = 0.1
      expect(getEffectiveHysteresis()).toBe(0.3)
    })
  })

  describe('adaptHysteresis', () => {
    // ? Trend-Confirmed Cycle-Time Seeking Algorithm with Cycle Count Signal
    // ? Mock config: minSec=300s, maxSec=1800s
    // ? minCycle = 300 * 1.8 = 540s (9 min) → widen below (with confirmation)
    // ? maxCycle = 1800 + 600 = 2400s (40 min) → tighten above (with confirmation)
    // ? dangerZone = 300 * 1.5 = 450s (7.5 min) → immediate widen +0.3°
    // ? HIGH CYCLE: cycleCount >= 5 && totalCycle < 1200s → treat as danger zone
    // ? Steps: widen +0.2° (confirmed), danger +0.3° (immediate), tighten -0.2°

    it('should widen IMMEDIATELY when below danger zone (<7.5 min)', () => {
      // ? totalCycle = 200 + 200 = 400s = 6.7 min < 450s (dangerZone)
      // ? Danger zone bypasses trend confirmation for compressor protection
      mockS.adapt_hystCurrent = 0.5
      const result = adaptHysteresis(200, 200, 3)
      expect(result).toBe('widen')
      expect(mockS.adapt_hystCurrent).toBe(0.8) // +0.3 step for danger zone
    })

    it('should widen after trend confirmation (2 consecutive short cycles)', () => {
      // ? totalCycle = 250 + 250 = 500s > dangerZone (450s), but < minCycle (540s)
      // ? Needs 2 consecutive triggers for widen
      mockS.adapt_hystCurrent = 0.5
      // First call - starts tracking
      let result = adaptHysteresis(250, 250, 3)
      expect(result).toBeNull()
      expect(mockV.adapt_lastDir).toBe('widen')
      expect(mockV.adapt_consecCount).toBe(1)

      // Second call - confirms and acts
      result = adaptHysteresis(250, 250, 3)
      expect(result).toBe('widen')
      expect(mockS.adapt_hystCurrent).toBe(0.7) // +0.2 step
    })

    it('should NOT adapt when total cycle is in stable zone (9-40 min)', () => {
      // ? totalCycle = 720 + 540 = 1260s = 21 min → STABLE (real device profile)
      // ? Stable zone is 540s to 2400s (wider than before)
      mockS.adapt_hystCurrent = 1.0
      const result = adaptHysteresis(720, 540, 3) // 12m ON + 9m OFF
      expect(result).toBeNull()
      // ? Stable zone maintains tracking - doesn't reset direction
    })

    it('should maintain tracking direction through stable zone periods', () => {
      // ? If tracking widen, stable zone shouldn't reset it
      mockS.adapt_hystCurrent = 1.0
      mockV.adapt_lastDir = 'widen'
      mockV.adapt_consecCount = 1

      // Stable zone cycle (21 min)
      const result = adaptHysteresis(720, 540, 3)
      expect(result).toBeNull()
      expect(mockV.adapt_lastDir).toBe('widen') // Maintained, not reset
      expect(mockV.adapt_consecCount).toBe(1)   // Unchanged
    })

    it('should tighten after trend confirmation (2 consecutive long cycles)', () => {
      // ? maxCycle = 2400s, totalCycle = 2500s > 2400s, duty = 63%
      mockS.adapt_hystCurrent = 1.0
      // First call - starts tracking
      let result = adaptHysteresis(1600, 900, 3)
      expect(result).toBeNull()
      expect(mockV.adapt_lastDir).toBe('tighten')
      expect(mockV.adapt_consecCount).toBe(1)

      // Second call - confirms and acts
      result = adaptHysteresis(1600, 900, 3)
      expect(result).toBe('tighten')
      expect(mockS.adapt_hystCurrent).toBe(0.8) // -0.2 step
    })

    it('should NOT tighten when duty cycle is too high (system struggling)', () => {
      // ? totalCycle = 2000 + 500 = 2500s > 2400s, but duty = 80% → no action
      mockS.adapt_hystCurrent = 1.0
      const result = adaptHysteresis(2000, 500, 3) // 80% duty
      expect(result).toBeNull()
    })

    it('should widen immediately on high cycle count (>=5 cycles)', () => {
      // ? High cycle count indicates short cycling despite averaged data
      // ? totalCycle = 1000s (16.7 min), but cycleCount = 6 → treat as danger
      mockS.adapt_hystCurrent = 0.5
      const result = adaptHysteresis(600, 400, 6) // totalCycle = 1000s < 1200s, count >= 5
      expect(result).toBe('widen')
      expect(mockS.adapt_hystCurrent).toBe(0.8) // +0.3 step (danger zone)
    })

    it('should tighten easier on low cycle count (<=3 cycles)', () => {
      // ? Low cycle count indicates long cycles (efficient), lower maxCycle threshold
      // ? totalCycle = 1600s (26.7 min), cycleCount = 3 → lower maxCycle to 1500s → tighten!
      mockS.adapt_hystCurrent = 1.0
      mockV.adapt_lastDir = 'tighten'
      mockV.adapt_consecCount = 1  // Already tracking

      const result = adaptHysteresis(1000, 600, 3) // totalCycle = 1600s, count = 3
      expect(result).toBe('tighten')
      expect(mockS.adapt_hystCurrent).toBe(0.8) // -0.2 step
    })

    it('should reset tracking when direction changes', () => {
      mockS.adapt_hystCurrent = 1.0
      // Start tracking tighten
      mockV.adapt_lastDir = 'tighten'
      mockV.adapt_consecCount = 1

      // Now get a cycle between danger and min (wants widen tracking)
      // ? totalCycle = 500s > dangerZone (450s), < minCycle (540s)
      adaptHysteresis(250, 250, 3)
      expect(mockV.adapt_lastDir).toBe('widen')
      expect(mockV.adapt_consecCount).toBe(1) // Reset to 1, not 2
    })

    it('should block widen near freeze limit', () => {
      // ? Short cycle in danger zone, but freeze guard blocks widening
      mockS.adapt_hystCurrent = 1.4
      mockC.ctrl_targetDeg = -1.0
      mockC.comp_freezeCutDeg = -2.0
      const result = adaptHysteresis(130, 130, 3) // totalCycle = 260s < 360s
      expect(result).toBe('blocked')
    })

    it('should return null during turbo', () => {
      mockV.turbo_active = true
      const result = adaptHysteresis(200, 500, 3)
      expect(result).toBeNull()
    })

    it('should return null when disabled', () => {
      mockC.adapt_enable = false
      const result = adaptHysteresis(200, 500, 3)
      expect(result).toBeNull()
    })

    it('should return null with zero cycles', () => {
      const result = adaptHysteresis(200, 500, 0)
      expect(result).toBeNull()
    })
  })

  // ----------------------------------------------------------
  // * TURBO MODE TESTS
  // ----------------------------------------------------------

  describe('checkTurboSwitch', () => {
    it('should activate on rising edge', () => {
      mockV.turbo_lastSw = false
      const result = checkTurboSwitch(true)

      expect(result).toBe(true)
      expect(mockV.turbo_active).toBe(true)
      expect(mockV.turbo_remSec).toBe(3600)
    })

    it('should not activate on high state (no edge)', () => {
      mockV.turbo_lastSw = true
      const result = checkTurboSwitch(true)

      expect(result).toBe(false)
      expect(mockV.turbo_active).toBe(false)
    })

    it('should not activate when disabled', () => {
      mockC.turbo_enable = false
      const result = checkTurboSwitch(true)

      expect(result).toBe(false)
    })

    it('should update lastSw state', () => {
      mockV.turbo_lastSw = false
      checkTurboSwitch(true)
      expect(mockV.turbo_lastSw).toBe(true)
    })
  })

  describe('handleTurboMode', () => {
    it('should return null when not active', () => {
      mockV.turbo_active = false
      expect(handleTurboMode(5)).toBeNull()
    })

    it('should decrement timer and return override', () => {
      mockV.turbo_active = true
      mockV.turbo_remSec = 600
      const result = handleTurboMode(5)

      expect(mockV.turbo_remSec).toBe(595)
      expect(result.target).toBe(-2.0)
      expect(result.hyst).toBe(0.3)
    })

    it('should deactivate when timer expires', () => {
      mockV.turbo_active = true
      mockV.turbo_remSec = 0
      const result = handleTurboMode(5)

      expect(mockV.turbo_active).toBe(false)
      expect(result).toBeNull()
    })
  })

  // ----------------------------------------------------------
  // * DOOR DETECTION TESTS
  // ----------------------------------------------------------

  describe('detectDoorOpen', () => {
    it('should detect rapid temperature rise', () => {
      mockV.door_refTemp = 4.0
      mockV.door_refTs = 100
      // Rate = (5.0 - 4.0) / 60 * 60 = 1.0 deg/min > 0.5 threshold
      const result = detectDoorOpen(5.0, 160)

      expect(result).toBe(true)
      // Timer set to 180, then decremented by sys_loopSec (5) = 175
      expect(mockV.door_timer).toBe(175)
    })

    it('should not detect slow temperature change', () => {
      mockV.door_refTemp = 4.0
      mockV.door_refTs = 100
      // Rate = (4.1 - 4.0) / 60 * 60 = 0.1 deg/min < 0.5 threshold
      const result = detectDoorOpen(4.1, 160)

      expect(result).toBe(false)
    })

    it('should update reference values', () => {
      mockV.door_refTemp = 0
      mockV.door_refTs = 0
      detectDoorOpen(5.0, 100)

      expect(mockV.door_refTemp).toBe(5.0)
      expect(mockV.door_refTs).toBe(100)
    })

    it('should decrement timer', () => {
      mockV.door_timer = 60
      detectDoorOpen(5.0, 100)

      expect(mockV.door_timer).toBe(55)
    })

    it('should return false when disabled', () => {
      mockC.door_enable = false
      const result = detectDoorOpen(10.0, 100)

      expect(result).toBe(false)
    })

    it('should ignore small dt values to prevent false positives', () => {
      // ? This guards against timer overlap or clock jitter causing false door events.
      // ? With sys_loopSec = 5, dt must be >= 2.5 seconds.
      mockV.door_refTemp = 2.0
      mockV.door_refTs = 100
      // ? dt = 0.1 seconds (too small), rate would be (2.1 - 2.0) / 0.1 * 60 = 60 deg/min
      // ? But this should be ignored because dt < sys_loopSec * 0.5 (2.5s)
      const result = detectDoorOpen(2.1, 100.1)

      expect(result).toBe(false)
      expect(mockV.door_timer).toBe(0) // Timer should not be triggered
    })

    it('should accept dt values at minimum threshold', () => {
      // ? dt = 2.5 seconds (exactly at threshold: sys_loopSec * 0.5)
      // ? rate = (10.0 - 4.0) / 2.5 * 60 = 144 deg/min > 0.5 threshold
      mockV.door_refTemp = 4.0
      mockV.door_refTs = 100
      const result = detectDoorOpen(10.0, 102.5)

      expect(result).toBe(true)
      expect(mockV.door_timer).toBe(175) // 180 - 5 (sys_loopSec)
    })
  })

  describe('isDoorPauseActive', () => {
    it('should return true when timer active', () => {
      mockV.door_timer = 100
      expect(isDoorPauseActive()).toBe(true)
    })

    it('should return false when timer expired', () => {
      mockV.door_timer = 0
      expect(isDoorPauseActive()).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // * DEFROST TESTS
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
      mockC.defr_schedEnable = false
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
      expect(mockS.defr_isActive).toBe(true)
    })

    it('should not trigger when evap too warm', () => {
      const result = checkDefrostTrigger(-15.0)

      expect(result).toBe(false)
      expect(mockS.defr_isActive).toBe(false)
    })

    it('should not trigger when disabled', () => {
      mockC.defr_dynEnable = false
      const result = checkDefrostTrigger(-22.0)

      expect(result).toBe(false)
    })

    it('should not trigger during turbo', () => {
      mockV.turbo_active = true
      const result = checkDefrostTrigger(-22.0)

      expect(result).toBe(false)
    })

    it('should not trigger when already active', () => {
      mockS.defr_isActive = true
      const result = checkDefrostTrigger(-22.0)

      expect(result).toBe(false)
    })
  })

  describe('handleDynamicDefrost', () => {
    // ? defr_dwellTimer is now module-local, so tests verify behavior via multiple calls
    beforeEach(() => {
      mockS.defr_isActive = true
    })

    it('should return true while active and evap cold', () => {
      const result = handleDynamicDefrost(-10.0)
      expect(result).toBe(true)
    })

    it('should return true while dwell accumulating', () => {
      // Evap is warm, dwell timer starts but not complete
      const result = handleDynamicDefrost(1.0) // Above 0.0 threshold
      expect(result).toBe(true)
      expect(mockS.defr_isActive).toBe(true) // Still active
    })

    it('should complete defrost after dwell via multiple calls', () => {
      // ? mockC.defr_dynDwellSec = 300, sys_loopSec = 5
      // ? 60 calls * 5s = 300s = threshold, defrost completes at 60th call (>= condition)
      for (let i = 0; i < 59; i++) {
        handleDynamicDefrost(1.0)
      }
      expect(mockS.defr_isActive).toBe(true) // Not yet (59 * 5 = 295s < 300s)

      const result = handleDynamicDefrost(1.0) // 60th call = 300s >= threshold
      expect(result).toBe(false)
      expect(mockS.defr_isActive).toBe(false)
    })

    it('should reset dwell timer if evap cools', () => {
      // Accumulate some dwell time with warm evap
      for (let i = 0; i < 50; i++) {
        handleDynamicDefrost(1.0)
      }
      // Evap cools - timer resets
      handleDynamicDefrost(-5.0)

      // ? Need full dwell again (>= 300s threshold to complete)
      // ? 60 calls * 5s = 300s = threshold, completes at 60th call
      for (let i = 0; i < 59; i++) {
        handleDynamicDefrost(1.0)
      }
      expect(mockS.defr_isActive).toBe(true) // Timer was reset, not complete yet

      handleDynamicDefrost(1.0) // 60th call = 300s = threshold
      expect(mockS.defr_isActive).toBe(false) // Now complete
    })

    it('should return false when not active', () => {
      mockS.defr_isActive = false
      const result = handleDynamicDefrost(-10.0)
      expect(result).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // * LIMP MODE TESTS
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
      mockC.limp_enable = false
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
})
