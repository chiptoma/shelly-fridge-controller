# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2024-12-18

### Added
- Smart KVS sync with retry logic and boot reliability improvements
- Comprehensive documentation audit with API corrections
- MQTT payload schema stability test for Home Assistant integration
- Bundle size check script (`npm run check:bundle-size`)
- TypeScript type checking for tools (`npm run typecheck:tools`)
- Multi-fault boot recovery tests
- Security section in CLAUDE.md

### Changed
- Normalized comment style across codebase
- Improved eslint directives with JSDoc description enforcement
- Updated adaptive hysteresis to prevent tightening when system is struggling
- Increased bundle size limit to 32KB

### Fixed
- Config field name corrections in documentation
- KVS callback parameter handling
- Cron scheduling edge cases

### Removed
- Deprecated @mutates/@sideeffect JSDoc tags
- Dead code in build pipeline

## [1.0.0] - 2024-12-01

### Added
- Initial release of Shelly Fridge Controller
- Core thermostat control with hysteresis
- Adaptive hysteresis based on cycle metrics
- Turbo mode for rapid cooling
- Door detection via temperature rise rate
- Dynamic and scheduled defrost management
- Limp mode for sensor failure recovery
- Compressor protection (min ON/OFF times, max run, freeze cut)
- Relay weld detection
- Ghost run and locked rotor detection
- MQTT status publishing and command handling
- KVS persistence for config and state
- Comprehensive test suite (800+ tests)
- Deploy tooling with health checks
