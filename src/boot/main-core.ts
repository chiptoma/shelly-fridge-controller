/**
 * Core Controller Entry Point
 *
 * This is Script 1 - contains essential thermostat control:
 * - Configuration and initialization
 * - Sensor reading and smoothing
 * - Thermostat control logic
 * - Relay control with timing constraints
 * - Freeze protection
 * - Sensor health monitoring
 * - All logging (console + Slack)
 *
 * Emits state events for optional features script.
 * Receives commands from features script (hysteresis adjustments, log requests).
 */

import CONFIG from './config';
import { initialize } from './init';
import { runCore, setupCommandHandler } from '@system/control/control-core';

declare const Timer: {
  set: (ms: number, repeat: boolean, callback: () => void) => number;
  clear: (id: number) => void;
};

// Module-level controller reference for hoisted callback
let _controller: { state: any; logger: any; isDebug: boolean };

// Hoisted loop callback - avoids per-call closure allocation
function loopCallback(): void {
  runCore(_controller);
}

// Initialize and start control loop after logger is ready
initialize(function(controller) {
  _controller = controller;

  // Setup handler for commands from features script
  setupCommandHandler(controller);

  // Defer first run to avoid deep stack from init callback
  // Then schedule periodic loop with hoisted callback
  Timer.set(10, false, function() {
    runCore(_controller);
    Timer.set(CONFIG.LOOP_PERIOD_MS, true, loopCallback);
  });
});
