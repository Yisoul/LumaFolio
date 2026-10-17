import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, opendir, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import * as exifr from 'exifr'
import sharp from 'sharp'
import type { AppDatabase, MediaLocationInput, Orientation, SourceRoot } from './database'
import { RAW_EXTENSIONS, extractRawPreview } from './raw'

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', ...RAW_EXTENSIONS])
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '$recycle.bin', 'system volume information'])

/**
 * 元数据结构版本：升级后存量位置会重读一次元数据（不重新哈希）。
 * v2：按 EXIF Orientation 交换宽高，竖拍照片的缩略图比例和瀑布流占位才正确。
 */
export const CURRENT_METADATA_VERSION = 2

export interface ScanProgress {
  rootId: string
  phase: 'scanning' | 'reading' | 'complete' | 'error' | 'error'
  discovered: number
  processed: number
  indexed: number
  errors: number
  message?: string
}

export interface ScanResult {
  discovered: number
  indexed: number
  errors: string[]
}

export interface RatingMetadata {
  Rating?: unknown
  RatingPercent?: unknown
}

interface ExifRecord extends RatingMetadata {
  Orientation?: number
  DateTimeOriginal?: Date
  CreateDate?: Date
  Make?: string
  Model?: string
  LensModel?: string
  FocalLength?: number
  FNumber?: number
  ExposureTime?: number
  ISO?: number
}

/**
 * 相机和修图软件写星级的位置不统一：Windows/部分相机写 EXIF `Rating`，
 * Lightroom/Bridge 写 XMP `xmp:Rating`（exifr 会合并到同一个 `Rating` 键）。
 * 两边都有值时取较大的那个，`RatingPercent` 作为兜底。
 */
export function normalizeRating(exif: RatingMetadata): number {
  const candidates: number[] = []
  const rating = toFiniteNumber(exif.Rating)
  if (rating != null) candidates.push(rating)
  const percent = toFiniteNumber(exif.RatingPercent)
  if (percent != null) candidates.push(percent / 20)
  if (candidates.length === 0) return 0
  return Math.max(0, Math.min(5, Math.round(Math.max(...candidates))))
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

export class LibraryScanner {
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly scanTimers = new Map<string, NodeJS.Timeout>()

  constructor(private readonly db: AppDatabase) {}

  async scanRoot(
    root: SourceRoot,
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult> {
    const errors: string[] = []
    const unchangedLocations: Array<{ id: string; assetId: string }> = []
    let discovered = 0
    let processed = 0
    let indexed = 0

    try {
      await access(root.path)
    } catch (error) {
      errors.push(`${root.path}: ${error instanceof Error ? error.message : String(error)}`)
      onProgress?.({ rootId: root.id, phase: 'error', discovered, processed, indexed, errors: errors.length, message: '来源目录当前不可用' })
      return { discovered, indexed, errors }
    }

    const files = await this.collectSupportedFiles(root.path, errors)
    discovered = files.length
    onProgress?.({ rootId: root.id, phase: 'scanning', discovered, processed, indexed, errors: errors.length })

    await mapLimit(files, Math.max(1, Math.min(4, (await import('node:os')).cpus().length - 1)), async (filePath) => {
      try {
        const unchanged = await this.indexFile(root, filePath)
        if (unchanged) unchangedLocations.push(unchanged)
        else indexed += 1
      } catch (error) {
        errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        processed += 1
        onProgress?.({ rootId: root.id, phase: 'reading', discovered, processed, indexed, errors: errors.length })
      }
    })

    this.db.markLocationsAvailable(unchangedLocations)
    this.db.markMissingLocations(root.id, files)
    onProgress?.({ rootId: root.id, phase: 'complete', discovered, processed, indexed, errors: errors.length })
    return { discovered, indexed, errors }
  }

  async scanAll(
    roots: SourceRoot[],
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult[]> {
    const enabled = roots.filter((root) => root.enabled)
    const results: ScanResult[] = []
    let discovered = 0
    let processed = 0
    let indexed = 0
    let errors = 0
    let lastEmit = 0
    const total = enabled.length

    /**
     * 所有目录汇总成一条连续进度：目录内部累加，目录之间不回到 0，
     * 顶部扫描条不会每个目录都闪一下、跳一次。事件也限流到 10 次/秒。
     */
    const emit = (phase: ScanProgress['phase'], root: SourceRoot, current: { discovered: number; processed: number }, force = false): void => {
      if (!onProgress) return
      const now = Date.now()
      if (!force && now - lastEmit < 100) return
      lastEmit = now
      onProgress({
        rootId: root.id,
        phase,
        discovered: discovered + current.discovered,
        processed: processed + current.processed,
        indexed,
        errors
      })
    }

    for (const root of enabled) {
      const result = await this.scanRoot(root, (progress) => {
        // 单个目录结束时先保持「读取中」，等整体结束再收掉扫描条。
        emit(progress.phase === 'complete' ? 'reading' : progress.phase, root, progress)
      })
      results.push(result)
      discovered += result.discovered
      processed += result.discovered
      indexed += result.indexed
      errors += result.errors.length
      emit(results.length === total ? 'complete' : 'reading', root, { discovered: 0, processed: 0 }, true)
    }
    if (total === 0 && onProgress) {
      onProgress({ rootId: '', phase: 'complete', discovered: 0, processed: 0, indexed: 0, errors: 0 })
    }
    return results
  }

  watchRoot(root: SourceRoot, onChanged?: (root: SourceRoot) => void): void {
    this.unwatchRoot(root.id)
    if (!root.enabled) return
    const watcher = watch(root.path, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
      ignored: (path) => {
        const name = basename(path).toLowerCase()
        return IGNORED_DIRECTORIES.has(name)
      }
    })

    watcher.on('all', (_event, changedPath) => {
      if (changedPath && !SUPPORTED_EXTENSIONS.has(extname(changedPath).toLowerCase())) return
      const existing = this.scanTimers.get(root.id)
      if (existing) clearTimeout(existing)
      this.scanTimers.set(root.id, setTimeout(() => {
        this.scanTimers.delete(root.id)
        void this.scanRoot(root).then(() => onChanged?.(root))
      }, 900))
    })

    this.watchers.set(root.id, watcher)
  }

  async close(): Promise<void> {
    for (const timer of this.scanTimers.values()) clearTimeout(timer)
    this.scanTimers.clear()
    await Promise.all([...this.watchers.values()].map((watcher) => watcher.close()))
    this.watchers.clear()
  }

  private unwatchRoot(rootId: string): void {
    const timer = this.scanTimers.get(rootId)
    if (timer) clearTimeout(timer)
    this.scanTimers.delete(rootId)
    const watcher = this.watchers.get(rootId)
    if (watcher) void watcher.close()
    this.watchers.delete(rootId)
  }

  private async collectSupportedFiles(rootPath: string, errors: string[]): Promise<string[]> {
    const files: string[] = []
    const visit = async (directory: string): Promise<void> => {
      // 被移除/排除的目录整棵跳过，不用再进去逐个文件判断。
      if (this.db.isPathIgnored(directory)) return
      let handle
      try {
        handle = await opendir(directory)
      } catch (error) {
        errors.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`)
        return
      }

      try {
        for await (const entry of handle) {
          if (entry.name.startsWith('.') || IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue
          const childPath = join(directory, entry.name)
          if (entry.isDirectory()) {
            await visit(childPath)
          } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
            files.push(childPath)
          }
        }
      } catch (error) {
        errors.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    await visit(rootPath)
    return files
  }

  private async indexFile(root: SourceRoot, filePath: string): Promise<{ id: string; assetId: string } | null> {
    if (this.db.isPathIgnored(filePath)) return null
    const fileStat = await stat(filePath)
    const existing = this.db.getLocationByPath(filePath)
    const unchangedFile = Boolean(existing
      && existing.rootId === root.id
      && existing.sizeBytes === fileStat.size
      && Math.abs(existing.modifiedAt - fileStat.mtimeMs) <= 1)
    if (unchangedFile && existing?.metadataVersion === CURRENT_METADATA_VERSION) {
      return { id: existing.id, assetId: existing.assetId }
    }
    const exif = await this.readExif(filePath)
    const image = await readImageInfo(filePath)
    // 竖拍照片的像素是横的、靠 Orientation 标记旋转：库里的宽高要按显示方向存，
    // 否则缩略图/瀑布流先按横图占位，等图片加载出来再变高，整列会跳一下。
    const orientationValue = exif.Orientation ?? image.orientation
    const rotated = Boolean(orientationValue && [5, 6, 7, 8].includes(orientationValue))
    const width = rotated ? image.height : image.width
    const height = rotated ? image.width : image.height
    const contentHash = unchangedFile && existing
      ? this.db.getAssetContentHash(existing.assetId) ?? await hashFile(filePath)
      : await hashFile(filePath)
    const orientation = normalizeOrientation(orientationValue, width, height)
    const input: MediaLocationInput = {
      rootId: root.id,
      absolutePath: filePath,
      relativePath: relative(root.path, filePath),
      contentHash,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtimeMs,
      metadataVersion: CURRENT_METADATA_VERSION,
      width,
      height,
      format: image.format,
      capturedAt: normalizeDate(exif.DateTimeOriginal ?? exif.CreateDate),
      cameraMake: exif.Make ?? null,
      cameraModel: exif.Model ?? null,
      lens: exif.LensModel ?? null,
      focalLength: finiteOrNull(exif.FocalLength),
      aperture: finiteOrNull(exif.FNumber),
      shutterSpeed: formatExposure(exif.ExposureTime),
      iso: finiteOrNull(exif.ISO),
      rating: normalizeRating(exif),
      orientation
    }
    this.db.upsertMediaLocation(input)
    return null
  }

  private async readExif(path: string): Promise<ExifRecord> {
    try {
      const parsed = await exifr.parse(path, {
        tiff: true,
        exif: true,
        xmp: true,
        gps: false,
        interop: false,
        ifd1: false,
        // Orientation 等枚举保留原始数字，避免拿到 "Rotate 90 CW" 这类翻译后的字符串。
        translateValues: false
      })
      return (parsed ?? {}) as ExifRecord
    } catch {
      return {}
    }
  }
}

interface ImageInfo {
  width: number
  height: number
  format: string
  orientation?: number
}

/**
 * RAW 的尺寸取文件里内嵌预览的尺寸（相机写进去的通常是全尺寸），
 * 万一没有可用预览，再退回让 libvips 按 TIFF 打开取尺寸。
 */
async function readImageInfo(filePath: string): Promise<ImageInfo> {
  const extension = extname(filePath).slice(1).toLowerCase()
  if (RAW_EXTENSIONS.has(`.${extension}`)) {
    const preview = await extractRawPreview(filePath).catch(() => null)
    if (preview) return { width: preview.width, height: preview.height, format: extension }
    const fallback = await sharp(filePath, { failOn: 'none' }).metadata()
    if (!fallback.width || !fallback.height) throw new Error('无法读取 RAW 预览')
    return { width: fallback.width, height: fallback.height, format: extension, orientation: fallback.orientation }
  }
  const metadata = await sharp(filePath, { failOn: 'none' }).metadata()
  if (!metadata.width || !metadata.height) throw new Error('无法读取图片尺寸')
  return { width: metadata.width, height: metadata.height, format: metadata.format ?? extension, orientation: metadata.orientation }
}

function normalizeOrientation(value: number | undefined, width: number, height: number): Orientation {
  if (value && [5, 6, 7, 8].includes(value)) return 'portrait'
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

function normalizeDate(value: Date | undefined): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatExposure(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  if (value >= 1) return `${Number(value.toFixed(2))}s`
  return `1/${Math.max(1, Math.round(1 / value))}`
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      await worker(items[index])
    }
  })
  await Promise.all(runners)
}
