/** @vitest-environment jsdom */
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JustifiedPhotoGrid from '../src/renderer/src/JustifiedPhotoGrid'
import type { MediaAssetSummary } from '../src/shared/types'

afterEach(cleanup)

function asset(id: string): MediaAssetSummary {
  return {
    id, contentHash: `hash-${id}`, addedAt: 0, width: 1200, height: 800, format: 'jpeg',
    capturedAt: null, cameraMake: null, cameraModel: null, lens: null, focalLength: null,
    aperture: null, shutterSpeed: null, iso: null, orientation: 'landscape', rating: 0,
    favorite: false, missing: false, primaryPath: `C:\\photos\\${id}.jpg`, primaryRootId: null,
    primaryDirectoryPath: null, locationCount: 1
  }
}

describe('JustifiedPhotoGrid', () => {
  it('toggles multi selection from the tile checkbox', () => {
    const onActivate = vi.fn()
    const { container } = render(<JustifiedPhotoGrid
      photos={[asset('a'), asset('b')]}
      targetHeight={200}
      selectedIds={new Set(['a'])}
      activeId={null}
      onActivate={onActivate}
      onOpen={() => undefined}
    />)

    fireEvent.click(container.querySelectorAll('.tile-check')[1])

    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), true)
  })

  it('treats shift click on the image as multi selection too', () => {
    const onActivate = vi.fn()
    const { container } = render(<JustifiedPhotoGrid
      photos={[asset('a')]}
      targetHeight={200}
      selectedIds={new Set()}
      activeId={null}
      onActivate={onActivate}
      onOpen={() => undefined}
    />)

    fireEvent.click(container.querySelector('.tile-image')!, { shiftKey: true })

    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true)
  })

  it('measures the scroll container instead of its own inflated width', () => {
    const { container } = render(<div className="host" style={{ paddingLeft: '14px', paddingRight: '14px' }}>
      <JustifiedPhotoGrid
        photos={[asset('a'), asset('b'), asset('c'), asset('d')]}
        targetHeight={200}
        selectedIds={new Set()}
        activeId={null}
        onActivate={() => undefined}
        onOpen={() => undefined}
      />
    </div>)
    const host = container.querySelector('.host') as HTMLElement
    const grid = container.querySelector('.justified-grid') as HTMLElement
    // 模拟"网格被行宽撑到 2000，滚动容器只有 900"这种真实故障场景。
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 900 })
    Object.defineProperty(grid, 'clientWidth', { configurable: true, value: 2000 })

    fireEvent(window, new Event('resize'))

    const row = container.querySelector('.justified-row') as HTMLElement
    const tiles = Array.from(row.querySelectorAll('.tile')) as HTMLElement[]
    const total = tiles.reduce((sum, tile) => sum + Number.parseFloat(tile.style.width), 0) + 6 * (tiles.length - 1)
    expect(Math.abs(total - 872)).toBeLessThanOrEqual(6)
  })

  it('re-measures when the viewport changes without any resize event', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<div className="host" style={{ paddingLeft: '14px', paddingRight: '14px' }}>
        <JustifiedPhotoGrid
          photos={[asset('a'), asset('b'), asset('c'), asset('d')]}
          targetHeight={200}
          selectedIds={new Set()}
          activeId={null}
          onActivate={() => undefined}
          onOpen={() => undefined}
        />
      </div>)
      const host = container.querySelector('.host') as HTMLElement
      const grid = container.querySelector('.justified-grid') as HTMLElement
      Object.defineProperty(host, 'clientWidth', { configurable: true, value: 900 })
      Object.defineProperty(grid, 'clientWidth', { configurable: true, value: 2000 })
      act(() => { vi.advanceTimersByTime(300) })
      const rowSum = (): number => {
        const row = container.querySelector('.justified-row') as HTMLElement
        const tiles = Array.from(row.querySelectorAll('.tile')) as HTMLElement[]
        return tiles.reduce((sum, tile) => sum + Number.parseFloat(tile.style.width), 0) + 6 * (tiles.length - 1)
      }
      expect(Math.abs(rowSum() - 872)).toBeLessThanOrEqual(6)

      // 模拟 Electron 改界面缩放：视口和容器都变窄，但没有任何事件派发。
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
      Object.defineProperty(host, 'clientWidth', { configurable: true, value: 500 })
      act(() => { vi.advanceTimersByTime(300) })
      expect(Math.abs(rowSum() - 472)).toBeLessThanOrEqual(6)
    } finally {
      vi.useRealTimers()
    }
  })
})
