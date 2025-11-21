/**
 * Unit tests for daily summary functions
 */

import {
  updateDailyStats,
  updateDailyRuntime,
  shouldGenerateSummary,
  calculateSummary,
  resetDailyStats,
  formatDailySummary
} from './daily-summary';
import type { DailyState, SummaryResult } from './types';

describe('Daily Summary', () => {
  // ═══════════════════════════════════════════════════════════════
  // formatDailySummary()
  // ═══════════════════════════════════════════════════════════════

  describe('formatDailySummary', () => {
    describe('complete data formatting', () => {
      it('should format summary with all values present', () => {
        const summary: SummaryResult = {
          onHours: 12.5,
          offHours: 11.5,
          dutyPct: 52,
          airMin: 3.0,
          airMax: 6.0,
          airAvg: 4.2,
          evapMin: -15.0,
          evapMax: -5.0,
          evapAvg: -10.0,
          freezeCount: 2,
          highTempCount: 1
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toBe(
          'Daily Summary (2025-01-15): ON 12.5h (52%), Air 3.0/6.0/4.2C, Evap -15.0/-5.0/-10.0C, Freeze 2, HighTemp 1'
        );
      });

      it('should format with zero counts', () => {
        const summary: SummaryResult = {
          onHours: 8.0,
          offHours: 16.0,
          dutyPct: 33,
          airMin: 4.0,
          airMax: 5.0,
          airAvg: 4.5,
          evapMin: -10.0,
          evapMax: -8.0,
          evapAvg: -9.0,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-16');

        expect(result).toContain('Freeze 0');
        expect(result).toContain('HighTemp 0');
      });

      it('should round hours to one decimal place', () => {
        const summary: SummaryResult = {
          onHours: 12.567,
          offHours: 11.433,
          dutyPct: 52.3,
          airMin: 3.0,
          airMax: 6.0,
          airAvg: 4.2,
          evapMin: -15.0,
          evapMax: -5.0,
          evapAvg: -10.0,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('ON 12.6h');
      });

      it('should round duty percentage to zero decimal places', () => {
        const summary: SummaryResult = {
          onHours: 12.0,
          offHours: 12.0,
          dutyPct: 52.789,
          airMin: 3.0,
          airMax: 6.0,
          airAvg: 4.2,
          evapMin: -15.0,
          evapMax: -5.0,
          evapAvg: -10.0,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('(53%)');
      });

      it('should round temperatures to one decimal place', () => {
        const summary: SummaryResult = {
          onHours: 12.0,
          offHours: 12.0,
          dutyPct: 50,
          airMin: 3.456,
          airMax: 6.789,
          airAvg: 4.234,
          evapMin: -15.678,
          evapMax: -5.123,
          evapAvg: -10.456,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('Air 3.5/6.8/4.2C');
        expect(result).toContain('Evap -15.7/-5.1/-10.5C');
      });
    });

    describe('null value handling', () => {
      it('should show n/a for null air values', () => {
        const summary: SummaryResult = {
          onHours: 12.0,
          offHours: 12.0,
          dutyPct: 50,
          airMin: null,
          airMax: null,
          airAvg: null,
          evapMin: -10.0,
          evapMax: -5.0,
          evapAvg: -7.5,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('Air n/a/n/a/n/aC');
      });

      it('should show n/a for null evap values', () => {
        const summary: SummaryResult = {
          onHours: 12.0,
          offHours: 12.0,
          dutyPct: 50,
          airMin: 3.0,
          airMax: 6.0,
          airAvg: 4.5,
          evapMin: null,
          evapMax: null,
          evapAvg: null,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('Evap n/a/n/a/n/aC');
      });

      it('should handle partial null values', () => {
        const summary: SummaryResult = {
          onHours: 12.0,
          offHours: 12.0,
          dutyPct: 50,
          airMin: 3.0,
          airMax: null,
          airAvg: 4.5,
          evapMin: null,
          evapMax: -5.0,
          evapAvg: null,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('Air 3.0/n/a/4.5C');
        expect(result).toContain('Evap n/a/-5.0/n/aC');
      });

      it('should handle all null temperatures', () => {
        const summary: SummaryResult = {
          onHours: 0,
          offHours: 24.0,
          dutyPct: 0,
          airMin: null,
          airMax: null,
          airAvg: null,
          evapMin: null,
          evapMax: null,
          evapAvg: null,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('Air n/a/n/a/n/aC');
        expect(result).toContain('Evap n/a/n/a/n/aC');
      });
    });

    describe('edge cases', () => {
      it('should format zero hours correctly', () => {
        const summary: SummaryResult = {
          onHours: 0,
          offHours: 24.0,
          dutyPct: 0,
          airMin: 4.0,
          airMax: 4.0,
          airAvg: 4.0,
          evapMin: -10.0,
          evapMax: -10.0,
          evapAvg: -10.0,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('ON 0.0h (0%)');
      });

      it('should format 100% duty cycle correctly', () => {
        const summary: SummaryResult = {
          onHours: 24.0,
          offHours: 0,
          dutyPct: 100,
          airMin: 4.0,
          airMax: 6.0,
          airAvg: 5.0,
          evapMin: -10.0,
          evapMax: -5.0,
          evapAvg: -7.5,
          freezeCount: 5,
          highTempCount: 3
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('ON 24.0h (100%)');
      });

      it('should format negative air temperatures', () => {
        const summary: SummaryResult = {
          onHours: 12.0,
          offHours: 12.0,
          dutyPct: 50,
          airMin: -2.0,
          airMax: -0.5,
          airAvg: -1.2,
          evapMin: -20.0,
          evapMax: -15.0,
          evapAvg: -17.5,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('Air -2.0/-0.5/-1.2C');
      });

      it('should handle high counts', () => {
        const summary: SummaryResult = {
          onHours: 12.0,
          offHours: 12.0,
          dutyPct: 50,
          airMin: 4.0,
          airMax: 6.0,
          airAvg: 5.0,
          evapMin: -10.0,
          evapMax: -5.0,
          evapAvg: -7.5,
          freezeCount: 100,
          highTempCount: 50
        };

        const result = formatDailySummary(summary, '2025-01-15');

        expect(result).toContain('Freeze 100');
        expect(result).toContain('HighTemp 50');
      });

      it('should include date in correct format', () => {
        const summary: SummaryResult = {
          onHours: 12.0,
          offHours: 12.0,
          dutyPct: 50,
          airMin: 4.0,
          airMax: 6.0,
          airAvg: 5.0,
          evapMin: -10.0,
          evapMax: -5.0,
          evapAvg: -7.5,
          freezeCount: 0,
          highTempCount: 0
        };

        const result = formatDailySummary(summary, '2025-12-31');

        expect(result).toContain('Daily Summary (2025-12-31)');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // resetDailyStats()
  // ═══════════════════════════════════════════════════════════════

  describe('resetDailyStats', () => {
    it('should return fresh state with all fields reset', () => {
      const state = resetDailyStats();

      expect(state.dayOnSec).toBe(0);
      expect(state.dayOffSec).toBe(0);
      expect(state.dayAirMin).toBeNull();
      expect(state.dayAirMax).toBeNull();
      expect(state.dayAirSum).toBe(0);
      expect(state.dayAirCount).toBe(0);
      expect(state.dayEvapMin).toBeNull();
      expect(state.dayEvapMax).toBeNull();
      expect(state.dayEvapSum).toBe(0);
      expect(state.dayEvapCount).toBe(0);
      expect(state.freezeCount).toBe(0);
      expect(state.highTempCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // shouldGenerateSummary()
  // ═══════════════════════════════════════════════════════════════

  describe('shouldGenerateSummary', () => {
    it('should generate summary at summary hour on new day', () => {
      // Jan 15, 2025 at 6:00 AM
      const timestamp = new Date('2025-01-15T06:00:00').getTime() / 1000;
      const result = shouldGenerateSummary(timestamp, '2025-01-14', 6);

      expect(result.shouldGenerate).toBe(true);
      expect(result.currentDate).toBe('2025-01-15');
    });

    it('should not generate summary if already generated today', () => {
      const timestamp = new Date('2025-01-15T06:00:00').getTime() / 1000;
      const result = shouldGenerateSummary(timestamp, '2025-01-15', 6);

      expect(result.shouldGenerate).toBe(false);
    });

    it('should not generate summary at wrong hour', () => {
      const timestamp = new Date('2025-01-15T07:00:00').getTime() / 1000;
      const result = shouldGenerateSummary(timestamp, '2025-01-14', 6);

      expect(result.shouldGenerate).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // calculateSummary()
  // ═══════════════════════════════════════════════════════════════

  describe('calculateSummary', () => {
    it('should calculate summary from daily state', () => {
      const state: DailyState = {
        dayOnSec: 43200, // 12 hours
        dayOffSec: 43200, // 12 hours
        dayAirMin: 3.0,
        dayAirMax: 6.0,
        dayAirSum: 450,
        dayAirCount: 100,
        dayEvapMin: -15.0,
        dayEvapMax: -5.0,
        dayEvapSum: -1000,
        dayEvapCount: 100,
        freezeCount: 2,
        highTempCount: 1
      };

      const result = calculateSummary(state);

      expect(result.onHours).toBe(12);
      expect(result.offHours).toBe(12);
      expect(result.dutyPct).toBe(50);
      expect(result.airMin).toBe(3.0);
      expect(result.airMax).toBe(6.0);
      expect(result.airAvg).toBe(4.5);
      expect(result.evapMin).toBe(-15.0);
      expect(result.evapMax).toBe(-5.0);
      expect(result.evapAvg).toBe(-10.0);
      expect(result.freezeCount).toBe(2);
      expect(result.highTempCount).toBe(1);
    });

    it('should handle zero counts for average calculation', () => {
      const state: DailyState = {
        dayOnSec: 0,
        dayOffSec: 86400,
        dayAirMin: null,
        dayAirMax: null,
        dayAirSum: 0,
        dayAirCount: 0,
        dayEvapMin: null,
        dayEvapMax: null,
        dayEvapSum: 0,
        dayEvapCount: 0,
        freezeCount: 0,
        highTempCount: 0
      };

      const result = calculateSummary(state);

      expect(result.airAvg).toBeNull();
      expect(result.evapAvg).toBeNull();
      expect(result.dutyPct).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // updateDailyStats()
  // ═══════════════════════════════════════════════════════════════

  describe('updateDailyStats', () => {
    it('should update min/max/sum/count for air temperature', () => {
      const state: DailyState = {
        dayAirMin: null,
        dayAirMax: null,
        dayAirSum: 0,
        dayAirCount: 0,
        dayEvapMin: null,
        dayEvapMax: null,
        dayEvapSum: 0,
        dayEvapCount: 0,
        dayOnSec: 0,
        dayOffSec: 0,
        freezeCount: 0,
        highTempCount: 0
      };

      updateDailyStats(state, 5.0, null);

      expect(state.dayAirMin).toBe(5.0);
      expect(state.dayAirMax).toBe(5.0);
      expect(state.dayAirSum).toBe(5.0);
      expect(state.dayAirCount).toBe(1);
    });

    it('should handle null readings', () => {
      const state: DailyState = {
        dayAirMin: 4.0,
        dayAirMax: 6.0,
        dayAirSum: 10,
        dayAirCount: 2,
        dayEvapMin: null,
        dayEvapMax: null,
        dayEvapSum: 0,
        dayEvapCount: 0,
        dayOnSec: 0,
        dayOffSec: 0,
        freezeCount: 0,
        highTempCount: 0
      };

      updateDailyStats(state, null, null);

      // Should remain unchanged
      expect(state.dayAirMin).toBe(4.0);
      expect(state.dayAirMax).toBe(6.0);
      expect(state.dayAirCount).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // updateDailyRuntime()
  // ═══════════════════════════════════════════════════════════════

  describe('updateDailyRuntime', () => {
    it('should accumulate ON time when relay is on', () => {
      const state: DailyState = {
        dayOnSec: 100,
        dayOffSec: 50,
        dayAirMin: null,
        dayAirMax: null,
        dayAirSum: 0,
        dayAirCount: 0,
        dayEvapMin: null,
        dayEvapMax: null,
        dayEvapSum: 0,
        dayEvapCount: 0,
        freezeCount: 0,
        highTempCount: 0
      };

      updateDailyRuntime(state, 10, true);

      expect(state.dayOnSec).toBe(110);
      expect(state.dayOffSec).toBe(50);
    });

    it('should accumulate OFF time when relay is off', () => {
      const state: DailyState = {
        dayOnSec: 100,
        dayOffSec: 50,
        dayAirMin: null,
        dayAirMax: null,
        dayAirSum: 0,
        dayAirCount: 0,
        dayEvapMin: null,
        dayEvapMax: null,
        dayEvapSum: 0,
        dayEvapCount: 0,
        freezeCount: 0,
        highTempCount: 0
      };

      updateDailyRuntime(state, 10, false);

      expect(state.dayOnSec).toBe(100);
      expect(state.dayOffSec).toBe(60);
    });

    it('should not update with zero or negative delta', () => {
      const state: DailyState = {
        dayOnSec: 100,
        dayOffSec: 50,
        dayAirMin: null,
        dayAirMax: null,
        dayAirSum: 0,
        dayAirCount: 0,
        dayEvapMin: null,
        dayEvapMax: null,
        dayEvapSum: 0,
        dayEvapCount: 0,
        freezeCount: 0,
        highTempCount: 0
      };

      updateDailyRuntime(state, 0, true);
      expect(state.dayOnSec).toBe(100);

      updateDailyRuntime(state, -5, true);
      expect(state.dayOnSec).toBe(100);
    });
  });
});
