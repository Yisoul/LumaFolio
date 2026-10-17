/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThumbSizeSlider from '../src/renderer/src/ThumbSizeSlider'

afterEach(cleanup)

function fillOf(container: HTMLElement): string {
  return (container.querySelector('input[type="range"]') as HTMLElement).style.getPropertyValue('--fill').trim()
}

describe('ThumbSizeSlider', () => {
  it('fills the track from empty at the minimum to full at the maximum', () => {
    const { container, rerender } = render(<ThumbSizeSlider value={120} onChange={() => undefined} />)
    expect(fillOf(container)).toBe('0%')

    rerender(<ThumbSizeSlider value={360} onChange={() => undefined} />)
    expect(fillOf(container)).toBe('100%')

    rerender(<ThumbSizeSlider value={240} onChange={() => undefined} />)
    expect(fillOf(container)).toBe('50%')
  })

  it('clamps out-of-range values so the thumb cannot overshoot', () => {
    const { container, rerender } = render(<ThumbSizeSlider value={520} onChange={() => undefined} />)
    const input = container.querySelector('input[type="range"]') as HTMLInputElement
    expect(input.value).toBe('360')
    expect(fillOf(container)).toBe('100%')

    rerender(<ThumbSizeSlider value={10} onChange={() => undefined} />)
    expect(input.value).toBe('120')
    expect(fillOf(container)).toBe('0%')
  })

  it('emits the value picked on the slider', () => {
    const onChange = vi.fn()
    const { container } = render(<ThumbSizeSlider value={200} onChange={onChange} />)

    fireEvent.change(container.querySelector('input[type="range"]')!, { target: { value: '230' } })

    expect(onChange).toHaveBeenCalledWith(230)
  })
})
