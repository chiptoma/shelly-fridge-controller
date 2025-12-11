// ==============================================================================
// * LOOP TESTS
// ? Validates loop control and orchestration.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Loop', () => {
  let startMainLoop, stopMainLoop, isLoopRunning, mainLoopTick
  let mockTimerSet, mockTimerClear
  let mockS, mockV, mockC
  let mockShellyCall, mockShellyGetStatus
  let mockValidateSensorReadings, mockHandleSensorError, mockProcessSensorData
  let mockResetSensorError, mockHandleSensorRecovery, mockCheckSensorStuck
  let mockCheckTurboSwitch, mockDetectDoorOpen, mockCheckDefrostTrigger
  let mockCheckLockedRotor, mockCheckGhostRun, mockIsScheduledDefrost
  let mockClearNonFatalAlarms, mockApplySensorAlarms, mockProcessAlarmEdges, mockCheckHighTempAlarm
  let mockCheckWeldDetection, mockCheckCoolingHealth
  let mockUpdateMetrics, mockDetermineMode, mockExecuteSwitchDecision
  let mockPublishStatus, mockPersistState

  beforeEach(async () => {
    vi.resetModules()

    // Track timer calls
    mockTimerSet = vi.fn(() => 123)
    mockTimerClear = vi.fn()

    // Mock global Timer
    global.Timer = {
      set: mockTimerSet,
      clear: mockTimerClear,
    }

    // Mock global print
    global.print = vi.fn()

    // Mock Date.now
    vi.spyOn(Date, 'now').mockReturnValue(1000000000)

    // Create mock state objects
    mockS = { sys_relayState: false, sys_tsRelayOn: 0 }
    mockV = {
      sys_alarm: 'NONE', sys_reason: 'NONE', sys_status: 'IDLE',
      sys_statusDetail: 'NONE', sens_smoothAir: 5.0, sens_errCount: 0,
      sens_wasError: false, hw_hasPM: true, lastSave: 0,
    }
    mockC = { sys_loopSec: 5, sys_sensAirId: 100, sys_sensEvapId: 101, sys_sensFailLimit: 5 }

    // Create capturable mock functions
    mockValidateSensorReadings = vi.fn(() => true)
    mockHandleSensorError = vi.fn(() => false)
    mockProcessSensorData = vi.fn(() => 5.0)
    mockResetSensorError = vi.fn()
    mockHandleSensorRecovery = vi.fn()
    mockCheckSensorStuck = vi.fn(() => false)
    mockCheckTurboSwitch = vi.fn()
    mockDetectDoorOpen = vi.fn()
    mockCheckDefrostTrigger = vi.fn()
    mockCheckLockedRotor = vi.fn()
    mockCheckGhostRun = vi.fn()
    mockIsScheduledDefrost = vi.fn(() => false)
    mockClearNonFatalAlarms = vi.fn()
    mockApplySensorAlarms = vi.fn()
    mockProcessAlarmEdges = vi.fn()
    mockCheckHighTempAlarm = vi.fn()
    mockCheckWeldDetection = vi.fn()
    mockCheckCoolingHealth = vi.fn()
    mockUpdateMetrics = vi.fn()
    mockDetermineMode = vi.fn(() => ({
      wantOn: false, status: 'IDLE', reason: 'NONE', detail: 'NONE',
    }))
    mockExecuteSwitchDecision = vi.fn(() => ({
      switched: false, blocked: false, reason: 'NONE', detail: null,
    }))
    mockPublishStatus = vi.fn()
    mockPersistState = vi.fn()

    // Mock Shelly.call to capture callbacks
    mockShellyCall = vi.fn((method, params, callback) => {
      if (method === 'Temperature.GetStatus') {
        // Return valid sensor data by default
        if (callback) callback({ tC: 5.0 })
      }
    })
    mockShellyGetStatus = vi.fn((type, id) => {
      if (type === 'Input') return { state: false }
      if (type === 'Switch') return { output: false, apower: 50, temperature: { tC: 30 } }
      return null
    })

    // Mock global Shelly
    global.Shelly = {
      call: mockShellyCall,
      getComponentStatus: mockShellyGetStatus,
    }

    // Mock all dependencies
    vi.doMock('./constants.js', () => ({
      ALM: { NONE: 'NONE', FAIL: 'FAIL', STUCK: 'STUCK' },
      RSN: { NONE: 'NONE' },
    }))
    vi.doMock('./config.js', () => ({ C: mockC }))
    vi.doMock('./state.js', () => ({
      S: mockS,
      V: mockV,
      persistState: mockPersistState,
    }))
    vi.doMock('./sensors.js', () => ({
      processSensorData: mockProcessSensorData,
      validateSensorReadings: mockValidateSensorReadings,
      handleSensorError: mockHandleSensorError,
      handleSensorRecovery: mockHandleSensorRecovery,
      checkSensorStuck: mockCheckSensorStuck,
      resetSensorError: mockResetSensorError,
    }))
    vi.doMock('./alarms.js', () => ({
      clearNonFatalAlarms: mockClearNonFatalAlarms,
      applySensorAlarms: mockApplySensorAlarms,
      processAlarmEdges: mockProcessAlarmEdges,
      checkHighTempAlarm: mockCheckHighTempAlarm,
    }))
    vi.doMock('./protection.js', () => ({
      checkWeldDetection: mockCheckWeldDetection,
      checkCoolingHealth: mockCheckCoolingHealth,
      checkLockedRotor: mockCheckLockedRotor,
      checkGhostRun: mockCheckGhostRun,
    }))
    vi.doMock('./features.js', () => ({
      checkTurboSwitch: mockCheckTurboSwitch,
      detectDoorOpen: mockDetectDoorOpen,
      checkDefrostTrigger: mockCheckDefrostTrigger,
      isScheduledDefrost: mockIsScheduledDefrost,
    }))
    vi.doMock('./metrics.js', () => ({
      updateMetrics: mockUpdateMetrics,
    }))
    vi.doMock('./control.js', () => ({
      determineMode: mockDetermineMode,
      executeSwitchDecision: mockExecuteSwitchDecision,
    }))
    vi.doMock('./reporting.js', () => ({
      publishStatus: mockPublishStatus,
    }))

    const module = await import('./loop.js')
    startMainLoop = module.startMainLoop
    stopMainLoop = module.stopMainLoop
    isLoopRunning = module.isLoopRunning
    mainLoopTick = module.mainLoopTick
  })

  // ----------------------------------------------------------
  // * LOOP CONTROL TESTS
  // ----------------------------------------------------------

  describe('startMainLoop', () => {
    it('should set timer with correct interval', () => {
      startMainLoop()

      expect(mockTimerSet).toHaveBeenCalledWith(
        5000, // 5 seconds in ms
        true, // repeat
        expect.any(Function),
      )
    })

    it('should print start message', () => {
      startMainLoop()

      expect(global.print).toHaveBeenCalledWith(
        expect.stringContaining('ℹ️ LOOP  : Starting main loop'),
      )
    })

    it('should not start twice', () => {
      startMainLoop()
      startMainLoop()

      expect(mockTimerSet).toHaveBeenCalledTimes(1)
      expect(global.print).toHaveBeenCalledWith('⚠️ LOOP  : Already running')
    })
  })

  describe('stopMainLoop', () => {
    it('should clear timer when running', () => {
      startMainLoop()
      stopMainLoop()

      expect(mockTimerClear).toHaveBeenCalledWith(123)
    })

    it('should print stop message', () => {
      startMainLoop()
      stopMainLoop()

      expect(global.print).toHaveBeenCalledWith('ℹ️ LOOP  : Main loop stopped')
    })

    it('should not fail when not running', () => {
      stopMainLoop()
      expect(mockTimerClear).not.toHaveBeenCalled()
    })
  })

  describe('isLoopRunning', () => {
    it('should return false initially', () => {
      expect(isLoopRunning()).toBe(false)
    })

    it('should return true after start', () => {
      startMainLoop()
      expect(isLoopRunning()).toBe(true)
    })

    it('should return false after stop', () => {
      startMainLoop()
      stopMainLoop()
      expect(isLoopRunning()).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // * MAIN LOOP TICK TESTS
  // ----------------------------------------------------------

  describe('mainLoopTick', () => {
    it('should check turbo switch input', () => {
      mainLoopTick()

      expect(mockShellyGetStatus).toHaveBeenCalledWith('Input', 0)
      expect(mockCheckTurboSwitch).toHaveBeenCalledWith(false)
    })

    it('should skip turbo switch if input unavailable', () => {
      mockShellyGetStatus.mockReturnValue(null)

      mainLoopTick()

      expect(mockCheckTurboSwitch).not.toHaveBeenCalled()
    })

    it('should read air and evap sensors', () => {
      mainLoopTick()

      expect(mockShellyCall).toHaveBeenCalledWith(
        'Temperature.GetStatus',
        { id: 100 },
        expect.any(Function),
      )
      expect(mockShellyCall).toHaveBeenCalledWith(
        'Temperature.GetStatus',
        { id: 101 },
        expect.any(Function),
      )
    })

    it('should validate sensor readings', () => {
      mainLoopTick()

      expect(mockValidateSensorReadings).toHaveBeenCalled()
    })

    it('should handle sensor error when validation fails', () => {
      mockValidateSensorReadings.mockReturnValue(false)

      mainLoopTick()

      expect(mockHandleSensorError).toHaveBeenCalled()
    })

    it('should set sens_wasError on fatal sensor error', () => {
      mockValidateSensorReadings.mockReturnValue(false)
      mockHandleSensorError.mockReturnValue(true)
      mockV.sens_wasError = false

      mainLoopTick()

      expect(mockV.sens_wasError).toBe(true)
    })

    it('should process sensor data when valid', () => {
      mainLoopTick()

      expect(mockProcessSensorData).toHaveBeenCalledWith(5.0)
      expect(mockResetSensorError).toHaveBeenCalled()
    })

    it('should handle sensor recovery', () => {
      mockV.sens_wasError = true

      mainLoopTick()

      expect(mockHandleSensorRecovery).toHaveBeenCalledWith(5.0)
    })

    it('should check for stuck sensors', () => {
      mainLoopTick()

      expect(mockCheckSensorStuck).toHaveBeenCalledTimes(2) // air and evap
    })

    it('should detect power monitor availability', () => {
      mockShellyGetStatus.mockImplementation((type) => {
        if (type === 'Input') return { state: false }
        if (type === 'Switch') return { output: false, apower: 50 }
        return null
      })

      mainLoopTick()

      expect(mockV.hw_hasPM).toBe(true)
    })

    it('should check locked rotor when relay on with PM', () => {
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = 999000
      mockV.hw_hasPM = true

      mainLoopTick()

      expect(mockCheckLockedRotor).toHaveBeenCalled()
      expect(mockCheckGhostRun).toHaveBeenCalled()
    })

    it('should clear non-fatal alarms', () => {
      mainLoopTick()

      expect(mockClearNonFatalAlarms).toHaveBeenCalled()
    })

    it('should apply sensor alarms', () => {
      mainLoopTick()

      expect(mockApplySensorAlarms).toHaveBeenCalled()
    })

    it('should update metrics', () => {
      mainLoopTick()

      expect(mockUpdateMetrics).toHaveBeenCalledWith(false, 5)
    })

    it('should detect door open', () => {
      mainLoopTick()

      expect(mockDetectDoorOpen).toHaveBeenCalled()
    })

    it('should check defrost trigger', () => {
      mainLoopTick()

      expect(mockCheckDefrostTrigger).toHaveBeenCalledWith(5.0)
    })

    it('should check high temp alarm', () => {
      mainLoopTick()

      expect(mockCheckHighTempAlarm).toHaveBeenCalled()
    })

    it('should check weld detection', () => {
      mainLoopTick()

      expect(mockCheckWeldDetection).toHaveBeenCalled()
    })

    it('should check cooling health', () => {
      mainLoopTick()

      expect(mockCheckCoolingHealth).toHaveBeenCalledWith(5.0, expect.any(Number))
    })

    it('should process alarm edges', () => {
      mainLoopTick()

      expect(mockProcessAlarmEdges).toHaveBeenCalled()
    })

    it('should determine mode', () => {
      mainLoopTick()

      expect(mockDetermineMode).toHaveBeenCalled()
    })

    it('should execute switch decision', () => {
      mainLoopTick()

      expect(mockExecuteSwitchDecision).toHaveBeenCalled()
    })

    it('should update status from mode determination', () => {
      mockDetermineMode.mockReturnValue({
        wantOn: true,
        status: 'COOLING',
        reason: 'TEST_REASON',
        detail: 'TEST_DETAIL',
      })

      mainLoopTick()

      expect(mockV.sys_status).toBe('COOLING')
      expect(mockV.sys_reason).toBe('TEST_REASON')
      expect(mockV.sys_statusDetail).toBe('TEST_DETAIL')
    })

    it('should persist state hourly', () => {
      mockV.lastSave = 0 // More than 1 hour ago

      mainLoopTick()

      expect(mockPersistState).toHaveBeenCalled()
    })

    it('should not persist state within hour', () => {
      mockV.lastSave = 999999 // Recent save

      mainLoopTick()

      expect(mockPersistState).not.toHaveBeenCalled()
    })

    it('should publish status', () => {
      mainLoopTick()

      expect(mockPublishStatus).toHaveBeenCalled()
    })

    it('should handle missing switch temperature', () => {
      mockShellyGetStatus.mockImplementation((type) => {
        if (type === 'Input') return { state: false }
        if (type === 'Switch') return { output: false, apower: 50 }
        return null
      })

      mainLoopTick()

      expect(mockPublishStatus).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        null,
      )
    })
  })
})
