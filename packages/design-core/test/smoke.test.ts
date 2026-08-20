import { describe, it, expect } from 'vitest'
import { PACKAGE_NAME } from '../src/index.js'

describe('workspace', () => {
  it('resolves the package entrypoint', () => {
    expect(PACKAGE_NAME).toBe('design-core')
  })
})
