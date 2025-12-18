# ADR 004: Sequential KVS Loading

## Status

Accepted

## Context

The fridge controller stores configuration and state in Shelly's Key-Value Store (KVS). At boot, this data must be loaded before the control loop starts.

Initial implementation used parallel loading:

```javascript
// Original approach (caused memory spikes)
Promise.all([
  loadChunk('fridge_cfg_ctl'),
  loadChunk('fridge_cfg_trb'),
  loadChunk('fridge_st_core'),
  // ... 10+ chunks
])
```

This caused memory spikes to ~28KB, exceeding the 25KB heap limit and causing crashes on some boots.

## Decision

We implemented **sequential KVS loading** with garbage collection opportunities between chunks.

```javascript
// Sequential loading (stable memory)
function loadChunksSeq(keyMap, target, onComplete) {
  let keys = Object.keys(keyMap)
  let idx = 0

  function loadNext() {
    if (idx >= keys.length) {
      onComplete(idx)
      return
    }

    let key = keys[idx]
    Shelly.call('KVS.Get', { key: key }, function($_r, $_e) {
      if ($_e === 0 && $_r && $_r.value) {
        // Parse and merge
        let parsed = JSON.parse($_r.value)
        // ... merge into target
      }
      idx++
      // Allow GC before next chunk
      loadNext()
    })
  }

  loadNext()
}
```

## Rationale

### Memory Profile Comparison

**Parallel Loading**
```
Time:     t0    t1    t2    t3    t4
Memory:   8KB → 12KB → 18KB → 25KB → 28KB (CRASH)
                ↑     ↑      ↑      ↑
              chunk1 chunk2 chunk3 chunk4...
```

All chunks in flight simultaneously, JSON strings accumulate.

**Sequential Loading**
```
Time:     t0    t1    t2    t3    t4    t5
Memory:   8KB → 12KB → 10KB → 14KB → 11KB → 14KB (STABLE)
                ↑      ↑      ↑      ↑
              load1  GC    load2  GC    ...
```

Each chunk loads, parses, merges, then GC runs before next.

### Why mJS Needs This

Shelly's mJS runtime has:
- Reference counting GC (no mark-and-sweep)
- GC runs between Shelly.call callbacks
- No explicit GC trigger available
- Limited stack for concurrent callbacks

Sequential loading exploits the callback boundary for GC.

### Chunk Design

Chunks are sized to balance:
- Memory per chunk (~1-2KB JSON)
- Number of KVS operations (fewer is faster)
- Logical grouping (related settings together)

```javascript
// Config chunks (~1KB each)
'fridge_cfg_ctl': 3 fields
'fridge_cfg_trb': 4 fields
'fridge_cfg_adt': 5 fields
// ...

// State chunks (~2KB each)
'fridge_st_core': 8 fields
'fridge_st_stats': 10 fields
'fridge_st_hist': 1 field (24-element array)
'fridge_st_faults': 4 fields (fault arrays)
```

## Consequences

### Positive

- Stable memory under 22KB peak
- No boot crashes from memory pressure
- Predictable load sequence
- Error recovery per chunk

### Negative

- Slower boot (~500ms per chunk)
- Total boot time ~5 seconds
- More complex async code
- Must maintain chunk order

### Mitigations

- Boot time acceptable for appliance controller
- Main loop starts immediately after load
- Error handling skips corrupt chunks
- Default values used for missing fields

## Implementation Notes

### Smart Sync

Writing uses similar sequencing with smart sync:

```javascript
// Only write chunks that changed
function chunkNeedsSync(chunkKey, keyMap, source) {
  // Compare current values to cached
  // Return true only if different
}

function syncToKvs(keyMap, source, onComplete) {
  // Sequential writes, skip unchanged chunks
}
```

### Boot Recovery

After loading, `recoverBootState()` validates:
- Hardware relay state matches `S.sys_isRelayOn`
- Timestamps are not in future
- Statistics are within reasonable bounds

## Related

- ADR 002: Memory Optimization Patterns
- ADR 003: Three-Tier Data Model
