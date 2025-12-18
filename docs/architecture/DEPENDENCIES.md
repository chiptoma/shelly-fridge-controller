# Module Dependencies

This document describes the dependency structure of the Shelly Fridge Controller codebase.

## Dependency Tiers

Modules are organized into tiers based on their dependencies. Later tiers may depend on earlier tiers, but not vice versa.

| Tier | Module | Dependencies |
|------|--------|--------------|
| 0 | constants.js | None |
| 1 | config.js | None |
| 2 | utils/math.js | None |
| 2 | utils/kvs.js | None |
| 3 | state.js | constants, config, utils/kvs, utils/math |
| 4 | sensors.js | constants, state, utils/math |
| 5 | alarms.js | constants, state, config, utils/math |
| 6 | protection.js | constants, state, config, alarms |
| 7 | features.js | constants, state, config, utils/math |
| 8 | metrics.js | state, config |
| 9 | reporting.js | constants, state, config, metrics, features |
| 10 | control.js | constants, state, config, protection, features, metrics, utils/math |
| 11 | loop.js | All modules |
| 12 | mqtt.js | constants, config, state |
| 13 | main.js | config, state, loop, mqtt, utils/math |

## Dependency Graph

```mermaid
flowchart TD
    subgraph "Tier 0-2: Foundation"
        constants[constants.js]
        config[config.js]
        math[utils/math.js]
        kvs[utils/kvs.js]
    end

    subgraph "Tier 3: State"
        state[state.js]
    end

    subgraph "Tier 4-5: Sensors & Alarms"
        sensors[sensors.js]
        alarms[alarms.js]
    end

    subgraph "Tier 6-8: Business Logic"
        protection[protection.js]
        features[features.js]
        metrics[metrics.js]
    end

    subgraph "Tier 9-10: Control"
        reporting[reporting.js]
        control[control.js]
    end

    subgraph "Tier 11-13: Entry Points"
        loop[loop.js]
        mqtt[mqtt.js]
        main[main.js]
    end

    %% Foundation dependencies
    state --> constants
    state --> config
    state --> kvs
    state --> math

    %% Sensors dependencies
    sensors --> constants
    sensors --> state
    sensors --> math

    %% Alarms dependencies
    alarms --> constants
    alarms --> state
    alarms --> config
    alarms --> math

    %% Protection dependencies
    protection --> constants
    protection --> state
    protection --> config
    protection --> alarms

    %% Features dependencies
    features --> constants
    features --> state
    features --> config
    features --> math

    %% Metrics dependencies
    metrics --> state
    metrics --> config

    %% Reporting dependencies
    reporting --> constants
    reporting --> state
    reporting --> config
    reporting --> metrics
    reporting --> features

    %% Control dependencies
    control --> constants
    control --> state
    control --> config
    control --> protection
    control --> features
    control --> metrics
    control --> math

    %% Loop dependencies
    loop --> constants
    loop --> config
    loop --> state
    loop --> math
    loop --> sensors
    loop --> alarms
    loop --> protection
    loop --> features
    loop --> metrics
    loop --> control
    loop --> reporting

    %% MQTT dependencies
    mqtt --> constants
    mqtt --> config
    mqtt --> state

    %% Main dependencies
    main --> config
    main --> state
    main --> math
    main --> mqtt
    main --> loop
```

## Simplified View

```mermaid
flowchart LR
    subgraph Foundation
        F[constants + config + utils]
    end

    subgraph State
        S[state]
    end

    subgraph Logic
        L[sensors + alarms + protection + features + metrics]
    end

    subgraph Control
        C[control + reporting]
    end

    subgraph Entry
        E[loop + mqtt + main]
    end

    F --> S --> L --> C --> E
```

## Import Rules

1. **No Circular Dependencies**: Module A cannot import from B if B imports from A
2. **Tier Order**: Higher tiers may import from lower tiers, not vice versa
3. **Utility Exception**: `utils/math.js` and `utils/kvs.js` may be imported anywhere
4. **State Singletons**: `S` (persisted) and `V` (volatile) are imported from `state.js`
5. **Config Singleton**: `C` is imported from `config.js`

## Bundle Order

The build tool (`tools/concat.cjs`) concatenates files in tier order. This ensures:

- Dependencies are defined before use
- No forward references
- ES module imports can be stripped safely

See `FILE_ORDER` in `tools/concat.cjs` for the exact concatenation sequence.
