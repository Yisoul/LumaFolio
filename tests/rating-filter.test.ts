import { describe, expect, it } from 'vitest'
import { RATING_FILTER_OPTIONS, ratingFilterPatch, ratingFilterValue, ratingStars } from '../src/renderer/src/helpers'

describe('rating filter helpers', () => {
  it('maps every option to search filters and back', () => {
    for (const option of RATING_FILTER_OPTIONS) {
      expect(ratingFilterValue(ratingFilterPatch(option.value))).toBe(option.value)
    }
  })

  it('covers the documented levels', () => {
    expect(RATING_FILTER_OPTIONS.map((option) => option.label)).toEqual(['全部星级', '未评级', '≥1 星', '≥2 星', '≥3 星', '≥4 星', '5 星'])
    expect(ratingFilterPatch('unrated')).toEqual({ ratingMin: 0, ratingMax: 0 })
    expect(ratingFilterPatch('min3')).toEqual({ ratingMin: 3, ratingMax: undefined })
    expect(ratingFilterPatch('exact5')).toEqual({ ratingMin: 5, ratingMax: 5 })
  })

  it('renders star glyphs for cards', () => {
    expect(ratingStars(0)).toBe('')
    expect(ratingStars(3)).toBe('★★★')
    expect(ratingStars(9)).toBe('★★★★★')
  })
})
