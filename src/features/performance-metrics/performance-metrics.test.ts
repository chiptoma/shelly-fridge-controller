/**
 * Unit tests for performance metrics
 */

import {
  trackLoopExecution,
  formatPerformanceSummary,
  initPerformanceState,
} from './performance-metrics';
import type { PerformanceState } from './types';

describe('Performance Metrics', () => {
  // ═══════════════════════════════════════════════════════════════
  // initPerformanceState()
  // ═══════════════════════════════════════════════════════════════

  describe('initPerformanceState', () => {
    it('should return fresh state with correct initial values', () => {
      const state = initPerformanceState();

      expect(state.loopCount).toBe(0);
      expect(state.loopTimeSum).toBe(0);
      expect(state.loopTimeMax).toBe(0);
      expect(state.loopTimeMin).toBe(Infinity);
      expect(state.slowLoopCount).toBe(0);
      expect(state.lastPerfLog).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // trackLoopExecution()
  // ═══════════════════════════════════════════════════════════════

  describe('trackLoopExecution', () => {
    describe('basic tracking', () => {
      it('should track a single loop execution', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, 0, 0.1, 500);

        expect(result.loopTime).toBe(0.1);
        expect(result.wasSlow).toBe(false);
        expect(result.performance.loopCount).toBe(1);
        expect(result.performance.loopTimeSum).toBe(0.1);
      });

      it('should update min and max times', () => {
        let state = initPerformanceState();

        // First loop sets both min and max
        let result = trackLoopExecution(state, 0, 0.05, 500);
        expect(result.performance.loopTimeMin).toBe(0.05);
        expect(result.performance.loopTimeMax).toBe(0.05);

        // Faster loop updates min
        result = trackLoopExecution(result.performance, 0, 0.01, 500);
        expect(result.performance.loopTimeMin).toBe(0.01);
        expect(result.performance.loopTimeMax).toBe(0.05);

        // Slower loop updates max
        result = trackLoopExecution(result.performance, 0, 0.1, 500);
        expect(result.performance.loopTimeMin).toBe(0.01);
        expect(result.performance.loopTimeMax).toBe(0.1);
      });

      it('should calculate cumulative sum', () => {
        let state = initPerformanceState();

        state = trackLoopExecution(state, 0, 0.1, 500).performance;
        state = trackLoopExecution(state, 0, 0.2, 500).performance;
        state = trackLoopExecution(state, 0, 0.3, 500).performance;

        expect(state.loopTimeSum).toBeCloseTo(0.6);
        expect(state.loopCount).toBe(3);
      });
    });

    describe('slow loop detection', () => {
      it('should detect slow loop when exceeds threshold', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, 0, 0.6, 500); // 600ms > 500ms

        expect(result.wasSlow).toBe(true);
        expect(result.performance.slowLoopCount).toBe(1);
      });

      it('should not flag as slow when at threshold', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, 0, 0.5, 500); // 500ms = 500ms

        expect(result.wasSlow).toBe(false);
      });

      it('should not flag as slow when below threshold', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, 0, 0.1, 500);

        expect(result.wasSlow).toBe(false);
        expect(result.performance.slowLoopCount).toBe(0);
      });

      it('should accumulate slow loop count', () => {
        let state = initPerformanceState();

        state = trackLoopExecution(state, 0, 0.6, 500).performance; // slow
        state = trackLoopExecution(state, 0, 0.1, 500).performance; // fast
        state = trackLoopExecution(state, 0, 0.7, 500).performance; // slow

        expect(state.slowLoopCount).toBe(2);
      });
    });

    describe('edge cases', () => {
      it('should handle zero loop time', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, 1.0, 1.0, 500);

        expect(result.loopTime).toBe(0);
        expect(result.wasSlow).toBe(false);
      });

      it('should handle negative loop time (end before start)', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, 1.0, 0.5, 500);

        expect(result.loopTime).toBe(0);
      });

      it('should handle NaN timestamps', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, NaN, 1.0, 500);

        expect(result.loopTime).toBe(0);
        expect(result.performance).toBe(state);
      });

      it('should handle Infinity timestamps', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, Infinity, 1.0, 500);

        expect(result.loopTime).toBe(0);
      });

      it('should handle zero threshold', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, 0, 0.001, 0);

        expect(result.wasSlow).toBe(false);
      });

      it('should handle negative threshold', () => {
        const state = initPerformanceState();
        const result = trackLoopExecution(state, 0, 0.001, -100);

        expect(result.wasSlow).toBe(false);
      });

      it('should preserve lastPerfLog', () => {
        const state: PerformanceState = {
          ...initPerformanceState(),
          lastPerfLog: 12345,
        };
        const result = trackLoopExecution(state, 0, 0.1, 500);

        expect(result.performance.lastPerfLog).toBe(12345);
      });
    });

    describe('immutability', () => {
      it('should not mutate input state', () => {
        const state = initPerformanceState();
        const original = { ...state };

        trackLoopExecution(state, 0, 0.1, 500);

        expect(state).toEqual(original);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // formatPerformanceSummary()
  // ═══════════════════════════════════════════════════════════════

  describe('formatPerformanceSummary', () => {
    it('should format summary with zero loops', () => {
      const state = initPerformanceState();
      const result = formatPerformanceSummary(state);

      expect(result).toBe('Performance: No loops executed yet');
    });

    it('should format summary with loop data', () => {
      const state: PerformanceState = {
        loopCount: 100,
        loopTimeSum: 5.0, // 50ms average
        loopTimeMax: 0.1, // 100ms
        loopTimeMin: 0.01, // 10ms
        slowLoopCount: 5,
        lastPerfLog: 0,
      };

      const result = formatPerformanceSummary(state);

      expect(result).toContain('100 loops');
      expect(result).toContain('avg=50.0ms');
      expect(result).toContain('min=10.0ms');
      expect(result).toContain('max=100.0ms');
      expect(result).toContain('slow=5 (5.0%)');
    });

    it('should handle single loop', () => {
      const state: PerformanceState = {
        loopCount: 1,
        loopTimeSum: 0.042,
        loopTimeMax: 0.042,
        loopTimeMin: 0.042,
        slowLoopCount: 0,
        lastPerfLog: 0,
      };

      const result = formatPerformanceSummary(state);

      expect(result).toContain('1 loops');
      expect(result).toContain('avg=42.0ms');
    });

    it('should handle zero slow loops', () => {
      const state: PerformanceState = {
        loopCount: 1000,
        loopTimeSum: 10,
        loopTimeMax: 0.05,
        loopTimeMin: 0.005,
        slowLoopCount: 0,
        lastPerfLog: 0,
      };

      const result = formatPerformanceSummary(state);

      expect(result).toContain('slow=0 (0.0%)');
    });

    it('should handle 100% slow loops', () => {
      const state: PerformanceState = {
        loopCount: 10,
        loopTimeSum: 6,
        loopTimeMax: 0.7,
        loopTimeMin: 0.55,
        slowLoopCount: 10,
        lastPerfLog: 0,
      };

      const result = formatPerformanceSummary(state);

      expect(result).toContain('slow=10 (100.0%)');
    });
  });
});
