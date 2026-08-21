import { describe, it, expect } from 'vitest'
import { validateViewSlugs } from '../src/hooks/validateViewSlugs'

describe('validateViewSlugs', () => {
  it('accepts distinct well-formed slugs', () => {
    expect(() => validateViewSlugs([{ slug: 'front' }, { slug: 'left-sleeve' }])).not.toThrow()
  })

  it('rejects a duplicate, naming it', () => {
    expect(() => validateViewSlugs([{ slug: 'front' }, { slug: 'front' }])).toThrow(/front/)
  })

  it('rejects uppercase', () => {
    expect(() => validateViewSlugs([{ slug: 'Front' }])).toThrow(/lowercase/i)
  })

  it('rejects spaces and underscores', () => {
    expect(() => validateViewSlugs([{ slug: 'left sleeve' }])).toThrow()
    expect(() => validateViewSlugs([{ slug: 'left_sleeve' }])).toThrow()
  })

  it('rejects an empty or missing slug', () => {
    expect(() => validateViewSlugs([{ slug: '' }])).toThrow()
    expect(() => validateViewSlugs([{}])).toThrow()
  })

  it('accepts an empty view list — required-ness is Payload\'s job', () => {
    expect(() => validateViewSlugs([])).not.toThrow()
  })
})
