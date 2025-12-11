// ==============================================================================
// * CONTROL TESTS
// ? Validates decision engine, thermostat logic, and relay switching.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Control', () => {
  let setIdleState, evaluateThermostat, setRelay, determineMode, executeSwitchDecision
  let mockS, mockV, mockC, mockST, mockRSN, mockALM

  beforeEach(async () => {
    vi.resetModules()

    // Create mock constants
    mockST = {
      BOOT: 'BOOT',
      IDLE: 'IDLE',
      COOLING: 'COOLING',
      WANT_IDLE: 'WANT_IDLE',
      WANT_COOL: 'WANT_COOL',
      LIMP_IDLE: 'LIMP_IDLE',
      LIMP_COOL: 'LIMP_COOL',
      TURBO_COOL: 'TURBO_COOL',
      TURBO_IDLE: 'TURBO_IDLE',
    }

    mockRSN = {
      NONE: 'NONE',
      PROT_MIN_ON: 'PROT_MIN_ON',
      PROT_MIN_OFF: 'PROT_MIN_OFF',
      PROT_MAX_ON: 'PROT_MAX_ON',
      PROT_AIR_FRZ: 'PROT_AIR_FRZ',
      PROT_DOOR: 'PROT_DOOR_OPEN',
      DEFR_SCHED: 'DEFR_SCHED',
      DEFR_DYN: 'DEFR_DYN',
    }

    mockALM = {
      NONE: 'NONE',
      WELD: 'ALARM_RELAY_WELD',
      LOCKED: 'ALARM_ROTOR_LOCKED',
      FAIL: 'ALARM_SENSOR_FAIL',
      STUCK: 'ALARM_SENSOR_STUCK',
      GHOST: 'ALARM_COMP_GHOST',
    }

    // Create mock state
    mockS = {
      sys_relayState: false,
      sys_tsRelayOn: 0,
      sys_tsRelayOff: 0,
      weld_snapAir: 0,
      weld_snapEvap: 0,
    }

    // Create mock volatile state
    mockV = {
      sys_status: 'IDLE',
      sys_reason: 'NONE',
      sys_alarm: 'NONE',
      sys_statusDetail: 'NONE',
      turbo_active: false,
      sens_wasError: false,
      health_startTemp: 0,
      health_lastScore: 0,
    }

    // Create mock config
    mockC = {
      sys_loopSec: 5,
      ctrl_targetDeg: 4.0,
      comp_freezeCutDeg: -2.0,
      comp_maxRunSec: 3600,
    }

    // Mock global print
    global.print = vi.fn()

    // Mock global Shelly
    global.Shelly = {
      call: vi.fn(),
    }

    // Mock Date.now
    vi.spyOn(Date, 'now').mockReturnValue(1000000000)

    // Mock dependencies
    vi.doMock('./constants.js', () => ({ ST: mockST, RSN: mockRSN, ALM: mockALM }))
    vi.doMock('./config.js', () => ({ C: mockC }))
    vi.doMock('./state.js', () => ({
      S: mockS,
      V: mockV,
      persistState: vi.fn(),
    }))
    vi.doMock('./utils/math.js', () => ({
      ri: vi.fn((v) => Math.floor(v)),
      r1: vi.fn((v) => Math.round(v * 10) / 10),
      r2: vi.fn((v) => Math.round(v * 100) / 100),
      r3: vi.fn((v) => Math.round(v * 1000) / 1000),
      formatXmYs: vi.fn((sec) => {
        if (typeof sec !== 'number' || !isFinite(sec) || sec <= 0) return '00m00s'
        let total = Math.floor(sec)
        let m = Math.floor(total / 60)
        let s = total % 60
        return (m < 10 ? '0' : '') + m + 'm' + (s < 10 ? '0' : '') + s + 's'
      }),
    }))
    vi.doMock('./protection.js', () => ({
      canTurnOn: vi.fn(() => true),
      canTurnOff: vi.fn(() => true),
      getTimeUntilOnAllowed: vi.fn(() => 0),
      getTimeUntilOffAllowed: vi.fn(() => 0),
      isFreezeProtectionActive: vi.fn((tCtrl) => tCtrl < mockC.comp_freezeCutDeg),
      isMaxRunExceeded: vi.fn(() => false),
    }))
    vi.doMock('./features.js', () => ({
      getEffectiveHysteresis: vi.fn(() => 0.5),
      handleTurboMode: vi.fn(() => null),
      handleLimpMode: vi.fn(() => ({
        wantOn: false,
        status: mockST.LIMP_IDLE,
        detail: 'Limp off',
      })),
      handleDynamicDefrost: vi.fn(() => false),
      isScheduledDefrost: vi.fn(() => false),
      isDoorPauseActive: vi.fn(() => false),
    }))
    vi.doMock('./metrics.js', () => ({
      incrementCycleCount: vi.fn(),
    }))

    const module = await import('./control.js')
    setIdleState = module.setIdleState
    evaluateThermostat = module.evaluateThermostat
    setRelay = module.setRelay
    determineMode = module.determineMode
    executeSwitchDecision = module.executeSwitchDecision
  })

  // ----------------------------------------------------------
  // * SET IDLE STATE TESTS
  // ----------------------------------------------------------

  describe('setIdleState', () => {
    it('should set IDLE when relay off', () => {
      mockS.sys_relayState = false
      setIdleState(mockRSN.PROT_AIR_FRZ)

      expect(mockV.sys_status).toBe('IDLE')
      expect(mockV.sys_reason).toBe('PROT_AIR_FRZ')
    })

    it('should set WANT_IDLE when relay on', () => {
      mockS.sys_relayState = true
      setIdleState(mockRSN.PROT_AIR_FRZ)

      expect(mockV.sys_status).toBe('WANT_IDLE')
    })
  })

  // ----------------------------------------------------------
  // * EVALUATE THERMOSTAT TESTS
  // ----------------------------------------------------------

  describe('evaluateThermostat', () => {
    it('should return true when above upper threshold', () => {
      // target 4.0, hyst 0.5, upper = 4.5
      expect(evaluateThermostat(5.0, 4.0, 0.5)).toBe(true)
    })

    it('should return false when below lower threshold', () => {
      // target 4.0, hyst 0.5, lower = 3.5
      expect(evaluateThermostat(3.0, 4.0, 0.5)).toBe(false)
    })

    it('should return null when within band', () => {
      expect(evaluateThermostat(4.0, 4.0, 0.5)).toBeNull()
    })

    it('should return null at exact upper threshold', () => {
      expect(evaluateThermostat(4.5, 4.0, 0.5)).toBeNull()
    })

    it('should return null at exact lower threshold', () => {
      expect(evaluateThermostat(3.5, 4.0, 0.5)).toBeNull()
    })
  })

  // ----------------------------------------------------------
  // * SET RELAY TESTS
  // ----------------------------------------------------------

  describe('setRelay', () => {
    it('should call Shelly.Switch.Set', () => {
      setRelay(true, 1000, 5.0, -10.0, false)

      expect(global.Shelly.call).toHaveBeenCalledWith(
        'Switch.Set',
        { id: 0, on: true },
        expect.any(Function),  // ? Verification callback
      )
    })

    it('should update relay state', () => {
      setRelay(true, 1000, 5.0, -10.0, false)
      expect(mockS.sys_relayState).toBe(true)
    })

    it('should update tsRelayOn when turning on', () => {
      setRelay(true, 1000, 5.0, -10.0, false)
      expect(mockS.sys_tsRelayOn).toBe(1000)
    })

    it('should update tsRelayOff when turning off', () => {
      mockS.sys_relayState = true
      setRelay(false, 2000, 5.0, -10.0, false)
      expect(mockS.sys_tsRelayOff).toBe(2000)
    })

    it('should capture weld snapshot when turning off', () => {
      mockS.sys_relayState = true
      setRelay(false, 2000, 5.0, -10.0, false)

      expect(mockS.weld_snapAir).toBe(5.0)
    })

    // ? Design decision: weld snapshot is now captured even on emergency/skipSnap
    // ? to avoid stale weld_snapAir values (see control.js lines 137-140)
    it('should capture weld snapshot even in limp/emergency mode', () => {
      mockS.sys_relayState = true
      setRelay(false, 2000, 5.0, -10.0, true)

      expect(mockS.weld_snapAir).toBe(5.0)
    })

    it('should print ON message', () => {
      mockS.sys_tsRelayOff = 940 // 60s ago
      setRelay(true, 1000, 5.0, -10.0, false)
      expect(global.print).toHaveBeenCalledWith('RELAY ON (after 01m00s off)')
    })

    it('should print OFF message with duration', () => {
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = 100
      setRelay(false, 700, 5.0, -10.0, false)
      expect(global.print).toHaveBeenCalledWith('RELAY OFF (after 10m00s on)')
    })

    it('should print TURBO suffix when turbo active', () => {
      mockS.sys_tsRelayOff = 940
      mockV.turbo_active = true
      setRelay(true, 1000, 5.0, -10.0, false)
      expect(global.print).toHaveBeenCalledWith('RELAY ON (TURBO) (after 01m00s off)')
    })

    it('should log error when Shelly.call fails', () => {
      // Make Shelly.call invoke the callback with error
      global.Shelly.call = vi.fn((method, params, callback) => {
        callback(null, 1, 'Switch error')
      })

      setRelay(true, 1000, 5.0, -10.0, false)

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('RELAY CMD FAILED'))
    })

    it('should retry emergency shutdown on failure', () => {
      // Make Shelly.call invoke the callback with error (only if callback exists)
      global.Shelly.call = vi.fn((method, params, callback) => {
        if (callback) {
          callback(null, 1, 'Switch error')
        }
      })

      // Emergency shutdown: skipSnap=true and state=false
      mockS.sys_relayState = true
      setRelay(false, 1000, 0, 0, true)

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('EMERGENCY RETRY'))
      // Shelly.call should have been called twice (original + retry)
      expect(global.Shelly.call).toHaveBeenCalledTimes(2)
    })

    it('should capture health start temp when turning on', () => {
      setRelay(true, 1000, 8.5, -10.0, false)
      expect(mockV.health_startTemp).toBe(8.5)
    })

    it('should not capture health start temp when skipSnap is true', () => {
      mockV.health_startTemp = 0
      setRelay(true, 1000, 8.5, -10.0, true)
      expect(mockV.health_startTemp).toBe(0)
    })

    it('should calculate health score on turn off after long run', () => {
      // Set up for health score calculation
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = 100  // Started at 100
      mockV.health_startTemp = 10.0  // Started at 10°C

      // Turn off at 700 (10 mins later) with temp at 5.0°C
      setRelay(false, 700, 5.0, -10.0, false)

      // delta = 10.0 - 5.0 = 5.0°C
      // runMins = (700 - 100) / 60 = 10 mins
      // score = 5.0 / 10 = 0.5 deg/min
      expect(mockV.health_lastScore).toBe(0.5)
    })

    it('should not calculate health score for short runs', () => {
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = 600  // Started at 600
      mockV.health_startTemp = 10.0

      // Turn off at 700 (< 5 mins later)
      setRelay(false, 700, 5.0, -10.0, false)

      expect(mockV.health_lastScore).toBe(0)  // Should not be updated
    })

    it('should not calculate health score when no cooling occurred', () => {
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = 100
      mockV.health_startTemp = 5.0  // Started at 5°C

      // Turn off with temp at 6.0°C (warmer - no cooling)
      setRelay(false, 700, 6.0, -10.0, false)

      expect(mockV.health_lastScore).toBe(0)  // Should not be updated
    })

    it('should not calculate health score when health_startTemp is 0', () => {
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = 100
      mockV.health_startTemp = 0  // No start temp captured

      setRelay(false, 700, 5.0, -10.0, false)

      expect(mockV.health_lastScore).toBe(0)
    })
  })

  // ----------------------------------------------------------
  // * DETERMINE MODE TESTS
  // ----------------------------------------------------------

  describe('determineMode', () => {
    it('should return idle for fatal alarm', () => {
      mockV.sys_alarm = 'ALARM_RELAY_WELD'
      const result = determineMode(5.0, -10.0, 1000000)

      expect(result.wantOn).toBe(false)
      expect(result.status).toBe('IDLE')
    })

    it('should return limp mode for sensor failure', () => {
      mockV.sys_alarm = 'ALARM_SENSOR_FAIL'
      const result = determineMode(5.0, -10.0, 1000000)

      expect(result.status).toBe('LIMP_IDLE')
    })

    it('should return freeze protection when temp too low', () => {
      const result = determineMode(-3.0, -10.0, 1000000)

      expect(result.wantOn).toBe(false)
      expect(result.reason).toBe('PROT_AIR_FRZ')
    })

    it('should evaluate thermostat in normal mode', () => {
      // Temp 6.0 > target 4.0 + hyst 0.5 = 4.5 -> should want ON
      const result = determineMode(6.0, -10.0, 1000000)

      expect(result.wantOn).toBe(true)
    })

    it('should return cooling status when relay on', () => {
      mockS.sys_relayState = true
      // Set recent relay-on time to avoid max run check
      mockS.sys_tsRelayOn = 999000 // Within last 1000 seconds
      const result = determineMode(4.0, -10.0, 1000000)

      expect(result.status).toBe('COOLING')
    })

    it('should return turbo status when turbo active and relay on', () => {
      mockV.turbo_active = true
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = 999000
      const result = determineMode(4.0, -10.0, 1000000)

      expect(result.status).toBe('TURBO_COOL')
    })

    it('should return turbo idle status when turbo active and relay off', () => {
      mockV.turbo_active = true
      mockS.sys_relayState = false
      const result = determineMode(3.0, -10.0, 1000000)

      expect(result.status).toBe('TURBO_IDLE')
    })
  })

  // ----------------------------------------------------------
  // * DETERMINE MODE - PRIORITY TESTS
  // ----------------------------------------------------------

  describe('determineMode - priorities', () => {
    it('should return door pause when active', async () => {
      vi.resetModules()

      vi.doMock('./constants.js', () => ({ ST: mockST, RSN: mockRSN, ALM: mockALM }))
      vi.doMock('./config.js', () => ({ C: mockC }))
      vi.doMock('./state.js', () => ({ S: mockS, V: mockV, persistState: vi.fn() }))
      vi.doMock('./utils/math.js', () => ({
        ri: vi.fn((v) => Math.floor(v)),
        r2: vi.fn((v) => Math.round(v * 100) / 100),
        r3: vi.fn((v) => Math.round(v * 1000) / 1000),
      }))
      vi.doMock('./protection.js', () => ({
        canTurnOn: vi.fn(() => true),
        canTurnOff: vi.fn(() => true),
        getTimeUntilOnAllowed: vi.fn(() => 0),
        getTimeUntilOffAllowed: vi.fn(() => 0),
        isFreezeProtectionActive: vi.fn(() => false),
        isMaxRunExceeded: vi.fn(() => false),
      }))
      vi.doMock('./features.js', () => ({
        getEffectiveHysteresis: vi.fn(() => 0.5),
        handleTurboMode: vi.fn(() => null),
        handleLimpMode: vi.fn(() => ({ wantOn: false, status: mockST.LIMP_IDLE, detail: 'Limp off' })),
        handleDynamicDefrost: vi.fn(() => false),
        isScheduledDefrost: vi.fn(() => false),
        isDoorPauseActive: vi.fn(() => true),  // Door pause active
      }))
      vi.doMock('./metrics.js', () => ({ incrementCycleCount: vi.fn() }))

      const module = await import('./control.js')
      const result = module.determineMode(5.0, -10.0, 1000000)

      expect(result.wantOn).toBe(false)
      expect(result.reason).toBe('PROT_DOOR_OPEN')
    })

    it('should return scheduled defrost when in defrost window', async () => {
      vi.resetModules()

      vi.doMock('./constants.js', () => ({ ST: mockST, RSN: mockRSN, ALM: mockALM }))
      vi.doMock('./config.js', () => ({ C: mockC }))
      vi.doMock('./state.js', () => ({ S: mockS, V: mockV, persistState: vi.fn() }))
      vi.doMock('./utils/math.js', () => ({
        ri: vi.fn((v) => Math.floor(v)),
        r2: vi.fn((v) => Math.round(v * 100) / 100),
        r3: vi.fn((v) => Math.round(v * 1000) / 1000),
      }))
      vi.doMock('./protection.js', () => ({
        canTurnOn: vi.fn(() => true),
        canTurnOff: vi.fn(() => true),
        getTimeUntilOnAllowed: vi.fn(() => 0),
        getTimeUntilOffAllowed: vi.fn(() => 0),
        isFreezeProtectionActive: vi.fn(() => false),
        isMaxRunExceeded: vi.fn(() => false),
      }))
      vi.doMock('./features.js', () => ({
        getEffectiveHysteresis: vi.fn(() => 0.5),
        handleTurboMode: vi.fn(() => null),
        handleLimpMode: vi.fn(() => ({ wantOn: false, status: mockST.LIMP_IDLE, detail: 'Limp off' })),
        handleDynamicDefrost: vi.fn(() => false),
        isScheduledDefrost: vi.fn(() => true),  // Scheduled defrost active
        isDoorPauseActive: vi.fn(() => false),
      }))
      vi.doMock('./metrics.js', () => ({ incrementCycleCount: vi.fn() }))

      const module = await import('./control.js')
      mockS.defr_isActive = true  // Should be cleared
      const result = module.determineMode(5.0, -10.0, 1000000)

      expect(result.wantOn).toBe(false)
      expect(result.reason).toBe('DEFR_SCHED')
      expect(mockS.defr_isActive).toBe(false)  // Cleared during scheduled defrost
    })

    it('should return max run exceeded when compressor ran too long', async () => {
      vi.resetModules()

      vi.doMock('./constants.js', () => ({ ST: mockST, RSN: mockRSN, ALM: mockALM }))
      vi.doMock('./config.js', () => ({ C: mockC }))
      vi.doMock('./state.js', () => ({ S: mockS, V: mockV, persistState: vi.fn() }))
      vi.doMock('./utils/math.js', () => ({
        ri: vi.fn((v) => Math.floor(v)),
        r2: vi.fn((v) => Math.round(v * 100) / 100),
        r3: vi.fn((v) => Math.round(v * 1000) / 1000),
      }))
      vi.doMock('./protection.js', () => ({
        canTurnOn: vi.fn(() => true),
        canTurnOff: vi.fn(() => true),
        getTimeUntilOnAllowed: vi.fn(() => 0),
        getTimeUntilOffAllowed: vi.fn(() => 0),
        isFreezeProtectionActive: vi.fn(() => false),
        isMaxRunExceeded: vi.fn(() => true),  // Max run exceeded
      }))
      vi.doMock('./features.js', () => ({
        getEffectiveHysteresis: vi.fn(() => 0.5),
        handleTurboMode: vi.fn(() => null),
        handleLimpMode: vi.fn(() => ({ wantOn: false, status: mockST.LIMP_IDLE, detail: 'Limp off' })),
        handleDynamicDefrost: vi.fn(() => false),
        isScheduledDefrost: vi.fn(() => false),
        isDoorPauseActive: vi.fn(() => false),
      }))
      vi.doMock('./metrics.js', () => ({ incrementCycleCount: vi.fn() }))

      const module = await import('./control.js')
      const result = module.determineMode(5.0, -10.0, 1000000)

      expect(result.wantOn).toBe(false)
      expect(result.status).toBe('WANT_IDLE')
      expect(result.reason).toBe('PROT_MAX_ON')
    })

    it('should return dynamic defrost when triggered', async () => {
      vi.resetModules()

      vi.doMock('./constants.js', () => ({ ST: mockST, RSN: mockRSN, ALM: mockALM }))
      vi.doMock('./config.js', () => ({ C: mockC }))
      vi.doMock('./state.js', () => ({ S: mockS, V: mockV, persistState: vi.fn() }))
      vi.doMock('./utils/math.js', () => ({
        ri: vi.fn((v) => Math.floor(v)),
        r2: vi.fn((v) => Math.round(v * 100) / 100),
        r3: vi.fn((v) => Math.round(v * 1000) / 1000),
      }))
      vi.doMock('./protection.js', () => ({
        canTurnOn: vi.fn(() => true),
        canTurnOff: vi.fn(() => true),
        getTimeUntilOnAllowed: vi.fn(() => 0),
        getTimeUntilOffAllowed: vi.fn(() => 0),
        isFreezeProtectionActive: vi.fn(() => false),
        isMaxRunExceeded: vi.fn(() => false),
      }))
      vi.doMock('./features.js', () => ({
        getEffectiveHysteresis: vi.fn(() => 0.5),
        handleTurboMode: vi.fn(() => null),
        handleLimpMode: vi.fn(() => ({ wantOn: false, status: mockST.LIMP_IDLE, detail: 'Limp off' })),
        handleDynamicDefrost: vi.fn(() => true),  // Dynamic defrost active
        isScheduledDefrost: vi.fn(() => false),
        isDoorPauseActive: vi.fn(() => false),
      }))
      vi.doMock('./metrics.js', () => ({ incrementCycleCount: vi.fn() }))

      const module = await import('./control.js')
      const result = module.determineMode(5.0, -10.0, 1000000)

      expect(result.wantOn).toBe(false)
      expect(result.reason).toBe('DEFR_DYN')
    })

    it('should handle turbo mode override target/hysteresis', async () => {
      vi.resetModules()

      vi.doMock('./constants.js', () => ({ ST: mockST, RSN: mockRSN, ALM: mockALM }))
      vi.doMock('./config.js', () => ({ C: mockC }))
      vi.doMock('./state.js', () => ({ S: mockS, V: mockV, persistState: vi.fn() }))
      vi.doMock('./utils/math.js', () => ({
        ri: vi.fn((v) => Math.floor(v)),
        r2: vi.fn((v) => Math.round(v * 100) / 100),
        r3: vi.fn((v) => Math.round(v * 1000) / 1000),
      }))
      vi.doMock('./protection.js', () => ({
        canTurnOn: vi.fn(() => true),
        canTurnOff: vi.fn(() => true),
        getTimeUntilOnAllowed: vi.fn(() => 0),
        getTimeUntilOffAllowed: vi.fn(() => 0),
        isFreezeProtectionActive: vi.fn(() => false),
        isMaxRunExceeded: vi.fn(() => false),
      }))
      vi.doMock('./features.js', () => ({
        getEffectiveHysteresis: vi.fn(() => 0.5),
        handleTurboMode: vi.fn(() => ({
          target: 2.0,  // Override target
          hyst: 0.3,
          detail: 'TURBO: 30m left',
        })),
        handleLimpMode: vi.fn(() => ({ wantOn: false, status: mockST.LIMP_IDLE, detail: 'Limp off' })),
        handleDynamicDefrost: vi.fn(() => false),
        isScheduledDefrost: vi.fn(() => false),
        isDoorPauseActive: vi.fn(() => false),
      }))
      vi.doMock('./metrics.js', () => ({ incrementCycleCount: vi.fn() }))

      const module = await import('./control.js')
      mockV.turbo_active = true
      const result = module.determineMode(5.0, -10.0, 1000000)

      expect(result.detail).toBe('TURBO: 30m left')
    })

    it('should handle LOCKED alarm as fatal', () => {
      mockV.sys_alarm = 'ALARM_ROTOR_LOCKED'
      const result = determineMode(5.0, -10.0, 1000000)

      expect(result.wantOn).toBe(false)
      expect(result.status).toBe('IDLE')
      expect(result.detail).toContain('FATAL')
    })

    it('should handle STUCK alarm as sensor failure', () => {
      mockV.sys_alarm = 'ALARM_SENSOR_STUCK'
      const result = determineMode(5.0, -10.0, 1000000)

      expect(result.status).toBe('LIMP_IDLE')
      expect(mockV.sens_wasError).toBe(true)
    })
  })

  // ----------------------------------------------------------
  // * EXECUTE SWITCH DECISION TESTS
  // ----------------------------------------------------------

  describe('executeSwitchDecision', () => {
    it('should switch relay when conditions allow', () => {
      const result = executeSwitchDecision(true, 1000, 5.0, -10.0, false)

      expect(result.switched).toBe(true)
      expect(mockS.sys_relayState).toBe(true)
    })

    it('should not switch in limp mode without change', () => {
      mockS.sys_relayState = false
      const result = executeSwitchDecision(false, 1000, 5.0, -10.0, true)

      expect(result.switched).toBe(false)
    })

    it('should switch immediately in limp mode', () => {
      const result = executeSwitchDecision(true, 1000, 0, 0, true)

      expect(result.switched).toBe(true)
    })

    it('should block switching during weld alarm', () => {
      mockV.sys_alarm = 'ALARM_RELAY_WELD'
      const result = executeSwitchDecision(true, 1000, 5.0, -10.0, false)

      expect(result.switched).toBe(false)
      expect(result.blocked).toBe(true)
    })

    it('should block switching during ghost alarm', () => {
      mockV.sys_alarm = 'ALARM_COMP_GHOST'
      const result = executeSwitchDecision(true, 1000, 5.0, -10.0, false)

      expect(result.blocked).toBe(true)
    })

    it('should return no change when wantOn matches current state', () => {
      mockS.sys_relayState = true
      const result = executeSwitchDecision(true, 1000, 5.0, -10.0, false)

      expect(result.switched).toBe(false)
      expect(result.blocked).toBe(false)
    })

    it('should set TURBO_COOL status when switching on in turbo mode', () => {
      mockV.turbo_active = true
      executeSwitchDecision(true, 1000, 5.0, -10.0, false)

      expect(mockV.sys_status).toBe('TURBO_COOL')
    })

    it('should set TURBO_IDLE status when switching off in turbo mode', () => {
      mockV.turbo_active = true
      mockS.sys_relayState = true
      executeSwitchDecision(false, 1000, 5.0, -10.0, false)

      expect(mockV.sys_status).toBe('TURBO_IDLE')
    })
  })

  // ----------------------------------------------------------
  // * EXECUTE SWITCH DECISION - BLOCKING TESTS
  // ----------------------------------------------------------

  describe('executeSwitchDecision - timing guards', () => {
    it('should block turn-on when min off time not elapsed', async () => {
      vi.resetModules()

      // Re-mock with canTurnOn returning false
      vi.doMock('./constants.js', () => ({ ST: mockST, RSN: mockRSN, ALM: mockALM }))
      vi.doMock('./config.js', () => ({ C: mockC }))
      vi.doMock('./state.js', () => ({
        S: mockS,
        V: mockV,
        persistState: vi.fn(),
      }))
      vi.doMock('./utils/math.js', () => ({
        ri: vi.fn((v) => Math.floor(v)),
        r2: vi.fn((v) => Math.round(v * 100) / 100),
        r3: vi.fn((v) => Math.round(v * 1000) / 1000),
      }))
      vi.doMock('./protection.js', () => ({
        canTurnOn: vi.fn(() => false),  // Block turn-on
        canTurnOff: vi.fn(() => true),
        getTimeUntilOnAllowed: vi.fn(() => 45),  // 45 seconds remaining
        getTimeUntilOffAllowed: vi.fn(() => 0),
        isFreezeProtectionActive: vi.fn(() => false),
        isMaxRunExceeded: vi.fn(() => false),
      }))
      vi.doMock('./features.js', () => ({
        getEffectiveHysteresis: vi.fn(() => 0.5),
        handleTurboMode: vi.fn(() => null),
        handleLimpMode: vi.fn(() => ({ wantOn: false, status: mockST.LIMP_IDLE, detail: 'Limp off' })),
        handleDynamicDefrost: vi.fn(() => false),
        isScheduledDefrost: vi.fn(() => false),
        isDoorPauseActive: vi.fn(() => false),
      }))
      vi.doMock('./metrics.js', () => ({ incrementCycleCount: vi.fn() }))

      const module = await import('./control.js')
      const execSwitch = module.executeSwitchDecision

      mockS.sys_relayState = false
      const result = execSwitch(true, 1000, 5.0, -10.0, false)

      expect(result.switched).toBe(false)
      expect(result.blocked).toBe(true)
      expect(result.reason).toBe('PROT_MIN_OFF')
      expect(mockV.sys_status).toBe('WANT_COOL')
      expect(mockV.sys_statusDetail).toBe('45s')
    })

    it('should block turn-off when min on time not elapsed', async () => {
      vi.resetModules()

      // Re-mock with canTurnOff returning false
      vi.doMock('./constants.js', () => ({ ST: mockST, RSN: mockRSN, ALM: mockALM }))
      vi.doMock('./config.js', () => ({ C: mockC }))
      vi.doMock('./state.js', () => ({
        S: mockS,
        V: mockV,
        persistState: vi.fn(),
      }))
      vi.doMock('./utils/math.js', () => ({
        ri: vi.fn((v) => Math.floor(v)),
        r2: vi.fn((v) => Math.round(v * 100) / 100),
        r3: vi.fn((v) => Math.round(v * 1000) / 1000),
      }))
      vi.doMock('./protection.js', () => ({
        canTurnOn: vi.fn(() => true),
        canTurnOff: vi.fn(() => false),  // Block turn-off
        getTimeUntilOnAllowed: vi.fn(() => 0),
        getTimeUntilOffAllowed: vi.fn(() => 30),  // 30 seconds remaining
        isFreezeProtectionActive: vi.fn(() => false),
        isMaxRunExceeded: vi.fn(() => false),
      }))
      vi.doMock('./features.js', () => ({
        getEffectiveHysteresis: vi.fn(() => 0.5),
        handleTurboMode: vi.fn(() => null),
        handleLimpMode: vi.fn(() => ({ wantOn: false, status: mockST.LIMP_IDLE, detail: 'Limp off' })),
        handleDynamicDefrost: vi.fn(() => false),
        isScheduledDefrost: vi.fn(() => false),
        isDoorPauseActive: vi.fn(() => false),
      }))
      vi.doMock('./metrics.js', () => ({ incrementCycleCount: vi.fn() }))

      const module = await import('./control.js')
      const execSwitch = module.executeSwitchDecision

      mockS.sys_relayState = true
      const result = execSwitch(false, 1000, 5.0, -10.0, false)

      expect(result.switched).toBe(false)
      expect(result.blocked).toBe(true)
      expect(result.reason).toBe('PROT_MIN_ON')
      expect(mockV.sys_status).toBe('WANT_IDLE')
      expect(mockV.sys_statusDetail).toBe('30s')
    })
  })
})
