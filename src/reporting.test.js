// ==============================================================================
// REPORTING TESTS
// Validates console formatting and MQTT payload generation.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Reporting', () => {
  let getScriptUptime, formatConsoleMessage, buildMqttPayload, publishStatus
  let mockS, mockV, mockC, mockALM, mockRSN, mockICO

  beforeEach(async () => {
    vi.resetModules()

    mockALM = { NONE: 'NONE', HIGH: 'ALARM_HIGH_TEMP' }
    mockRSN = { NONE: 'NONE', PROT_MIN_OFF: 'PROT_MIN_OFF' }
    mockICO = { IDLE: '⚪', COOLING: '❄️', WANT_COOL: '⏳' }

    mockS = {
      sys_isRelayOn: false,
      sts_hourTotalSec: 1800,
      sts_hourRunSec: 900,
      sts_lifeTotalSec: 86400,
      sts_lifeRunSec: 43200,
      sts_cycleCnt: 3,
      dfr_isActive: false,
      flt_fatalArr: [],
      flt_critArr: [],
      flt_errorArr: [],
      flt_warnArr: [],
    }

    mockV = {
      sys_status: 'IDLE',
      sys_statusReason: 'NONE',
      sys_alarm: 'NONE',
      sys_detail: 'NONE',
      sys_startMs: 0,
      dor_pauseRemSec: 0,
      trb_isActive: false,
      hw_hasPM: true,
      hlt_lastScore: 100,
    }

    mockC = {
      ctl_targetDeg: 4.0,
      sys_mqttTopic: 'fridge/status',
    }

    global.print = vi.fn()
    global.MQTT = { publish: vi.fn() }
    global.Shelly = { getUptimeMs: vi.fn(() => 7200000) }

    vi.doMock('./constants.js', () => ({ ALM: mockALM, RSN: mockRSN, ICO: mockICO }))
    vi.doMock('./config.js', () => ({ C: mockC }))
    vi.doMock('./state.js', () => ({ S: mockS, V: mockV }))
    vi.doMock('./utils/math.js', () => ({
      r1: vi.fn((v) => Math.round(v * 10) / 10),
      r2: vi.fn((v) => Math.round(v * 100) / 100),
      ri: vi.fn((v) => Math.floor(v)),
      formatXmYs: vi.fn((sec) => {
        if (typeof sec !== 'number' || !isFinite(sec) || sec <= 0) return '00m00s'
        let total = Math.floor(sec)
        let m = Math.floor(total / 60)
        let s = total % 60
        return (m < 10 ? '0' : '') + m + 'm' + (s < 10 ? '0' : '') + s + 's'
      }),
    }))
    vi.doMock('./utils/format.js', () => ({
      formatUptime: vi.fn((ms) => {
        let h = Math.floor(ms / 3600000)
        let m = Math.floor((ms % 3600000) / 60000)
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m
      }),
    }))
    vi.doMock('./features.js', () => ({
      getEffectiveHysteresis: vi.fn(() => 0.5),
    }))
    vi.doMock('./metrics.js', () => ({
      getAvgDuty24h: vi.fn(() => 45),
      getCurrentHourDuty: vi.fn(() => 50),
      getLifetimeDuty: vi.fn(() => 50),
      getLifetimeRunHours: vi.fn(() => 123.5),
      getCurrentHourAverages: vi.fn(() => ({ avgOn: 600, avgOff: 600, cycleCount: 3 })),
    }))

    const module = await import('./reporting.js')
    getScriptUptime = module.getScriptUptime
    formatConsoleMessage = module.formatConsoleMessage
    buildMqttPayload = module.buildMqttPayload
    publishStatus = module.publishStatus
  })

  // ----------------------------------------------------------
  // GET SCRIPT UPTIME TESTS
  // ----------------------------------------------------------

  describe('getScriptUptime', () => {
    it('should format hours and minutes with padding', () => {
      global.Shelly.getUptimeMs.mockReturnValue(7200000)
      mockV.sys_startMs = 0

      expect(getScriptUptime()).toBe('02:00')
    })

    it('should handle minutes correctly', () => {
      global.Shelly.getUptimeMs.mockReturnValue(5400000)
      mockV.sys_startMs = 0

      expect(getScriptUptime()).toBe('01:30')
    })

    it('should account for script start offset', () => {
      global.Shelly.getUptimeMs.mockReturnValue(7200000)
      mockV.sys_startMs = 3600000

      expect(getScriptUptime()).toBe('01:00')
    })
  })

  // ----------------------------------------------------------
  // FORMAT CONSOLE MESSAGE TESTS
  // ----------------------------------------------------------

  describe('formatConsoleMessage', () => {
    it('should include status icon', () => {
      const msg = formatConsoleMessage(4.5, -10.0, 4.52)
      expect(msg).toContain('⚪')
    })

    it('should include temperatures', () => {
      const msg = formatConsoleMessage(4.5, -10.0, 4.52)
      expect(msg).toContain('4.52R/')
      expect(msg).toContain('4.50S')  // toFixed(2) keeps trailing zeros
      expect(msg).toContain('-10.00') // toFixed(2) keeps trailing zeros
    })

    it('should handle null temperatures', () => {
      const msg = formatConsoleMessage(null, null, null)
      expect(msg).toContain('--')
    })

    it('should include reason when not NONE', () => {
      mockV.sys_statusReason = 'PROT_MIN_OFF'
      const msg = formatConsoleMessage(4.5, -10.0, 4.52)
      expect(msg).toContain(':PROT_MIN_OFF')
    })

    it('should include alarm when present', () => {
      mockV.sys_alarm = 'ALARM_HIGH_TEMP'
      const msg = formatConsoleMessage(4.5, -10.0, 4.52)
      expect(msg).toContain('!ALARM_HIGH_TEMP')
    })

    it('should include duty percentages', () => {
      const msg = formatConsoleMessage(4.5, -10.0, 4.52)
      expect(msg).toContain('DUTY:')
    })

    it('should include setpoint', () => {
      const msg = formatConsoleMessage(4.5, -10.0, 4.52)
      expect(msg).toContain('SP: 4 HYS:')
    })
  })

  // ----------------------------------------------------------
  // BUILD MQTT PAYLOAD TESTS
  // ----------------------------------------------------------

  describe('buildMqttPayload', () => {
    it('should include temps section', () => {
      const payload = buildMqttPayload(4.5, -10.0, 4.52, 50, 35)

      expect(payload.tAirRaw).toBe(4.52)
      expect(payload.tAirSmt).toBe(4.5)
      expect(payload.tEvap).toBe(-10.0)
      expect(payload.tDev).toBe(35)
    })

    it('should include state section', () => {
      mockV.sys_status = 'COOLING'
      mockV.sys_statusReason = 'NONE'
      mockV.sys_alarm = 'NONE'
      mockS.sys_isRelayOn = true

      const payload = buildMqttPayload(4.5, -10.0, 4.52, 50, 35)

      expect(payload.status).toBe('COOLING')
      expect(payload.relayOn).toBe(1)
    })

    it('should include duty section', () => {
      const payload = buildMqttPayload(4.5, -10.0, 4.52, 50, 35)

      expect(payload.dutyHr).toBeDefined()
      expect(payload.dutyDay).toBeDefined()
      expect(payload.dutyLife).toBeDefined()
    })

    it('should include lifetime run hours', () => {
      const payload = buildMqttPayload(4.5, -10.0, 4.52, 50, 35)

      expect(payload.hoursLife).toBe(123.5)
    })

    it('should include hysteresis and averages', () => {
      const payload = buildMqttPayload(4.5, -10.0, 4.52, 50, 35)

      expect(payload.hyst).toBe(0.5)
      expect(payload.avgOnSec).toBeDefined()
      expect(payload.avgOffSec).toBeDefined()
    })

    it('should include flags section', () => {
      mockS.dfr_isActive = true
      mockV.dor_pauseRemSec = 60
      mockV.trb_isActive = true

      const payload = buildMqttPayload(4.5, -10.0, 4.52, 50, 35)

      expect(payload.defrostOn).toBe(1)
      expect(payload.doorOpen).toBe(1)
      expect(payload.turboOn).toBe(1)
    })

    it('should include health section with power', () => {
      const payload = buildMqttPayload(4.5, -10.0, 4.52, 75.5, 35)

      expect(payload.health).toBe(100)
      expect(payload.watts).toBe(75.5)
    })

    it('should return null power when PM not available', () => {
      mockV.hw_hasPM = false

      const payload = buildMqttPayload(4.5, -10.0, 4.52, 75.5, 35)

      expect(payload.watts).toBeNull()
    })

    it('should maintain stable payload schema for HA integration', () => {
      // This test catches unintended breaking changes to MQTT payload structure
      const payload = buildMqttPayload(4.5, -10.0, 4.52, 75.5, 35)
      const keys = Object.keys(payload).sort()

      // Schema stability: these fields are consumed by Home Assistant integrations
      expect(keys).toEqual([
        'alarm', 'avgOffSec', 'avgOnSec', 'defrostOn', 'doorOpen',
        'dutyDay', 'dutyHr', 'dutyLife', 'health', 'hoursLife',
        'hyst', 'reason', 'relayOn', 'status', 'tAirRaw',
        'tAirSmt', 'tDev', 'tEvap', 'turboOn', 'watts',
      ])
    })
  })

  // ----------------------------------------------------------
  // PUBLISH STATUS TESTS
  // ----------------------------------------------------------

  describe('publishStatus', () => {
    it('should print console message', () => {
      publishStatus(4.5, -10.0, 4.52, 50, 35)

      expect(global.print).toHaveBeenCalled()
    })

    it('should publish to MQTT', () => {
      publishStatus(4.5, -10.0, 4.52, 50, 35)

      expect(global.MQTT.publish).toHaveBeenCalledWith(
        'fridge/status',
        expect.any(String),
        0,
        false,
      )
    })

    it('should publish valid JSON', () => {
      publishStatus(4.5, -10.0, 4.52, 50, 35)

      const publishCall = global.MQTT.publish.mock.calls[0]
      const payload = JSON.parse(publishCall[1])

      expect(payload.tAirRaw).toBeDefined()
      expect(payload.status).toBeDefined()
    })
  })
})
