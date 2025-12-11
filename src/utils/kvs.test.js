// ==============================================================================
// * KVS UTILITIES TESTS
// ? Validates KVS parsing, merging, sync, and fetch operations.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('KVS Utilities', () => {
  let pickKeys, loadChunksSeq, syncToKvs, saveAllToKvs
  let mockShelly, mockTimer, timerCallbacks

  beforeEach(async () => {
    vi.resetModules()
    timerCallbacks = []

    // Mock Shelly
    mockShelly = {
      call: vi.fn(),
    }
    global.Shelly = mockShelly

    // Mock Timer - capture callbacks for manual triggering
    mockTimer = {
      set: vi.fn((delay, repeat, cb) => {
        timerCallbacks.push(cb)
        return timerCallbacks.length
      }),
    }
    global.Timer = mockTimer

    // Mock print
    global.print = vi.fn()

    const module = await import('./kvs.js')
    pickKeys = module.pickKeys
    loadChunksSeq = module.loadChunksSeq
    syncToKvs = module.syncToKvs
    saveAllToKvs = module.saveAllToKvs
  })

  // ----------------------------------------------------------
  // * PICK KEYS TESTS
  // ----------------------------------------------------------

  describe('pickKeys', () => {
    it('should pick specified keys from object', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const result = pickKeys(obj, ['a', 'c'])
      expect(result).toEqual({ a: 1, c: 3 })
    })

    it('should ignore missing keys', () => {
      const obj = { a: 1, b: 2 }
      const result = pickKeys(obj, ['a', 'z'])
      expect(result).toEqual({ a: 1 })
    })

    it('should return empty object for no matches', () => {
      const obj = { a: 1 }
      const result = pickKeys(obj, ['x', 'y'])
      expect(result).toEqual({})
    })
  })

  // ----------------------------------------------------------
  // * LOAD CHUNKS SEQ TESTS
  // ----------------------------------------------------------

  describe('loadChunksSeq', () => {
    it('should load chunks one at a time and merge into target', () => {
      const mapping = {
        key1: ['field1', 'field2'],
        key2: ['field3'],
      }
      const target = { existing: 'value' }
      const onDone = vi.fn()

      // Start loading
      loadChunksSeq(mapping, target, onDone)
      timerCallbacks[0]() // Initial Timer.set kick-off

      // First KVS.Get call
      expect(mockShelly.call).toHaveBeenCalledWith(
        'KVS.Get',
        { key: 'key1' },
        expect.any(Function),
      )

      // Respond to first get
      mockShelly.call.mock.calls[0][2]({ value: '{"field1":"a","field2":"b"}' }, 0)
      timerCallbacks[1]() // GC pause callback

      // Second KVS.Get call
      expect(mockShelly.call).toHaveBeenCalledWith(
        'KVS.Get',
        { key: 'key2' },
        expect.any(Function),
      )

      // Respond to second get
      mockShelly.call.mock.calls[1][2]({ value: '{"field3":"c"}' }, 0)
      timerCallbacks[2]() // GC pause callback

      // Final completion callback
      timerCallbacks[3]()

      expect(onDone).toHaveBeenCalled()
      expect(target.field1).toBe('a')
      expect(target.field2).toBe('b')
      expect(target.field3).toBe('c')
      expect(target.existing).toBe('value')
    })

    it('should handle missing keys gracefully', () => {
      const mapping = { missing: ['field1'] }
      const target = { field1: 'default' }
      const onDone = vi.fn()

      loadChunksSeq(mapping, target, onDone)
      timerCallbacks[0]() // Initial kick-off

      // Simulate error response
      mockShelly.call.mock.calls[0][2](null, -1)
      timerCallbacks[1]() // GC pause callback
      timerCallbacks[2]() // Final callback

      expect(onDone).toHaveBeenCalled()
      expect(target.field1).toBe('default') // Unchanged
    })

    it('should handle JSON parse errors gracefully', () => {
      const mapping = { badKey: ['field1'] }
      const target = { field1: 'default' }
      const onDone = vi.fn()

      loadChunksSeq(mapping, target, onDone)
      timerCallbacks[0]()

      // Return invalid JSON
      mockShelly.call.mock.calls[0][2]({ value: 'not valid json' }, 0)
      timerCallbacks[1]()
      timerCallbacks[2]()

      expect(onDone).toHaveBeenCalled()
      expect(target.field1).toBe('default') // Unchanged
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Parse error for badKey'))
    })

    it('should return loaded chunks to callback', () => {
      const mapping = { chunk1: ['a'] }
      const target = {}
      let returnedChunks = null

      loadChunksSeq(mapping, target, (chunks) => {
        returnedChunks = chunks
      })
      timerCallbacks[0]()

      mockShelly.call.mock.calls[0][2]({ value: '{"a":1}' }, 0)
      timerCallbacks[1]()
      timerCallbacks[2]()

      expect(returnedChunks).toEqual({ chunk1: { a: 1 } })
    })

    it('should handle empty mapping', () => {
      const target = {}
      const onDone = vi.fn()

      loadChunksSeq({}, target, onDone)
      timerCallbacks[0]() // Initial kick-off (idx=0 >= keys.length=0)
      timerCallbacks[1]() // Completion callback

      expect(onDone).toHaveBeenCalled()
      expect(mockShelly.call).not.toHaveBeenCalled()
    })

    it('should handle null callback gracefully', () => {
      const mapping = { key1: ['a'] }
      const target = {}

      // Should not throw
      loadChunksSeq(mapping, target, null)
      timerCallbacks[0]()

      mockShelly.call.mock.calls[0][2]({ value: '{"a":1}' }, 0)
      timerCallbacks[1]()

      // ? When onDone is null, no final Timer.set is called (only 2 callbacks)
      expect(timerCallbacks.length).toBe(2)
      expect(target.a).toBe(1)
    })
  })

  // ----------------------------------------------------------
  // * SYNC TO KVS TESTS
  // ----------------------------------------------------------

  describe('syncToKvs', () => {
    it('should call onDone immediately when no changes needed', () => {
      const mapping = { chunk1: ['a', 'b'] }
      const source = { a: 1, b: 2 }
      const loadedChunks = { chunk1: { a: 1, b: 2 } }
      const onDone = vi.fn()

      syncToKvs(mapping, source, loadedChunks, onDone, 'Test')

      // Timer.set should be called for async callback
      expect(mockTimer.set).toHaveBeenCalled()
      timerCallbacks[0]() // Trigger callback
      expect(onDone).toHaveBeenCalled()
    })

    it('should save chunk when missing from KVS', () => {
      const mapping = { chunk1: ['a'] }
      const source = { a: 1 }
      const loadedChunks = {} // Nothing loaded
      const onDone = vi.fn()

      syncToKvs(mapping, source, loadedChunks, onDone, 'Test')

      // Timer.set kicks off the operation
      expect(mockTimer.set).toHaveBeenCalled()
      timerCallbacks[0]() // Start ops

      // Should call KVS.Set
      expect(mockShelly.call).toHaveBeenCalledWith(
        'KVS.Set',
        expect.objectContaining({ key: 'chunk1' }),
        expect.any(Function),
      )
    })

    it('should delete obsolete chunks', () => {
      const mapping = {} // No mappings
      const source = {}
      const loadedChunks = { obsolete: { old: true } } // Obsolete chunk
      const onDone = vi.fn()

      syncToKvs(mapping, source, loadedChunks, onDone, 'Test')

      timerCallbacks[0]() // Start ops

      // Should call KVS.Delete
      expect(mockShelly.call).toHaveBeenCalledWith(
        'KVS.Delete',
        expect.objectContaining({ key: 'obsolete' }),
        expect.any(Function),
      )
    })

    it('should handle save error gracefully', () => {
      const mapping = { chunk1: ['a'] }
      const source = { a: 1 }
      const loadedChunks = {}
      const onDone = vi.fn()

      syncToKvs(mapping, source, loadedChunks, onDone, 'Test')
      timerCallbacks[0]() // Start ops

      // Simulate save error
      const shellyCallback = mockShelly.call.mock.calls[0][2]
      shellyCallback(null, 1, 'Error message')

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Save chunk1 failed'))
    })

    it('should handle delete error gracefully', () => {
      const mapping = {}
      const source = {}
      const loadedChunks = { obsolete: {} }
      const onDone = vi.fn()

      syncToKvs(mapping, source, loadedChunks, onDone, 'Test')
      timerCallbacks[0]() // Start ops

      // Simulate delete error
      const shellyCallback = mockShelly.call.mock.calls[0][2]
      shellyCallback(null, 1, 'Error message')

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Delete obsolete failed'))
    })

    it('should print sync summary when changes made', () => {
      const mapping = { chunk1: ['a'] }
      const source = { a: 1 }
      const loadedChunks = {}
      const onDone = vi.fn()

      syncToKvs(mapping, source, loadedChunks, onDone, 'Config')
      timerCallbacks[0]() // Start ops

      // Complete save
      const shellyCallback = mockShelly.call.mock.calls[0][2]
      shellyCallback({}, 0)

      // Trigger next timer (completion)
      timerCallbacks[1]()

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Config sync'))
    })
  })

  // ----------------------------------------------------------
  // * SAVE ALL TO KVS TESTS
  // ----------------------------------------------------------

  describe('saveAllToKvs', () => {
    it('should save all chunks in mapping', () => {
      const mapping = {
        chunk1: ['a'],
        chunk2: ['b'],
      }
      const source = { a: 1, b: 2 }
      const onDone = vi.fn()

      saveAllToKvs(mapping, source, onDone)
      timerCallbacks[0]() // Start first save (next())

      expect(mockShelly.call).toHaveBeenCalledWith(
        'KVS.Set',
        expect.objectContaining({ key: expect.any(String) }),
        expect.any(Function),
      )

      // Complete first save, triggers Timer.set for next iteration
      mockShelly.call.mock.calls[0][2]()
      timerCallbacks[1]() // Run next() - starts second save

      // Complete second save, triggers Timer.set for next iteration
      mockShelly.call.mock.calls[1][2]()
      timerCallbacks[2]() // Run next() - idx >= keys.length, sets onDone timer
      timerCallbacks[3]() // Run onDone

      expect(onDone).toHaveBeenCalled()
    })

    it('should handle empty mapping', () => {
      const onDone = vi.fn()

      saveAllToKvs({}, {}, onDone)

      expect(mockTimer.set).toHaveBeenCalled()
      timerCallbacks[0]()

      expect(onDone).toHaveBeenCalled()
      expect(mockShelly.call).not.toHaveBeenCalled()
    })
  })

  // ----------------------------------------------------------
  // * CHUNK NEEDS SYNC TESTS
  // ? Testing via syncToKvs behavior since chunkNeedsSync is not exported
  // ----------------------------------------------------------

  describe('chunkNeedsSync behavior', () => {
    it('should detect missing key in loaded chunk', () => {
      const mapping = { chunk1: ['a', 'b', 'c'] }
      const source = { a: 1, b: 2, c: 3 }
      // ? Missing key 'c' in loaded chunk
      const loadedChunks = { chunk1: { a: 1, b: 2 } }

      syncToKvs(mapping, source, loadedChunks, vi.fn(), null)
      timerCallbacks[0]()

      // Should trigger save due to missing key
      expect(mockShelly.call).toHaveBeenCalledWith(
        'KVS.Set',
        expect.objectContaining({ key: 'chunk1' }),
        expect.any(Function),
      )
    })

    it('should detect extra key in loaded chunk', () => {
      const mapping = { chunk1: ['a'] }
      const source = { a: 1 }
      // ? Extra key 'obsoleteKey' in loaded chunk
      const loadedChunks = { chunk1: { a: 1, obsoleteKey: 'old' } }

      syncToKvs(mapping, source, loadedChunks, vi.fn(), null)
      timerCallbacks[0]()

      // Should trigger save due to extra key
      expect(mockShelly.call).toHaveBeenCalledWith(
        'KVS.Set',
        expect.objectContaining({ key: 'chunk1' }),
        expect.any(Function),
      )
    })
  })
})
