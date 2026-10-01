import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SettingsService } from '../src/main/settings'

describe('SettingsService', () => {
  let directory: string
  let file: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'luma-folio-settings-'))
    file = join(directory, 'settings.json')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('defaults to 100% interface scale without a settings file', async () => {
    const settings = await new SettingsService(file).get()
    expect(settings.uiScale).toBe(1)
    expect(settings.theme).toBe('dark')
  })

  it('falls back to 100% for settings written before the scale existed', async () => {
    await writeFile(file, JSON.stringify({ thumbnailCacheLimitGb: 5, autoWatch: false, theme: 'light' }))
    const settings = await new SettingsService(file).get()
    expect(settings.uiScale).toBe(1)
    expect(settings.theme).toBe('light')
    expect(settings.autoWatch).toBe(false)
  })

  it('clamps the interface scale into 0.8 - 1.5', async () => {
    const service = new SettingsService(file)
    expect((await service.save({ thumbnailCacheLimitGb: 10, autoWatch: true, theme: 'dark', uiScale: 3, thumbnailSize: 200, treeWidth: 220, inspectorWidth: 320, navWidth: 208 })).uiScale).toBe(1.5)
    expect((await service.save({ thumbnailCacheLimitGb: 10, autoWatch: true, theme: 'dark', uiScale: 0.2, thumbnailSize: 200, treeWidth: 220, inspectorWidth: 320, navWidth: 208 })).uiScale).toBe(0.8)
  })

  it('persists the interface scale across reads', async () => {
    const service = new SettingsService(file)
    await service.save({ thumbnailCacheLimitGb: 10, autoWatch: true, theme: 'light', uiScale: 1.25, thumbnailSize: 260, treeWidth: 240, inspectorWidth: 360, navWidth: 240 })
    const settings = await service.get()
    expect(settings.uiScale).toBe(1.25)
    expect(settings.thumbnailSize).toBe(260)
    expect(settings.treeWidth).toBe(240)
    expect(settings.navWidth).toBe(240)
    expect(settings.theme).toBe('light')
  })
})
