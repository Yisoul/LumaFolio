/** @vitest-environment jsdom */
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShortcutProvider, useShortcut } from '../src/renderer/src/shortcuts'

afterEach(cleanup)

function Harness(props: {
  libraryRun: () => void
  lightboxRun?: () => void
  controlAll?: () => void
  nudge?: () => void
  escapeInInput?: () => void
  enabled?: () => boolean
}) {
  useShortcut({ id: 'library.space', keys: ['space'], scope: 'library', label: '图库空格', when: props.enabled, run: props.libraryRun })
  if (props.lightboxRun) useShortcut({ id: 'lightbox.space', keys: ['space'], scope: 'lightbox', label: '灯箱空格', run: props.lightboxRun })
  if (props.controlAll) useShortcut({ id: 'library.all', keys: ['ctrl+a'], scope: 'library', label: '全选', skipInInput: true, run: props.controlAll })
  if (props.nudge) useShortcut({ id: 'editor.nudge', keys: ['arrowright', 'shift+arrowright'], scope: 'editor', label: '微移', run: props.nudge })
  if (props.escapeInInput) useShortcut({ id: 'menu.close', keys: ['escape'], scope: 'context-menu', label: '关闭菜单', allowInInput: true, run: props.escapeInInput })
  return <div>
    <input aria-label="搜索" />
    <textarea aria-label="备注" />
  </div>
}

describe('shortcut dispatcher', () => {
  it('runs the highest priority scope for the same key', () => {
    const libraryRun = vi.fn()
    const lightboxRun = vi.fn()
    render(<ShortcutProvider><Harness libraryRun={libraryRun} lightboxRun={lightboxRun} /></ShortcutProvider>)

    fireEvent.keyDown(window, { key: ' ' })

    expect(lightboxRun).toHaveBeenCalledTimes(1)
    expect(libraryRun).not.toHaveBeenCalled()
  })

  it('falls through when a higher priority command is disabled', () => {
    const libraryRun = vi.fn()
    const lightboxRun = vi.fn()
    render(<ShortcutProvider><Harness libraryRun={libraryRun} lightboxRun={lightboxRun} enabled={() => false} /></ShortcutProvider>)

    fireEvent.keyDown(window, { key: ' ' })

    expect(libraryRun).not.toHaveBeenCalled()
    expect(lightboxRun).toHaveBeenCalledTimes(1)
  })

  it('ignores unmodified shortcuts while typing but keeps ctrl combos', () => {
    const libraryRun = vi.fn()
    const controlAll = vi.fn()
    render(<ShortcutProvider><Harness libraryRun={libraryRun} controlAll={controlAll} /></ShortcutProvider>)

    fireEvent.keyDown(screen.getByLabelText('搜索'), { key: ' ' })
    fireEvent.keyDown(screen.getByLabelText('备注'), { key: ' ' })
    expect(libraryRun).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByLabelText('搜索'), { key: 'a', ctrlKey: true })
    expect(controlAll).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(controlAll).toHaveBeenCalledTimes(1)
  })

  it('only prevents the default when a command matched', () => {
    render(<ShortcutProvider><Harness libraryRun={() => undefined} /></ShortcutProvider>)

    const matched = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    window.dispatchEvent(matched)
    expect(matched.defaultPrevented).toBe(true)

    const unmatched = new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true })
    window.dispatchEvent(unmatched)
    expect(unmatched.defaultPrevented).toBe(false)
  })

  it('unregisters commands when the component unmounts', () => {
    const libraryRun = vi.fn()
    function Toggle() {
      const [open, setOpen] = useState(true)
      return <div>
        <button onClick={() => setOpen(false)}>关闭</button>
        {open && <Harness libraryRun={libraryRun} />}
      </div>
    }
    render(<ShortcutProvider><Toggle /></ShortcutProvider>)

    fireEvent.keyDown(window, { key: ' ' })
    expect(libraryRun).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('关闭'))
    fireEvent.keyDown(window, { key: ' ' })
    expect(libraryRun).toHaveBeenCalledTimes(1)
  })

  it('judges the typing guard per matched combo, not per command', () => {
    const nudge = vi.fn()
    render(<ShortcutProvider><Harness libraryRun={() => undefined} nudge={nudge} /></ShortcutProvider>)

    fireEvent.keyDown(screen.getByLabelText('搜索'), { key: 'ArrowRight' })
    expect(nudge).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByLabelText('搜索'), { key: 'ArrowRight', shiftKey: true })
    expect(nudge).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(nudge).toHaveBeenCalledTimes(2)
  })

  it('lets a command opt into firing inside inputs', () => {
    const close = vi.fn()
    render(<ShortcutProvider><Harness libraryRun={() => undefined} escapeInInput={close} /></ShortcutProvider>)

    fireEvent.keyDown(screen.getByLabelText('搜索'), { key: 'Escape' })

    expect(close).toHaveBeenCalledTimes(1)
  })
})
