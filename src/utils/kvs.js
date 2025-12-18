// ==============================================================================
// KVS UTILITIES
// Helper functions for Shelly Key-Value Store operations.
// Includes parsing, merging, sync checking, and async save operations.
// ==============================================================================

// ----------------------------------------------------------
// INLINE HELPER: pickKeys
// Inlined to reduce module overhead (~350 bytes saved).
// ----------------------------------------------------------

/**
 * pickKeys - Extract subset of object keys
 * Creates new object with only specified keys from source.
 *
 * @param {object} obj  - Source object
 * @param {string[]} keys - Keys to extract
 * @returns {object} New object with only specified keys
 */
function pickKeys(obj, keys) {
  let result = {}
  for (let i = 0; i < keys.length; i++) {
    if (obj[keys[i]] !== undefined) result[keys[i]] = obj[keys[i]]
  }
  return result
}

// ----------------------------------------------------------
// SEQUENTIAL KVS LOADING
// Loads chunks one at a time to reduce peak memory.
// Retries on KVS errors, marks parse errors for rewrite.
// ----------------------------------------------------------

/**
 * loadChunksSeq - Load KVS chunks sequentially with retry
 * Retries KVS.Get errors up to 3 times. Parse errors marked for rewrite.
 * loadedChunks[key] = false means corrupted data, needs defaults.
 *
 * @param {object} mapping - Key mappings (e.g., CFG_KEYS)
 * @param {object} target - Target object to merge into
 * @param {Function} onDone - Callback with loadedChunks object
 * @mutates target - Merged with values from KVS
 */
function loadChunksSeq(mapping, target, onDone) {
  let keys = Object.keys(mapping)
  let loadedChunks = {}
  let idx = 0

  /**
   * loadWithRetry - Load a single chunk with retry logic
   * @param {string} key - KVS key to load
   * @param {number} retries - Remaining retry attempts
   * @internal
   */
  function loadWithRetry(key, retries) {
    Shelly.call('KVS.Get', { key: key }, function ($_r, $_e) {
      // KVS error (not "key not found") - retry
      if ($_e !== 0 && $_e !== -104 && retries > 0) {
        print('⚠️ KVS   : Retry ' + key + ' (attempt ' + (4 - retries) + '/3)')
        Timer.set(100, false, function () { loadWithRetry(key, retries - 1) })
        return
      }

      // KVS error after all retries - FATAL (abnormal hardware state)
      if ($_e !== 0 && $_e !== -104) {
        print('🛑 KVS   : FATAL - Cannot read ' + key + ' after 3 retries, error=' + $_e)
        // Continue with partial data - system will use defaults for missing chunks
        if (onDone) Timer.set(0, false, function () { onDone(loadedChunks) })
        return
      }

      // Key not found (first boot) - loadedChunks[key] stays undefined
      if ($_e === -104 || !$_r || !$_r.value) {
        idx++
        Timer.set(0, false, next)
        return
      }

      // Parse JSON
      try {
        let chunk = JSON.parse($_r.value)
        loadedChunks[key] = chunk
        // Merge immediately to allow chunk to be GC'd
        let chunkKeys = Object.keys(chunk)
        for (let i = 0; i < chunkKeys.length; i++) {
          target[chunkKeys[i]] = chunk[chunkKeys[i]]
        }
      } catch (e) {
        print('⚠️ KVS   : Parse error for ' + key + ' - will save defaults')
        loadedChunks[key] = false  // MARKER: corrupted, needs rewrite
      }

      idx++
      Timer.set(0, false, next)
    })
  }

  /**
   * next - Load next chunk in sequence
   * @internal
   */
  function next() {
    if (idx >= keys.length) {
      if (onDone) Timer.set(0, false, function () { onDone(loadedChunks) })
      return
    }
    loadWithRetry(keys[idx], 3)  // 3 retries
  }

  Timer.set(0, false, next)
}

// ----------------------------------------------------------
// CHUNK SYNC CHECK
// ----------------------------------------------------------

/**
 * chunkNeedsSync - Check if chunk needs saving
 *
 * @param {object | null} loadedChunk - Chunk loaded from KVS (or null)
 * @param {string[]} expectedKeys - Array of expected key names
 * @returns {boolean} - True if sync needed
 */
function chunkNeedsSync(loadedChunk, expectedKeys) {
  if (!loadedChunk) return true

  for (let i = 0; i < expectedKeys.length; i++) {
    if (loadedChunk[expectedKeys[i]] === undefined) return true
  }

  let loadedKeys = Object.keys(loadedChunk)
  for (let j = 0; j < loadedKeys.length; j++) {
    let found = false
    for (let i = 0; i < expectedKeys.length; i++) {
      if (expectedKeys[i] === loadedKeys[j]) { found = true; break }
    }
    if (!found) return true
  }

  return false
}

// ----------------------------------------------------------
// SYNC TO KVS
// Smart sync: preserves loaded values, only adds missing fields.
// ----------------------------------------------------------

/**
 * syncToKvs - Sync chunks to KVS storage with smart merging
 * Parse error (false) or first boot (undefined): saves defaults.
 * Schema mismatch: preserves loaded values, adds missing from defaults.
 *
 * @param {object} mapping - Key mappings (e.g., ST_KEYS)
 * @param {object} source - Source object to sync from (defaults)
 * @param {object} loadedChunks - Already loaded chunks from KVS
 * @param {Function} onDone - Callback when sync complete
 * @param {string} label - Label for logging
 */
function syncToKvs(mapping, source, loadedChunks, onDone, label) {
  let toSave = []
  let toDelete = []

  let mapKeys = Object.keys(mapping)
  for (let i = 0; i < mapKeys.length; i++) {
    let key = mapKeys[i]
    let chunk = loadedChunks[key]
    let expectedKeys = mapping[key]

    if (chunk === false) {
      // Parse error - data corrupted, save defaults
      toSave.push({ key: key, data: pickKeys(source, expectedKeys) })
    } else if (chunk === undefined) {
      // First boot - key not found, save defaults
      toSave.push({ key: key, data: pickKeys(source, expectedKeys) })
    } else if (chunkNeedsSync(chunk, expectedKeys)) {
      // Schema mismatch - MERGE: preserve loaded, add missing from defaults
      let merged = {}
      for (let j = 0; j < expectedKeys.length; j++) {
        let field = expectedKeys[j]
        if (chunk[field] !== undefined) {
          merged[field] = chunk[field]  // PRESERVE loaded value
        } else {
          merged[field] = source[field]  // ADD missing from default
        }
      }
      // Extra fields automatically excluded (only iterate expectedKeys)
      toSave.push({ key: key, data: merged })
    }
  }

  // Check for orphaned KVS keys to delete
  let loadKeys = Object.keys(loadedChunks)
  for (let i = 0; i < loadKeys.length; i++) {
    if (loadedChunks[loadKeys[i]] !== false && !mapping[loadKeys[i]]) {
      toDelete.push(loadKeys[i])
    }
  }

  if (toSave.length === 0 && toDelete.length === 0) {
    if (onDone) Timer.set(0, false, onDone)
    return
  }

  let ops = []
  for (let i = 0; i < toSave.length; i++) ops.push({ type: 'save', item: toSave[i] })
  for (let i = 0; i < toDelete.length; i++) ops.push({ type: 'del', name: toDelete[i] })

  let idx = 0
  /**
   * next - Process next sync operation
   * @internal
   */
  function next() {
    if (idx >= ops.length) {
      if (label && (toSave.length > 0 || toDelete.length > 0)) {
        let names = []
        for (let i = 0; i < toSave.length; i++) names.push(toSave[i].key)
        let info = names.length > 0 ? ' [' + names.join(',') + ']' : ''
        print('🔄 KVS   : ' + label + ' sync: ' + toSave.length + ' saved, ' + toDelete.length + ' removed' + info)
      }
      if (onDone) Timer.set(0, false, onDone)
      return
    }
    let op = ops[idx]
    if (op.type === 'save') {
      Shelly.call('KVS.Set', { key: op.item.key, value: JSON.stringify(op.item.data) }, function ($_r, $_e, $_m) {
        if ($_e !== 0) print('⚠️ KVS   : Save ' + op.item.key + ' failed: ' + $_m)
        idx++
        Timer.set(0, false, next)
      })
    } else {
      Shelly.call('KVS.Delete', { key: op.name }, function ($_r, $_e, $_m) {
        if ($_e !== 0) print('⚠️ KVS   : Delete ' + op.name + ' failed: ' + $_m)
        idx++
        Timer.set(0, false, next)
      })
    }
  }
  Timer.set(0, false, next)
}

// ----------------------------------------------------------
// SAVE ALL TO KVS
// ----------------------------------------------------------

/**
 * saveAllToKvs - Save all chunks to KVS
 *
 * Iterates through all keys in mapping and saves each chunk.
 *
 * @param {object} mapping - Key mappings
 * @param {object} source - Source object to save from
 * @param {Function} onDone - Callback when complete
 */
function saveAllToKvs(mapping, source, onDone) {
  let keys = Object.keys(mapping)
  if (keys.length === 0) {
    if (onDone) Timer.set(0, false, onDone)
    return
  }

  let idx = 0
  /**
   * next - Save next chunk in sequence
   * @internal
   */
  function next() {
    if (idx >= keys.length) {
      if (onDone) Timer.set(0, false, onDone)
      return
    }
    let key = keys[idx]
    let chunk = pickKeys(source, mapping[key])
    Shelly.call('KVS.Set', { key: key, value: JSON.stringify(chunk) }, function () {
      idx++
      Timer.set(0, false, next)
    })
  }
  Timer.set(0, false, next)
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export {
  pickKeys,
  loadChunksSeq,
  syncToKvs,
  saveAllToKvs,
}
