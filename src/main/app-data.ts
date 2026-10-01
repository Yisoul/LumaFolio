import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** 改名前应用数据固定在 %APPDATA%/album-studio。 */
export const LEGACY_APP_FOLDER = 'album-studio'

const LEGACY_FILES = ['library.sqlite', 'library.sqlite-wal', 'library.sqlite-shm', 'settings.json']

/**
 * 更名成 LumaFolio 后 userData 变成 %APPDATA%/luma-folio，这里做一次性迁移：
 * 只复制数据库、设置和导入字体；缩略图缓存按需重新生成，旧目录保持原样可回退。
 * 返回是否真的执行了迁移。
 */
export function migrateLegacyAppData(legacyDirectory: string, targetDirectory: string): boolean {
  if (legacyDirectory === targetDirectory) return false
  if (existsSync(join(targetDirectory, 'library.sqlite'))) return false
  if (!existsSync(join(legacyDirectory, 'library.sqlite'))) return false

  mkdirSync(targetDirectory, { recursive: true })
  for (const name of LEGACY_FILES) {
    const source = join(legacyDirectory, name)
    if (existsSync(source)) copyFileSync(source, join(targetDirectory, name))
  }
  const legacyFonts = join(legacyDirectory, 'fonts')
  if (existsSync(legacyFonts)) cpSync(legacyFonts, join(targetDirectory, 'fonts'), { recursive: true })
  return true
}
