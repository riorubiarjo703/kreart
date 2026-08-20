import { describe, it, expect } from 'vitest'
import { DesignHistory, HISTORY_LIMIT } from '../src/history.js'
import type { DesignDocument } from '../src/schema.js'

const doc = (n: number): DesignDocument => ({
  schemaVersion: 1, productId: `p${n}`, sizeId: 's', colourwayId: 'c', views: {},
})

describe('DesignHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const h = new DesignHistory(doc(0))
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
    expect(h.current.productId).toBe('p0')
  })

  it('undoes and redoes a single commit', () => {
    const h = new DesignHistory(doc(0))
    h.commit(doc(1))
    expect(h.current.productId).toBe('p1')
    expect(h.undo().productId).toBe('p0')
    expect(h.canRedo).toBe(true)
    expect(h.redo().productId).toBe('p1')
  })

  it('collapses a continuous drag into one undo step', () => {
    const h = new DesignHistory(doc(0))
    for (let i = 1; i <= 60; i++) h.commit(doc(i), { coalesceKey: 'drag:o1' })
    expect(h.depth).toBe(1)
    expect(h.current.productId).toBe('p60')
    expect(h.undo().productId).toBe('p0')
  })

  it('starts a new entry when the coalesce key changes', () => {
    const h = new DesignHistory(doc(0))
    h.commit(doc(1), { coalesceKey: 'drag:o1' })
    h.commit(doc(2), { coalesceKey: 'drag:o2' })
    expect(h.depth).toBe(2)
  })

  it('starts a new entry for an uncoalesced commit after a drag', () => {
    const h = new DesignHistory(doc(0))
    h.commit(doc(1), { coalesceKey: 'drag:o1' })
    h.commit(doc(2))
    expect(h.depth).toBe(2)
    expect(h.undo().productId).toBe('p1')
  })

  it('discards the redo stack once a new commit lands', () => {
    const h = new DesignHistory(doc(0))
    h.commit(doc(1))
    h.undo()
    h.commit(doc(2))
    expect(h.canRedo).toBe(false)
    expect(h.current.productId).toBe('p2')
  })

  it('caps depth at the limit, dropping the oldest entry', () => {
    const h = new DesignHistory(doc(0))
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h.commit(doc(i))
    expect(h.depth).toBe(HISTORY_LIMIT)
  })

  it('returns current unchanged when there is nothing to undo', () => {
    const h = new DesignHistory(doc(0))
    expect(h.undo().productId).toBe('p0')
  })
})
