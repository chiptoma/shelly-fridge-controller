/**
 * Allocation Tracker for Memory Benchmarking
 *
 * Tracks object and array allocations to measure GC pressure.
 * Used to compare memory efficiency before/after optimizations.
 */

export interface AllocationStats {
  objects: number;
  arrays: number;
  strings: number;
  totalAllocations: number;
}

export interface AllocationTracker {
  reset(): void;
  getStats(): AllocationStats;
  trackObject(): void;
  trackArray(): void;
  trackString(): void;
}

/**
 * Create an allocation tracker
 */
export function createAllocationTracker(): AllocationTracker {
  let objects = 0;
  let arrays = 0;
  let strings = 0;

  function reset(): void {
    objects = 0;
    arrays = 0;
    strings = 0;
  }

  function getStats(): AllocationStats {
    return {
      objects: objects,
      arrays: arrays,
      strings: strings,
      totalAllocations: objects + arrays + strings
    };
  }

  function trackObject(): void {
    objects++;
  }

  function trackArray(): void {
    arrays++;
  }

  function trackString(): void {
    strings++;
  }

  return {
    reset: reset,
    getStats: getStats,
    trackObject: trackObject,
    trackArray: trackArray,
    trackString: trackString
  };
}

/**
 * Estimate object size in bytes (rough approximation)
 * Based on V8's object overhead + property storage
 */
export function estimateObjectSize(obj: any): number {
  if (obj === null || obj === undefined) return 0;

  const type = typeof obj;

  if (type === 'boolean') return 4;
  if (type === 'number') return 8;
  if (type === 'string') return 2 * (obj as string).length + 12; // 2 bytes per char + header

  if (Array.isArray(obj)) {
    // Array header (~32 bytes) + elements
    let size = 32;
    for (let i = 0; i < obj.length; i++) {
      size += estimateObjectSize(obj[i]) + 8; // 8 bytes per slot
    }
    return size;
  }

  if (type === 'object') {
    // Object header (~24 bytes) + properties
    let size = 24;
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      size += 2 * keys[i].length + 12; // key string
      size += estimateObjectSize(obj[keys[i]]) + 8; // value + slot
    }
    return size;
  }

  return 8; // default for functions, symbols, etc.
}
