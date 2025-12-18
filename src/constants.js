// ==============================================================================
// FRIDGE CONTROLLER CONSTANTS
// System status, reasons, alarms, and icons for the fridge controller.
// Pure data - no dependencies, no logic.
// ==============================================================================

// ----------------------------------------------------------
// STATUS CONSTANTS
// What state IS the system currently in?
// ----------------------------------------------------------

let ST = {
  BOOT: 'BOOT',             // System starting
  IDLE: 'IDLE',             // Compressor OFF, at target
  COOLING: 'COOLING',       // Compressor ON, cooling
  WANT_IDLE: 'WANT_IDLE',   // Wants OFF (blocked by timer/logic)
  WANT_COOL: 'WANT_COOL',   // Wants ON (blocked by timer/logic)
  LIMP_IDLE: 'LIMP_IDLE',   // Blind cycle OFF
  LIMP_COOL: 'LIMP_COOL',   // Blind cycle ON
  TURBO_COOL: 'TURBO_COOL', // Turbo Mode Active (Running)
  TURBO_IDLE: 'TURBO_IDLE',  // Turbo Mode Active (Idle)
}

// ----------------------------------------------------------
// REASON CONSTANTS
// Why can't we have the desired state?
// ----------------------------------------------------------

let RSN = {
  NONE: 'NONE',                   // No blocking reason
  PROT_MIN_ON: 'PROT_MIN_ON',     // Can't OFF - min run time
  PROT_MIN_OFF: 'PROT_MIN_OFF',   // Can't ON - min off time
  PROT_MAX_ON: 'PROT_MAX_ON',     // Forced OFF - max run exceeded
  PROT_AIR_FRZ: 'PROT_AIR_FRZ',   // Forced OFF - air too cold
  PROT_DOOR: 'PROT_DOOR_OPEN',    // Paused - door open
  DEFR_SCHED: 'DEFR_SCHED',       // Scheduled defrost
  DEFR_TRIG: 'DEFR_TRIG',         // Defrost just triggered
  DEFR_DYN: 'DEFR_DYN',            // Dynamic defrost active
}

// ----------------------------------------------------------
// ALARM CONSTANTS
// Critical issues requiring attention.
// ----------------------------------------------------------

let ALM = {
  NONE: 'NONE',
  WELD: 'ALARM_RELAY_WELD',       // Fatal: Relay welded
  LOCKED: 'ALARM_ROTOR_LOCKED',   // Fatal: Motor seized
  HIGH: 'ALARM_HIGH_TEMP',        // Critical: Temp high
  FAIL: 'ALARM_SENSOR_FAIL',      // Error: Sensor broken
  STUCK: 'ALARM_SENSOR_STUCK',    // Error: Sensor frozen
  GHOST: 'ALARM_COMP_GHOST',      // Warning: Motor trip (Recoverable)
  COOL: 'ALARM_COOLING_FAIL',      // Warning: Gas Leak / Valve Fail
}

// ----------------------------------------------------------
// STATUS ICONS
// Visual indicators for console/MQTT output.
// ----------------------------------------------------------

let ICO = {
  BOOT: '🔄',
  IDLE: '⚪',
  COOLING: '❄️',
  WANT_IDLE: '⏳',
  WANT_COOL: '⏳',
  LIMP_IDLE: '⚠️',
  LIMP_COOL: '⚠️',
  TURBO_COOL: '🚀',
  TURBO_IDLE: '🚀',
}

// ----------------------------------------------------------
// ADAPTIVE HYSTERESIS TUNING CONSTANTS
// Thresholds derived from refrigeration cycle dynamics.
// Based on typical compressor inrush stress and thermal mass.
// ----------------------------------------------------------

let ADAPT = {
  // Zone multipliers (relative to adapt_targetMinSec = 600s = 10min)
  //
  // DANGER_MULT = 1.5 → 15min
  //   Below this, compressor stress from frequent restarts is severe.
  //   Immediate action required - no confirmation needed.
  //
  // SHORT_MULT = 1.8 → 18min
  //   Below this, cycles are too short for efficiency.
  //   Widen hysteresis after trend confirmation.
  //
  // STABLE_PAD = 480s (8min) added to targetMaxSec (20min) → 28min
  //   Creates 10min deadband (18-28min) to prevent oscillation.
  //   Wider than typical (5min) due to thermal lag in refrigeration.

  DANGER_MULT: 1.5,           // Immediate widen threshold multiplier
  SHORT_MULT: 1.8,            // Trend-confirmed widen threshold
  STABLE_PAD_SEC: 480,        // Padding above targetMax for stable zone

  // Cycle count compensation thresholds
  //   HIGH_CYCLE_COUNT (5+/hour) → avg cycle < 12min, force widen
  //   LOW_CYCLE_COUNT (≤3/hour) → avg cycle > 20min, allow tighten
  //   These compensate for hourly averaging distortion at boundaries

  HIGH_CYCLE_COUNT: 5,        // Cycles/hour indicating short-cycling
  HIGH_CYCLE_MAX_SEC: 1200,   // 20min - if count high AND below this, danger
  LOW_CYCLE_COUNT: 3,         // Cycles/hour indicating long cycles
  LOW_CYCLE_MIN_SEC: 1500,    // 25min - if count low AND above this, tighten

  // Step sizes for hysteresis adjustment
  //   DANGER_STEP larger (0.3°C) for faster correction
  //   NORMAL_STEP smaller (0.2°C) for stable convergence

  DANGER_STEP_DEG: 0.3,       // Immediate correction step
  NORMAL_STEP_DEG: 0.2,       // Trend-confirmed step

  // Freeze protection margin
  //   Don't widen if lower band would approach freeze cut

  FREEZE_MARGIN_DEG: 0.3,     // Buffer above comp_freezeCutDeg
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export { ST, RSN, ALM, ICO, ADAPT }
