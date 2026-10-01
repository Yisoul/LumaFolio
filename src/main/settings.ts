import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppSettings } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  thumbnailCacheLimitGb: 10,
  autoWatch: true,
  theme: 'dark',
  uiScale: 1,
  thumbnailSize: 200,
  treeWidth: 220,
  inspectorWidth: 320,
  navWidth: 208
}
const THEMES = new Set<AppSettings['theme']>(['dark', 'light'])
const MIN_UI_SCALE = 0.8
const MAX_UI_SCALE = 1.5
const MIN_THUMBNAIL_SIZE = 120
const MAX_THUMBNAIL_SIZE = 360

export class SettingsService {
  constructor(private readonly filePath: string) {}

  async get(): Promise<AppSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<AppSettings>
      return {
        thumbnailCacheLimitGb: clamp(parsed.thumbnailCacheLimitGb ?? DEFAULT_SETTINGS.thumbnailCacheLimitGb, 1, 100),
        autoWatch: parsed.autoWatch ?? DEFAULT_SETTINGS.autoWatch,
        theme: parsed.theme && THEMES.has(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
        uiScale: clamp(parsed.uiScale ?? DEFAULT_SETTINGS.uiScale, MIN_UI_SCALE, MAX_UI_SCALE),
        thumbnailSize: clamp(parsed.thumbnailSize ?? DEFAULT_SETTINGS.thumbnailSize, MIN_THUMBNAIL_SIZE, MAX_THUMBNAIL_SIZE),
        treeWidth: clamp(parsed.treeWidth ?? DEFAULT_SETTINGS.treeWidth, 160, 420),
        inspectorWidth: clamp(parsed.inspectorWidth ?? DEFAULT_SETTINGS.inspectorWidth, 240, 520),
        navWidth: clamp(parsed.navWidth ?? DEFAULT_SETTINGS.navWidth, 160, 360)
      }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  async save(settings: AppSettings): Promise<AppSettings> {
    const normalized: AppSettings = {
      thumbnailCacheLimitGb: clamp(settings.thumbnailCacheLimitGb, 1, 100),
      autoWatch: Boolean(settings.autoWatch),
      theme: THEMES.has(settings.theme) ? settings.theme : DEFAULT_SETTINGS.theme,
      uiScale: clamp(settings.uiScale, MIN_UI_SCALE, MAX_UI_SCALE),
      thumbnailSize: clamp(settings.thumbnailSize, MIN_THUMBNAIL_SIZE, MAX_THUMBNAIL_SIZE),
      treeWidth: clamp(settings.treeWidth, 160, 420),
      inspectorWidth: clamp(settings.inspectorWidth, 240, 520),
      navWidth: clamp(settings.navWidth, 160, 360)
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(normalized, null, 2), 'utf8')
    return normalized
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
