import { access, copyFile, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import type { ExportPhotosRequest, ExportPhotosResult } from '../shared/types'
import type { AppDatabase } from './database'
import { loadSourceForSharp } from './raw'

/** 导出 JPEG 时的长边和画质；原图模式则按原样复制。 */
export const PHOTO_EXPORT_LONG_EDGE = 2560
export const PHOTO_EXPORT_QUALITY = 92

/** 目标目录里重名时追加 (2)、(3)…，返回一个还没被占用的路径。 */
export async function uniqueTargetPath(directory: string, fileName: string, taken: Set<string>): Promise<string> {
  const extension = extname(fileName)
  const base = basename(fileName, extension)
  for (let index = 1; index < 10000; index += 1) {
    const candidate = join(directory, index === 1 ? fileName : `${base} (${index})${extension}`)
    const key = candidate.toLowerCase()
    if (taken.has(key)) continue
    try {
      await access(candidate)
    } catch {
      taken.add(key)
      return candidate
    }
  }
  throw new Error('无法生成不重复的文件名')
}

/** 把相册里选中的照片复制或转成 JPEG 写入目标文件夹。 */
export async function exportPhotos(db: AppDatabase, request: ExportPhotosRequest): Promise<ExportPhotosResult> {
  await mkdir(request.directory, { recursive: true })
  const assetIds = [...new Set(request.assetIds)]
  const taken = new Set<string>()
  const result: ExportPhotosResult = { exported: 0, failed: 0, skipped: 0 }

  for (const assetId of assetIds) {
    const location = db.getPreferredLocation(assetId)
    if (!location) {
      result.skipped += 1
      continue
    }
    try {
      const originalName = basename(location.absolutePath)
      if (request.mode === 'original') {
        const target = await uniqueTargetPath(request.directory, originalName, taken)
        await copyFile(location.absolutePath, target)
      } else {
        const base = basename(originalName, extname(originalName))
        const target = await uniqueTargetPath(request.directory, `${base}.jpg`, taken)
        const source = await loadSourceForSharp(location.absolutePath)
        await sharp(source, { failOn: 'none' })
          .rotate()
          .resize({ width: PHOTO_EXPORT_LONG_EDGE, height: PHOTO_EXPORT_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: PHOTO_EXPORT_QUALITY })
          .withMetadata()
          .toFile(target)
      }
      result.exported += 1
    } catch {
      result.failed += 1
    }
  }
  return result
}
