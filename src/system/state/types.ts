
export interface ControllerState {
    // ═══════════════════════════════════════════════════════════════
    // CORE: RELAY STATE
    // ═══════════════════════════════════════════════════════════════
    intendedOn: boolean;
    confirmedOn: boolean;
    lastOnTime: number;
    lastOffTime: number;
    lastStateChangeCommand: number;

    // ═══════════════════════════════════════════════════════════════
    // CORE: TIMING
    // ═══════════════════════════════════════════════════════════════
    startTime: number;
    lastLoopTime: number;

    // ═══════════════════════════════════════════════════════════════
    // CORE: FREEZE PROTECTION
    // ═══════════════════════════════════════════════════════════════
    freezeLocked: boolean;
    lockCount: number;
    unlockTime: number;

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_SENSOR_FAILURE: SENSOR HEALTH MONITORING
    // ═══════════════════════════════════════════════════════════════
    airLastRaw: number | null;
    airLastReadTime: number;
    airLastChangeTime: number;
    airNoReadingFired: boolean;
    airStuckFired: boolean;
    airCriticalFailure: boolean;

    evapLastRaw: number | null;
    evapLastReadTime: number;
    evapLastChangeTime: number;
    evapNoReadingFired: boolean;
    evapStuckFired: boolean;
    evapCriticalFailure: boolean;

    // ═══════════════════════════════════════════════════════════════
    // CORE: SENSOR SMOOTHING
    // ═══════════════════════════════════════════════════════════════
    airTempBuffer: number[];
    evapTempBuffer: number[];
    airTempSmoothed: number | null;
    evapTempSmoothed: number | null;

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_DUTY_CYCLE: DUTY CYCLE TRACKING
    // ═══════════════════════════════════════════════════════════════
    dutyOnSec: number;
    dutyOffSec: number;
    dutyLastReset: number;

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_DAILY_SUMMARY: DAILY STATISTICS
    // ═══════════════════════════════════════════════════════════════
    dayOnSec: number;
    dayOffSec: number;

    dayAirMin: number | null;
    dayAirMax: number | null;
    dayAirSum: number;
    dayAirCount: number;

    dayEvapMin: number | null;
    dayEvapMax: number | null;
    dayEvapSum: number;
    dayEvapCount: number;

    dayFreezeCount: number;
    dayHighTempCount: number;
    lastDailySummaryDate: string | null;

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_HIGH_TEMP_ALERTS: HIGH TEMPERATURE ALERTING
    // ═══════════════════════════════════════════════════════════════
    instantStart: number;
    instantFired: boolean;
    sustainedStart: number;
    sustainedFired: boolean;
    // Pre-allocated alert state object for memory efficiency
    alertState: {
        instant: { startTime: number; fired: boolean };
        sustained: { startTime: number; fired: boolean };
        justFired: boolean;
    };

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_ADAPTIVE_HYSTERESIS: DYNAMIC THRESHOLD ADJUSTMENT
    // ═══════════════════════════════════════════════════════════════
    dynOnAbove: number;
    dynOffBelow: number;
    lastAdaptiveAdjust: number;

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_WATCHDOG: SYSTEM HEALTH MONITORING
    // ═══════════════════════════════════════════════════════════════
    lastWatchdogPet: number;

    // ═══════════════════════════════════════════════════════════════
    // CORE: ERROR TRACKING
    // ═══════════════════════════════════════════════════════════════
    consecutiveErrors: number;
    lastErrorTime: number;

    // ═══════════════════════════════════════════════════════════════
    // CORE: MIN_ON/MIN_OFF WAIT STATE LOGGING
    // ═══════════════════════════════════════════════════════════════
    minOnWaitLogged: boolean;
    minOffWaitLogged: boolean;

    // ═══════════════════════════════════════════════════════════════
    // FEATURE_PERFORMANCE_METRICS: LOOP EXECUTION TRACKING
    // ═══════════════════════════════════════════════════════════════
    loopCount: number;
    loopTimeSum: number;
    loopTimeMax: number;
    loopTimeMin: number;
    slowLoopCount: number;
    lastPerfLog: number;
}
