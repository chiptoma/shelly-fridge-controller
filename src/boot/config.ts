import type { FridgeUserConfig, FridgeAppConstants, FridgeConfig } from '../types';

// ─────────────────────────────────────────────────────────────
// USER CONFIGURATION
//   Everything a user might reasonably tune for behavior,
//   safety, alerts, and observability.
// ─────────────────────────────────────────────────────────────

export const USER_CONFIG: Readonly<FridgeUserConfig> = {
  // AIR_SENSOR_ID
  //   Role: Logical ID/index of the cabinet (air) temperature sensor.
  //   Critical: Integer in [0, 255], different from EVAP_SENSOR_ID.
  //   Recommended: Small, stable ID, unique per sensor on the bus.
  AIR_SENSOR_ID: 101,

  // EVAP_SENSOR_ID
  //   Role: Logical ID/index of the evaporator temperature sensor.
  //   Critical: Integer in [0, 255], different from AIR_SENSOR_ID.
  //   Recommended: Small, stable ID, explicitly mapped in wiring/docs.
  EVAP_SENSOR_ID: 100,

  // SETPOINT_C
  //   Role: Target cabinet air temperature in °C.
  //   Critical: 1–10 °C (error if <1 or >10 for a drinks fridge).
  //   Recommended: 3–5 °C; 4 °C is ideal for water / sparkling water.
  SETPOINT_C: 4.0,

  // HYSTERESIS_C
  //   Role: Temperature swing ±(°C) around setpoint for ON/OFF control.
  //   Critical: 0.3–5.0 °C (error if ≤0.3 or >5).
  //   Recommended: 0.5–2.0 °C; 1.0 °C is a good balance of stability and tightness.
  HYSTERESIS_C: 1.0,

  // AIR_SENSOR_SMOOTHING_SEC
  //   Role: Moving-average window (s) for air temperature readings.
  //   Critical: 5–300 s (error if <5 or >300).
  //   Recommended: 20–60 s; 30 s gives stable but responsive cabinet readings.
  AIR_SENSOR_SMOOTHING_SEC: 30,

  // EVAP_SENSOR_SMOOTHING_SEC
  //   Role: Moving-average window (s) for evaporator temperature readings.
  //   Critical: 5–300 s (error if <5 or >300).
  //   Recommended: 5–20 s; 10 s tracks coil behaviour without noise.
  EVAP_SENSOR_SMOOTHING_SEC: 10,

  // LOOP_PERIOD_MS
  //   Role: Main control loop period in milliseconds.
  //   Critical: 2000–15000 ms (error if <2000 or >15000).
  //   Recommended: 5000 ms; 5 s matches fridge dynamics and Shelly constraints.
  LOOP_PERIOD_MS: 5000,

  // MIN_ON_SEC / MIN_OFF_SEC
  //   Role: Compressor short-cycle protection: minimum run and rest times.
  //   Critical:
  //     MIN_ON_SEC: 120–600 s (error if <120).
  //     MIN_OFF_SEC: 180–1800 s (error if <180).
  //     MIN_ON_SEC + MIN_OFF_SEC: ≥240 s (error if <240).
  //   Recommended: MIN_ON_SEC = 180 s, MIN_OFF_SEC = 300 s for a small drinks fridge.
  MIN_ON_SEC: 180,
  MIN_OFF_SEC: 300,

  // FREEZE_PROTECTION_START_C / FREEZE_PROTECTION_STOP_C
  //   Role: Evaporator-based freeze protection thresholds in °C.
  //   FREEZE_PROTECTION_START_C: Temperature at which protection engages (stops cooling).
  //   FREEZE_PROTECTION_STOP_C: Temperature at which protection releases (resumes cooling).
  //   Critical:
  //     FREEZE_PROTECTION_START_C: –30 to –5 °C (error if < -30 or > -5).
  //     FREEZE_PROTECTION_STOP_C: –8 to +5 °C (error if < -8 or > 5), and FREEZE_PROTECTION_STOP_C > FREEZE_PROTECTION_START_C.
  //   Recommended:
  //     FREEZE_PROTECTION_START_C ≈ –15 to –18 °C; FREEZE_PROTECTION_STOP_C ≈ –5 to –2 °C.
  FREEZE_PROTECTION_START_C: -16.0,
  FREEZE_PROTECTION_STOP_C: -2.0,

  // FREEZE_RECOVERY_DELAY_SEC
  //   Role: Delay in seconds after FREEZE_PROTECTION_STOP_C before compressor can restart.
  //   Critical: 120–900 s (error if <120 or >900).
  //   Recommended: 300 s; aligns with MIN_OFF_SEC and gives thaw/stabilisation time.
  FREEZE_RECOVERY_DELAY_SEC: 300,

  // FREEZE_RECOVERY_HYSTERESIS_C
  //   Role: Extra °C above FREEZE_PROTECTION_STOP_C before starting recovery logic.
  //   Critical: 0.1–5.0 °C (error if ≤0.0 or >5.0).
  //   Recommended: 0.5–1.0 °C; 0.5 °C is a tight, safe margin.
  FREEZE_RECOVERY_HYSTERESIS_C: 0.5,

  // FREEZE_LOCK_HYSTERESIS_C
  //   Role: Deadband °C around FREEZE_PROTECTION_START_C to prevent rapid lock/unlock.
  //   Critical: 0.1–5.0 °C (error if ≤0.0 or >5.0).
  //   Recommended: 0.2–0.5 °C; 0.3 °C is a good compromise.
  FREEZE_LOCK_HYSTERESIS_C: 0.3,

  // FEATURE_DUTY_CYCLE
  //   Role: Enable reporting of compressor duty cycle.
  //   Critical: Boolean only.
  //   Recommended: true in development/monitoring environments.
  FEATURE_DUTY_CYCLE: true,

  // FEATURE_DAILY_SUMMARY
  //   Role: Enable generation of daily summary statistics.
  //   Critical: Boolean only.
  //   Recommended: true when daily logs are consumed or archived.
  FEATURE_DAILY_SUMMARY: true,

  // FEATURE_SENSOR_FAILURE
  //   Role: Enable sensor failure detection logic.
  //   Critical: Boolean only; should not be disabled without alternative safety.
  //   Recommended: true; this is a primary safety mechanism.
  FEATURE_SENSOR_FAILURE: true,

  // FEATURE_HIGH_TEMP_ALERTS
  //   Role: Enable high-temperature alerting.
  //   Critical: Boolean only.
  //   Recommended: true for any remotely monitored fridge.
  FEATURE_HIGH_TEMP_ALERTS: true,

  // FEATURE_ADAPTIVE_HYSTERESIS
  //   Role: Enable duty-cycle-based automatic hysteresis adjustment.
  //   Critical: Boolean only; constrained by ADAPTIVE_MAX_SHIFT_C.
  //   Recommended: true; bounded adaptation improves efficiency.
  FEATURE_ADAPTIVE_HYSTERESIS: true,

  // FEATURE_WATCHDOG
  //   Role: Enable watchdog supervision of the control loop.
  //   Critical: Boolean only.
  //   Recommended: true; prevents silent lockups.
  FEATURE_WATCHDOG: true,

  // FEATURE_PERFORMANCE_METRICS
  //   Role: Enable performance/loop timing metrics.
  //   Critical: Boolean only.
  //   Recommended: true while tuning; optional in long-term production.
  FEATURE_PERFORMANCE_METRICS: true,

  // DUTY_INTERVAL_SEC
  //   Role: Length of duty-cycle reporting window in seconds.
  //   Critical: 300–86400 s (error if <300 or >86400).
  //   Recommended: 3600 s (hourly reporting).
  DUTY_INTERVAL_SEC: 3600,

  // DUTY_LOG_EVERY_INTERVAL
  //   Role: Whether to log duty-cycle at every interval.
  //   Critical: Boolean only.
  //   Recommended: true; overhead is small.
  DUTY_LOG_EVERY_INTERVAL: true,

  // DAILY_SUMMARY_HOUR
  //   Role: Wall-clock hour (0–23) when daily summary should be emitted.
  //   Critical: 0–23 inclusive.
  //   Recommended: Early morning low-activity window, e.g. 4–7; 7 is acceptable.
  DAILY_SUMMARY_HOUR: 7,

  // DAILY_SUMMARY_ENABLED
  //   Role: Master switch for daily summary generation.
  //   Critical: Boolean only.
  //   Recommended: true for long-running systems with logging.
  DAILY_SUMMARY_ENABLED: true,

  // SENSOR_NO_READING_SEC
  //   Role: Timeout for receiving no readings from a sensor.
  //   Critical: 5–120 s (error if <5 or >120).
  //   Recommended: 20–60 s; 30 s is a good mid-point.
  SENSOR_NO_READING_SEC: 30,

  // SENSOR_STUCK_SEC
  //   Role: Time window for flagging a sensor as "stuck" if value does not change.
  //   Critical: 60–3600 s (error if <60 or >3600).
  //   Recommended: ~300 s (5 min) for a drinks fridge.
  SENSOR_STUCK_SEC: 300,

  // SENSOR_STUCK_EPSILON_C
  //   Role: Maximum absolute delta (°C) still treated as "no change".
  //   Critical: >0 and ≤0.5 °C (error if ≤0 or >0.5).
  //   Recommended: 0.05–0.1 °C; 0.05 °C is precise but realistic.
  SENSOR_STUCK_EPSILON_C: 0.05,

  // SENSOR_CRITICAL_FAILURE_SEC
  //   Role: Time from initial sensor failure until escalation to critical.
  //   Critical: 60–3600 s (error if <60 or >3600).
  //   Recommended: ~600 s (10 min) to avoid flapping.
  SENSOR_CRITICAL_FAILURE_SEC: 600,

  // HIGH_TEMP_INSTANT_THRESHOLD_C
  //   Role: Instant high-temperature alarm threshold in °C.
  //   Critical: 5–20 °C (error if <5 or >20).
  //   Recommended: 10 °C for a drinks fridge (well above normal range).
  HIGH_TEMP_INSTANT_THRESHOLD_C: 10.0,

  // HIGH_TEMP_INSTANT_DELAY_SEC
  //   Role: Time above instant threshold before raising an instant alert.
  //   Critical: 60–900 s (error if <60 or >900).
  //   Recommended: 180–300 s to filter door openings and short warm pulses.
  HIGH_TEMP_INSTANT_DELAY_SEC: 180,

  // HIGH_TEMP_SUSTAINED_THRESHOLD_C
  //   Role: Sustained high-temperature alarm threshold in °C.
  //   Critical: 5–20 °C (error if <5 or >20); usually equal to instant threshold.
  //   Recommended: 10 °C for a drinks fridge.
  HIGH_TEMP_SUSTAINED_THRESHOLD_C: 10.0,

  // HIGH_TEMP_SUSTAINED_DELAY_SEC
  //   Role: Time above sustained threshold before raising a sustained alert.
  //   Critical: 300–3600 s (error if <300 or >3600).
  //   Recommended: 600–1200 s for long-fault detection.
  HIGH_TEMP_SUSTAINED_DELAY_SEC: 600,

  // ADAPTIVE_HIGH_DUTY_PCT / ADAPTIVE_LOW_DUTY_PCT / ADAPTIVE_MAX_SHIFT_C
  //   Role: Duty-cycle-based adaptive hysteresis configuration.
  //   Critical:
  //     ADAPTIVE_LOW_DUTY_PCT: 0–100%.
  //     ADAPTIVE_HIGH_DUTY_PCT: 0–100% and > ADAPTIVE_LOW_DUTY_PCT.
  //     ADAPTIVE_MAX_SHIFT_C: 0.1–1.0 °C.
  //   Recommended:
  //     ADAPTIVE_LOW_DUTY_PCT = 30%, ADAPTIVE_HIGH_DUTY_PCT = 70%, MAX_SHIFT = 0.5 °C.
  ADAPTIVE_HIGH_DUTY_PCT: 70,
  ADAPTIVE_LOW_DUTY_PCT: 30,
  ADAPTIVE_MAX_SHIFT_C: 0.5,
  ADAPTIVE_MIN_SHIFT_C: 0,
  ADAPTIVE_SHIFT_STEP_C: 0.1,

  // WATCHDOG_TIMEOUT_SEC
  //   Role: Maximum allowed time between healthy loop iterations.
  //   Critical: 5–120 s (error if <5 or >120).
  //   Recommended: 30 s; good balance between responsiveness and noise.
  WATCHDOG_TIMEOUT_SEC: 30,

  // PERF_LOG_INTERVAL_SEC
  //   Role: Interval (s) at which performance stats are logged.
  //   Critical: 60–86400 s (error if <60 or >86400).
  //   Recommended: 3600 s (hourly).
  PERF_LOG_INTERVAL_SEC: 3600,

  // PERF_SLOW_LOOP_THRESHOLD_MS
  //   Role: Loop execution time (ms) above which a loop is counted as "slow".
  //   Critical: 50–2000 ms (error if <50 or >2000).
  //   Recommended: 200–300 ms for a 5 s loop period.
  PERF_SLOW_LOOP_THRESHOLD_MS: 250,

  // PERF_WARN_SLOW_LOOPS
  //   Role: Whether to emit warnings for slow loops.
  //   Critical: Boolean only.
  //   Recommended: false on constrained devices to avoid log spam.
  PERF_WARN_SLOW_LOOPS: false,

  // SLACK_ENABLED
  //   Role: Master switch for Slack notifications.
  //   Critical: Boolean only.
  //   Recommended: true when remote monitoring is desired.
  SLACK_ENABLED: true,

  // SLACK_LOG_LEVEL
  //   Role: Minimum log severity sent to Slack (0=DEBUG..3=CRITICAL).
  //   Critical: Must be one of the LOG_LEVELS values.
  //   Recommended: 1 (INFO) for production; 2 (WARNING) if noise-sensitive.
  SLACK_LOG_LEVEL: 1,

  // SLACK_WEBHOOK_KEY
  //   Role: KVS key name where the Slack webhook URL is stored.
  //   Critical: Non-empty string when SLACK_ENABLED = true.
  //   Recommended: Stable key name; "slack_webhook" is clear and explicit.
  SLACK_WEBHOOK_KEY: 'slack_webhook',

  // SLACK_INTERVAL_SEC
  //   Role: Minimum interval (s) between Slack messages.
  //   Critical: ≥1 s (error if <1).
  //   Recommended: 10–60 s to avoid rate limiting and bursts; 30 s is conservative.
  SLACK_INTERVAL_SEC: 30,

  // SLACK_BUFFER_SIZE
  //   Role: Maximum number of buffered Slack messages.
  //   Critical: 1–100 (error if ≤0 or >100).
  //   Recommended: 10–30; 10 is conservative for Shelly RAM.
  SLACK_BUFFER_SIZE: 10,

  // SLACK_RETRY_DELAY_SEC
  //   Role: Delay (s) before retrying a failed Slack send.
  //   Critical: 5–600 s (error if <5 or >600).
  //   Recommended: 30–60 s; 30 s is a reasonable default.
  SLACK_RETRY_DELAY_SEC: 30,

  // CONSOLE_ENABLED
  //   Role: Master switch for Console logging.
  //   Critical: Boolean only.
  //   Recommended: true (essential for debugging).
  CONSOLE_ENABLED: true,

  // CONSOLE_LOG_LEVEL
  //   Role: Minimum log severity sent to Console (0=DEBUG..3=CRITICAL).
  //   Critical: Must be one of the LOG_LEVELS values.
  //   Recommended: 1 (INFO) for normal operation.
  CONSOLE_LOG_LEVEL: 0,

  // CONSOLE_BUFFER_SIZE
  //   Role: Maximum number of queued console log messages.
  //   Critical: 50–500 (avoid >1000 on small devices).
  //   Recommended: 100–200; 150 is a reasonable compromise.
  CONSOLE_BUFFER_SIZE: 50,

  // CONSOLE_INTERVAL_MS
  //   Role: Interval between draining queued console logs in ms.
  //   Critical: 10–200 ms (error if <10 or >200).
  //   Recommended: 50–100 ms; 50 ms is responsive without being noisy.
  CONSOLE_INTERVAL_MS: 50,

  // GLOBAL_LOG_LEVEL
  //   Role: Current master log verbosity (0=DEBUG..3=CRITICAL).
  //   Acts as a floor; sinks cannot log below their own minLevel, but this controls internal logic.
  //   Critical: Must match one of the LOG_LEVELS values.
  //   Recommended: 1 (INFO) for normal operation, 0 (DEBUG) only during tuning.
  GLOBAL_LOG_LEVEL: 0,

  // GLOBAL_LOG_AUTO_DEMOTE_HOURS
  //   Role: Hours after which log level can auto-demote (e.g. DEBUG → INFO).
  //   Critical: 1–720 h (error if <1 or >720).
  //   Recommended: 24 h; resets debug verbosity after a day.
  GLOBAL_LOG_AUTO_DEMOTE_HOURS: 24,
};

// ─────────────────────────────────────────────────────────────
// APPLICATION CONSTANTS
//   Internal engine constants that should rarely change,
//   unless porting or doing low-level tuning.
// ─────────────────────────────────────────────────────────────

export const APP_CONSTANTS: Readonly<FridgeAppConstants> = {
  // LOG_LEVELS
  //   Role: Canonical mapping of log level names to numeric codes.
  //   Critical: Values must be distinct; LOG_LEVEL / SLACK_LOG_LEVEL must use these.
  //   Recommended: DEBUG=0, INFO=1, WARNING=2, CRITICAL=3 (standard convention).
  LOG_LEVELS: {
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    CRITICAL: 3,
  },

  // RELAY_RESPONSE_TIMEOUT_SEC
  //   Role: Maximum time to wait for relay state-change confirmation.
  //   Critical: 0.5–10 s (error if <0.5 or >10).
  //   Recommended: 1–3 s; 2 s is a robust middle ground.
  RELAY_RESPONSE_TIMEOUT_SEC: 2,

  // MAX_CONSECUTIVE_ERRORS
  //   Role: Number of consecutive errors before treating the situation as critical.
  //   Critical: 1–20 (error if <1 or >20).
  //   Recommended: 3–5; 3 is conservative for safety.
  MAX_CONSECUTIVE_ERRORS: 3,

  // ═══════════════════════════════════════════════════════════════
  // VALIDATION CONSTANTS
  // ═══════════════════════════════════════════════════════════════

  // MIN_TOTAL_CYCLE_TIME_SEC
  //   Role: Minimum required sum of MIN_ON + MIN_OFF for safe compressor cycling.
  //   Critical: 240 s (4 minutes) minimum to prevent rapid cycling damage.
  //   Recommended: Do not change unless compressor specs explicitly allow shorter cycles.
  MIN_TOTAL_CYCLE_TIME_SEC: 240,

  // MIN_FREEZE_GAP_WARNING_C
  //   Role: Minimum gap (°C) between FREEZE_PROTECTION_ON and OFF thresholds to avoid warning.
  //   Critical: Not a hard error, but gaps < 3°C may cause frequent lock/unlock cycles.
  //   Recommended: 5°C+ for stability; 3°C is minimum acceptable.
  MIN_FREEZE_GAP_WARNING_C: 3.0,

  // MIN_CONTROL_LOOPS_PER_OFF
  //   Role: Minimum control loop iterations during MIN_OFF period.
  //   Critical: At least 3 loops needed for responsive control and stable state management.
  //   Recommended: Do not change; fundamental to control loop responsiveness.
  MIN_CONTROL_LOOPS_PER_OFF: 3,

  // MIN_SENSOR_EPSILON_C
  //   Role: Minimum allowable SENSOR_STUCK_EPSILON_C value (°C) for stuck sensor detection.
  //   Critical: 0.0001°C minimum; smaller values may cause false positives from sensor noise.
  //   Recommended: Do not change; based on DS18B20 sensor resolution (0.0625°C).
  MIN_SENSOR_EPSILON_C: 0.0001,

  // ═══════════════════════════════════════════════════════════════
  // HARDWARE CONSTANTS
  // ═══════════════════════════════════════════════════════════════

  // RELAY_ID
  //   Role: Primary relay ID on Shelly device.
  //   Critical: Shelly Plus 1/1PM has a single relay at index 0.
  //   Recommended: Do not change unless using different hardware with multiple relays.
  RELAY_ID: 0,

  // COMPONENT_SWITCH
  //   Role: Shelly API component type for switch/relay control.
  //   Critical: Must match Shelly Gen2 RPC API component naming ('switch').
  //   Recommended: Do not change unless porting to different hardware platform.
  COMPONENT_SWITCH: 'switch',

  // METHOD_SWITCH_SET
  //   Role: Shelly RPC method name for setting relay state.
  //   Critical: Must match Shelly Gen2 RPC API method ('Switch.Set').
  //   Recommended: Do not change unless porting to different hardware platform.
  METHOD_SWITCH_SET: 'Switch.Set',

  // INITIAL_LOOP_TIME_MIN
  //   Role: Initial value for loopTimeMin in performance metrics.
  //   Critical: Must be Infinity so first loop correctly sets the minimum.
  //   Recommended: Do not change; Infinity ensures first loop always updates.
  INITIAL_LOOP_TIME_MIN: Infinity,
};

// ─────────────────────────────────────────────────────────────
// COMBINED CONFIG (DEFAULT EXPORT)
//   Merges user config and app constants for backward compatibility
// ─────────────────────────────────────────────────────────────


const CONFIG: FridgeConfig = Object.assign({}, APP_CONSTANTS, USER_CONFIG) as FridgeConfig;

export default CONFIG;
