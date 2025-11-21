# Safety Gaps & Missing Features - Detailed Analysis

**Document Version:** 1.0
**Audit Date:** 2025-11-21
**Auditor:** Senior Embedded Systems Engineer / IoT Architect
**Related Document:** `FRIDGE_LOGIC_AUDIT.md`

---

## Executive Summary

This document provides detailed analysis of safety gaps and missing features identified during the deep contextual audit of the Shelly fridge controller codebase. Each item includes:

- Problem description and real-world scenarios
- Physical damage risks
- Proposed configuration parameters
- Implementation sketches
- Integration guidance

### Priority Matrix

| Priority | Feature | Category | Risk Level | Implementation Effort |
|----------|---------|----------|------------|----------------------|
| **P0** | Compressor Overrun Protection | CORE SAFETY | HIGH | Medium |
| **P1** | Welded Contact Detection | CORE SAFETY | MEDIUM-HIGH | Medium |
| **P2** | Scheduled Defrost Cycles | Feature | LOW-MEDIUM | Low |
| **P3** | Door Open Detection | Feature | LOW | Low |
| **P3** | Startup Delay | Feature | LOW | Low |

---

## 1. Compressor Overrun Protection (MAX_RUN_TIME)

### Classification

- **Category:** CORE SAFETY FEATURE
- **Risk Level:** HIGH
- **Priority:** P0 - Must fix before critical deployments
- **Current State:** NOT IMPLEMENTED

### Problem Description

The current codebase enforces MIN_ON (180s) to ensure the compressor runs long enough for proper oil circulation, but has no protection against running too long. A compressor running continuously for 8+ hours indicates a serious problem that the system cannot self-correct.

#### Root Causes of Continuous Running

| Cause | Detection Possible | Notes |
|-------|-------------------|-------|
| Door left open | Yes (via door detection) | Continuous warm air ingress |
| Door seal failure | Partial | Slow leak, gradual performance loss |
| Refrigerant leak | No | Compressor works but no cooling effect |
| Setpoint too aggressive | Yes (user config) | Target temp unreachable for ambient |
| Compressor degradation | No | Mechanical wear, capacity loss |
| Evaporator completely iced | Yes (via evap sensor) | Airflow blocked, no heat transfer |
| Ambient too hot | No | Undersized for environment |

#### Physical Damage Risks

1. **Compressor Motor Burnout**
   - Motor windings overheat from continuous current draw
   - Insulation breakdown leads to short circuit
   - Result: Complete compressor failure requiring replacement

2. **Lubricating Oil Breakdown**
   - Oil viscosity decreases with sustained high temperature
   - Bearing surfaces lose protection
   - Result: Accelerated wear, eventual seizure

3. **Bearing Wear**
   - Continuous rotation without rest cycles
   - Heat buildup in bearing surfaces
   - Result: Increased friction, noise, eventual failure

4. **Energy Waste**
   - Compressor consuming power but not achieving cooling
   - Electricity costs with no benefit
   - Result: Financial loss, environmental impact

5. **Secondary Damage**
   - Overheated compressor can damage nearby components
   - Potential fire hazard in extreme cases
   - Result: Safety risk

### Real-World Failure Scenario

```
Timeline: User Misconfiguration Leading to Compressor Burnout

Hour 0:00
  - User sets SETPOINT_C = 2.0°C (too aggressive for warm garage, 30°C ambient)
  - System initializes normally
  - Air temp: 25°C
  - Compressor: ON

Hour 1:00
  - Air temp: 12°C (cooling, but slowly)
  - Compressor: ON (1 hour continuous)
  - Status: Normal operation

Hour 3:00
  - Air temp: 6°C (still above setpoint)
  - Compressor: ON (3 hours continuous)
  - Compressor motor temperature rising
  - Status: Warning signs appearing

Hour 6:00
  - Air temp: 4°C (still above 2°C setpoint)
  - Compressor: ON (6 hours continuous)
  - Motor very hot, oil thinning
  - Status: Damage accumulating

Hour 8:00
  - Air temp: 3.5°C (cannot reach 2°C)
  - Compressor: ON (8 hours continuous)
  - Motor windings overheating
  - Status: Critical - imminent failure

Hour 10:00
  - Compressor motor winding insulation fails
  - Short circuit occurs
  - Compressor stops permanently
  - Food begins warming
  - Result: $500+ repair, potential food loss
```

### Proposed Configuration

Add to `src/boot/config.ts` in USER_CONFIG:

```typescript
// ═══════════════════════════════════════════════════════════════
// MAX RUN PROTECTION
// Prevents compressor burnout from continuous operation
// ═══════════════════════════════════════════════════════════════

// FEATURE_MAX_RUN_PROTECTION
//   Role: Enable maximum continuous run time protection.
//   Critical: Boolean only; highly recommended for all installations.
//   Recommended: true; this is a critical safety mechanism.
FEATURE_MAX_RUN_PROTECTION: true,

// MAX_CONTINUOUS_RUN_SEC
//   Role: Maximum allowed continuous compressor runtime before forced rest.
//   Context: Domestic fridges typically cycle every 20-40 minutes. A compressor
//   running for hours indicates a problem the system cannot self-correct.
//   Critical: 3600-28800s (1-8 hours). Error if <3600s (too aggressive) or
//   >28800s (defeats purpose of protection).
//   Recommended:
//     - Domestic/drinks fridge: 7200s (2 hours)
//     - Commercial/walk-in: 14400s (4 hours)
//     - High-ambient/outdoor: 10800s (3 hours)
MAX_CONTINUOUS_RUN_SEC: 7200,

// MAX_RUN_REST_SEC
//   Role: Forced rest period after max run time exceeded.
//   Context: Gives compressor motor time to cool down and user time to
//   investigate. Should be long enough to provide real cooling but not
//   so long that food spoils.
//   Critical: 300-1800s (5-30 minutes). Error if <300s (insufficient cooling)
//   or >1800s (food safety risk).
//   Recommended: 600s (10 minutes); allows significant motor cooling while
//   keeping food safe.
MAX_RUN_REST_SEC: 600,

// MAX_RUN_REPEAT_ALERT_SEC
//   Role: Interval for repeating max run alert if condition persists.
//   Context: If the compressor hits max run protection repeatedly, the user
//   needs persistent notification that intervention is required.
//   Critical: 1800-7200s (30 min - 2 hours). Error if <1800s (too spammy)
//   or >7200s (user might miss it).
//   Recommended: 3600s (hourly); persistent but not overwhelming.
MAX_RUN_REPEAT_ALERT_SEC: 3600,
```

### State Requirements

Add to `src/system/state/types.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FEATURE_MAX_RUN_PROTECTION: COMPRESSOR OVERRUN PROTECTION
// Tracks continuous runtime and enforces rest periods to prevent
// compressor burnout from endless operation.
// ═══════════════════════════════════════════════════════════════

// When current continuous run started (0 if not running)
continuousRunStart: number;

// Timestamp when forced rest period ends (0 if not in forced rest)
forcedRestUntil: number;

// Has max run alert been fired for current overrun event?
maxRunAlertFired: boolean;

// When last max run alert was sent (for repeat alert timing)
lastMaxRunAlert: number;

// Total max run events since boot (for diagnostics)
maxRunCount: number;

// Total forced rest time accumulated today (for daily summary)
dayForcedRestSec: number;
```

### Implementation

Create `src/core/max-run-protection/max-run-protection.ts`:

```typescript
/**
 * Compressor maximum run time protection
 *
 * Prevents compressor burnout by enforcing maximum continuous run time
 * with mandatory rest periods.
 *
 * ## Business Context
 * A compressor running for hours without cycling indicates a problem:
 * - Door open or seal failure
 * - Refrigerant leak
 * - Setpoint unreachable for ambient conditions
 * - Equipment degradation
 *
 * This protection forces periodic rest to prevent motor burnout and
 * alert the user that intervention is needed.
 */

import type { MaxRunState, MaxRunConfig, MaxRunCheckResult } from './types';

/**
 * Check if max run protection should engage
 *
 * @param relayOn - Current relay state (true = compressor running)
 * @param now - Current timestamp in seconds
 * @param state - Max run protection state
 * @param config - Max run configuration
 * @returns Check result with force-off decision and alert info
 */
export function checkMaxRunProtection(
  relayOn: boolean,
  now: number,
  state: MaxRunState,
  config: MaxRunConfig
): MaxRunCheckResult {

  // ─────────────────────────────────────────────────────────────
  // FORCED REST PERIOD
  // If we're in a forced rest, keep compressor off until it ends
  // ─────────────────────────────────────────────────────────────

  if (state.forcedRestUntil > 0 && now < state.forcedRestUntil) {
    const remaining = state.forcedRestUntil - now;
    return {
      forceOff: true,
      reason: 'FORCED_REST',
      remainingSec: remaining,
      alertTriggered: false,
      repeatAlert: false
    };
  }

  // Clear forced rest if it has ended
  if (state.forcedRestUntil > 0 && now >= state.forcedRestUntil) {
    state.forcedRestUntil = 0;
    state.maxRunAlertFired = false; // Reset for next potential overrun
  }

  // ─────────────────────────────────────────────────────────────
  // TRACK RUN START
  // Record when compressor started running
  // ─────────────────────────────────────────────────────────────

  if (relayOn && state.continuousRunStart === 0) {
    state.continuousRunStart = now;
  }

  // ─────────────────────────────────────────────────────────────
  // RESET ON STOP
  // Clear tracking when compressor stops naturally
  // ─────────────────────────────────────────────────────────────

  if (!relayOn) {
    state.continuousRunStart = 0;
    return {
      forceOff: false,
      reason: '',
      alertTriggered: false,
      repeatAlert: false
    };
  }

  // ─────────────────────────────────────────────────────────────
  // CHECK FOR OVERRUN
  // If running too long, force rest period
  // ─────────────────────────────────────────────────────────────

  const runTime = now - state.continuousRunStart;

  if (runTime >= config.MAX_CONTINUOUS_RUN_SEC) {
    // Trigger forced rest
    state.forcedRestUntil = now + config.MAX_RUN_REST_SEC;
    state.maxRunCount++;
    state.continuousRunStart = 0; // Reset for next run

    // Determine alert status
    const alertTriggered = !state.maxRunAlertFired;
    state.maxRunAlertFired = true;

    // Check for repeat alert
    const repeatAlert = !alertTriggered &&
      (now - state.lastMaxRunAlert >= config.MAX_RUN_REPEAT_ALERT_SEC);

    if (alertTriggered || repeatAlert) {
      state.lastMaxRunAlert = now;
    }

    return {
      forceOff: true,
      reason: 'MAX_RUN_EXCEEDED',
      runTimeSec: runTime,
      restDurationSec: config.MAX_RUN_REST_SEC,
      alertTriggered,
      repeatAlert,
      totalEvents: state.maxRunCount
    };
  }

  // ─────────────────────────────────────────────────────────────
  // NORMAL OPERATION
  // Running but within limits
  // ─────────────────────────────────────────────────────────────

  return {
    forceOff: false,
    reason: '',
    runTimeSec: runTime,
    alertTriggered: false,
    repeatAlert: false
  };
}

/**
 * Format max run alert message
 */
export function formatMaxRunAlert(
  runTimeSec: number,
  restDurationSec: number,
  totalEvents: number
): string {
  const runHours = (runTimeSec / 3600).toFixed(1);
  const restMin = (restDurationSec / 60).toFixed(0);

  return `MAX RUN PROTECTION ACTIVATED: Compressor ran for ${runHours}h continuous. ` +
    `Forcing ${restMin}min rest period. Event #${totalEvents} since boot. ` +
    `INVESTIGATE: Check door seal, ambient temp, setpoint, refrigerant level.`;
}
```

### Control Loop Integration

In `src/system/control/helpers.ts`, add after thermostat decision:

```typescript
/**
 * Process max run protection
 */
export function processMaxRunProtection(
  state: ControllerState,
  relayOn: boolean,
  wantCool: boolean,
  t: number,
  logger: Logger
): boolean {
  const check = checkMaxRunProtection(relayOn, t, {
    continuousRunStart: state.continuousRunStart,
    forcedRestUntil: state.forcedRestUntil,
    maxRunAlertFired: state.maxRunAlertFired,
    lastMaxRunAlert: state.lastMaxRunAlert,
    maxRunCount: state.maxRunCount
  }, CONFIG);

  // Update state
  state.continuousRunStart = check.runTimeSec ? t - check.runTimeSec : 0;
  state.forcedRestUntil = check.forceOff ? t + (check.restDurationSec || 0) : 0;

  // Fire alerts
  if (check.alertTriggered) {
    logger.critical(formatMaxRunAlert(
      check.runTimeSec || 0,
      check.restDurationSec || CONFIG.MAX_RUN_REST_SEC,
      check.totalEvents || state.maxRunCount
    ));
  } else if (check.repeatAlert) {
    logger.warning("MAX RUN: Still in protection cycle, event #" + state.maxRunCount);
  }

  return check.forceOff;
}
```

In `src/system/control/control.ts`, integrate:

```typescript
// After thermostat decision, before relay execution

// Max run protection (P0 - critical safety)
if (CONFIG.FEATURE_MAX_RUN_PROTECTION) {
  const forceOff = processMaxRunProtection(state, sensors.relayOn, wantCool, t, logger);
  if (forceOff) {
    wantCool = false; // Override thermostat decision
  }
}
```

### Testing Requirements

Create `src/core/max-run-protection/max-run-protection.test.ts`:

```typescript
describe('checkMaxRunProtection', () => {
  describe('normal operation', () => {
    it('should allow running within time limit', () => {
      // Test: relayOn for 1 hour with 2 hour limit -> allow
    });

    it('should reset tracking when compressor stops', () => {
      // Test: relayOn, then relayOff -> continuousRunStart resets
    });
  });

  describe('overrun detection', () => {
    it('should force off after max run time exceeded', () => {
      // Test: relayOn for 2.1 hours with 2 hour limit -> forceOff
    });

    it('should set correct rest period duration', () => {
      // Test: after overrun, forcedRestUntil = now + MAX_RUN_REST_SEC
    });

    it('should increment event counter', () => {
      // Test: each overrun increments maxRunCount
    });
  });

  describe('forced rest period', () => {
    it('should keep compressor off during rest', () => {
      // Test: forcedRestUntil in future -> forceOff = true
    });

    it('should release after rest period ends', () => {
      // Test: now >= forcedRestUntil -> forceOff = false
    });
  });

  describe('alerting', () => {
    it('should fire alert on first detection', () => {
      // Test: first overrun -> alertTriggered = true
    });

    it('should not spam alerts', () => {
      // Test: subsequent checks -> alertTriggered = false
    });

    it('should send repeat alert after interval', () => {
      // Test: after MAX_RUN_REPEAT_ALERT_SEC -> repeatAlert = true
    });
  });
});
```

### Validation Rules

Add to `src/validation/validator.ts`:

```typescript
// Max Run Protection
if (config.FEATURE_MAX_RUN_PROTECTION) {
  if (config.MAX_CONTINUOUS_RUN_SEC < 3600 || config.MAX_CONTINUOUS_RUN_SEC > 28800) {
    errors.push({
      field: 'MAX_CONTINUOUS_RUN_SEC',
      message: 'Must be between 3600 and 28800 seconds (1-8 hours)'
    });
  }

  if (config.MAX_RUN_REST_SEC < 300 || config.MAX_RUN_REST_SEC > 1800) {
    errors.push({
      field: 'MAX_RUN_REST_SEC',
      message: 'Must be between 300 and 1800 seconds (5-30 minutes)'
    });
  }

  // Warning if rest period is shorter than MIN_OFF
  if (config.MAX_RUN_REST_SEC < config.MIN_OFF_SEC) {
    warnings.push({
      field: 'MAX_RUN_REST_SEC',
      message: `Rest period (${config.MAX_RUN_REST_SEC}s) is shorter than MIN_OFF (${config.MIN_OFF_SEC}s)`
    });
  }
}
```

---

## 2. Welded Contact Detection (Runaway Cooling)

### Classification

- **Category:** CORE SAFETY FEATURE
- **Risk Level:** MEDIUM-HIGH
- **Priority:** P1 - Should fix for production
- **Current State:** NOT IMPLEMENTED

### Problem Description

Electrical relay contacts can become permanently welded together due to:

| Cause | Mechanism | Prevention |
|-------|-----------|------------|
| Electrical arcing | Spark during opening melts contact surfaces | Snubber circuits, zero-cross switching |
| Overcurrent | Excessive current welds contacts together | Proper relay sizing, current limiting |
| Contact wear | Repeated cycling erodes contact material | Quality relays, reduced cycling |
| Contamination | Debris on contacts causes localized heating | Sealed relays, clean environment |

When contacts weld:
- The relay's electronic driver reports OFF (coil de-energized)
- The physical contacts remain closed
- The compressor continues running indefinitely

#### Why Existing Detection Fails

The current `validateRelayState()` in `src/hardware/relay/helpers.ts` only detects command-response mismatches:

```typescript
// DETECTED: Command sent but state didn't change
Intended: ON, Reported: OFF  // Relay failed to turn on

// NOT DETECTED: Welded contact
Intended: OFF, Reported: OFF  // System thinks it's off, but contact is stuck closed
```

### Physical Damage Risks

1. **Food Freezing**
   - Temperature drops below 0°C
   - Beverages freeze and containers burst
   - Produce crystallizes and becomes inedible
   - Result: Complete food loss

2. **Evaporator Ice Block**
   - Continuous cooling forms massive ice buildup
   - Airflow completely blocked
   - No heat transfer possible
   - Result: Permanent freeze protection, no cooling even if fixed

3. **Compressor Damage**
   - Combines with max run problem
   - All risks from Section 1 apply
   - Result: Equipment failure

4. **Energy Waste**
   - Compressor runs 24/7
   - Significant electricity cost
   - Result: Financial loss

### Real-World Failure Scenario

```
Timeline: Welded Contact Leading to Food Loss

Day 1, 14:00
  - Controller commands relay OFF (temp reached 3°C)
  - Relay coil de-energizes
  - Relay reports OFF
  - Contact is welded - compressor keeps running
  - Status: System believes compressor is off

Day 1, 14:30
  - Air temp: 2°C (still dropping)
  - Evap temp: -8°C (still dropping)
  - Relay: Reports OFF
  - Status: Temperatures declining while "off" - RED FLAG

Day 1, 16:00
  - Air temp: 0°C (freezing point)
  - Evap temp: -15°C
  - Drinks starting to freeze
  - Status: Freeze protection should engage soon

Day 1, 17:00
  - Evap temp: -16.3°C (lock threshold)
  - Freeze protection LOCKS compressor "off"
  - But compressor already running due to welded contact!
  - Status: Protection ineffective

Day 1, 20:00
  - Air temp: -5°C
  - All beverages frozen
  - Cans bursting
  - Result: Complete contents loss

Day 2
  - User discovers frozen/destroyed contents
  - Relay must be physically replaced
  - Result: $200+ repair + $100+ food loss
```

### Detection Method

The key insight: **when relay should be OFF, temperatures should stabilize or rise, not drop.**

After commanding OFF, monitor both sensors:
- Air temperature should stop dropping (or rise slightly)
- Evaporator temperature should rise toward ambient

If both continue dropping significantly, the compressor is still running despite the OFF command.

### Proposed Configuration

```typescript
// ═══════════════════════════════════════════════════════════════
// WELDED CONTACT DETECTION
// Detects stuck-closed relay contacts by monitoring temperature
// behavior when compressor should be off
// ═══════════════════════════════════════════════════════════════

// FEATURE_WELDED_CONTACT_DETECTION
//   Role: Enable runaway cooling detection for stuck relays.
//   Critical: Boolean only; strongly recommended.
//   Recommended: true; this detects a serious hardware failure.
FEATURE_WELDED_CONTACT_DETECTION: true,

// WELDED_CONTACT_CHECK_DELAY_SEC
//   Role: Time to wait after OFF command before checking for runaway.
//   Context: After compressor stops, temperatures continue dropping briefly
//   due to thermal mass. Need to wait for this to settle.
//   Critical: 60-300s (1-5 minutes). Error if <60s (false positives from
//   thermal lag) or >300s (too slow to detect).
//   Recommended: 120s (2 minutes); allows settling while detecting quickly.
WELDED_CONTACT_CHECK_DELAY_SEC: 120,

// WELDED_CONTACT_AIR_DROP_C
//   Role: Air temperature drop that indicates runaway cooling.
//   Context: After compressor stops, air temp should stabilize or rise.
//   A continued drop means compressor is still running.
//   Critical: 0.5-3.0°C. Error if <0.5°C (sensor noise) or >3.0°C (too slow).
//   Recommended: 1.5°C; clear signal above noise threshold.
WELDED_CONTACT_AIR_DROP_C: 1.5,

// WELDED_CONTACT_EVAP_DROP_C
//   Role: Evaporator temperature drop that indicates runaway cooling.
//   Context: Evaporator responds faster than air. A continued drop is a
//   strong signal of active refrigeration.
//   Critical: 2.0-10.0°C. Error if <2.0°C (thermal inertia) or >10.0°C (too slow).
//   Recommended: 5.0°C; evaporator moves faster than air.
WELDED_CONTACT_EVAP_DROP_C: 5.0,
```

### State Requirements

```typescript
// ═══════════════════════════════════════════════════════════════
// FEATURE_WELDED_CONTACT_DETECTION: RUNAWAY COOLING DETECTION
// Monitors temperature behavior to detect stuck-closed relay contacts.
// ═══════════════════════════════════════════════════════════════

// When OFF command was sent (for delay calculation)
weldedCheckStart: number;

// Initial temperatures when OFF was commanded (for comparison)
weldedInitialAirTemp: number | null;
weldedInitialEvapTemp: number | null;

// Has welded contact alert been fired?
weldedAlertFired: boolean;

// Total detections since boot
weldedDetectionCount: number;
```

### Implementation

Create `src/core/welded-contact/welded-contact.ts`:

```typescript
/**
 * Welded contact detection
 *
 * Detects stuck-closed relay contacts by monitoring temperature behavior
 * when the compressor should be off.
 *
 * ## Detection Method
 * When relay intends OFF and reports OFF, but both air and evaporator
 * temperatures continue dropping significantly, the compressor is still
 * running despite the OFF state - indicating a welded contact.
 *
 * ## False Positive Prevention
 * - Wait WELDED_CONTACT_CHECK_DELAY_SEC for thermal settling
 * - Require BOTH sensors to show continued cooling
 * - Use meaningful thresholds above sensor noise
 */

import type { TemperatureReading } from '$types/common';
import type { WeldedContactState, WeldedContactConfig, WeldedContactResult } from './types';

/**
 * Check for welded contact condition
 *
 * @param intendedOn - What controller wants relay to be
 * @param reportedOn - What relay reports its state as
 * @param airTemp - Current air temperature
 * @param evapTemp - Current evaporator temperature
 * @param now - Current timestamp in seconds
 * @param state - Welded contact detection state
 * @param config - Detection configuration
 * @returns Detection result
 */
export function checkWeldedContact(
  intendedOn: boolean,
  reportedOn: boolean,
  airTemp: TemperatureReading,
  evapTemp: TemperatureReading,
  now: number,
  state: WeldedContactState,
  config: WeldedContactConfig
): WeldedContactResult {

  // ─────────────────────────────────────────────────────────────
  // RESET CONDITIONS
  // Only check when we intend OFF and relay reports OFF
  // ─────────────────────────────────────────────────────────────

  if (intendedOn || reportedOn) {
    // Reset tracking - we're not in a detection-relevant state
    return {
      detected: false,
      alertTriggered: false,
      reset: true
    };
  }

  // ─────────────────────────────────────────────────────────────
  // START TRACKING
  // Begin monitoring when we first enter OFF state
  // ─────────────────────────────────────────────────────────────

  if (state.weldedCheckStart === 0) {
    return {
      detected: false,
      alertTriggered: false,
      startTracking: true,
      initialAirTemp: airTemp,
      initialEvapTemp: evapTemp,
      checkStartTime: now
    };
  }

  // ─────────────────────────────────────────────────────────────
  // WAIT FOR CHECK DELAY
  // Allow thermal mass to settle before checking
  // ─────────────────────────────────────────────────────────────

  const elapsed = now - state.weldedCheckStart;

  if (elapsed < config.WELDED_CONTACT_CHECK_DELAY_SEC) {
    return {
      detected: false,
      alertTriggered: false,
      waiting: true,
      remainingSec: config.WELDED_CONTACT_CHECK_DELAY_SEC - elapsed
    };
  }

  // ─────────────────────────────────────────────────────────────
  // CHECK FOR RUNAWAY COOLING
  // Both sensors must show continued cooling for detection
  // ─────────────────────────────────────────────────────────────

  // Need valid readings and initial values
  if (airTemp === null || evapTemp === null ||
      state.weldedInitialAirTemp === null || state.weldedInitialEvapTemp === null) {
    return {
      detected: false,
      alertTriggered: false,
      insufficientData: true
    };
  }

  // Calculate temperature drops (positive = cooling)
  const airDrop = state.weldedInitialAirTemp - airTemp;
  const evapDrop = state.weldedInitialEvapTemp - evapTemp;

  // Check if both sensors show runaway cooling
  const airRunaway = airDrop > config.WELDED_CONTACT_AIR_DROP_C;
  const evapRunaway = evapDrop > config.WELDED_CONTACT_EVAP_DROP_C;

  if (airRunaway && evapRunaway) {
    // WELDED CONTACT DETECTED
    const alertTriggered = !state.weldedAlertFired;

    return {
      detected: true,
      alertTriggered,
      airDrop,
      evapDrop,
      checkDuration: elapsed,
      detectionCount: state.weldedDetectionCount + (alertTriggered ? 1 : 0)
    };
  }

  // ─────────────────────────────────────────────────────────────
  // NORMAL - NO RUNAWAY DETECTED
  // ─────────────────────────────────────────────────────────────

  return {
    detected: false,
    alertTriggered: false,
    airDrop,
    evapDrop
  };
}

/**
 * Format welded contact alert message
 */
export function formatWeldedContactAlert(
  airDrop: number,
  evapDrop: number,
  checkDuration: number
): string {
  return `WELDED CONTACT DETECTED: Relay reports OFF but cooling continues! ` +
    `Air dropped ${airDrop.toFixed(1)}°C, Evap dropped ${evapDrop.toFixed(1)}°C ` +
    `over ${checkDuration}s while relay commanded OFF. ` +
    `IMMEDIATE ACTION REQUIRED: Power off unit and replace relay!`;
}
```

### Control Loop Integration

```typescript
/**
 * Process welded contact detection
 */
export function processWeldedContactDetection(
  state: ControllerState,
  intendedOn: boolean,
  reportedOn: boolean,
  airTemp: TemperatureReading,
  evapTemp: TemperatureReading,
  t: number,
  logger: Logger
): void {
  const check = checkWeldedContact(intendedOn, reportedOn, airTemp, evapTemp, t, {
    weldedCheckStart: state.weldedCheckStart,
    weldedInitialAirTemp: state.weldedInitialAirTemp,
    weldedInitialEvapTemp: state.weldedInitialEvapTemp,
    weldedAlertFired: state.weldedAlertFired,
    weldedDetectionCount: state.weldedDetectionCount
  }, CONFIG);

  // Apply state updates
  if (check.reset) {
    state.weldedCheckStart = 0;
    state.weldedInitialAirTemp = null;
    state.weldedInitialEvapTemp = null;
    state.weldedAlertFired = false;
  } else if (check.startTracking) {
    state.weldedCheckStart = check.checkStartTime || t;
    state.weldedInitialAirTemp = check.initialAirTemp || null;
    state.weldedInitialEvapTemp = check.initialEvapTemp || null;
  }

  // Fire alert
  if (check.alertTriggered && check.detected) {
    state.weldedAlertFired = true;
    state.weldedDetectionCount++;

    logger.critical(formatWeldedContactAlert(
      check.airDrop || 0,
      check.evapDrop || 0,
      check.checkDuration || 0
    ));
  }
}
```

---

## 3. Scheduled Defrost Cycles

### Classification

- **Category:** FEATURE (enhances existing freeze protection)
- **Risk Level:** LOW-MEDIUM
- **Priority:** P2 - Recommended for humid environments
- **Current State:** Reactive defrost only (via freeze protection)

### Problem Description

The current system uses reactive defrost: the freeze protection module locks out the compressor when the evaporator reaches -16.3°C. While effective at preventing freeze-up, this approach has limitations:

#### Reactive Defrost Limitations

| Issue | Impact | When It Matters |
|-------|--------|-----------------|
| Ice accumulates before trigger | Reduced efficiency during buildup | High humidity environments |
| Performance degrades gradually | Higher duty cycle, more energy | Summer months |
| Relies on extreme cold detection | Significant ice already present at trigger | Frequent door openings |
| No proactive prevention | Heat transfer already impaired | Commercial applications |

#### Ice Accumulation Process

```
Initial State: Clean evaporator coil
  - Maximum surface area for heat transfer
  - Efficient airflow
  - Low energy consumption

After 4 hours (humid environment):
  - Thin frost layer forms
  - 10% reduction in heat transfer
  - Slightly increased duty cycle

After 8 hours:
  - Significant ice buildup
  - 25% reduction in heat transfer
  - Airflow partially blocked
  - Noticeably higher duty cycle

After 12 hours:
  - Evaporator approaching -16°C
  - 40% reduction in heat transfer
  - Airflow severely restricted
  - Freeze protection imminent

Trigger at -16.3°C:
  - Compressor locked out
  - Ice begins melting (10-15 min)
  - Air temp rises during defrost
  - Must wait for full recovery before restart
```

With scheduled defrost:
- Force brief defrost every 8 hours
- Prevent ice buildup before efficiency loss
- Shorter defrost cycles (less ice to melt)
- More consistent performance

### Proposed Configuration

```typescript
// ═══════════════════════════════════════════════════════════════
// SCHEDULED DEFROST
// Time-based proactive defrost to prevent ice accumulation
// ═══════════════════════════════════════════════════════════════

// FEATURE_SCHEDULED_DEFROST
//   Role: Enable time-based proactive defrost cycles.
//   Critical: Boolean only.
//   Recommended:
//     - Humid environments (>60% RH): true
//     - Dry/climate-controlled: false
//     - Commercial with frequent door openings: true
FEATURE_SCHEDULED_DEFROST: false,

// SCHEDULED_DEFROST_INTERVAL_SEC
//   Role: Time between scheduled defrost cycles.
//   Context: Shorter intervals = less ice but more temperature swings.
//   Longer intervals = more efficiency but risk of buildup.
//   Critical: 14400-86400s (4-24 hours). Error if <14400s (excessive cycling)
//   or >86400s (defeats purpose).
//   Recommended:
//     - High humidity: 21600s (6 hours)
//     - Moderate humidity: 28800s (8 hours)
//     - Low humidity: 43200s (12 hours)
SCHEDULED_DEFROST_INTERVAL_SEC: 28800,

// SCHEDULED_DEFROST_MIN_RUN_SEC
//   Role: Minimum compressor runtime since last defrost before scheduling another.
//   Context: If compressor barely ran, there's no ice to clear. Prevents
//   unnecessary defrost cycles.
//   Critical: 1800-7200s (30 min - 2 hours). Error if <1800s (too sensitive)
//   or >7200s (may miss needed defrosts).
//   Recommended: 3600s (1 hour); meaningful ice forms in this time.
SCHEDULED_DEFROST_MIN_RUN_SEC: 3600,

// SCHEDULED_DEFROST_DURATION_SEC
//   Role: How long to keep compressor off during scheduled defrost.
//   Context: Needs enough time for ice to melt but not so long that food warms.
//   Scheduled defrosts have less ice than reactive, so shorter duration works.
//   Critical: 180-900s (3-15 minutes). Error if <180s (incomplete melt)
//   or >900s (food safety risk).
//   Recommended: 300-420s (5-7 minutes); usually sufficient for light frost.
SCHEDULED_DEFROST_DURATION_SEC: 360,
```

### State Requirements

```typescript
// ═══════════════════════════════════════════════════════════════
// FEATURE_SCHEDULED_DEFROST: TIME-BASED DEFROST CYCLES
// Proactively prevents ice buildup with regular defrost intervals.
// ═══════════════════════════════════════════════════════════════

// When last scheduled defrost completed
lastScheduledDefrost: number;

// Compressor runtime accumulated since last defrost
runTimeSinceDefrost: number;

// Currently in a scheduled defrost cycle?
inScheduledDefrost: boolean;

// When current scheduled defrost will end
scheduledDefrostEndTime: number;

// Total scheduled defrosts since boot
scheduledDefrostCount: number;

// Daily scheduled defrost count (for summary)
dayScheduledDefrostCount: number;
```

### Implementation

Create `src/features/scheduled-defrost/scheduled-defrost.ts`:

```typescript
/**
 * Scheduled defrost cycle management
 *
 * Implements time-based proactive defrost to prevent ice accumulation
 * before it impacts efficiency.
 *
 * ## Scheduling Logic
 * A defrost is scheduled when:
 * 1. Time since last defrost >= SCHEDULED_DEFROST_INTERVAL_SEC
 * 2. Compressor runtime since last defrost >= SCHEDULED_DEFROST_MIN_RUN_SEC
 *
 * Condition #2 prevents unnecessary defrosts if compressor barely ran.
 */

import type {
  ScheduledDefrostState,
  ScheduledDefrostConfig,
  ScheduledDefrostResult
} from './types';

/**
 * Update scheduled defrost state
 *
 * @param relayOn - Current relay state
 * @param now - Current timestamp in seconds
 * @param dt - Time delta since last loop (seconds)
 * @param state - Scheduled defrost state
 * @param config - Defrost configuration
 * @returns Defrost decision and state updates
 */
export function updateScheduledDefrost(
  relayOn: boolean,
  now: number,
  dt: number,
  state: ScheduledDefrostState,
  config: ScheduledDefrostConfig
): ScheduledDefrostResult {

  // ─────────────────────────────────────────────────────────────
  // TRACK COMPRESSOR RUNTIME
  // Accumulate runtime for defrost scheduling decision
  // ─────────────────────────────────────────────────────────────

  if (relayOn && !state.inScheduledDefrost) {
    state.runTimeSinceDefrost += dt;
  }

  // ─────────────────────────────────────────────────────────────
  // CURRENTLY IN DEFROST
  // Check if defrost cycle should end
  // ─────────────────────────────────────────────────────────────

  if (state.inScheduledDefrost) {
    if (now >= state.scheduledDefrostEndTime) {
      // Defrost complete
      state.inScheduledDefrost = false;
      state.lastScheduledDefrost = now;
      state.runTimeSinceDefrost = 0;

      return {
        forceOff: false,
        defrostEnded: true,
        defrostCount: state.scheduledDefrostCount
      };
    }

    // Still in defrost - keep compressor off
    const remaining = state.scheduledDefrostEndTime - now;
    return {
      forceOff: true,
      inDefrost: true,
      remainingSec: remaining
    };
  }

  // ─────────────────────────────────────────────────────────────
  // CHECK IF DEFROST NEEDED
  // Both time and runtime conditions must be met
  // ─────────────────────────────────────────────────────────────

  const timeSinceDefrost = now - state.lastScheduledDefrost;
  const timeCondition = timeSinceDefrost >= config.SCHEDULED_DEFROST_INTERVAL_SEC;
  const runCondition = state.runTimeSinceDefrost >= config.SCHEDULED_DEFROST_MIN_RUN_SEC;

  if (timeCondition && runCondition) {
    // Start scheduled defrost
    state.inScheduledDefrost = true;
    state.scheduledDefrostEndTime = now + config.SCHEDULED_DEFROST_DURATION_SEC;
    state.scheduledDefrostCount++;

    return {
      forceOff: true,
      defrostStarted: true,
      defrostDuration: config.SCHEDULED_DEFROST_DURATION_SEC,
      defrostCount: state.scheduledDefrostCount,
      runTimeSinceDefrost: state.runTimeSinceDefrost
    };
  }

  // ─────────────────────────────────────────────────────────────
  // NORMAL OPERATION
  // No defrost needed yet
  // ─────────────────────────────────────────────────────────────

  return {
    forceOff: false,
    timeSinceDefrost,
    runTimeSinceDefrost: state.runTimeSinceDefrost,
    timeUntilEligible: Math.max(0, config.SCHEDULED_DEFROST_INTERVAL_SEC - timeSinceDefrost)
  };
}

/**
 * Format scheduled defrost log message
 */
export function formatScheduledDefrostStart(
  durationSec: number,
  runTimeSinceDefrost: number,
  defrostCount: number
): string {
  const durationMin = (durationSec / 60).toFixed(0);
  const runTimeMin = (runTimeSinceDefrost / 60).toFixed(0);

  return `Scheduled defrost #${defrostCount}: ${durationMin}min cycle ` +
    `(runtime since last: ${runTimeMin}min)`;
}
```

---

## 4. Door Open Detection

### Classification

- **Category:** FEATURE (efficiency improvement)
- **Risk Level:** LOW
- **Priority:** P3 - Nice to have
- **Current State:** NOT IMPLEMENTED

### Problem Description

When a refrigerator door opens:
1. Warm ambient air rushes in
2. Temperature rises rapidly (2-5°C in 30 seconds)
3. Thermostat detects high temp and turns compressor ON
4. Running compressor creates negative pressure, pulling in more warm air
5. Warm, humid air contacts cold evaporator -> ice formation
6. Cycle continues until door closes

#### Better Behavior

Detect door open via temperature spike, then:
- Delay compressor start (allow user to close door)
- Log door open events for diagnostics
- Track door open frequency (identify seal issues)

### Detection Method

Monitor rate of temperature rise:

| Scenario | Typical Rate | Detection |
|----------|--------------|-----------|
| Closed door, stable | ±0.1°C/min | No spike |
| Closed door, warming | +0.3°C/min | No spike |
| Door open | +4-10°C/min | SPIKE DETECTED |

A rapid rise (e.g., +1.5°C in 30s = 3°C/min) indicates door open.

### Proposed Configuration

```typescript
// ═══════════════════════════════════════════════════════════════
// DOOR OPEN DETECTION
// Detects door openings via rapid temperature rise
// ═══════════════════════════════════════════════════════════════

// FEATURE_DOOR_DETECTION
//   Role: Enable door open detection via temperature spike.
//   Critical: Boolean only.
//   Recommended: true; useful diagnostics with minimal overhead.
FEATURE_DOOR_DETECTION: true,

// DOOR_SPIKE_THRESHOLD_C
//   Role: Temperature rise that indicates door open.
//   Context: Normal warming is <0.5°C in 30s. Door open causes 1-5°C rise.
//   Critical: 0.5-3.0°C. Error if <0.5°C (false positives from noise)
//   or >3.0°C (may miss brief openings).
//   Recommended: 1.5°C; clear signal with low false positive rate.
DOOR_SPIKE_THRESHOLD_C: 1.5,

// DOOR_SPIKE_WINDOW_SEC
//   Role: Time window for spike detection.
//   Context: Shorter window = more sensitive but more noise. Longer = more
//   certain but may miss brief openings.
//   Critical: 15-120s. Error if <15s (too noisy) or >120s (too slow).
//   Recommended: 30s; balances sensitivity and reliability.
DOOR_SPIKE_WINDOW_SEC: 30,

// DOOR_OPEN_COMPRESSOR_DELAY_SEC
//   Role: Delay compressor start when door open detected.
//   Context: Give user time to close door before starting compressor.
//   Prevents pulling in more warm air.
//   Critical: 0-300s. 0 = no delay (detection only).
//   Recommended: 60s; reasonable time to get items and close door.
DOOR_OPEN_COMPRESSOR_DELAY_SEC: 60,

// DOOR_OPEN_LOG_EVENTS
//   Role: Log door open/close events.
//   Critical: Boolean only.
//   Recommended: true; useful for diagnostics and seal monitoring.
DOOR_OPEN_LOG_EVENTS: true,
```

### State Requirements

```typescript
// ═══════════════════════════════════════════════════════════════
// FEATURE_DOOR_DETECTION: DOOR OPEN DETECTION
// Detects door openings for diagnostics and compressor delay.
// ═══════════════════════════════════════════════════════════════

// Previous air temperature (for rate calculation)
doorLastAirTemp: number | null;

// When last temperature sample was taken
doorLastCheckTime: number;

// Is door currently detected as open?
doorOpenDetected: boolean;

// When door was detected open
doorOpenTime: number;

// Total door openings today (for daily summary)
dayDoorOpenCount: number;
```

### Implementation

Create `src/features/door-detection/door-detection.ts`:

```typescript
/**
 * Door open detection via temperature spike
 *
 * Detects rapid temperature rises that indicate door openings.
 * Optionally delays compressor start to avoid pulling in more warm air.
 */

import type { TemperatureReading } from '$types/common';
import type { DoorDetectionState, DoorDetectionConfig, DoorDetectionResult } from './types';

/**
 * Detect door open condition
 *
 * @param airTemp - Current air temperature
 * @param now - Current timestamp in seconds
 * @param state - Door detection state
 * @param config - Detection configuration
 * @returns Detection result with door status
 */
export function detectDoorOpen(
  airTemp: TemperatureReading,
  now: number,
  state: DoorDetectionState,
  config: DoorDetectionConfig
): DoorDetectionResult {

  // Need valid current and previous readings
  if (airTemp === null || state.doorLastAirTemp === null) {
    return {
      isOpen: state.doorOpenDetected,
      justOpened: false,
      justClosed: false,
      updateLastTemp: true,
      newLastTemp: airTemp,
      newLastTime: now
    };
  }

  const dt = now - state.doorLastCheckTime;
  const dTemp = airTemp - state.doorLastAirTemp;

  // Calculate rate-based threshold
  // threshold = (THRESHOLD / WINDOW) * dt
  const threshold = (config.DOOR_SPIKE_THRESHOLD_C / config.DOOR_SPIKE_WINDOW_SEC) * dt;
  const isSpike = dTemp > threshold;

  let justOpened = false;
  let justClosed = false;

  if (isSpike && !state.doorOpenDetected) {
    // Door just opened
    justOpened = true;
  } else if (state.doorOpenDetected && dTemp < 0) {
    // Temperature dropping = door closed, cooling resumed
    justClosed = true;
  }

  return {
    isOpen: isSpike || (state.doorOpenDetected && dTemp >= 0),
    justOpened,
    justClosed,
    tempRise: dTemp,
    threshold,
    updateLastTemp: true,
    newLastTemp: airTemp,
    newLastTime: now
  };
}

/**
 * Check if compressor should be delayed due to door open
 */
export function shouldDelayCompressor(
  doorOpenDetected: boolean,
  doorOpenTime: number,
  now: number,
  delaySec: number
): boolean {
  if (!doorOpenDetected || delaySec === 0) {
    return false;
  }

  return (now - doorOpenTime) < delaySec;
}
```

---

## 5. Startup Delay After Power Loss

### Classification

- **Category:** FEATURE (grid protection)
- **Risk Level:** LOW
- **Priority:** P3 - Recommended for residential
- **Current State:** Uses MIN_OFF via pessimistic boot

### Problem Description

After a neighborhood power outage, all refrigerators restart simultaneously. This causes:

1. **Inrush Current Spike**
   - Compressor motors draw 5-10x running current at startup
   - Many simultaneous startups = massive demand spike
   - Can overload transformers and trip breakers

2. **Voltage Sag**
   - High demand causes voltage drop
   - Motors starting under low voltage draw even more current
   - Can damage equipment

3. **Grid Instability**
   - Cascading effects as more devices struggle
   - Can cause rolling blackouts

### Current Mitigation

The pessimistic boot sets `lastOffTime = now`, which forces MIN_OFF (300s) wait. However:
- All controllers wait exactly 300s (synchronized restart)
- May not be sufficient for grid stabilization
- Commercial setups may need longer delays

### Solution: Randomized Startup Delay

Add random jitter to stagger restarts:
- Minimum delay: 60s (allow grid to stabilize)
- Maximum delay: 180s (don't leave food too long)
- Actual delay: random between min and max

### Proposed Configuration

```typescript
// ═══════════════════════════════════════════════════════════════
// STARTUP DELAY
// Randomized delay after power loss to stagger restarts
// ═══════════════════════════════════════════════════════════════

// FEATURE_STARTUP_DELAY
//   Role: Enable randomized startup delay after boot.
//   Critical: Boolean only.
//   Recommended: true for residential; false for critical commercial.
FEATURE_STARTUP_DELAY: true,

// STARTUP_DELAY_MIN_SEC
//   Role: Minimum delay after boot before compressor can start.
//   Context: Grid needs time to stabilize after outage. Minimum delay
//   ensures some waiting period.
//   Critical: 0-300s. Error if >300s (food safety).
//   Recommended: 60s; allows initial grid stabilization.
STARTUP_DELAY_MIN_SEC: 60,

// STARTUP_DELAY_MAX_SEC
//   Role: Maximum delay after boot.
//   Context: Upper bound for random delay. Actual delay is random between
//   MIN and MAX to stagger restarts across devices.
//   Critical: 60-600s. Must be >= STARTUP_DELAY_MIN_SEC.
//   Recommended: 180s; good distribution without excessive wait.
STARTUP_DELAY_MAX_SEC: 180,
```

### Implementation

In `src/system/state/state.ts`:

```typescript
export function createInitialState(
  nowSec: number,
  relayOn: boolean,
  config: FridgeConfig
): ControllerState {

  // Calculate randomized startup delay
  let startupDelayUntil = nowSec;

  if (config.FEATURE_STARTUP_DELAY) {
    const range = config.STARTUP_DELAY_MAX_SEC - config.STARTUP_DELAY_MIN_SEC;
    const randomDelay = config.STARTUP_DELAY_MIN_SEC + (Math.random() * range);
    startupDelayUntil = nowSec + randomDelay;
  }

  return {
    // ... existing fields ...

    bootTime: nowSec,
    startupDelayUntil,

    // ... rest of state ...
  };
}
```

In control loop:

```typescript
// At start of run()
if (CONFIG.FEATURE_STARTUP_DELAY && now < state.startupDelayUntil) {
  // Still in startup delay - skip control decisions
  if (isDebug) {
    const remaining = state.startupDelayUntil - now;
    logger.debug("Startup delay: " + remaining.toFixed(0) + "s remaining");
  }
  return;
}
```

---

## Implementation Roadmap

### Phase 1: Critical Safety (P0-P1)

**Duration:** 1-2 days
**Files to create:**
- `src/core/max-run-protection/`
- `src/core/welded-contact/`

**Testing:** Add comprehensive unit tests for both modules

### Phase 2: Enhanced Features (P2)

**Duration:** 0.5-1 day
**Files to create:**
- `src/features/scheduled-defrost/`

**Testing:** Test scheduling logic and defrost duration

### Phase 3: Quality of Life (P3)

**Duration:** 0.5-1 day
**Files to create:**
- `src/features/door-detection/`
- Modify `src/system/state/state.ts` for startup delay

**Testing:** Test detection thresholds and delay timing

### Integration Checklist

- [ ] Add new config parameters to `src/boot/config.ts`
- [ ] Add new state fields to `src/system/state/types.ts`
- [ ] Initialize new state in `createInitialState()`
- [ ] Add validation rules to `src/validation/validator.ts`
- [ ] Integrate processing in `src/system/control/helpers.ts`
- [ ] Call processing in `src/system/control/control.ts`
- [ ] Update daily summary to include new metrics
- [ ] Add to init summary logging
- [ ] Update documentation in `docs/CONFIG.md`

---

## Conclusion

This document provides complete specifications for implementing the five identified gaps in the fridge controller. The most critical items are:

1. **Max Run Protection (P0)** - Prevents compressor burnout from endless operation
2. **Welded Contact Detection (P1)** - Detects stuck relay causing runaway cooling

These should be implemented before deploying the controller in any critical application. The remaining features (P2-P3) enhance efficiency and diagnostics but are not safety-critical.

All implementations follow the established codebase patterns:
- Pure functions with state passed in
- Immutable state updates
- Comprehensive type definitions
- Testable design with dependency injection
- Clear separation of concerns

---

*End of Document*
