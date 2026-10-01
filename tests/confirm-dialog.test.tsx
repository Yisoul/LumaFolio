/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmHost, confirmDialog } from '../src/renderer/src/ConfirmDialog'

afterEach(cleanup)

describe('confirmDialog', () => {
  it('resolves true when confirmed', async () => {
    render(<ConfirmHost />)
    const promise = confirmDialog({ title: '删除相册', message: '确定删除？', confirmLabel: '确认删除', danger: true })

    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))

    await expect(promise).resolves.toBe(true)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('resolves false when cancelled or dismissed with Escape', async () => {
    render(<ConfirmHost />)
    const cancelled = confirmDialog({ title: '删除作品', message: '确定删除？' })
    fireEvent.click(await screen.findByRole('button', { name: '取消' }))
    await expect(cancelled).resolves.toBe(false)

    const escaped = confirmDialog({ title: '删除图层', message: '确定删除？' })
    // 等弹窗真的渲染出来（真实使用里也是先看到弹窗才按 Esc）。
    await screen.findByText('删除图层')
    fireEvent.keyDown(window, { key: 'Escape' })
    await expect(escaped).resolves.toBe(false)
  })

  it('renders only one dialog at a time', async () => {
    render(<ConfirmHost />)
    const first = confirmDialog({ title: '第一个', message: 'a' })
    const second = confirmDialog({ title: '第二个', message: 'b' })

    expect(await screen.findByText('第二个')).toBeTruthy()
    expect(screen.queryByText('第一个')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await expect(second).resolves.toBe(true)
    void first
  })
})
