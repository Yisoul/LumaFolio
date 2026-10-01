import { describe, expect, it } from 'vitest'
import { computeJustifiedRows } from '../src/renderer/src/grid'

const landscape = (id: string) => ({ id, width: 3000, height: 2000 })
const portrait = (id: string) => ({ id, width: 2000, height: 3000 })

describe('computeJustifiedRows', () => {
  it('fills a stretched row to the container width', () => {
    const layout = computeJustifiedRows([landscape('a'), landscape('b'), landscape('c'), landscape('d')], { containerWidth: 900, targetHeight: 200, gap: 6 })

    expect(layout.rows).toHaveLength(2)
    const [row] = layout.rows
    expect(row.items).toHaveLength(3)
    const total = row.items.reduce((sum, item) => sum + item.width, 0) + 6 * 2
    expect(Math.abs(total - 900)).toBeLessThanOrEqual(6)
    expect(new Set(row.items.map((item) => item.width)).size).toBe(1)
  })

  it('keeps the aspect ratio inside a row', () => {
    const layout = computeJustifiedRows([landscape('a'), portrait('b')], { containerWidth: 1200, targetHeight: 200, gap: 6 })
    const [row] = layout.rows

    expect(row.items[0].width).toBeCloseTo(row.height * 1.5, 0)
    expect(row.items[1].width).toBeCloseTo(row.height * (2 / 3), 0)
  })

  it('does not stretch the last incomplete row', () => {
    const layout = computeJustifiedRows([landscape('a'), landscape('b'), landscape('c')], { containerWidth: 4000, targetHeight: 200, gap: 6 })

    expect(layout.rows).toHaveLength(1)
    expect(layout.rows[0].height).toBe(200)
    const used = layout.rows[0].items.reduce((sum, item) => sum + item.width, 0)
    expect(used).toBeLessThan(4000)
  })

  it('clamps extreme rows and falls back to a square for unknown sizes', () => {
    const pano = { id: 'pano', width: 12000, height: 1000 }
    const unknown = { id: 'unknown', width: 0, height: 0 }
    const layout = computeJustifiedRows([pano], { containerWidth: 800, targetHeight: 200, gap: 6 })

    // 超宽全景允许低于最小行高，避免横向溢出。
    expect(layout.rows[0].height).toBeLessThan(100)
    expect(Math.abs(layout.rows[0].items[0].width - 800)).toBeLessThanOrEqual(14)

    const squareLayout = computeJustifiedRows([unknown], { containerWidth: 800, targetHeight: 200, gap: 6 })
    expect(squareLayout.rows[0].items[0].width).toBe(squareLayout.rows[0].height)
  })

  it('honours the thumbnail size setting for the row height', () => {
    for (const targetHeight of [120, 200, 360]) {
      const layout = computeJustifiedRows([landscape('a')], { containerWidth: 5000, targetHeight, gap: 6 })
      expect(layout.rows[0].height).toBe(targetHeight)
    }
  })

  it('returns an empty layout for no photos', () => {
    expect(computeJustifiedRows([], { containerWidth: 800, targetHeight: 200 })).toEqual({ rows: [], height: 0 })
  })
})
