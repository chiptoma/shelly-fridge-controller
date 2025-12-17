// ==============================================================================
// * KVS UTILITIES
// ? Helper functions for Shelly Key-Value Store operations.
// ? Includes parsing, merging, sync checking, and async save operations.
// ==============================================================================

// ----------------------------------------------------------
// * INLINE HELPER: pickKeys
// ? Inlined to reduce module overhead (~350 bytes saved).
// ----------------------------------------------------------

/**
 * * pickKeys - Extract subset of object keys
 * ? Creates new object with only specified keys from source.
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
// * SEQUENTIAL KVS LOADING
// ? Loads chunks one at a time to reduce peak memory.
// ? Allows GC between each chunk parse/merge.
// ----------------------------------------------------------

/**
 * * loadChunksSeq - Load KVS chunks sequentially
 *
 * @param {object} mapping - Key mappings (e.g., CFG_KEYS)
 * @param {object} target - Target object to merge into
 * @param {Function} onDone - Callback with loadedChunks object
 */
function loadChunksSeq(mapping, target, onDone) {
  let keys = Object.keys(mapping)
  let loadedChunks = {}
  let idx = 0

  /**
   * * next - Load next chunk in sequence
   * @internal
   */
  function next() {
    if (idx >= keys.length) {
      if (onDone) Timer.set(0, false, function () { onDone(loadedChunks) })
      return
    }

    let key = keys[idx]
    Shelly.call('KVS.Get', { key: key }, function ($_r, $_e) {
      if ($_e === 0 && $_r && $_r.value) {
        try {
          let chunk = JSON.parse($_r.value)
          loadedChunks[key] = chunk
          // ? Merge immediately to allow chunk to be GC'd
          let chunkKeys = Object.keys(chunk)
          for (let i = 0; i < chunkKeys.length; i++) {
            target[chunkKeys[i]] = chunk[chunkKeys[i]]
          }
        } catch (e) {
          print('⚠️ KVS   : Parse error for ' + key + ': ' + (e.message || e))
        }
      }
      idx++
      Timer.set(0, false, next) // ? GC pause between chunks
    })
  }

  Timer.set(0, false, next)
}

// ----------------------------------------------------------
// * CHUNK SYNC CHECK
// ----------------------------------------------------------

/**
 * * chunkNeedsSync - Check if chunk needs saving
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
// * SYNC TO KVS
// ----------------------------------------------------------

/**
 * * syncToKvs - Sync chunks to KVS storage
 *
 * Compares loaded chunks with expected keys, saves/deletes as needed.
 * Uses Timer.set(0) to break callback chains and free stack.
 *
 * @param {object} mapping - Key mappings (e.g., ST_KEYS)
 * @param {object} source - Source object to sync from
 * @param {object} loadedChunks - Already loaded chunks from KVS
 * @param {Function} onDone - Callback when sync complete
 * @param {string} label - Label for logging
 */
function syncToKvs(mapping, source, loadedChunks, onDone, label) {
  let toSave = []
  let toDelete = []

  let mapKeys = Object.keys(mapping)
  for (let i = 0; i < mapKeys.length; i++) {
    if (chunkNeedsSync(loadedChunks[mapKeys[i]], mapping[mapKeys[i]])) toSave.push(mapKeys[i])
  }
  let loadKeys = Object.keys(loadedChunks)
  for (let i = 0; i < loadKeys.length; i++) {
    if (!mapping[loadKeys[i]]) toDelete.push(loadKeys[i])
  }

  if (toSave.length === 0 && toDelete.length === 0) {
    if (onDone) Timer.set(0, false, onDone)
    return
  }

  let ops = []
  for (let i = 0; i < toSave.length; i++) ops.push({ type: 'save', name: toSave[i] })
  for (let i = 0; i < toDelete.length; i++) ops.push({ type: 'del', name: toDelete[i] })

  let idx = 0
  /**
   * * next - Process next sync operation
   * @internal
   */
  function next() {
    if (idx >= ops.length) {
      if (label && (toSave.length > 0 || toDelete.length > 0)) {
        let info = toSave.length > 0 ? ' [' + toSave.join(',') + ']' : ''
        print('🔄 KVS   : ' + label + ' sync: ' + toSave.length + ' saved, ' + toDelete.length + ' removed' + info)
      }
      if (onDone) Timer.set(0, false, onDone)
      return
    }
    let op = ops[idx]
    if (op.type === 'save') {
      let chunk = pickKeys(source, mapping[op.name])
      Shelly.call('KVS.Set', { key: op.name, value: JSON.stringify(chunk) }, function ($_r, $_e, $_m) {
        if ($_e !== 0) print('⚠️ KVS   : Save ' + op.name + ' failed: ' + $_m)
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
// * SAVE ALL TO KVS
// ----------------------------------------------------------

/**
 * * saveAllToKvs - Save all chunks to KVS
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
   * * next - Save next chunk in sequence
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
// * EXPORTS
// ----------------------------------------------------------

export {
  pickKeys,
  loadChunksSeq,
  syncToKvs,
  saveAllToKvs,
}
