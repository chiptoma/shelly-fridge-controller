#!/usr/bin/env node
// ==============================================================================
// * MINIFICATION TOOL
// ? Minifies bundle.js using Terser with Shelly-optimized settings.
// ? Output: dist/main.js (production-ready)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// ----------------------------------------------------------
// * CONFIGURATION
// ----------------------------------------------------------
const ROOT = path.join(__dirname, '..');
const INPUT = path.join(ROOT, 'dist', 'bundle.js');
const OUTPUT = path.join(ROOT, 'dist', 'main.js');

// Terser options - Shelly-safe settings
// ? Note: Disabled unsafe options that can break Shelly's mJS engine
// ? Multiple profiles are provided for experimentation; switch by changing
// ? the TERSER_OPTIONS assignment near the bottom of this block.

// Profile A – SAFE (current behaviour, no top-level mangling)
const TERSER_OPTIONS_SAFE = {
  ecma: 5,
  compress: {
    passes: 3,
    pure_getters: true,
    unsafe: false,           // ! Disabled - can break code patterns
    unsafe_comps: false,     // ! Disabled - comparison optimizations
    unsafe_math: false,      // ! Disabled - math optimizations
    unsafe_proto: false,     // ! Disabled - prototype optimizations
    booleans_as_integers: false,
    drop_console: false,
    drop_debugger: true,
    evaluate: true,
    hoist_funs: true,
    hoist_vars: false,
    if_return: true,
    join_vars: true,
    loops: true,
    negate_iife: false,      // ! Disabled - IIFE negation breaks mJS
    properties: true,
    reduce_vars: true,
    sequences: true,         // ? Re-enabled - helps memory, not the error source
    side_effects: true,
    toplevel: true,
    unused: true
  },
  mangle: {
    toplevel: false,
    properties: false
    // ! CRITICAL: Don't mangle top-level declarations.
    // ! Shelly mJS has a scoping bug where callback parameters leak and shadow
    // ! outer-scope variables. By keeping top-level names (like math functions r1, r2, ri)
    // ! unchanged, minified callback params (a, b, c) can't shadow them.
  },
  output: {
    comments: false,
    beautify: false,
    semicolons: true
  }
};

// Profile B – BALANCED (toplevel mangling with reserved helper names)
const TERSER_OPTIONS_BALANCED = {
  ...TERSER_OPTIONS_SAFE,
  mangle: {
    toplevel: true,
    properties: false,
    reserved: [
      // ─────────────────────────────────────────────────────────────
      // ! CRITICAL: mJS SCOPE LEAKAGE PREVENTION
      // !
      // ! Shelly's mJS engine has broken scoping where:
      // ! 1. Callback parameters leak into outer scopes
      // ! 2. Named callback functions shadow outer functions
      // ! 3. Single-letter minified names collide with callback params
      // !
      // ! ANY function called from Timer.set or Shelly.call callbacks
      // ! must be reserved to prevent collision with callback params.
      // ─────────────────────────────────────────────────────────────

      // ! SINGLE-LETTER BAN: Terser extracts constants (ST.IDLE → t = "IDLE")
      // ! which then collide with callback parameters. Banning single-letter
      // ! names forces Terser to use longer names that don't collide.
      // ! Cost: ~2.5 KB larger bundle (29.5 KB vs 27 KB)
      // ! Alternative (reduce_vars: false): 32.3 KB and causes OOM
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      '_',

      // Math helpers (used everywhere)
      'ri', 'r1', 'r2', 'r3', 'nowSec', 'formatXmYs', 'getMedian3', 'calcEMA',

      // KVS functions (called from async callbacks with params t,e,s,a)
      'pickKeys', 'loadChunksSeq', 'syncToKvs', 'saveAllToKvs', 'chunkNeedsSync',

      // Config functions (minified to t,e which collide with callback params)
      'validateNumber', 'validateConfig', 'loadConfig', 'persistConfig',

      // State functions (minified to s,a which are common callback params)
      'persistState', 'isTimestampInvalid', 'loadState',
      'sanitizeLoadedState', 'sanitizeTimestamps', 'sanitizeStats', 'sanitizeFaults',

      // Alarm functions (n = recordFault, Timer callback named 'n' shadows it)
      'recordFault', 'getSeverity', 'formatFaultDetail', 'processAlarmEdges',
      'clearNonFatalAlarms', 'applySensorAlarms', 'checkHighTempAlarm',

      // Sensor functions (r = checkSensorStuck, used as callback param)
      'checkSensorStuck', 'handleSensorError', 'handleSensorRecovery',
      'processSensorData', 'validateSensorReadings', 'resetSensorError',

      // Control functions (c = setRelay, called from callbacks)
      'setRelay', 'setIdleState', 'evaluateThermostat',
      'determineMode', 'executeSwitchDecision',

      // Protection functions (called from main loop callbacks)
      'canTurnOn', 'canTurnOff', 'getTimeUntilOnAllowed', 'getTimeUntilOffAllowed',
      'isMaxRunExceeded', 'isFreezeProtectionActive',
      'checkWeldDetection', 'checkCoolingHealth', 'checkLockedRotor',
      'checkGhostRun', 'resetGhostCount',

      // Metrics functions (called from hourly rollover callback)
      'updateRuntimeStats', 'incrementCycleCount', 'isHourlyRolloverDue',
      'processHourlyRollover', 'getAvgDuty24h', 'getCurrentHourDuty',
      'getCurrentHourAverages', 'getLifetimeDuty', 'getLifetimeRunHours', 'updateMetrics',

      // Features functions (called from main loop)
      'getEffectiveHysteresis', 'adaptHysteresis', 'checkTurboSwitch',
      'handleTurboMode', 'detectDoorOpen', 'isDoorPauseActive',
      'isScheduledDefrost', 'checkDefrostTrigger', 'handleDynamicDefrost', 'handleLimpMode',

      // Loop functions (f = mainLoopTick, Timer.set callback)
      'mainLoopTick', 'startMainLoop', 'stopMainLoop', 'isLoopRunning',

      // MQTT functions (d = handleMqttMessage, MQTT.subscribe callback)
      'handleMqttMessage', 'setupMqttCommands',
      'handleTurbo', 'handleTurboOff', 'handleStatus', 'handleResetAlarms', 'handleSetpoint',

      // Reporting functions
      'getScriptUptime', 'formatConsoleMessage', 'buildMqttPayload', 'publishStatus',

      // Main/boot functions
      'recoverBootState', 'initialize',

      // Loop callback variables (local vars that must stay unique)
      'tEvap', 'tAirRaw', 'tAirMedian', 'swWatts', 'swTemp', 'swStatus',
      'airStuck', 'evapStuck', 'alarmBefore', 'alarmAfter', 'isLimp',
      'mode', 'switchResult', 'isFatal', 'isDeepDefrost', 'runDur',
    ],
  },
}

// Profile C – AGGRESSIVE (unsafe optimisations; for experiments only)
const TERSER_OPTIONS_AGGRESSIVE = {
  ...TERSER_OPTIONS_BALANCED,
  compress: {
    ...TERSER_OPTIONS_BALANCED.compress,
    unsafe: true,
    unsafe_comps: true,
    unsafe_math: true,
    unsafe_proto: true,
    negate_iife: true,
  },
}

// Choose one profile for this build
const TERSER_OPTIONS = TERSER_OPTIONS_BALANCED
// const TERSER_OPTIONS = TERSER_OPTIONS_SAFE  // ! OOM - bundle too large
// const TERSER_OPTIONS = TERSER_OPTIONS_AGGRESSIVE

// ----------------------------------------------------------
// * MAIN
// ----------------------------------------------------------
async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error('Input file not found: dist/bundle.js');
    console.error('Run "npm run build:concat" first.');
    process.exit(1);
  }

  const input = fs.readFileSync(INPUT, 'utf-8');
  console.log('Input size: ' + input.length + ' bytes');

  try {
    const result = await minify(input, TERSER_OPTIONS);

    if (result.error) {
      console.error('Terser error:', result.error);
      process.exit(1);
    }

    fs.writeFileSync(OUTPUT, result.code);
    console.log('Output size: ' + result.code.length + ' bytes');
    console.log('Compression: ' + ((1 - result.code.length / input.length) * 100).toFixed(1) + '%');
    console.log('Minified -> dist/main.js');
  } catch (err) {
    console.error('Minification failed:', err);
    process.exit(1);
  }
}

main();
