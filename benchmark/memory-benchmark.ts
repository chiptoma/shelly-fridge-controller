/**
 * Memory Benchmark for Fridge Controller
 *
 * Measures heap usage and allocations per control loop iteration.
 * Uses V8 heap statistics for accurate measurements.
 *
 * Usage: npx ts-node benchmark/memory-benchmark.ts
 */

import * as v8 from 'v8';

// Import production modules
import { createInitialState } from '@system/state/state';
import { runCore } from '@system/control/control-core';
import CONFIG from '@boot/config';
import { estimateObjectSize } from './allocation-tracker';

// Mock Shelly APIs
const mockSensors = {
  airRaw: 4.5,
  evapRaw: -5.0,
  relayOn: false
};

let emittedEvents: any[] = [];
let eventHandlers: ((event: any) => void)[] = [];

const mockShelly = {
  getComponentStatus: (component: string) => {
    if (component === 'sys') {
      return { uptime: Date.now() / 1000 };
    }
    if (component === 'switch:0') {
      return { output: mockSensors.relayOn };
    }
    if (component === 'temperature:100') {
      return { tC: mockSensors.airRaw };
    }
    if (component === 'temperature:101') {
      return { tC: mockSensors.evapRaw };
    }
    return {};
  },
  call: (method: string, params: any, callback?: (result: any) => void) => {
    if (method === 'Switch.Set' && params.id === 0) {
      mockSensors.relayOn = params.on;
    }
    if (callback) callback({ was_on: !mockSensors.relayOn });
  },
  emitEvent: (name: string, data: unknown) => {
    emittedEvents.push({ name, data });
    // Trigger handlers
    for (const handler of eventHandlers) {
      handler({ name, info: data });
    }
  },
  addEventHandler: (callback: (event: { name: string; info: unknown }) => void) => {
    eventHandlers.push(callback);
  }
};

const mockTimer = {
  set: (_ms: number, _repeat: boolean, _callback: () => void) => {
    return 1;
  },
  clear: (_id: number) => {}
};

// Inject mocks into global scope
(global as any).Shelly = mockShelly;
(global as any).Timer = mockTimer;

interface BenchmarkResult {
  iterations: number;
  heapBefore: number;
  heapAfter: number;
  heapDelta: number;
  heapPerIteration: number;
  externalBefore: number;
  externalAfter: number;
  gcRuns: number;
  avgLoopTimeMs: number;
  stateSize: number;
}

/**
 * Force garbage collection if available
 */
function forceGC(): boolean {
  if (global.gc) {
    global.gc();
    return true;
  }
  return false;
}

/**
 * Get current heap statistics
 */
function getHeapStats() {
  const stats = v8.getHeapStatistics();
  return {
    used: stats.used_heap_size,
    total: stats.total_heap_size,
    external: stats.external_memory
  };
}

/**
 * Run the benchmark
 */
function runBenchmark(iterations: number): BenchmarkResult {
  // Create initial state
  const nowSec = Date.now() / 1000;
  const state = createInitialState(nowSec, false, CONFIG);

  // Create mock logger
  const mockLogger = {
    debug: () => {},
    info: () => {},
    warning: () => {},
    critical: () => {}
  };

  // Create controller
  const controller = {
    state,
    logger: mockLogger,
    isDebug: false
  };

  // Estimate state size
  const stateSize = estimateObjectSize(state);

  // Warm up - run a few iterations to stabilize
  for (let i = 0; i < 10; i++) {
    emittedEvents = [];
    runCore(controller as any);
  }

  // Force GC before measurement
  const gcAvailable = forceGC();

  // Measure heap before
  const heapBefore = getHeapStats();

  // Run benchmark
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    emittedEvents = [];

    // Simulate temperature variations
    mockSensors.airRaw = 3.5 + Math.sin(i / 100) * 2;
    mockSensors.evapRaw = -8 + Math.sin(i / 50);

    runCore(controller as any);
  }

  const endTime = Date.now();

  // Force GC after measurement
  forceGC();

  // Measure heap after
  const heapAfter = getHeapStats();

  return {
    iterations,
    heapBefore: heapBefore.used,
    heapAfter: heapAfter.used,
    heapDelta: heapAfter.used - heapBefore.used,
    heapPerIteration: (heapAfter.used - heapBefore.used) / iterations,
    externalBefore: heapBefore.external,
    externalAfter: heapAfter.external,
    gcRuns: gcAvailable ? 2 : 0,
    avgLoopTimeMs: (endTime - startTime) / iterations,
    stateSize
  };
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) {
    return bytes.toFixed(0) + ' B';
  }
  return (bytes / 1024).toFixed(2) + ' KB';
}

/**
 * Main entry point
 */
function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Fridge Controller Memory Benchmark                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  if (!global.gc) {
    console.log('⚠️  Warning: GC not exposed. Run with --expose-gc for accurate results');
    console.log('   Example: node --expose-gc -r ts-node/register benchmark/memory-benchmark.ts');
    console.log();
  }

  // Run with different iteration counts
  const testCases = [100, 1000, 10000];

  for (const iterations of testCases) {
    console.log(`Running ${iterations} iterations...`);
    const result = runBenchmark(iterations);

    console.log();
    console.log(`📊 Results for ${iterations} iterations:`);
    console.log('─'.repeat(50));
    console.log(`  State object size:     ${formatBytes(result.stateSize)}`);
    console.log(`  Heap before:           ${formatBytes(result.heapBefore)}`);
    console.log(`  Heap after:            ${formatBytes(result.heapAfter)}`);
    console.log(`  Heap delta:            ${formatBytes(result.heapDelta)}`);
    console.log(`  Heap per iteration:    ${formatBytes(result.heapPerIteration)}`);
    console.log(`  Avg loop time:         ${result.avgLoopTimeMs.toFixed(3)} ms`);
    console.log();

    // Calculate daily allocations (assuming 5s loop period)
    const loopsPerDay = (24 * 60 * 60) / 5; // 17,280 loops/day
    const dailyAllocation = result.heapPerIteration * loopsPerDay;

    console.log('📈 Projected daily impact (5s loop period):');
    console.log('─'.repeat(50));
    console.log(`  Loops per day:         ${loopsPerDay.toLocaleString()}`);
    console.log(`  Daily allocations:     ${formatBytes(dailyAllocation)}`);
    console.log(`  GC pressure:           ${dailyAllocation > 100000 ? '⚠️  HIGH' : dailyAllocation > 10000 ? '⚡ MEDIUM' : '✅ LOW'}`);
    console.log();
    console.log('═'.repeat(50));
    console.log();
  }

  // Summary
  console.log('💡 Optimization targets:');
  console.log('─'.repeat(50));
  console.log('  Target heap/iteration: < 100 bytes (low GC pressure)');
  console.log('  Target daily alloc:    < 1.7 MB');
  console.log('  Shelly heap limit:     25 KB');
  console.log();
}

main();
