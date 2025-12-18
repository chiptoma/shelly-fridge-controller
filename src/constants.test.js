// ==============================================================================
// CONSTANTS TESTS
// Validates that all constant enums are properly defined.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Constants', () => {
  let ST, RSN, ALM, ICO, ADAPT

  beforeEach(async () => {
    vi.resetModules()
    const module = await import('./constants.js')
    ST = module.ST
    RSN = module.RSN
    ALM = module.ALM
    ICO = module.ICO
    ADAPT = module.ADAPT
  })

  // ----------------------------------------------------------
  // STATUS (ST) TESTS
  // ----------------------------------------------------------

  describe('ST (Status)', () => {
    it('should define all required status values', () => {
      expect(ST.BOOT).toBe('BOOT')
      expect(ST.IDLE).toBe('IDLE')
      expect(ST.COOLING).toBe('COOLING')
      expect(ST.WANT_IDLE).toBe('WANT_IDLE')
      expect(ST.WANT_COOL).toBe('WANT_COOL')
      expect(ST.LIMP_IDLE).toBe('LIMP_IDLE')
      expect(ST.LIMP_COOL).toBe('LIMP_COOL')
      expect(ST.TURBO_COOL).toBe('TURBO_COOL')
      expect(ST.TURBO_IDLE).toBe('TURBO_IDLE')
    })

    it('should have exactly 9 status values', () => {
      expect(Object.keys(ST)).toHaveLength(9)
    })
  })

  // ----------------------------------------------------------
  // REASON (RSN) TESTS
  // ----------------------------------------------------------

  describe('RSN (Reason)', () => {
    it('should define all required reason values', () => {
      expect(RSN.NONE).toBe('NONE')
      expect(RSN.PROT_MIN_ON).toBe('PROT_MIN_ON')
      expect(RSN.PROT_MIN_OFF).toBe('PROT_MIN_OFF')
      expect(RSN.PROT_MAX_ON).toBe('PROT_MAX_ON')
      expect(RSN.PROT_AIR_FRZ).toBe('PROT_AIR_FRZ')
      expect(RSN.PROT_DOOR).toBe('PROT_DOOR_OPEN')
      expect(RSN.DEFR_SCHED).toBe('DEFR_SCHED')
      expect(RSN.DEFR_TRIG).toBe('DEFR_TRIG')
      expect(RSN.DEFR_DYN).toBe('DEFR_DYN')
    })

    it('should have exactly 9 reason values', () => {
      expect(Object.keys(RSN)).toHaveLength(9)
    })
  })

  // ----------------------------------------------------------
  // ALARM (ALM) TESTS
  // ----------------------------------------------------------

  describe('ALM (Alarm)', () => {
    it('should define all required alarm values', () => {
      expect(ALM.NONE).toBe('NONE')
      expect(ALM.WELD).toBe('ALARM_RELAY_WELD')
      expect(ALM.LOCKED).toBe('ALARM_ROTOR_LOCKED')
      expect(ALM.HIGH).toBe('ALARM_HIGH_TEMP')
      expect(ALM.FAIL).toBe('ALARM_SENSOR_FAIL')
      expect(ALM.STUCK).toBe('ALARM_SENSOR_STUCK')
      expect(ALM.GHOST).toBe('ALARM_COMP_GHOST')
      expect(ALM.COOL).toBe('ALARM_COOLING_FAIL')
    })

    it('should have exactly 8 alarm values', () => {
      expect(Object.keys(ALM)).toHaveLength(8)
    })

    it('should have unique alarm string values', () => {
      const values = Object.values(ALM)
      const uniqueValues = new Set(values)
      expect(uniqueValues.size).toBe(values.length)
    })
  })

  // ----------------------------------------------------------
  // ICONS (ICO) TESTS
  // ----------------------------------------------------------

  describe('ICO (Icons)', () => {
    it('should define icons for all status values', () => {
      expect(ICO.BOOT).toBeDefined()
      expect(ICO.IDLE).toBeDefined()
      expect(ICO.COOLING).toBeDefined()
      expect(ICO.WANT_IDLE).toBeDefined()
      expect(ICO.WANT_COOL).toBeDefined()
      expect(ICO.LIMP_IDLE).toBeDefined()
      expect(ICO.LIMP_COOL).toBeDefined()
      expect(ICO.TURBO_COOL).toBeDefined()
      expect(ICO.TURBO_IDLE).toBeDefined()
    })

    it('should have icons as non-empty strings', () => {
      Object.values(ICO).forEach((icon) => {
        expect(typeof icon).toBe('string')
        expect(icon.length).toBeGreaterThan(0)
      })
    })

    it('should have matching keys with ST enum', () => {
      Object.keys(ST).forEach((key) => {
        expect(ICO[key]).toBeDefined()
      })
    })
  })

  // ----------------------------------------------------------
  // ADAPTIVE HYSTERESIS (ADAPT) TESTS
  // ----------------------------------------------------------

  describe('ADAPT (Adaptive Hysteresis)', () => {
    it('should define all zone multipliers', () => {
      expect(ADAPT.DANGER_MULT).toBe(1.5)
      expect(ADAPT.SHORT_MULT).toBe(1.8)
      expect(ADAPT.STABLE_PAD_SEC).toBe(480)
    })

    it('should define cycle count thresholds', () => {
      expect(ADAPT.HIGH_CYCLE_COUNT).toBe(5)
      expect(ADAPT.HIGH_CYCLE_MAX_SEC).toBe(1200)
      expect(ADAPT.LOW_CYCLE_COUNT).toBe(3)
      expect(ADAPT.LOW_CYCLE_MIN_SEC).toBe(1500)
    })

    it('should define step sizes', () => {
      expect(ADAPT.DANGER_STEP_DEG).toBe(0.3)
      expect(ADAPT.NORMAL_STEP_DEG).toBe(0.2)
    })

    it('should define freeze margin', () => {
      expect(ADAPT.FREEZE_MARGIN_DEG).toBe(0.3)
    })

    it('should have exactly 10 ADAPT values', () => {
      expect(Object.keys(ADAPT)).toHaveLength(10)
    })

    it('should have all numeric values', () => {
      Object.values(ADAPT).forEach((value) => {
        expect(typeof value).toBe('number')
        expect(isNaN(value)).toBe(false)
      })
    })

    it('should have DANGER_MULT < SHORT_MULT (correct threshold order)', () => {
      expect(ADAPT.DANGER_MULT).toBeLessThan(ADAPT.SHORT_MULT)
    })

    it('should have positive step sizes', () => {
      expect(ADAPT.DANGER_STEP_DEG).toBeGreaterThan(0)
      expect(ADAPT.NORMAL_STEP_DEG).toBeGreaterThan(0)
    })

    it('should have DANGER_STEP > NORMAL_STEP (faster correction in danger)', () => {
      expect(ADAPT.DANGER_STEP_DEG).toBeGreaterThan(ADAPT.NORMAL_STEP_DEG)
    })
  })
})
