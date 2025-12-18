// ==============================================================================
// ALARM TESTS
// Validates alarm detection, severity mapping, and fault logging.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Alarms', () => {
  let getSeverity, formatFaultDetail, recordFault
  let processAlarmEdges, clearNonFatalAlarms, applySensorAlarms, checkHighTempAlarm
  let mockS, mockV, mockC, mockALM

  beforeEach(async () => {
    vi.resetModules()

    // Create mock ALM constants
    mockALM = {
      NONE: 'NONE',
      WELD: 'ALARM_RELAY_WELD',
      LOCKED: 'ALARM_ROTOR_LOCKED',
      HIGH: 'ALARM_HIGH_TEMP',
      FAIL: 'ALARM_SENSOR_FAIL',
      STUCK: 'ALARM_SENSOR_STUCK',
      GHOST: 'ALARM_COMP_GHOST',
      COOL: 'ALARM_COOLING_FAIL',
    }

    // Create mock state
    mockS = {
      sys_isRelayOn: false,
      flt_fatalArr: [],
      flt_critArr: [],
      flt_errorArr: [],
      flt_warnArr: [],
    }

    // Create mock volatile state
    // alarm_highTimer is now module-local in alarms.js
    mockV = {
      sys_alarm: 'NONE',
      sns_airSmoothDeg: 5.0,
      sns_errCnt: 0,
      flt_pendCode: null,
      hw_hasPM: true,
      trb_isActive: false,
    }

    // Create mock config
    mockC = {
      sys_loopSec: 5,
      alm_highEnable: true,
      alm_highDeg: 15.0,
      alm_highDelaySec: 300,
    }

    // Mock global print
    global.print = vi.fn()

    // Mock global Shelly
    global.Shelly = {
      call: vi.fn(),
    }

    // Mock Date.now for consistent timestamps
    vi.spyOn(Date, 'now').mockReturnValue(1000000000)

    // Mock dependencies
    vi.doMock('./constants.js', () => ({ ALM: mockALM }))
    vi.doMock('./config.js', () => ({ C: mockC }))
    vi.doMock('./state.js', () => ({
      S: mockS,
      V: mockV,
      ST_KEYS: { 'fridge_st_faults': ['flt_fatalArr', 'flt_critArr', 'flt_errorArr', 'flt_warnArr'] },
    }))
    vi.doMock('./utils/math.js', () => ({
      ri: vi.fn((v) => Math.floor(v)),
    }))
    vi.doMock('./utils/object.js', () => ({
      pickKeys: vi.fn((obj, keys) => {
        let result = {}
        keys.forEach((k) => { if (obj[k] !== undefined) result[k] = obj[k] })
        return result
      }),
    }))

    const module = await import('./alarms.js')
    getSeverity = module.getSeverity
    formatFaultDetail = module.formatFaultDetail
    recordFault = module.recordFault
    processAlarmEdges = module.processAlarmEdges
    clearNonFatalAlarms = module.clearNonFatalAlarms
    applySensorAlarms = module.applySensorAlarms
    checkHighTempAlarm = module.checkHighTempAlarm
  })

  // ----------------------------------------------------------
  // GET SEVERITY TESTS
  // ----------------------------------------------------------

  describe('getSeverity', () => {
    it('should return fatal for WELD alarm', () => {
      expect(getSeverity(mockALM.WELD)).toBe('fatal')
    })

    it('should return fatal for LOCKED alarm', () => {
      expect(getSeverity(mockALM.LOCKED)).toBe('fatal')
    })

    it('should return critical for HIGH alarm', () => {
      expect(getSeverity(mockALM.HIGH)).toBe('critical')
    })

    it('should return error for FAIL alarm', () => {
      expect(getSeverity(mockALM.FAIL)).toBe('error')
    })

    it('should return error for STUCK alarm', () => {
      expect(getSeverity(mockALM.STUCK)).toBe('error')
    })

    it('should return warning for GHOST alarm', () => {
      expect(getSeverity(mockALM.GHOST)).toBe('warning')
    })

    it('should return warning for COOL alarm', () => {
      expect(getSeverity(mockALM.COOL)).toBe('warning')
    })

    it('should return warning for unknown alarm', () => {
      expect(getSeverity('UNKNOWN')).toBe('warning')
    })
  })

  // ----------------------------------------------------------
  // FORMAT FAULT DETAIL TESTS
  // ----------------------------------------------------------

  describe('formatFaultDetail', () => {
    it('should format GHOST alarm detail', () => {
      const result = formatFaultDetail(mockALM.GHOST, { watts: 150 }, 30)
      expect(result).toBe('150W/30s')
    })

    it('should format COOL alarm detail', () => {
      mockV.sns_airSmoothDeg = 8.5
      const result = formatFaultDetail(
        mockALM.COOL,
        { peak: 12, airRaw: 9.1, airSmt: 8.5, evap: 4.2 },
        600,
      )
      // toFixed(0) rounds 9.1->9, 8.5->9, 4.2->4
      expect(result).toBe('A:12 R:9 C:9 E:4')
    })

    it('should format HIGH alarm detail', () => {
      const result = formatFaultDetail(mockALM.HIGH, { peak: 18.5 }, 600)
      // toFixed(0) rounds 18.5 to 19
      expect(result).toBe('19C/10m')
    })

    it('should format FAIL alarm detail', () => {
      mockV.sns_errCnt = 5
      const result = formatFaultDetail(mockALM.FAIL, {}, 300)
      expect(result).toBe('Null:5')
    })

    it('should format STUCK alarm detail', () => {
      const result = formatFaultDetail(mockALM.STUCK, {}, 14400)
      expect(result).toBe('Air:240m')
    })

    it('should format unknown alarm as duration', () => {
      const result = formatFaultDetail('UNKNOWN', {}, 1200)
      expect(result).toBe('20m')
    })

    it('should handle missing pending values', () => {
      const result = formatFaultDetail(mockALM.GHOST, {}, 30)
      expect(result).toBe('0W/30s')
    })
  })

  // ----------------------------------------------------------
  // RECORD FAULT TESTS
  // ----------------------------------------------------------

  describe('recordFault', () => {
    it('should add fault to correct array', () => {
      recordFault('warning', mockALM.GHOST, '50W/10s')
      expect(mockS.flt_warnArr[0]).toEqual({
        a: mockALM.GHOST,
        t: 1000000,
        d: '50W/10s',
      })
    })

    it('should shift existing entries', () => {
      mockS.flt_warnArr = [{ a: 'OLD1', t: 1, d: 'd1' }]
      recordFault('warning', mockALM.GHOST, 'new')

      expect(mockS.flt_warnArr[0].a).toBe(mockALM.GHOST)
      expect(mockS.flt_warnArr[1].a).toBe('OLD1')
    })

    it('should maintain max 3 entries', () => {
      mockS.flt_warnArr = [
        { a: 'A1', t: 1, d: 'd1' },
        { a: 'A2', t: 2, d: 'd2' },
        { a: 'A3', t: 3, d: 'd3' },
      ]

      recordFault('warning', mockALM.GHOST, 'new')

      expect(mockS.flt_warnArr.length).toBeLessThanOrEqual(3)
      expect(mockS.flt_warnArr[0].a).toBe(mockALM.GHOST)
    })

    it('should handle invalid severity gracefully', () => {
      recordFault('invalid', mockALM.GHOST, 'test')
      expect(global.print).toHaveBeenCalledWith('⚠️ ALARM Unknown severity "invalid": ignoring fault')
    })

    it('should trigger KVS save for fatal severity', () => {
      recordFault('fatal', mockALM.WELD, 'test detail')

      expect(global.Shelly.call).toHaveBeenCalledWith(
        'KVS.Set',
        expect.objectContaining({
          key: 'fridge_st_faults',
        }),
      )
      expect(global.print).toHaveBeenCalledWith('ALARM 🚨 Fatal fault logged: ALARM_RELAY_WELD - test detail')
    })

    it('should not trigger KVS save for non-fatal severity', () => {
      recordFault('warning', mockALM.GHOST, 'test')
      expect(global.Shelly.call).not.toHaveBeenCalled()
    })
  })

  // ----------------------------------------------------------
  // PROCESS ALARM EDGES TESTS
  // ----------------------------------------------------------

  describe('processAlarmEdges', () => {
    it('should create flt_pendCode on rising edge', () => {
      mockV.sns_airSmoothDeg = 18.5
      mockS.sys_isRelayOn = true

      processAlarmEdges(mockALM.NONE, mockALM.HIGH, 45)

      expect(mockV.flt_pendCode).not.toBeNull()
      expect(mockV.flt_pendCode.alarm).toBe(mockALM.HIGH)
      expect(mockV.flt_pendCode.peak).toBe(18.5)
    })

    it('should capture watts on rising edge when PM available', () => {
      mockV.hw_hasPM = true
      mockS.sys_isRelayOn = true

      processAlarmEdges(mockALM.NONE, mockALM.GHOST, 150)

      expect(mockV.flt_pendCode.watts).toBe(150)
    })

    it('should not capture watts when PM not available', () => {
      mockV.hw_hasPM = false
      mockS.sys_isRelayOn = true

      processAlarmEdges(mockALM.NONE, mockALM.GHOST, 150)

      expect(mockV.flt_pendCode.watts).toBe(0)
    })

    it('should log fault on falling edge', () => {
      mockV.flt_pendCode = {
        t: 999900,
        alarm: mockALM.GHOST,
        peak: 5.0,
        watts: 50,
      }

      processAlarmEdges(mockALM.GHOST, mockALM.NONE, 0)

      expect(mockV.flt_pendCode).toBeNull()
      expect(mockS.flt_warnArr.length).toBeGreaterThan(0)
    })

    it('should not log fault if no pending', () => {
      mockV.flt_pendCode = null

      processAlarmEdges(mockALM.GHOST, mockALM.NONE, 0)

      expect(mockS.flt_warnArr.length).toBe(0)
    })

    it('should not trigger on stable alarm state', () => {
      processAlarmEdges(mockALM.HIGH, mockALM.HIGH, 0)

      expect(mockV.flt_pendCode).toBeNull()
    })

    it('should not trigger on stable NONE state', () => {
      processAlarmEdges(mockALM.NONE, mockALM.NONE, 0)

      expect(mockV.flt_pendCode).toBeNull()
    })
  })

  // ----------------------------------------------------------
  // CLEAR NON-FATAL ALARMS TESTS
  // ----------------------------------------------------------

  describe('clearNonFatalAlarms', () => {
    it('should clear HIGH alarm', () => {
      mockV.sys_alarm = mockALM.HIGH
      clearNonFatalAlarms()
      expect(mockV.sys_alarm).toBe(mockALM.NONE)
    })

    it('should clear FAIL alarm', () => {
      mockV.sys_alarm = mockALM.FAIL
      clearNonFatalAlarms()
      expect(mockV.sys_alarm).toBe(mockALM.NONE)
    })

    it('should clear STUCK alarm', () => {
      mockV.sys_alarm = mockALM.STUCK
      clearNonFatalAlarms()
      expect(mockV.sys_alarm).toBe(mockALM.NONE)
    })

    it('should NOT clear WELD alarm', () => {
      mockV.sys_alarm = mockALM.WELD
      clearNonFatalAlarms()
      expect(mockV.sys_alarm).toBe(mockALM.WELD)
    })

    it('should NOT clear LOCKED alarm', () => {
      mockV.sys_alarm = mockALM.LOCKED
      clearNonFatalAlarms()
      expect(mockV.sys_alarm).toBe(mockALM.LOCKED)
    })

    it('should keep NONE as NONE', () => {
      mockV.sys_alarm = mockALM.NONE
      clearNonFatalAlarms()
      expect(mockV.sys_alarm).toBe(mockALM.NONE)
    })
  })

  // ----------------------------------------------------------
  // APPLY SENSOR ALARMS TESTS
  // ----------------------------------------------------------

  describe('applySensorAlarms', () => {
    it('should apply FAIL alarm when alarmFail is true', () => {
      mockV.sys_alarm = mockALM.NONE
      applySensorAlarms(true, false)
      expect(mockV.sys_alarm).toBe(mockALM.FAIL)
    })

    it('should apply STUCK alarm when alarmStuck is true', () => {
      mockV.sys_alarm = mockALM.NONE
      applySensorAlarms(false, true)
      expect(mockV.sys_alarm).toBe(mockALM.STUCK)
    })

    // Design decision: FAIL takes priority over STUCK
    // A sensor returning null is worse than a frozen value
    it('should apply FAIL over STUCK (FAIL is worse)', () => {
      mockV.sys_alarm = mockALM.NONE
      applySensorAlarms(true, true)
      expect(mockV.sys_alarm).toBe(mockALM.FAIL)
    })

    it('should not change alarm when both false', () => {
      mockV.sys_alarm = mockALM.HIGH
      applySensorAlarms(false, false)
      expect(mockV.sys_alarm).toBe(mockALM.HIGH)
    })
  })

  // ----------------------------------------------------------
  // CHECK HIGH TEMP ALARM TESTS
  // Timer is now module-local, so tests verify behavior via multiple calls
  // ----------------------------------------------------------

  describe('checkHighTempAlarm', () => {
    it('should not trigger alarm on first call above threshold', () => {
      const result = checkHighTempAlarm(16.0, false)
      expect(result).toBe(false)
      expect(mockV.sys_alarm).not.toBe(mockALM.HIGH)
    })

    it('should trigger alarm after delay exceeded via multiple calls', () => {
      // mockC.alarm_highDelaySec = 300, sys_loopSec = 5
      // Need > 60 calls (300/5 = 60) to exceed delay
      for (let i = 0; i < 60; i++) {
        checkHighTempAlarm(16.0, false)
      }
      expect(mockV.sys_alarm).not.toBe(mockALM.HIGH) // Not yet

      const result = checkHighTempAlarm(16.0, false)
      expect(mockV.sys_alarm).toBe(mockALM.HIGH)
      expect(result).toBe(true)
      expect(global.print).toHaveBeenCalled()
    })

    it('should not trigger if under threshold', () => {
      // Call multiple times above threshold
      for (let i = 0; i < 50; i++) {
        checkHighTempAlarm(16.0, false)
      }
      // Then call with temp under threshold - timer resets
      checkHighTempAlarm(14.0, false)

      // Continue above threshold - need full delay again
      for (let i = 0; i < 60; i++) {
        checkHighTempAlarm(16.0, false)
      }
      expect(mockV.sys_alarm).not.toBe(mockALM.HIGH) // Timer was reset
    })

    it('should not trigger during deep defrost', () => {
      // Accumulate time
      for (let i = 0; i < 61; i++) {
        checkHighTempAlarm(16.0, true) // isDeepDefrost = true
      }
      expect(mockV.sys_alarm).not.toBe(mockALM.HIGH)
    })

    it('should not trigger during turbo mode', () => {
      mockV.trb_isActive = true
      for (let i = 0; i < 61; i++) {
        checkHighTempAlarm(16.0, false)
      }
      expect(mockV.sys_alarm).not.toBe(mockALM.HIGH)
    })

    it('should not trigger when disabled', () => {
      mockC.alm_highEnable = false
      for (let i = 0; i < 61; i++) {
        checkHighTempAlarm(16.0, false)
      }
      expect(mockV.sys_alarm).not.toBe(mockALM.HIGH)
    })

    it('should reset timer when temp drops below threshold', () => {
      // Accumulate 50 iterations of time
      for (let i = 0; i < 50; i++) {
        checkHighTempAlarm(16.0, false)
      }
      // Temp drops - timer resets
      checkHighTempAlarm(10.0, false)

      // Needs full delay again to trigger
      for (let i = 0; i < 60; i++) {
        checkHighTempAlarm(16.0, false)
      }
      expect(mockV.sys_alarm).not.toBe(mockALM.HIGH)

      // One more to exceed
      checkHighTempAlarm(16.0, false)
      expect(mockV.sys_alarm).toBe(mockALM.HIGH)
    })
  })
})
