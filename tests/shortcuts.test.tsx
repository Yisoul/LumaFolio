import { describe, expect, it } from 'vitest'
import { comboMatches, formatCombo, formatKeys, normalizeKey } from '../src/renderer/src/shortcuts'

function keyEvent(key: string, modifiers: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers
  } as KeyboardEvent
}

describe('shortcut combos', () => {
  it('normalizes key names', () => {
    expect(normalizeKey(' ')).toBe('space')
    expect(normalizeKey('Esc')).toBe('escape')
    expect(normalizeKey('+')).toBe('plus')
    expect(normalizeKey('-')).toBe('minus')
    expect(normalizeKey('F')).toBe('f')
  })

  it('matches plain characters and symbols', () => {
    expect(comboMatches('/', keyEvent('/'))).toBe(true)
    expect(comboMatches('/', keyEvent('f'))).toBe(false)
    expect(comboMatches('?', keyEvent('?', { shiftKey: true }))).toBe(true)
    expect(comboMatches('space', keyEvent(' '))).toBe(true)
    expect(comboMatches('enter', keyEvent('Enter'))).toBe(true)
  })

  it('requires ctrl exactly and ignores shift for shifted symbols', () => {
    expect(comboMatches('ctrl+1', keyEvent('1', { ctrlKey: true }))).toBe(true)
    expect(comboMatches('ctrl+1', keyEvent('1', { metaKey: true }))).toBe(true)
    expect(comboMatches('ctrl+1', keyEvent('1'))).toBe(false)
    expect(comboMatches('ctrl+1', keyEvent('1', { ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(comboMatches('plus', keyEvent('+', { shiftKey: true }))).toBe(true)
    expect(comboMatches('equal', keyEvent('=', { shiftKey: true }))).toBe(false)
  })

  it('treats arrow keys as distinct from their shift variants', () => {
    expect(comboMatches('arrowup', keyEvent('ArrowUp'))).toBe(true)
    expect(comboMatches('arrowup', keyEvent('ArrowUp', { shiftKey: true }))).toBe(false)
    expect(comboMatches('shift+arrowup', keyEvent('ArrowUp', { shiftKey: true }))).toBe(true)
    expect(comboMatches('shift+arrowup', keyEvent('ArrowUp'))).toBe(false)
  })

  it('formats combos for the help panel', () => {
    expect(formatCombo('ctrl+1')).toBe('Ctrl+1')
    expect(formatCombo('shift+arrowup')).toBe('Shift+↑')
    expect(formatCombo('space')).toBe('空格')
    expect(formatCombo('delete')).toBe('Delete')
    expect(formatKeys(['/', 'ctrl+f'])).toBe('/ / Ctrl+F')
  })
})
