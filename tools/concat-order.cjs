// ==============================================================================
// * CONCATENATION ORDER
// ? Defines the exact order for concatenating source files.
// ? Order MUST respect dependency hierarchy - later files may depend on earlier ones.
// ? ES module imports/exports are stripped during concatenation.
// ==============================================================================

module.exports = [
  // Tier 0: Pure data (no dependencies)
  'src/constants.js',

  // Tier 1: Configuration (depends on nothing)
  'src/config.js',

  // Tier 2: Pure utilities (no dependencies)
  // ? object.js and format.js inlined into kvs.js and reporting.js respectively
  'src/utils/math.js',
  'src/utils/kvs.js',

  // Tier 3: State (depends on constants, config)
  'src/state.js',

  // Tier 4: Sensors (depends on math, state)
  'src/sensors.js',

  // Tier 5: Alarms (depends on constants, state, config)
  'src/alarms.js',

  // Tier 6: Protection (depends on constants, state, config, alarms)
  'src/protection.js',

  // Tier 7: Features (depends on all above)
  'src/features.js',

  // Tier 8: Metrics (depends on state, config)
  'src/metrics.js',

  // Tier 9: Reporting (depends on state, config, constants, metrics, features)
  'src/reporting.js',

  // Tier 10: Control (depends on constants, state, config, protection, features, metrics)
  'src/control.js',

  // Tier 11: Loop (depends on everything)
  'src/loop.js',

  // Tier 12: MQTT (depends on constants, config, state)
  'src/mqtt.js',

  // Tier 13: Entry point (depends on everything)
  'src/main.js',
]
