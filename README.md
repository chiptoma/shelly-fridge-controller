# Shelly Fridge Controller v4.0

Production-grade thermostat controller for Shelly Plus 1/1PM with comprehensive test coverage.

## 📊 Project Status

- ✅ **Test Coverage:** 97.35% (209 tests passing)
- ✅ **Modular Architecture:** 20+ source modules
- ✅ **Production Build:** Single minified script (17.98KB, ES5-compatible)
- ✅ **Shelly Compatible:** Ready for deployment

---

## 🏗️ Architecture

### Development Structure (Modular)
```
src/
├── core/                   # Core control logic
│   ├── thermostat.js      # Temperature decision logic
│   ├── freeze-protection.js # Evaporator freeze protection
│   ├── timing.js          # MIN_ON/MIN_OFF safety
│   └── smoothing.js       # Moving average filtering
├── sensors/
│   ├── reader.js          # Sensor data acquisition
│   └── monitor.js         # Failure detection
├── hardware/
│   └── relay.js           # Relay control abstraction
├── monitoring/
│   ├── duty-cycle.js      # Runtime tracking
│   ├── alerts.js          # High temp alerts
│   └── daily-summary.js   # Daily statistics
├── logging/
│   └── logger.js          # Logging engine
├── config/
│   └── validator.js       # Configuration validation
├── state/
│   └── state-manager.js   # State initialization
├── utils/
│   ├── time.js            # Time utilities
│   └── formatter.js       # Temperature formatting
├── config.js              # Configuration constants
└── main.js                # Entry point (orchestration)
```

### Production Output
- **script.js** - Single minified file (17.98KB) for Shelly deployment (ES5-compatible, no arrow functions or destructuring)
- **script.dev.js** - Readable version for debugging

---

## 🚀 Quick Start

### Prerequisites
```bash
# Node.js 14+ required
node --version  # Should be >= 14.0.0
```

### Installation
```bash
# Install dependencies
npm install
```

### Development
```bash
# Run tests
npm test

# Watch mode (auto-run on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Building for Production
```bash
# Run tests + build + validate
npm run build

# Build only (skip tests)
npm run build:fast

# Build readable version
npm run build:dev
```

### Deployment to Shelly
1. Build production script: `npm run build`
2. Open Shelly web interface (http://shelly-ip)
3. Navigate to: **Scripts** → **Add Script**
4. Paste contents of `script.js`
5. Click **Save** and **Enable**

---

## 🧪 Testing

### Test Suite Structure
```
__tests__/
├── unit/                           # Unit tests (143 tests)
│   ├── thermostat.test.js         # 18 tests - Decision logic
│   ├── freeze-protection.test.js  # 23 tests - Freeze protection
│   ├── timing.test.js             # 18 tests - Safety timing
│   ├── smoothing.test.js          # 12 tests - Moving average
│   ├── sensor-monitoring.test.js  # 16 tests - Sensor health
│   ├── config-validation.test.js  # 14 tests - Config validation
│   ├── duty-cycle.test.js         # 10 tests - Duty tracking
│   ├── alerts.test.js             # 8 tests - High temp alerts
│   ├── relay.test.js              # 6 tests - Relay control
│   ├── utils.test.js              # 13 tests - Utilities
│   ├── daily-summary.test.js      # 11 tests - Daily stats
│   ├── logger.test.js             # 13 tests - Logging
│   ├── reader.test.js             # 10 tests - Sensor reading
│   └── state-manager.test.js      # 11 tests - State management
└── edge-cases/                     # Edge case tests (26 tests)
    └── edge-cases.test.js         # Boundary conditions
```

### Running Tests
```bash
# All tests
npm test

# Specific test file
npm test -- thermostat

# Coverage report (HTML)
npm run test:coverage
open coverage/index.html

# CI mode (text output)
npm run test:ci
```

### Test Coverage
```
File                   | % Stmts | % Branch | % Funcs | % Lines
-----------------------|---------|----------|---------|--------
All files              |   97.35 |    95.49 |   94.87 |   97.27
 src/core              |     100 |      100 |     100 |     100
 src/sensors           |     100 |      100 |     100 |     100
 src/monitoring        |   96.59 |    86.36 |     100 |   96.59
 src/config            |     100 |      100 |     100 |     100
 src/logging           |     100 |      100 |     100 |     100
 src/utils             |     100 |      100 |     100 |     100
```

---

## 📋 NPM Scripts

| Script | Description |
|--------|-------------|
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:ci` | Run tests for CI (text output) |
| `npm run build` | Full build (test + bundle + validate) |
| `npm run build:fast` | Quick build (skip tests) |
| `npm run build:dev` | Build readable version |
| `npm run validate` | Validate built script |
| `npm run clean` | Remove build artifacts |

---

## ⚙️ Configuration

Edit `src/config.js` to customize controller behavior:

### Critical Settings
```javascript
// Thermostat
SETPOINT: 4.0,           // Target temperature (C)
HYSTERESIS: 1.0,         // Temperature tolerance (+/- C)

// Safety
MIN_ON: 90,              // Min compressor ON time (sec)
MIN_OFF: 300,            // Min compressor OFF time (sec)

// Freeze Protection
FREEZE_OFF: -18.0,       // Engage freeze lock (C)
FREEZE_ON: -5.0,         // Release freeze lock (C)
```

### Feature Flags
```javascript
FEATURE_DUTY_CYCLE: true,
FEATURE_DAILY_SUMMARY: true,
FEATURE_SENSOR_FAILURE: true,
FEATURE_HIGH_TEMP_ALERTS: true,
FEATURE_ADAPTIVE_HYSTERESIS: true,
FEATURE_WATCHDOG: true,
FEATURE_PERFORMANCE_METRICS: true,
```

---

## 🔬 Code Quality

### Static Analysis
- **Modular design:** 20+ testable modules
- **Pure functions:** Core logic is side-effect free
- **Dependency injection:** All hardware dependencies injectable
- **Comprehensive validation:** Config validation on startup

### Test Quality
- **AAA pattern:** All tests follow Arrange-Act-Assert
- **Isolated:** Tests are independent (no shared state)
- **Fast:** Full suite runs in < 1 second
- **Deterministic:** No flaky tests, no real timers

---

## 📦 Build Process

```
Development Files (src/)
        ↓
    esbuild (bundle + minify → IIFE)
        ↓
    unwrap-bundle.js (remove outer IIFE wrapper)
        ↓
    script.js (17.98KB)
        ↓
    Validation Check
        ↓
    Ready for Shelly
```

### Build Configuration
The build pipeline ensures Shelly compatibility:
1. **esbuild bundling**: Combines all modules with `--format=iife` and `--platform=node`
2. **Arrow function transpilation**: `--supported:arrow=false` converts all arrow functions to regular functions
3. **Template literal transpilation**: `--supported:template-literal=false` prevents template literal optimization
4. **Destructuring elimination**: Source code manually rewritten to avoid ES6 destructuring (esbuild cannot transpile this)
5. **IIFE unwrapping**: Custom post-processor removes the outer `(function(){...})()` wrapper that Shelly doesn't support
6. **UTF-8 preservation**: `--charset=utf8` preserves emoji characters instead of converting to ES6 Unicode escapes
7. **Internal module loader**: esbuild's CommonJS compatibility layer remains (valid JavaScript that executes in Shelly)
8. **ES2015 target**: Modern JavaScript features transpiled to Shelly-compatible syntax
9. **Minification**: Optimal size (17.98KB, well under 100KB limit)

### Build Output Validation
The build process automatically validates:
- ✅ Single file output
- ✅ No unresolved imports/exports
- ✅ File size < 100KB (Shelly limit)
- ✅ No syntax errors
- ✅ Contains Shelly API calls
- ✅ Timer initialization present

---

## 🐛 Troubleshooting

### Tests Failing
```bash
# Clear cache and reinstall
rm -rf node_modules coverage
npm install
npm test
```

### Build Issues
```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

### Coverage Below 90%
```bash
# Check coverage report
npm run test:coverage
open coverage/index.html
# Look for uncovered lines and add tests
```

---

## 📝 Development Workflow

### Adding a New Feature
1. Write failing test first (TDD)
2. Implement feature in appropriate module
3. Ensure tests pass: `npm test`
4. Check coverage: `npm run test:coverage`
5. Build: `npm run build`
6. Deploy `script.js` to Shelly

### Making Changes
```bash
# 1. Run tests in watch mode
npm run test:watch

# 2. Edit code (tests auto-run)
vim src/core/thermostat.js

# 3. When done, verify full suite
npm test

# 4. Build for deployment
npm run build
```

---

## 🔐 Safety Features

### Compressor Protection
- **MIN_ON:** Prevents rapid cycling (90s minimum)
- **MIN_OFF:** Ensures rest period (300s minimum)

### Freeze Protection
- **Auto-lock:** Disables compressor at -18°C
- **Recovery delay:** 10-minute safety period
- **Hysteresis:** Prevents oscillation

### Sensor Monitoring
- **Failure detection:** Alerts on sensor offline (30s)
- **Stuck detection:** Detects frozen sensors (5min)
- **Critical escalation:** Emergency mode (10min)
- **Safe mode:** Holds relay state on air sensor failure

### High Temperature Alerts
- **Instant:** Alerts if temp >10°C for 3 minutes
- **Sustained:** Alerts if temp >10°C for 10 minutes

---

## 📊 Monitoring

### Duty Cycle Tracking
- **Interval:** 1 hour
- **Metrics:** ON time, OFF time, duty %
- **Adaptive:** Auto-adjusts hysteresis based on duty

### Daily Summary
- **Schedule:** 7:00 AM
- **Stats:** Runtime, temps (min/max/avg), events

### Performance Metrics
- **Loop timing:** Execution speed monitoring
- **Slow loop detection:** Warnings if >250ms

---

## 🤝 Contributing

### Code Style
- Use pure functions when possible
- Inject dependencies (don't use globals)
- Write tests before code (TDD)
- Keep functions small (< 50 lines)
- Add JSDoc comments

### Pull Request Checklist
- [ ] All tests pass (`npm test`)
- [ ] Coverage ≥ 90% (`npm run test:coverage`)
- [ ] Build succeeds (`npm run build`)
- [ ] No lint errors
- [ ] Documentation updated

---

## 📄 License

MIT

---

## 🙏 Acknowledgments

Built with:
- **Jest** - Testing framework
- **esbuild** - Fast bundler
- **Shelly Plus 1/1PM** - IoT hardware platform

---

**Last Updated:** 2025-11-16
**Version:** 4.0.0
**Test Coverage:** 97.35%
**Tests:** 209 passing
