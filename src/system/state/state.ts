/**
 * State management functions
 * Provides initial state structure for the fridge controller
 */

import type { ControllerState } from './types';
import type { FridgeConfig } from '$types/config';

export * from './types';

/**
 * Create initial controller state
 *
 * Initializes all state fields with safe default values. The initial state is designed to:
 * - Assume the relay is in the state reported by hardware
 * - Satisfy MIN_ON/MIN_OFF constraints immediately (no wait time)
 * - Initialize feature-specific state (duty cycle, daily stats, etc.)
 * - Set up empty sensor buffers for smoothing
 * - Configure adaptive hysteresis thresholds based on config
 *
 * @param nowSec - Current timestamp in seconds (from Shelly.getComponentStatus('sys').uptime)
 * @param relayOn - Initial relay state from hardware (true = ON, false = OFF)
 * @param config - Complete fridge configuration (USER_CONFIG + APP_CONSTANTS)
 * @returns Initial ControllerState object with all fields populated
 *
 * @remarks
 * **MIN_ON/MIN_OFF Initialization**: The initial state sets `lastOnTime` and `lastOffTime`
 * to values that satisfy the MIN_ON/MIN_OFF constraints immediately. This prevents the
 * controller from waiting for constraints on the first loop:
 * - If relay is ON: `lastOnTime = now - MIN_ON` (constraint already satisfied)
 * - If relay is OFF: `lastOffTime = now - MIN_OFF` (constraint already satisfied)
 *
 * **Adaptive Hysteresis**: Initial thresholds are set to static values from config:
 * - `dynOnAbove = SETPOINT + HYSTERESIS`
 * - `dynOffBelow = SETPOINT - HYSTERESIS`
 *
 * **Sensor Health**: All sensor health fields start in healthy state (no alerts fired).
 * Sensor monitoring begins tracking health on the first control loop.
 *
 * **Performance Metrics**: `loopTimeMin` starts at `Infinity` so the first loop sets it correctly.
 *
 * @example
 * ```typescript
 * const now = Shelly.getComponentStatus('sys').uptime;
 * const relayStatus = getRelayStatus(Shelly);
 * const state = createInitialState(now, relayStatus.output, CONFIG);
 * ```
 */
export function createInitialState(
  nowSec: number,
  relayOn: boolean,
  config: FridgeConfig
): ControllerState {
  return {
    // ═══════════════════════════════════════════════════════════════
    // CORE: RELAY STATE
    // Controls the compressor relay and tracks state transitions.
    // intendedOn = what we want, confirmedOn = what hardware reports.
    // lastOnTime/lastOffTime used for MIN_ON/MIN_OFF safety constraints.
    // ═══════════════════════════════════════════════════════════════

    intendedOn: relayOn,           // What the controller wants the relay to be
    confirmedOn: relayOn,          // What the hardware actually reports
    lastOnTime: relayOn ? (nowSec - config.MIN_ON_SEC) : 0,   // When relay last turned ON (for MIN_ON check)
    lastOffTime: relayOn ? 0 : nowSec, // PESSIMISTIC BOOT: Assume we just turned off now to force MIN_OFF wait
    lastStateChangeCommand: 0,     // When we last sent a command to change state (for timeout detection)

    // ═══════════════════════════════════════════════════════════════
    // CORE: TIMING
    // Tracks control loop execution timing for delta calculations.
    // ═══════════════════════════════════════════════════════════════

    startTime: nowSec,  // Controller start time for uptime calculation
    lastLoopTime: 0,  // Timestamp of previous loop (used to calculate dt for accumulators)

    // ═══════════════════════════════════════════════════════════════
    // CORE: FREEZE PROTECTION
    // Prevents evaporator from freezing by locking out compressor when
    // evap temp drops below FREEZE_PROTECTION_ON. Unlocks after temp
    // rises above FREEZE_PROTECTION_OFF + recovery delay.
    // ═══════════════════════════════════════════════════════════════

    freezeLocked: false,  // Is compressor currently locked out due to freeze protection?
    lockCount: 0,         // Total freeze protection activations since boot
    unlockTime: 0,        // Timestamp when freeze lock will release (after recovery delay)

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_SENSOR_FAILURE: SENSOR HEALTH MONITORING
    // Detects offline sensors (no reading) and stuck sensors (value not changing).
    // Air sensor is SAFETY-CRITICAL: failure triggers compressor shutdown.
    // Evap sensor is DIAGNOSTIC: failure logged but operation continues.
    // ═══════════════════════════════════════════════════════════════

    // Air sensor health (SAFETY-CRITICAL - controls thermostat decisions)
    airLastRaw: null,           // Last raw reading for stuck detection comparison
    airLastReadTime: 0,         // When we last got a valid reading (for offline detection)
    airLastChangeTime: 0,       // When value last changed (for stuck detection)
    airNoReadingFired: false,   // Has "sensor offline" alert been sent?
    airStuckFired: false,       // Has "sensor stuck" alert been sent?
    airCriticalFailure: false,  // Is sensor in critical failure? (triggers safety shutdown)

    // Evap sensor health (DIAGNOSTIC - monitors freeze protection)
    evapLastRaw: null,          // Last raw reading for stuck detection comparison
    evapLastReadTime: 0,        // When we last got a valid reading
    evapLastChangeTime: 0,      // When value last changed
    evapNoReadingFired: false,  // Has "sensor offline" alert been sent?
    evapStuckFired: false,      // Has "sensor stuck" alert been sent?
    evapCriticalFailure: false, // Is sensor in critical failure? (logged only, no shutdown)

    // ═══════════════════════════════════════════════════════════════
    // CORE: SENSOR SMOOTHING
    // Moving average buffers to smooth out sensor noise.
    // Buffer size determined by AIR/EVAP_SENSOR_SMOOTHING_SEC config.
    // ═══════════════════════════════════════════════════════════════

    airTempBuffer: [],       // Circular buffer of recent air temp readings
    evapTempBuffer: [],      // Circular buffer of recent evap temp readings
    airTempSmoothed: null,   // Calculated moving average of air temp
    evapTempSmoothed: null,  // Calculated moving average of evap temp

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_DUTY_CYCLE: DUTY CYCLE TRACKING
    // Tracks compressor ON/OFF time within DUTY_INTERVAL_SEC window.
    // Used for logging and adaptive hysteresis calculations.
    // Resets every DUTY_INTERVAL_SEC (default 1 hour).
    // ═══════════════════════════════════════════════════════════════

    dutyOnSec: 0,        // Seconds compressor was ON in current interval
    dutyOffSec: 0,       // Seconds compressor was OFF in current interval
    dutyLastReset: nowSec, // When duty cycle counters were last reset

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_DAILY_SUMMARY: DAILY STATISTICS
    // Accumulates 24-hour statistics for daily summary report.
    // Summary generated at DAILY_SUMMARY_HOUR, then counters reset.
    // Tracks runtime, temp min/max/avg, and event counts.
    // ═══════════════════════════════════════════════════════════════

    // Runtime tracking (24h accumulator)
    dayOnSec: 0,         // Total seconds compressor ON today
    dayOffSec: 0,        // Total seconds compressor OFF today

    // Air temperature statistics (for daily min/max/avg report)
    dayAirMin: null,     // Minimum air temp recorded today
    dayAirMax: null,     // Maximum air temp recorded today
    dayAirSum: 0,        // Sum of all air readings (for avg calculation)
    dayAirCount: 0,      // Count of air readings (for avg calculation)

    // Evap temperature statistics (for daily min/max/avg report)
    dayEvapMin: null,    // Minimum evap temp recorded today
    dayEvapMax: null,    // Maximum evap temp recorded today
    dayEvapSum: 0,       // Sum of all evap readings
    dayEvapCount: 0,     // Count of evap readings

    // Event counters (reset after daily summary)
    dayFreezeCount: 0,      // Freeze protection activations today
    dayHighTempCount: 0,    // High temp alerts (instant + sustained) today
    lastDailySummaryDate: null, // Date string (YYYY-MM-DD) of last summary

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_HIGH_TEMP_ALERTS: HIGH TEMPERATURE ALERTING
    // Two alert types with different thresholds and delays:
    // - Instant: Severe temp (>10°C) for short delay (5min) → WARNING
    // - Sustained: Moderate temp (>8°C) for long delay (1hr) → WARNING
    // Alerts reset when temp drops below threshold, can fire again.
    // ═══════════════════════════════════════════════════════════════

    instantStart: 0,      // When instant threshold was exceeded, 0 if normal
    instantFired: false,  // Has instant alert been sent? (prevents spam)
    sustainedStart: 0,    // When sustained threshold was exceeded, 0 if normal
    sustainedFired: false, // Has sustained alert been sent?
    // Pre-allocated alert state object to avoid per-loop allocations
    alertState: {
      instant: { startTime: 0, fired: false },
      sustained: { startTime: 0, fired: false },
      justFired: false
    },

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_ADAPTIVE_HYSTERESIS: DYNAMIC THRESHOLD ADJUSTMENT
    // Adjusts ON/OFF thresholds based on duty cycle performance.
    // If duty >80%: compressor overworked → widen thresholds (less cycling)
    // If duty <40%: compressor underused → narrow thresholds (tighter control)
    // Adjustments are gradual (0.1°C increments) up to ADAPTIVE_MAX_SHIFT.
    // ═══════════════════════════════════════════════════════════════

    dynOnAbove: config.SETPOINT_C + config.HYSTERESIS_C,  // Turn ON when temp exceeds this
    dynOffBelow: config.SETPOINT_C - config.HYSTERESIS_C, // Turn OFF when temp drops below this
    lastAdaptiveAdjust: 0,  // Timestamp of last threshold adjustment

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_WATCHDOG: SYSTEM HEALTH MONITORING
    // Proves control loop is running by updating timestamp each loop.
    // External monitoring can detect stall if lastWatchdogPet is stale.
    // ═══════════════════════════════════════════════════════════════

    lastWatchdogPet: nowSec,  // Updated every control loop to prove we're alive

    // ═══════════════════════════════════════════════════════════════
    // CORE: ERROR TRACKING
    // Tracks consecutive errors to detect persistent failures.
    // After MAX_CONSECUTIVE_ERRORS, system may need intervention.
    // ═══════════════════════════════════════════════════════════════

    consecutiveErrors: 0,  // Error counter (resets on successful loop)
    lastErrorTime: 0,      // When last error occurred

    // ═══════════════════════════════════════════════════════════════
    // CORE: MIN_ON/MIN_OFF WAIT STATE LOGGING
    // Prevents log spam when waiting for compressor timing constraints.
    // Logs once when wait starts, clears when wait ends.
    // ═══════════════════════════════════════════════════════════════

    minOnWaitLogged: false,  // Has "waiting for MIN_ON" been logged?
    minOffWaitLogged: false, // Has "waiting for MIN_OFF" been logged?

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_PERFORMANCE_METRICS: LOOP EXECUTION TRACKING
    // Tracks control loop timing for performance monitoring.
    // Detects slow loops (>PERF_SLOW_LOOP_THRESHOLD_MS).
    // Logs periodic summaries every PERF_LOG_INTERVAL_SEC.
    // ═══════════════════════════════════════════════════════════════

    loopCount: 0,           // Total control loops executed since boot
    loopTimeSum: 0,         // Cumulative loop time (for avg calculation)
    loopTimeMax: 0,         // Longest loop execution time
    loopTimeMin: config.INITIAL_LOOP_TIME_MIN,  // Shortest loop execution time (Infinity so first loop sets it)
    slowLoopCount: 0,       // Loops exceeding slow threshold
    lastPerfLog: nowSec     // When performance summary was last logged
  };
}
