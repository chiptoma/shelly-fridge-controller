// ==============================================================================
// SHELLY RUNTIME SIMULATOR
// Complete virtual Shelly environment for integration testing.
// Simulates all Shelly APIs: KVS, MQTT, Switch, Sensors, Timers, Input.
// Designed to be extracted as a reusable boilerplate for any Shelly project.
// ==============================================================================

// ----------------------------------------------------------
// SHELLY RUNTIME CLASS
// Core simulator that provides the virtual Shelly environment.
// ----------------------------------------------------------

class ShellyRuntime {
  constructor(config = {}) {
    // Virtual clock (milliseconds since "boot")
    this.uptimeMs = 0
    this.realTimeMs = config.startTime || Date.now()

    // Virtual KVS storage
    this.kvs = {}

    // Virtual Switch state
    this.switches = {
      0: {
        output: false,
        apower: 0,
        voltage: 230,
        current: 0,
        temperature: { tC: 25 },
      },
    }

    // Virtual Temperature sensors
    this.temperatures = {
      100: { tC: null }, // Evap sensor (default null = disconnected)
      101: { tC: null }, // Air sensor
    }

    // Virtual Input state
    this.inputs = {
      0: { state: false },
    }

    // Virtual Timers
    this.timers = new Map()
    this.timerIdCounter = 1

    // MQTT subscriptions and message log
    this.mqttSubscriptions = new Map()
    this.mqttMessages = []

    // History tracking for assertions
    this.history = {
      relay: [],      // { time, state, reason }
      alarms: [],     // { time, alarm, detail }
      mqtt: [],       // { time, topic, payload }
      kvs: [],        // { time, op, key, value }
      prints: [],     // { time, message }
    }

    // Callbacks for state change notifications
    this.onRelayChange = null
    this.onAlarmChange = null

    // Script reference (set when script is loaded)
    this.script = null

    // Build global mocks
    this._buildGlobals()
  }

  // ----------------------------------------------------------
  // GLOBAL MOCK BUILDERS
  // ----------------------------------------------------------

  _buildGlobals() {
    const self = this

    // Mock Shelly object
    this.Shelly = {
      getUptimeMs: () => self.uptimeMs,

      call: (method, params, callback) => {
        self._handleShellyCall(method, params, callback)
      },

      getComponentStatus: (type, id) => {
        return self._getComponentStatus(type, id)
      },

      emitEvent: (name, data) => {
        self._recordHistory('event', { name, data })
      },
    }

    // Mock Timer object
    this.Timer = {
      set: (delayMs, repeat, callback) => {
        return self._setTimer(delayMs, repeat, callback)
      },

      clear: (timerId) => {
        self._clearTimer(timerId)
      },
    }

    // Mock MQTT object
    this.MQTT = {
      subscribe: (topic, callback) => {
        self.mqttSubscriptions.set(topic, callback)
      },

      publish: (topic, payload, qos, retain) => {
        self._mqttPublish(topic, payload, qos, retain)
      },
    }

    // Mock print function
    this.print = (message) => {
      self.history.prints.push({
        time: self.uptimeMs,
        message: message,
      })
      if (self.debugPrint) {
        console.log(`[${self.uptimeMs}ms] ${message}`)
      }
    }

    // Mock Date object
    this.Date = {
      now: () => self.realTimeMs,
    }

    // Make Date constructable
    const OriginalDate = Date
    this.DateConstructor = function (arg) {
      if (arg === undefined) {
        return new OriginalDate(self.realTimeMs)
      }
      return new OriginalDate(arg)
    }
    this.DateConstructor.now = () => self.realTimeMs
    this.DateConstructor.prototype = OriginalDate.prototype
  }

  // ----------------------------------------------------------
  // SHELLY.CALL HANDLER
  // ----------------------------------------------------------

  _handleShellyCall(method, params, callback) {
    const cb = callback || (() => {})

    switch (method) {
      case 'KVS.GetMany': {
        const match = params.match || ''
        const prefix = match.replace('*', '')
        const items = []
        for (const key in this.kvs) {
          if (key.startsWith(prefix)) {
            items.push({ key: key, value: this.kvs[key] })
          }
        }
        cb({ items: items }, 0, '')
        break
      }

      case 'KVS.Set': {
        this.kvs[params.key] = params.value
        this._recordHistory('kvs', { op: 'set', key: params.key, value: params.value })
        cb({}, 0, '')
        break
      }

      case 'KVS.Delete': {
        delete this.kvs[params.key]
        this._recordHistory('kvs', { op: 'delete', key: params.key })
        cb({}, 0, '')
        break
      }

      case 'KVS.Get': {
        const value = this.kvs[params.key]
        cb({ value: value }, value ? 0 : -1, value ? '' : 'Not found')
        break
      }

      case 'Switch.Set': {
        const sw = this.switches[params.id]
        if (sw) {
          const oldState = sw.output
          sw.output = params.on
          if (oldState !== params.on) {
            this._recordHistory('relay', {
              state: params.on,
              apower: sw.apower,
            })
            if (this.onRelayChange) {
              this.onRelayChange(params.on, this.uptimeMs)
            }
          }
        }
        cb({}, 0, '')
        break
      }

      case 'Temperature.GetStatus': {
        const sensor = this.temperatures[params.id]
        if (sensor && sensor.tC !== null) {
          cb({ tC: sensor.tC }, 0, '')
        } else {
          cb(null, -1, 'Sensor not found')
        }
        break
      }

      default:
        console.warn(`Unhandled Shelly.call: ${method}`)
        cb(null, -1, 'Not implemented')
    }
  }

  // ----------------------------------------------------------
  // COMPONENT STATUS
  // ----------------------------------------------------------

  _getComponentStatus(type, id) {
    switch (type) {
      case 'Switch':
        return this.switches[id] || null
      case 'Input':
        return this.inputs[id] || null
      case 'Temperature':
        return this.temperatures[id] || null
      default:
        return null
    }
  }

  // ----------------------------------------------------------
  // TIMER MANAGEMENT
  // ----------------------------------------------------------

  _setTimer(delayMs, repeat, callback) {
    const timerId = this.timerIdCounter++
    this.timers.set(timerId, {
      delayMs: delayMs,
      repeat: repeat,
      callback: callback,
      nextFireMs: this.uptimeMs + delayMs,
    })
    return timerId
  }

  _clearTimer(timerId) {
    this.timers.delete(timerId)
  }

  _processTimers() {
    const toFire = []

    for (const [id, timer] of this.timers) {
      if (this.uptimeMs >= timer.nextFireMs) {
        toFire.push({ id, timer })
      }
    }

    for (const { id, timer } of toFire) {
      try {
        timer.callback()
      } catch (e) {
        console.error(`Timer ${id} error:`, e)
      }

      if (timer.repeat) {
        timer.nextFireMs = this.uptimeMs + timer.delayMs
      } else {
        this.timers.delete(id)
      }
    }
  }

  // ----------------------------------------------------------
  // MQTT HANDLING
  // ----------------------------------------------------------

  _mqttPublish(topic, payload, qos, retain) {
    const msg = {
      time: this.uptimeMs,
      topic: topic,
      payload: payload,
      qos: qos,
      retain: retain,
    }
    this.mqttMessages.push(msg)
    this.history.mqtt.push(msg)
  }

  // Simulate receiving an MQTT message
  mqttReceive(topic, message) {
    const callback = this.mqttSubscriptions.get(topic)
    if (callback) {
      callback(topic, message)
    }
  }

  // ----------------------------------------------------------
  // HISTORY TRACKING
  // ----------------------------------------------------------

  _recordHistory(type, data) {
    const entry = { time: this.uptimeMs, ...data }

    switch (type) {
      case 'relay':
        this.history.relay.push(entry)
        break
      case 'kvs':
        this.history.kvs.push(entry)
        break
      case 'event':
        // Could add event history if needed
        break
    }
  }

  // ----------------------------------------------------------
  // TIME CONTROL
  // ----------------------------------------------------------

  /**
   * Advance virtual time by specified milliseconds
   * Processes all timers that fire during this period
   */
  advanceTime(ms) {
    const targetTime = this.uptimeMs + ms
    const stepMs = 1 // Process timers every 1ms for precision

    while (this.uptimeMs < targetTime) {
      this.uptimeMs += stepMs
      this.realTimeMs += stepMs
      this._processTimers()
    }
  }

  /**
   * Advance time in larger steps (faster for long simulations)
   * Only stops at timer boundaries
   */
  advanceTimeFast(ms) {
    const targetTime = this.uptimeMs + ms

    while (this.uptimeMs < targetTime) {
      // Find next timer fire time
      let nextFire = targetTime
      for (const [, timer] of this.timers) {
        if (timer.nextFireMs < nextFire && timer.nextFireMs > this.uptimeMs) {
          nextFire = timer.nextFireMs
        }
      }

      // Jump to next fire time
      const jump = nextFire - this.uptimeMs
      this.uptimeMs = nextFire
      this.realTimeMs += jump

      // Process timers at this moment
      this._processTimers()
    }
  }

  /**
   * Run for N loop iterations (convenience method)
   */
  runLoops(count, loopIntervalMs = 5000) {
    for (let i = 0; i < count; i++) {
      this.advanceTimeFast(loopIntervalMs)
    }
  }

  // ----------------------------------------------------------
  // SENSOR CONTROL
  // ----------------------------------------------------------

  setTemperature(sensorId, tempC) {
    if (this.temperatures[sensorId]) {
      this.temperatures[sensorId].tC = tempC
    }
  }

  disconnectSensor(sensorId) {
    if (this.temperatures[sensorId]) {
      this.temperatures[sensorId].tC = null
    }
  }

  // ----------------------------------------------------------
  // SWITCH/POWER CONTROL
  // ----------------------------------------------------------

  setPower(switchId, watts) {
    if (this.switches[switchId]) {
      this.switches[switchId].apower = watts
      this.switches[switchId].current = watts / this.switches[switchId].voltage
    }
  }

  setSwitchTemperature(switchId, tempC) {
    if (this.switches[switchId]) {
      this.switches[switchId].temperature.tC = tempC
    }
  }

  getRelayState(switchId = 0) {
    return this.switches[switchId]?.output || false
  }

  // ----------------------------------------------------------
  // INPUT CONTROL
  // ----------------------------------------------------------

  setInput(inputId, state) {
    if (this.inputs[inputId]) {
      this.inputs[inputId].state = state
    }
  }

  // ----------------------------------------------------------
  // GLOBAL INJECTION
  // ----------------------------------------------------------

  /**
   * Install simulator globals into the given scope
   * Call this before loading your script
   */
  installGlobals(scope = global) {
    scope.Shelly = this.Shelly
    scope.Timer = this.Timer
    scope.MQTT = this.MQTT
    scope.print = this.print
    scope.Date = this.DateConstructor
  }

  /**
   * Remove simulator globals from scope
   */
  uninstallGlobals(scope = global) {
    delete scope.Shelly
    delete scope.Timer
    delete scope.MQTT
    delete scope.print
    // Don't delete Date - restore original
  }

  // ----------------------------------------------------------
  // STATE QUERIES
  // ----------------------------------------------------------

  getLastMqttMessage(topic = null) {
    if (topic) {
      for (let i = this.mqttMessages.length - 1; i >= 0; i--) {
        if (this.mqttMessages[i].topic === topic) {
          return this.mqttMessages[i]
        }
      }
      return null
    }
    return this.mqttMessages[this.mqttMessages.length - 1] || null
  }

  getRelayHistory() {
    return this.history.relay
  }

  getPrintHistory() {
    return this.history.prints
  }

  getKvsValue(key) {
    const value = this.kvs[key]
    return value ? JSON.parse(value) : null
  }

  // ----------------------------------------------------------
  // RESET
  // ----------------------------------------------------------

  reset() {
    this.uptimeMs = 0
    this.kvs = {}
    this.switches[0].output = false
    this.switches[0].apower = 0
    this.temperatures[100].tC = null
    this.temperatures[101].tC = null
    this.inputs[0].state = false
    this.timers.clear()
    this.timerIdCounter = 1
    this.mqttSubscriptions.clear()
    this.mqttMessages = []
    this.history = {
      relay: [],
      alarms: [],
      mqtt: [],
      kvs: [],
      prints: [],
    }
  }
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export { ShellyRuntime }
