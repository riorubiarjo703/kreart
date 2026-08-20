import type { DesignDocument } from './schema.js'

/** Spec §9 / §15: starting value. */
export const HISTORY_LIMIT = 50

type Entry = { doc: DesignDocument; coalesceKey?: string }

/**
 * Undo/redo over the document, never over Fabric state (spec §9).
 * Because entries are plain data, this is testable with no browser.
 */
export class DesignHistory {
  #past: Entry[] = []
  #future: Entry[] = []
  #current: Entry

  constructor(initial: DesignDocument, private readonly limit = HISTORY_LIMIT) {
    this.#current = { doc: initial }
  }

  get current(): DesignDocument { return this.#current.doc }
  get canUndo(): boolean { return this.#past.length > 0 }
  get canRedo(): boolean { return this.#future.length > 0 }
  /** Number of undoable steps. */
  get depth(): number { return this.#past.length }

  /**
   * Record a new state. Consecutive commits sharing a `coalesceKey` replace the
   * current entry instead of pushing, so one drag is one undo step rather than sixty.
   */
  commit(next: DesignDocument, opts: { coalesceKey?: string } = {}): void {
    this.#future = []

    const coalescing =
      opts.coalesceKey !== undefined &&
      opts.coalesceKey === this.#current.coalesceKey

    if (!coalescing) {
      this.#past.push(this.#current)
      if (this.#past.length > this.limit) this.#past.shift()
    }

    this.#current = { doc: next, coalesceKey: opts.coalesceKey }
  }

  undo(): DesignDocument {
    const prev = this.#past.pop()
    if (!prev) return this.#current.doc
    this.#future.push(this.#current)
    this.#current = prev
    return this.#current.doc
  }

  redo(): DesignDocument {
    const next = this.#future.pop()
    if (!next) return this.#current.doc
    this.#past.push(this.#current)
    this.#current = next
    return this.#current.doc
  }
}
