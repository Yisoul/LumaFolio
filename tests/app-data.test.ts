import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateLegacyAppData } from '../src/main/app-data'

describe('migrateLegacyAppData', () => {
  let root: string
  let legacy: string
  let target: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luma-folio-data-'))
    legacy = join(root, 'album-studio')
    target = join(root, 'luma-folio')
    await mkdir(legacy, { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('copies the database, settings and fonts into the new directory', async () => {
    await writeFile(join(legacy, 'library.sqlite'), 'db')
    await writeFile(join(legacy, 'library.sqlite-wal'), 'wal')
    await writeFile(join(legacy, 'settings.json'), '{"theme":"dark"}')
    await mkdir(join(legacy, 'fonts'), { recursive: true })
    await writeFile(join(legacy, 'fonts', 'fonts.json'), '[]')

    expect(migrateLegacyAppData(legacy, target)).toBe(true)

    expect(await readFile(join(target, 'library.sqlite'), 'utf8')).toBe('db')
    expect(await readFile(join(target, 'library.sqlite-wal'), 'utf8')).toBe('wal')
    expect(await readFile(join(target, 'settings.json'), 'utf8')).toBe('{"theme":"dark"}')
    expect(await readFile(join(target, 'fonts', 'fonts.json'), 'utf8')).toBe('[]')
    // 旧目录保持原样，出问题可以回退。
    expect(await readFile(join(legacy, 'library.sqlite'), 'utf8')).toBe('db')
  })

  it('keeps the existing library when the new directory already has one', async () => {
    await writeFile(join(legacy, 'library.sqlite'), 'old')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'library.sqlite'), 'new')

    expect(migrateLegacyAppData(legacy, target)).toBe(false)
    expect(await readFile(join(target, 'library.sqlite'), 'utf8')).toBe('new')
  })

  it('does nothing when there is no legacy library', async () => {
    expect(migrateLegacyAppData(legacy, target)).toBe(false)
    expect(existsSync(join(target, 'library.sqlite'))).toBe(false)
  })

  it('does nothing when both paths are the same', async () => {
    await writeFile(join(legacy, 'library.sqlite'), 'db')
    expect(migrateLegacyAppData(legacy, legacy)).toBe(false)
  })
})
