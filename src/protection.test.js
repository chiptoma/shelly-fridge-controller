// ==============================================================================
// PROTECTION TESTS
// Validates compressor timing, weld detection, freeze protection, and power monitoring.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Protection', () => {
  let canTurnOn, canTurnOff, getTimeUntilOnAllowed, getTimeUntilOffAllowed
  let isMaxRunExceeded, isFreezeProtectionActive
  let checkWeldDetection, checkCoolingHealth
  let checkLockedRotor, checkGhostRun, resetGhostCount
  let mockS, mockV, mockC, mockALM

  beforeEach(async () => {
    vi.resetModules()

    // Create mock ALM constants
    mockALM = {
      NONE: 'NONE',
      WELD: 'ALARM_RELAY_WELD',
      COOL: 'ALARM_COOLING_FAIL',
      LOCKED: 'ALARM_ROTOR_LOCKED',
      GHOST: 'ALARM_COMP_GHOST',
    }

    // Create mock state
    mockS = {
      sys_isRelayOn: false,
      sys_relayOnTs: 0,
      sys_relayOffTs: 0,
      wld_airSnapDeg: 5.0,
    }

    // Create mock volatile state
    mockV = {
      sys_alarm: 'NONE',
      sns_airSmoothDeg: 5.0,
      trb_isActive: false,
      hw_hasPM: true,
      pwr_ghostSec: 0,
      pwr_ghostCnt: 0,
    }

    // Create mock config
    mockC = {
      sys_loopSec: 5,
      cmp_minOffSec: 180,
      cmp_minOnSec: 60,
      cmp_maxRunSec: 3600,
      cmp_freezeCutDeg: -2.0,
      wld_enable: true,
      wld_waitSec: 60,
      wld_winSec: 300,
      wld_dropDeg: 1.0,
      gas_checkSec: 600,
      gas_failDiff: 5.0,
      pwr_enable: true,
      pwr_startMaskSec: 30,
      pwr_runMaxW: 200,
      pwr_runMinW: 20,
      pwr_ghostTripSec: 60,
      pwr_ghostMaxCnt: 3,
    }

    // Mock global print
    global.print = vi.fn()

    // Mock dependencies
    vi.doMock('./constants.js', () => ({ ALM: mockALM }))
    vi.doMock('./config.js', () => ({ C: mockC }))
    vi.doMock('./state.js', () => ({ S: mockS, V: mockV }))
    vi.doMock('./alarms.js', () => ({
      recordFault: vi.fn(),
    }))

    const module = await import('./protection.js')
    canTurnOn = module.canTurnOn
    canTurnOff = module.canTurnOff
    getTimeUntilOnAllowed = module.getTimeUntilOnAllowed
    getTimeUntilOffAllowed = module.getTimeUntilOffAllowed
    isMaxRunExceeded = module.isMaxRunExceeded
    isFreezeProtectionActive = module.isFreezeProtectionActive
    checkWeldDetection = module.checkWeldDetection
    checkCoolingHealth = module.checkCoolingHealth
    checkLockedRotor = module.checkLockedRotor
    checkGhostRun = module.checkGhostRun
    resetGhostCount = module.resetGhostCount
  })

  // ----------------------------------------------------------
  // CAN TURN ON TESTS
  // ----------------------------------------------------------

  describe('canTurnOn', () => {
    it('should return true when min off time elapsed', () => {
      mockS.sys_relayOffTs = 0
      expect(canTurnOn(200)).toBe(true)
    })

    it('should return false when min off time not elapsed', () => {
      mockS.sys_relayOffTs = 100
      expect(canTurnOn(200)).toBe(false)
    })

    it('should return true at exact min off time', () => {
      mockS.sys_relayOffTs = 0
      expect(canTurnOn(180)).toBe(true)
    })
  })

  // ----------------------------------------------------------
  // CAN TURN OFF TESTS
  // ----------------------------------------------------------

  describe('canTurnOff', () => {
    it('should return true when min on time elapsed', () => {
      mockS.sys_relayOnTs = 0
      expect(canTurnOff(100)).toBe(true)
    })

    it('should return false when min on time not elapsed', () => {
      mockS.sys_relayOnTs = 100
      expect(canTurnOff(120)).toBe(false)
    })

    it('should return true at exact min on time', () => {
      mockS.sys_relayOnTs = 0
      expect(canTurnOff(60)).toBe(true)
    })
  })

  // ----------------------------------------------------------
  // GET TIME UNTIL ON ALLOWED TESTS
  // ----------------------------------------------------------

  describe('getTimeUntilOnAllowed', () => {
    it('should return remaining seconds when not yet allowed', () => {
      mockS.sys_relayOffTs = 100
      expect(getTimeUntilOnAllowed(200)).toBe(80)
    })

    it('should return 0 when already allowed', () => {
      mockS.sys_relayOffTs = 0
      expect(getTimeUntilOnAllowed(200)).toBe(0)
    })

    it('should return 0 at exact min off time', () => {
      mockS.sys_relayOffTs = 0
      expect(getTimeUntilOnAllowed(180)).toBe(0)
    })
  })

  // ----------------------------------------------------------
  // GET TIME UNTIL OFF ALLOWED TESTS
  // ----------------------------------------------------------

  describe('getTimeUntilOffAllowed', () => {
    it('should return remaining seconds when not yet allowed', () => {
      mockS.sys_relayOnTs = 100
      expect(getTimeUntilOffAllowed(120)).toBe(40)
    })

    it('should return 0 when already allowed', () => {
      mockS.sys_relayOnTs = 0
      expect(getTimeUntilOffAllowed(100)).toBe(0)
    })

    it('should return 0 at exact min on time', () => {
      mockS.sys_relayOnTs = 0
      expect(getTimeUntilOffAllowed(60)).toBe(0)
    })
  })

  // ----------------------------------------------------------
  // IS MAX RUN EXCEEDED TESTS
  // ----------------------------------------------------------

  describe('isMaxRunExceeded', () => {
    it('should return true when max run exceeded', () => {
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = 0
      expect(isMaxRunExceeded(3700)).toBe(true)
    })

    it('should return false when under max run', () => {
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = 0
      expect(isMaxRunExceeded(3000)).toBe(false)
    })

    it('should return false when relay is off', () => {
      mockS.sys_isRelayOn = false
      mockS.sys_relayOnTs = 0
      expect(isMaxRunExceeded(5000)).toBe(false)
    })

    it('should return false during turbo mode', () => {
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = 0
      mockV.trb_isActive = true
      expect(isMaxRunExceeded(5000)).toBe(false)
    })

    it('should return false at exact max run time', () => {
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = 0
      expect(isMaxRunExceeded(3600)).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // IS FREEZE PROTECTION ACTIVE TESTS
  // ----------------------------------------------------------

  describe('isFreezeProtectionActive', () => {
    it('should return true when temp below freeze cut', () => {
      expect(isFreezeProtectionActive(-3.0)).toBe(true)
    })

    it('should return false when temp above freeze cut', () => {
      expect(isFreezeProtectionActive(0.0)).toBe(false)
    })

    it('should return false at exact freeze cut temp', () => {
      expect(isFreezeProtectionActive(-2.0)).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // CHECK WELD DETECTION TESTS
  // ----------------------------------------------------------

  describe('checkWeldDetection', () => {
    it('should return false when disabled', () => {
      mockC.wld_enable = false
      mockS.wld_airSnapDeg = 10.0
      expect(checkWeldDetection(5.0, 100)).toBe(false)
    })

    it('should return false when relay is on', () => {
      mockS.sys_isRelayOn = true
      expect(checkWeldDetection(5.0, 100)).toBe(false)
    })

    it('should return false before detection window', () => {
      mockS.sys_isRelayOn = false
      mockS.sys_relayOffTs = 0
      mockS.wld_airSnapDeg = 10.0
      expect(checkWeldDetection(5.0, 50)).toBe(false)
    })

    it('should return false after detection window', () => {
      mockS.sys_isRelayOn = false
      mockS.sys_relayOffTs = 0
      mockS.wld_airSnapDeg = 10.0
      expect(checkWeldDetection(5.0, 400)).toBe(false)
    })

    it('should return true when weld detected (temp dropped)', () => {
      mockS.sys_isRelayOn = false
      mockS.sys_relayOffTs = 0
      mockS.wld_airSnapDeg = 10.0
      // Temp dropped from 10 to 5 (drop of 5 > threshold of 1)
      const result = checkWeldDetection(5.0, 100)

      expect(result).toBe(true)
      expect(mockV.sys_alarm).toBe(mockALM.WELD)
      expect(global.print).toHaveBeenCalled()
    })

    it('should return false when temp stable', () => {
      mockS.sys_isRelayOn = false
      mockS.sys_relayOffTs = 0
      mockS.wld_airSnapDeg = 10.0
      // Temp dropped only 0.5 (< threshold of 1)
      expect(checkWeldDetection(9.5, 100)).toBe(false)
    })

    it('should return false when temp rises', () => {
      mockS.sys_isRelayOn = false
      mockS.sys_relayOffTs = 0
      mockS.wld_airSnapDeg = 10.0
      expect(checkWeldDetection(11.0, 100)).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // CHECK COOLING HEALTH TESTS
  // ----------------------------------------------------------

  describe('checkCoolingHealth', () => {
    it('should return false when relay is off', () => {
      mockS.sys_isRelayOn = false
      expect(checkCoolingHealth(-5.0, 1000)).toBe(false)
    })

    it('should return false before check time elapsed', () => {
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = 500
      expect(checkCoolingHealth(-5.0, 1000)).toBe(false)
    })

    it('should return false during turbo mode', () => {
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = 0
      mockV.trb_isActive = true
      mockV.sns_airSmoothDeg = 5.0
      expect(checkCoolingHealth(3.0, 1000)).toBe(false)
    })

    it('should return true when evap too warm (gas leak)', () => {
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = 0
      mockV.sns_airSmoothDeg = 5.0
      // Evap at 3.0, air at 5.0, diff only 2 (< 5 threshold)
      const result = checkCoolingHealth(3.0, 1000)

      expect(result).toBe(true)
      expect(mockV.sys_alarm).toBe(mockALM.COOL)
      expect(global.print).toHaveBeenCalled()
    })

    it('should return false when evap properly cold', () => {
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = 0
      mockV.sns_airSmoothDeg = 5.0
      // Evap at -5.0, air at 5.0, diff of 10 (> 5 threshold)
      expect(checkCoolingHealth(-5.0, 1000)).toBe(false)
    })

    it('should return false at exact threshold', () => {
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = 0
      mockV.sns_airSmoothDeg = 5.0
      // Evap at 0.0, air at 5.0, diff exactly 5 (= threshold)
      expect(checkCoolingHealth(0.0, 1000)).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // CHECK LOCKED ROTOR TESTS
  // ----------------------------------------------------------

  describe('checkLockedRotor', () => {
    beforeEach(() => {
      mockS.sys_isRelayOn = true
    })

    it('should detect locked rotor', () => {
      const result = checkLockedRotor(250, 60)

      expect(result).toBe(true)
      expect(mockV.sys_alarm).toBe(mockALM.LOCKED)
    })

    it('should not trigger below threshold', () => {
      const result = checkLockedRotor(150, 60)
      expect(result).toBe(false)
    })

    it('should not trigger during startup mask', () => {
      const result = checkLockedRotor(250, 20)
      expect(result).toBe(false)
    })

    it('should not trigger when relay off', () => {
      mockS.sys_isRelayOn = false
      const result = checkLockedRotor(250, 60)
      expect(result).toBe(false)
    })

    it('should not trigger without power monitor', () => {
      mockV.hw_hasPM = false
      const result = checkLockedRotor(250, 60)
      expect(result).toBe(false)
    })

    it('should not trigger when power monitoring disabled', () => {
      mockC.pwr_enable = false
      const result = checkLockedRotor(250, 60)
      expect(result).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // CHECK GHOST RUN TESTS
  // ----------------------------------------------------------

  describe('checkGhostRun', () => {
    beforeEach(() => {
      mockS.sys_isRelayOn = true
    })

    it('should accumulate timer on low power', () => {
      mockV.pwr_ghostSec = 0
      checkGhostRun(10, 60)
      expect(mockV.pwr_ghostSec).toBe(5)
    })

    it('should trigger after timer threshold', () => {
      mockV.pwr_ghostSec = 60
      const result = checkGhostRun(10, 60)

      expect(result).toBe(true)
      expect(mockV.sys_alarm).toBe(mockALM.GHOST)
    })

    it('should reset timer on normal power', () => {
      mockV.pwr_ghostSec = 50
      checkGhostRun(80, 60)
      expect(mockV.pwr_ghostSec).toBe(0)
    })

    it('should reset timer when relay off', () => {
      mockS.sys_isRelayOn = false
      mockV.pwr_ghostSec = 50
      checkGhostRun(10, 60)
      expect(mockV.pwr_ghostSec).toBe(0)
    })

    it('should not trigger during startup mask', () => {
      mockV.pwr_ghostSec = 60
      const result = checkGhostRun(10, 20)
      expect(result).toBe(false)
    })

    it('should not trigger without power monitor', () => {
      mockV.hw_hasPM = false
      mockV.pwr_ghostSec = 60
      const result = checkGhostRun(10, 60)
      expect(result).toBe(false)
    })

    it('should increment ghost count on trigger', () => {
      mockV.pwr_ghostSec = 60
      mockV.pwr_ghostCnt = 0
      checkGhostRun(10, 60)
      expect(mockV.pwr_ghostCnt).toBe(1)
    })

    it('should escalate to LOCKED after max ghost count', () => {
      mockV.pwr_ghostSec = 60
      mockV.pwr_ghostCnt = 2  // One below max (3)
      const result = checkGhostRun(10, 60)

      expect(result).toBe(true)
      expect(mockV.pwr_ghostCnt).toBe(3)  // Now at max
      expect(mockV.sys_alarm).toBe(mockALM.LOCKED)  // Escalated
    })
  })

  // ----------------------------------------------------------
  // RESET GHOST COUNT TESTS
  // ----------------------------------------------------------

  describe('resetGhostCount', () => {
    it('should reset ghost count to zero', () => {
      mockV.pwr_ghostCnt = 5
      resetGhostCount()
      expect(mockV.pwr_ghostCnt).toBe(0)
    })

    it('should work when already zero', () => {
      mockV.pwr_ghostCnt = 0
      resetGhostCount()
      expect(mockV.pwr_ghostCnt).toBe(0)
    })
  })
})
