import { app, BrowserWindow, Menu, net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LEGACY_APP_FOLDER, migrateLegacyAppData } from './app-data'
import { BackupService } from './backup'
import { AppDatabase } from './database'
import { WorkExporter } from './exporter'
import { FontService } from './fonts'
import { registerIpcHandlers, seedTemplates } from './ipc'
import { LibraryScanner } from './scanner'
import { SettingsService } from './settings'
import { ThumbnailService } from './thumbnails'

protocol.registerSchemesAsPrivileged([
  { scheme: 'album-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'album-font', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

let mainWindow: BrowserWindow | null = null
let database: AppDatabase | null = null
let scanner: LibraryScanner | null = null
let removeIpcHandlers: (() => void) | null = null
/** 当前界面缩放比例，新建窗口（例如 macOS 激活）时沿用它。 */
let currentUiScale = 1

function applyZoom(window: BrowserWindow | null, scale: number): void {
  if (!window || window.isDestroyed()) return
  window.webContents.setZoomFactor(scale)
}

function migrateLegacyAppDataSafe(): void {
  try {
    const migrated = migrateLegacyAppData(
      join(app.getPath('appData'), LEGACY_APP_FOLDER),
      app.getPath('userData')
    )
    if (migrated) console.log('已把旧版相册工作台的数据库、设置和字体迁移到新目录')
  } catch (error) {
    console.error('迁移旧版应用数据失败，将从新目录重新建立索引', error)
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#f6f4ef',
    title: '光影册 LumaFolio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // 导航前先设一次，并在加载完成后补一次：缩放比例是按来源记录的，
  // 页面加载后需要重新应用才能保证首帧就是目标比例。
  applyZoom(window, currentUiScale)
  window.webContents.on('did-finish-load', () => applyZoom(window, currentUiScale))

  const headless = process.env.LUMA_FOLIO_HEADLESS === '1' || process.env.ALBUM_STUDIO_HEADLESS === '1'
  window.once('ready-to-show', () => { if (!headless) window.show() })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

async function initialize(): Promise<void> {
  migrateLegacyAppDataSafe()
  const userData = app.getPath('userData')
  const databasePath = join(userData, 'library.sqlite')
  const thumbnailDirectory = join(userData, 'thumbnails')
  const fontDirectory = join(userData, 'fonts')
  const backupDirectory = join(userData, 'backups')

  database = new AppDatabase(databasePath)
  database.migrate()
  seedTemplates(database)

  const backups = new BackupService(database, databasePath, backupDirectory, 7)
  const settings = new SettingsService(join(userData, 'settings.json'))
  const thumbnails = new ThumbnailService(database, thumbnailDirectory)
  const fonts = new FontService(fontDirectory, join(fontDirectory, 'fonts.json'))
  scanner = new LibraryScanner(database)
  const exporter = new WorkExporter(database, fonts)

  protocol.handle('album-font', async (request) => {
    try {
      const url = new URL(request.url)
      const id = decodeURIComponent(url.hostname || url.pathname.replace(/^\/+/, ''))
      const filePath = await fonts.getPath(id)
      if (!filePath) return new Response('Font not found', { status: 404 })
      const response = await net.fetch(pathToFileURL(filePath).toString())
      return new Response(await response.arrayBuffer(), { headers: { 'content-type': await fonts.mimeType(id) } })
    } catch {
      return new Response('Font not found', { status: 404 })
    }
  })

  protocol.handle('album-media', async (request) => {
    try {
      const url = new URL(request.url)
      const assetId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const size = Math.max(64, Math.min(4096, Number(url.searchParams.get('size') ?? 320)))
      const filePath = url.hostname === 'thumbnail'
        ? await thumbnails.getThumbnail(assetId, size)
        : await thumbnails.getPreview(assetId, size)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Image not found', { status: 404 })
    }
  })

  currentUiScale = (await settings.get()).uiScale
  mainWindow = createWindow()
  removeIpcHandlers = registerIpcHandlers({
    db: database,
    scanner,
    exporter,
    backups,
    settings,
    thumbnails,
    fonts,
    getWindow: () => mainWindow,
    setUiScale: (value: number) => {
      currentUiScale = value
      applyZoom(mainWindow, value)
    }
  })

  void backups.createBackup().catch(() => undefined)
  void settings.get().then((value) => thumbnails.enforceCacheLimit(value.thumbnailCacheLimitGb * 1024 * 1024 * 1024)).catch(() => undefined)
  void (async () => {
    const currentSettings = await settings.get()
    const roots = database?.listSourceRoots() ?? []
    await scanner?.scanAll(roots, (progress) => {
      mainWindow?.webContents.send('app:scan-progress', progress)
    })
    if (currentSettings.autoWatch) {
      for (const root of roots) scanner?.watchRoot(root)
    }
  })().catch((error) => {
    console.error('初始化图库失败', error)
  })
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  app.setAppUserModelId('com.lumafolio.desktop')
  await initialize()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
}).catch((error) => {
  console.error(error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  removeIpcHandlers?.()
  void scanner?.close()
  database?.close()
  database = null
})
