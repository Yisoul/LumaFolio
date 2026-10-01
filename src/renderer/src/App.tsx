import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppStats, CreateWorkRequest } from '../../shared/api'
import type {
  Album, AppSettings, AppTheme, DuplicateGroup, FolderSummary, MediaAssetSummary, MediaLocation, OutputMode,
  ScanProgress, SearchFilters, SourceRemovalMode, SourceRemovalResult, SourceRoot, SourceRootImpact,
  TemplateDefinition, Work
} from '../../shared/types'
import ContextMenu from './ContextMenu'
import Editor from './Editor'
import FilterChips from './FilterChips'
import FolderTree from './FolderTree'
import JustifiedPhotoGrid from './JustifiedPhotoGrid'
import Lightbox from './Lightbox'
import PhotoInspector from './PhotoInspector'
import ShortcutHelp from './ShortcutHelp'
import Splitter from './Splitter'
import ThumbSizeSlider from './ThumbSizeSlider'
import TextInputDialog from './TextInputDialog'
import WaterfallView from './WaterfallView'
import { RATING_FILTER_OPTIONS, errorMessage, formatCamera, formatDate, previewUrl, ratingFilterPatch, ratingFilterValue, ratingStars, thumbnailUrl } from './helpers'
import { IconAlbums, IconChevronLeft, IconDuplicates, IconExpand, IconLibrary, IconPanelLeft, IconPanelRight, IconPlus, IconRefresh, IconSearch, IconSettings, IconTrash } from './icons'
import { useShortcut } from './shortcuts'
import { useThumbWheel } from './useThumbWheel'

type NavKey = 'library' | 'duplicates' | 'albums' | 'settings'

/** 界面缩放档位，和设置页、Ctrl+= / Ctrl+- 共用同一组值。 */
const UI_SCALE_PRESETS = [0.9, 1, 1.1, 1.25, 1.5]

export default function App() {
  const [nav, setNav] = useState<NavKey>('library')
  const [stats, setStats] = useState<AppStats>({ assets: 0, duplicateGroups: 0, missing: 0, roots: 0 })
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [roots, setRoots] = useState<SourceRoot[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TemplateDefinition[]>([])
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [toast, setToast] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings>({ thumbnailCacheLimitGb: 10, autoWatch: true, theme: 'dark', uiScale: 1, thumbnailSize: 200, treeWidth: 220, inspectorWidth: 320, navWidth: 208 })
  const settingsRef = useRef(settings)
  const saveTimerRef = useRef<number | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [searchFocusRequest, setSearchFocusRequest] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(false)

  const refreshStats = useCallback(async () => setStats(await window.albumApi.app.getStats()), [])
  const refreshRoots = useCallback(async () => setRoots(await window.albumApi.library.listRoots()), [])
  const refreshAlbums = useCallback(async () => setAlbums(await window.albumApi.albums.list()), [])
  const refreshTemplates = useCallback(async () => setTemplates(await window.albumApi.templates.list()), [])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStats(), refreshRoots(), refreshAlbums(), refreshTemplates()])
  }, [refreshAlbums, refreshRoots, refreshStats, refreshTemplates])

  useEffect(() => {
    void window.albumApi.app.getSettings()
      .then((loaded) => { settingsRef.current = loaded; setSettings(loaded) })
      .catch(() => undefined)
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = settings.theme }, [settings.theme])
  // 桌面端屏蔽 Ctrl+滚轮的整页缩放，这个手势留给全屏瀑布流调图片大小。
  useEffect(() => {
    const handler = (event: WheelEvent) => { if (event.ctrlKey || event.metaKey) event.preventDefault() }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [])
  useEffect(() => {
    void refreshAll().catch((error) => setToast({ kind: 'error', text: errorMessage(error) }))
    return window.albumApi.app.onScanProgress((progress) => {
      setScanProgress(progress)
      if (progress.phase === 'complete') void refreshStats().catch(() => undefined)
    })
  }, [refreshAll, refreshStats])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])

  const addRoots = async () => {
    try {
      const paths = await window.albumApi.app.chooseFolders()
      if (paths.length === 0) return
      const added = await window.albumApi.library.addRoots(paths)
      await refreshRoots()
      for (const root of added) await window.albumApi.library.scanRoot(root.id)
      await Promise.all([refreshStats(), refreshRoots()])
      setToast({ kind: 'info', text: `已加入 ${added.length} 个来源目录` })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    }
  }

  const removeRoot = async (rootId: string, mode: SourceRemovalMode): Promise<SourceRemovalResult> => {
    const result = await window.albumApi.library.removeRoot(rootId, mode)
    await Promise.all([refreshRoots(), refreshStats(), refreshAlbums()])
    return result
  }

  const setRootEnabled = async (rootId: string, enabled: boolean): Promise<void> => {
    await window.albumApi.library.setRootEnabled(rootId, enabled)
    await Promise.all([refreshRoots(), refreshStats()])
  }

  const scanAll = async () => {
    try {
      await window.albumApi.app.scanAll()
      await refreshStats()
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    }
  }

  const createAlbum = async (name: string): Promise<void> => {
    const album = await window.albumApi.albums.create(name)
    await refreshAlbums()
    setAlbumDialogOpen(false)
    setSelectedAlbumId(album.id)
    setNav('albums')
  }

  const goTo = (key: NavKey): void => {
    setEditingWorkId(null)
    setNav(key)
  }

  useShortcut({ id: 'global.library', keys: ['ctrl+1'], scope: 'global', label: '切换到图库', run: () => goTo('library') })
  useShortcut({ id: 'global.duplicates', keys: ['ctrl+2'], scope: 'global', label: '切换到重复项', run: () => goTo('duplicates') })
  useShortcut({ id: 'global.albums', keys: ['ctrl+3'], scope: 'global', label: '切换到相册', run: () => goTo('albums') })
  useShortcut({ id: 'global.settings', keys: ['ctrl+4'], scope: 'global', label: '切换到设置', run: () => goTo('settings') })
  useShortcut({
    id: 'global.search',
    keys: ['/', 'ctrl+f'],
    scope: 'global',
    label: '聚焦搜索框',
    run: () => { goTo('library'); setSearchFocusRequest(true) }
  })
  useShortcut({ id: 'global.help', keys: ['?', 'ctrl+/'], scope: 'global', label: '快捷键帮助', when: () => !helpOpen, run: () => setHelpOpen(true) })

  /**
   * 设置只有这一份数据源：先本地生效，再按需落盘。
   * 之前主题和缩放各存一份，点主题会用旧快照把缩放写回去。
   */
  const persistSettings = useCallback(async (next: AppSettings): Promise<void> => {
    try {
      const saved = await window.albumApi.app.saveSettings(next)
      settingsRef.current = saved
      setSettings(saved)
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    }
  }, [])

  const applySettings = useCallback((patch: Partial<AppSettings>, persist: 'now' | 'debounce' = 'now'): void => {
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    setSettings(next)
    if (persist === 'now') {
      void persistSettings(next)
      return
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => void persistSettings(next), 300)
  }, [persistSettings])

  const changeUiScale = (next: number): void => {
    applySettings({ uiScale: next })
    setToast({ kind: 'info', text: `界面缩放 ${Math.round(next * 100)}%` })
  }

  const stepUiScale = (delta: number): void => {
    const currentIndex = Math.max(0, UI_SCALE_PRESETS.findIndex((value) => Math.abs(value - settingsRef.current.uiScale) < 0.001))
    const nextIndex = Math.min(UI_SCALE_PRESETS.length - 1, Math.max(0, currentIndex + delta))
    if (nextIndex === currentIndex) return
    changeUiScale(UI_SCALE_PRESETS[nextIndex])
  }

  useShortcut({ id: 'global.scale-in', keys: ['ctrl+plus', 'ctrl+equal'], scope: 'global', label: '放大界面', run: () => stepUiScale(1) })
  useShortcut({ id: 'global.scale-out', keys: ['ctrl+minus'], scope: 'global', label: '缩小界面', run: () => stepUiScale(-1) })
  useShortcut({ id: 'global.scale-reset', keys: ['ctrl+0'], scope: 'global', label: '界面缩放回到 100%', run: () => changeUiScale(1) })

  if (editingWorkId) {
    return (
      <>
        <Editor workId={editingWorkId} onBack={async () => { setEditingWorkId(null); await refreshStats() }} onToast={setToast} />
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
        {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      </>
    )
  }

  return (
    <div
      className={`app-shell ${navCollapsed ? 'nav-collapsed' : ''}`}
      style={{ gridTemplateColumns: navCollapsed ? '44px minmax(0, 1fr)' : `${settings.navWidth ?? 208}px 4px minmax(0, 1fr)` }}
    >
      {navCollapsed && <div className="nav-rail"><button type="button" className="icon-button" title="显示导航栏" onClick={() => setNavCollapsed(false)}><IconPanelRight size={16} /></button></div>}
      <aside className="sidebar">
        <div className="brand"><div><strong>光影册</strong><span>LumaFolio</span></div><button type="button" className="icon-button" title="隐藏导航栏" onClick={() => setNavCollapsed(true)}><IconPanelLeft size={16} /></button></div>
        <nav className="nav-list">
          <NavButton icon={<IconLibrary size={16} />} label="图库" active={nav === 'library'} onClick={() => setNav('library')} />
          <NavButton icon={<IconDuplicates size={16} />} label="重复项" count={stats.duplicateGroups} active={nav === 'duplicates'} onClick={() => setNav('duplicates')} />
          <NavButton icon={<IconAlbums size={16} />} label="相册" count={albums.length} active={nav === 'albums'} onClick={() => setNav('albums')} />
          <NavButton icon={<IconSettings size={16} />} label="设置" active={nav === 'settings'} onClick={() => setNav('settings')} />
        </nav>
        <div className="sidebar-stats"><span>{stats.assets.toLocaleString()} 张照片</span><span>{stats.roots} 个来源目录</span></div>
      </aside>
      {!navCollapsed && <Splitter
        width={settings.navWidth ?? 208}
        min={160}
        max={360}
        onResize={(value) => applySettings({ navWidth: value }, 'debounce')}
      />}
      <main className="main-content">
        {scanProgress && scanProgress.phase !== 'complete' && (
          <div className="scan-banner">
            <span>正在读取照片</span>
            <div className="scan-track"><i style={{ width: `${scanProgress.discovered ? Math.round(scanProgress.processed / scanProgress.discovered * 100) : 0}%` }} /></div>
            <span>{scanProgress.processed} / {scanProgress.discovered}</span>
          </div>
        )}
        {nav === 'library' && <LibraryPage roots={roots} albums={albums} onAddRoots={addRoots} onScanAll={scanAll} onRefreshStats={refreshStats} onToast={setToast} focusSearch={searchFocusRequest} onSearchFocused={() => setSearchFocusRequest(false)} settings={settings} onSettingsChange={applySettings} />}
        {nav === 'duplicates' && <DuplicatesPage onToast={setToast} onRefresh={refreshStats} />}
        {nav === 'albums' && <AlbumsPage albums={albums} selectedAlbumId={selectedAlbumId} onSelectAlbum={setSelectedAlbumId} onRefreshAlbums={refreshAlbums} templates={templates} onOpenWork={setEditingWorkId} onToast={setToast} onCreateAlbum={() => setAlbumDialogOpen(true)} settings={settings} onSettingsChange={applySettings} />}
        {nav === 'settings' && <SettingsPage roots={roots} onAddRoots={addRoots} onRemoveRoot={removeRoot} onSetRootEnabled={setRootEnabled} onScanAll={scanAll} onRefreshStats={refreshStats} onToast={setToast} settings={settings} onSettingsChange={applySettings} onUiScaleChange={changeUiScale} />}
      </main>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      {albumDialogOpen && <TextInputDialog title="新建相册" label="相册名称" confirmLabel="创建相册" onClose={() => setAlbumDialogOpen(false)} onConfirm={createAlbum} />}
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

function NavButton(props: { icon: React.ReactNode; label: string; count?: number; active: boolean; onClick: () => void }) {
  return <button className={`nav-button ${props.active ? 'active' : ''}`} onClick={props.onClick}><span className="nav-icon">{props.icon}</span><span>{props.label}</span>{props.count != null && props.count > 0 && <b>{props.count}</b>}</button>
}

function LibraryPage(props: {
  roots: SourceRoot[]
  albums: Album[]
  onAddRoots: () => Promise<void>
  onScanAll: () => Promise<void>
  onRefreshStats: () => Promise<void>
  onToast: (toast: { kind: 'info' | 'error'; text: string }) => void
  focusSearch: boolean
  onSearchFocused: () => void
  settings: AppSettings
  onSettingsChange: (patch: Partial<AppSettings>, persist?: 'now' | 'debounce') => void
}) {
  const pageSize = 120
  const [filters, setFilters] = useState<Omit<SearchFilters, 'limit' | 'offset'>>({ sort: 'captured_desc' })
  const [page, setPage] = useState(0)
  const [viewMode, setViewMode] = useState<'folders' | 'all'>('folders')
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [photos, setPhotos] = useState<MediaAssetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; asset: MediaAssetSummary } | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [waterfallOpen, setWaterfallOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth >= 1280)
  const [treeOpen, setTreeOpen] = useState(true)
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 空格全屏查看当前照片；Esc 先关浮层、再取消选择。
  useShortcut({
    id: 'library.lightbox',
    keys: ['space'],
    scope: 'library',
    label: '全屏查看选中的照片',
    when: () => !waterfallOpen && !contextMenu && lightboxIndex == null,
    run: () => {
      const index = photos.findIndex((photo) => photo.id === activeId)
      if (index >= 0) setLightboxIndex(index)
    }
  })
  useShortcut({ id: 'library.fullscreen', keys: ['f'], scope: 'library', label: '全屏浏览', when: () => !waterfallOpen, run: () => setWaterfallOpen(true) })
  useShortcut({ id: 'library.select-all', keys: ['ctrl+a'], scope: 'library', label: '全选已加载照片', skipInInput: true, when: () => photos.length > 0, run: () => setSelected(new Set(photos.map((photo) => photo.id))) })
  useShortcut({ id: 'library.clear-selection', keys: ['escape'], scope: 'library', label: '取消选择', when: () => selected.size > 0, run: () => setSelected(new Set()) })

  useEffect(() => {
    if (!props.focusSearch) return
    const node = searchRef.current
    if (!node) return
    node.focus()
    node.select()
    props.onSearchFocused()
  }, [props.focusSearch, props.onSearchFocused])

  useEffect(() => {
    const timer = setTimeout(async () => {
      const requestId = ++requestIdRef.current
      if (page === 0) setLoading(true)
      else setLoadingMore(true)
      try {
        const result = await window.albumApi.library.search({ ...filters, limit: pageSize, offset: page * pageSize })
        if (requestId !== requestIdRef.current) return
        setTotal(result.total)
        void window.albumApi.library.listFolders().then(setFolders)
        setPhotos((current) => page === 0 ? result.items : [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))])
      } catch (error) {
        if (requestId === requestIdRef.current) props.onToast({ kind: 'error', text: errorMessage(error) })
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    }, page === 0 ? 220 : 0)
    return () => clearTimeout(timer)
  }, [filters, page, props.onToast])

  const hasMore = photos.length < total

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loading || loadingMore) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setPage((current) => current + 1)
    }, { rootMargin: '300px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore])

  const updateFilters = (patch: Partial<Omit<SearchFilters, 'limit' | 'offset'>>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(0)
  }

  const addToAlbum = async (albumId: string) => {
    if (!albumId || selected.size === 0) return
    try {
      await window.albumApi.albums.addAssets(albumId, [...selected])
      props.onToast({ kind: 'info', text: `已加入 ${selected.size} 张照片` })
      setSelected(new Set())
    } catch (error) {
      props.onToast({ kind: 'error', text: errorMessage(error) })
    }
  }

  const addAssetToAlbum = async (album: Album, assetId: string) => {
    try { await window.albumApi.albums.addAssets(album.id, [assetId]); props.onToast({ kind: 'info', text: `已加入“${album.name}”` }) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const toggleFavorite = async (asset: MediaAssetSummary) => {
    try {
      await window.albumApi.library.setFavorite(asset.id, !asset.favorite)
      setPhotos((current) => current.map((item) => item.id === asset.id ? { ...item, favorite: !asset.favorite } : item))
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const showAssetInFolder = async (asset: MediaAssetSummary) => {
    try {
      const locations = await window.albumApi.library.listLocations(asset.id)
      const available = locations.find((location) => location.status === 'available')
      if (available) await window.albumApi.library.showInFolder(available.id)
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const removeFromLibrary = async (asset: MediaAssetSummary) => {
    if (!window.confirm('从图库移除这张照片？相册和作品中的引用会保留，磁盘原图不会删除。')) return
    try {
      await window.albumApi.library.ignoreAsset(asset.id)
      setPhotos((current) => current.filter((item) => item.id !== asset.id))
      setTotal((current) => Math.max(0, current - 1))
      await props.onRefreshStats()
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const activePhoto = photos.find((photo) => photo.id === activeId) ?? null
  /** 单击设为当前照片并打开信息栏；Ctrl/⌘ 单击切换多选。 */
  const activate = (asset: MediaAssetSummary, additive: boolean): void => {
    setActiveId(asset.id)
    setSelected((current) => {
      if (!additive) return new Set([asset.id])
      const next = new Set(current)
      if (next.has(asset.id)) next.delete(asset.id)
      else next.add(asset.id)
      if (next.size === 0) next.add(asset.id)
      return next
    })
    setInspectorOpen(true)
  }
  const openLightbox = (asset: MediaAssetSummary): void => {
    const index = photos.findIndex((photo) => photo.id === asset.id)
    if (index >= 0) setLightboxIndex(index)
  }
  /** 普通点击只选一个目录（父级和「全部文件夹」自动取消），Ctrl/⌘ 点击可以多选。 */
  const toggleFolder = (path: string, additive: boolean): void => {
    const current = filters.folderPaths ?? []
    if (!additive) {
      updateFilters({ folderPaths: current.length === 1 && current[0] === path ? undefined : [path] })
      return
    }
    const next = current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
    updateFilters({ folderPaths: next.length ? next : undefined })
  }
  const clearFilters = (): void => {
    setFilters({ sort: filters.sort ?? 'captured_desc' })
    setPage(0)
  }
  const treeWidth = props.settings.treeWidth ?? 220
  const inspectorWidth = props.settings.inspectorWidth ?? 320
  const gridTemplateColumns = [
    treeOpen ? `${treeWidth}px` : null,
    treeOpen ? '4px' : null,
    'minmax(0, 1fr)',
    inspectorOpen ? '4px' : null,
    inspectorOpen ? `${inspectorWidth}px` : null
  ].filter(Boolean).join(' ')
  useThumbWheel(scrollRef, props.settings.thumbnailSize, 120, 360, (value) => props.onSettingsChange({ thumbnailSize: value }, 'debounce'))

  return (
    <section className="browse-page" style={{ gridTemplateColumns }}>
      {treeOpen && <>
        <aside className="browse-side">
          <div className="browse-side-head">
            <div className="segmented small">
              <button className={viewMode === 'folders' ? 'active' : ''} onClick={() => setViewMode('folders')}>按文件夹</button>
              <button className={viewMode === 'all' ? 'active' : ''} onClick={() => { setViewMode('all'); updateFilters({ folderPaths: undefined }) }}>全部照片</button>
            </div>
          </div>
          <div className="browse-side-scroll">
            <FolderTree
              folders={folders}
              roots={props.roots}
              selectedPaths={viewMode === 'all' ? [] : filters.folderPaths ?? []}
              onToggle={(path, additive) => { setViewMode('folders'); toggleFolder(path, additive) }}
              onClear={() => updateFilters({ folderPaths: undefined })}
              totalCount={total}
              linkedPath={hoveredFolder}
            />
          </div>
        </aside>
        <Splitter width={treeWidth} min={160} max={420} onResize={(value) => props.onSettingsChange({ treeWidth: value }, 'debounce')} />
      </>}

      <div className="browse-main">
        <header className="browse-toolbar">
          <div className="browse-title">
            <button type="button" className={`icon-button ${treeOpen ? 'active' : ''}`} title={treeOpen ? '隐藏文件夹栏' : '显示文件夹栏'} onClick={() => setTreeOpen((open) => !open)}><IconPanelLeft size={16} /></button>
            <strong>图库</strong>
            <span>{total.toLocaleString()} 张{selected.size > 0 ? ` · 已选 ${selected.size}` : ''}</span>
          </div>
          <ThumbSizeSlider value={props.settings.thumbnailSize} onChange={(value) => props.onSettingsChange({ thumbnailSize: value }, 'debounce')} />
          <div className="browse-tools">
            <button type="button" className="icon-button" title="全屏浏览（F）" onClick={() => setWaterfallOpen(true)}><IconExpand size={16} /></button>
            <button type="button" className="icon-button" title="重新扫描" onClick={() => void props.onScanAll()}><IconRefresh size={16} /></button>
            <button type="button" className="icon-button" title="添加文件夹" onClick={() => void props.onAddRoots()}><IconPlus size={16} /></button>
            <label className="search-field">
              <IconSearch size={14} />
              <input ref={searchRef} placeholder="搜索文件名或文件夹路径" value={filters.text ?? ''} onChange={(event) => updateFilters({ text: event.target.value || undefined })} />
            </label>
            <button type="button" className={`icon-button ${inspectorOpen ? 'active' : ''}`} title={inspectorOpen ? '收起信息栏' : '显示信息栏'} onClick={() => setInspectorOpen((open) => !open)}><IconPanelRight size={16} /></button>
          </div>
        </header>

        <div className="browse-subbar">
          <FilterChips filters={filters} onChange={updateFilters} onClear={clearFilters} />
          <div className="browse-subbar-right">
            {photos.length > 0 && <button type="button" className="text-button" onClick={() => setSelected(new Set(photos.map((photo) => photo.id)))}>全选已加载</button>}
            {selected.size > 0 && <button type="button" className="text-button" onClick={() => setSelected(new Set())}>取消选择</button>}
          </div>
        </div>

        <div className="browse-scroll" ref={scrollRef}>
          {props.roots.every((root) => !root.enabled)
            ? <EmptyState title="还没有启用的照片来源" text="添加一个包含 JPG 或 PNG 的文件夹，或重新启用已停用的目录。" action="选择照片文件夹" onAction={() => void props.onAddRoots()} />
            : loading && photos.length === 0
              ? <div className="loading">正在读取图库…</div>
              : photos.length === 0
                ? <EmptyState title="没有匹配的照片" text="换个关键词或清空筛选条件。" />
                : <JustifiedPhotoGrid
                  photos={photos}
                  targetHeight={props.settings.thumbnailSize}
                  selectedIds={selected}
                  activeId={activeId}
                  onActivate={activate}
                  onOpen={openLightbox}
                  onContextMenu={(event, photo) => setContextMenu({ x: event.clientX, y: event.clientY, asset: photo })}
                  onHover={(photo) => setHoveredFolder(treeOpen ? photo?.primaryDirectoryPath ?? null : null)}
                />}
          {photos.length > 0 && <div className="load-more" ref={sentinelRef}>{hasMore ? <button className="button secondary" disabled={loadingMore} onClick={() => setPage((current) => current + 1)}>{loadingMore ? '正在加载…' : '加载更多'}</button> : <span>已显示全部 {total.toLocaleString()} 张</span>}</div>}
        </div>
      </div>

      {inspectorOpen && <>
        <Splitter width={inspectorWidth} min={240} max={520} invert onResize={(value) => props.onSettingsChange({ inspectorWidth: value }, 'debounce')} />
        <PhotoInspector
          asset={activePhoto}
          albums={props.albums}
          selectedCount={selected.size}
          onClose={() => setInspectorOpen(false)}
          onAddToAlbum={addToAlbum}
          onToggleFavorite={toggleFavorite}
          onRemoveFromLibrary={removeFromLibrary}
          onToast={props.onToast}
        />
      </>}

      {lightboxIndex != null && photos[lightboxIndex] && <Lightbox assets={photos} index={lightboxIndex} onChangeIndex={setLightboxIndex} onClose={() => setLightboxIndex(null)} />}
      {waterfallOpen && <WaterfallView source={{ kind: 'library', title: '全屏浏览 · 图库', filters }} onClose={() => setWaterfallOpen(false)} onToast={props.onToast} />}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[
        { label: '查看大图', hint: '空格', onClick: () => openLightbox(contextMenu.asset) },
        { label: contextMenu.asset.favorite ? '取消收藏' : '加入收藏', onClick: () => void toggleFavorite(contextMenu.asset) },
        { label: '在文件夹中显示', disabled: contextMenu.asset.missing, onClick: () => void showAssetInFolder(contextMenu.asset) },
        ...props.albums.map((album) => ({ label: `加入相册：${album.name}`, onClick: () => void addAssetToAlbum(album, contextMenu.asset.id) })),
        { label: '从图库移除', separator: true, danger: true, onClick: () => void removeFromLibrary(contextMenu.asset) }
      ]} />}
    </section>
  )
}

function PhotoDetail(props: { asset: MediaAssetSummary; assets: MediaAssetSummary[]; onChange: (asset: MediaAssetSummary) => void; onClose: () => void; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void }) {
  const [locations, setLocations] = useState<MediaLocation[]>([])
  const [fullscreen, setFullscreen] = useState(false)
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const lastNavigationRef = useRef(0)
  const currentIndex = Math.max(0, props.assets.findIndex((asset) => asset.id === props.asset.id))
  const multiple = props.assets.length > 1
  const navigate = useCallback((delta: number) => {
    if (props.assets.length === 0) return
    const index = Math.max(0, props.assets.findIndex((asset) => asset.id === props.asset.id))
    const nextIndex = (index + delta + props.assets.length) % props.assets.length
    if (nextIndex !== index) props.onChange(props.assets[nextIndex])
  }, [props.asset.id, props.assets, props.onChange])
  useEffect(() => { void window.albumApi.library.listLocations(props.asset.id).then(setLocations) }, [props.asset.id])
  useEffect(() => { setPreviewLoaded(false); setPreviewFailed(false) }, [props.asset.id])
  useEffect(() => {
    for (const offset of [-1, 1]) {
      const asset = props.assets[(currentIndex + offset + props.assets.length) % props.assets.length]
      if (!asset || asset.missing || asset.id === props.asset.id) continue
      const image = new window.Image()
      image.decoding = 'async'
      image.src = previewUrl(asset.id, 1600)
    }
  }, [currentIndex, props.asset.id, props.assets])
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === previewRef.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  const navigateRepeated = (delta: number, event: KeyboardEvent) => {
    const now = Date.now()
    if (event.repeat && now - lastNavigationRef.current < 90) return
    lastNavigationRef.current = now
    navigate(delta)
  }
  useShortcut({ id: 'photo.close', keys: ['escape'], scope: 'dialog', label: '关闭照片详情', when: () => !document.fullscreenElement, run: props.onClose })
  useShortcut({ id: 'photo.next', keys: ['arrowright', 'arrowdown'], scope: 'dialog', label: '下一张', when: () => multiple, run: (event) => navigateRepeated(1, event) })
  useShortcut({ id: 'photo.previous', keys: ['arrowleft', 'arrowup'], scope: 'dialog', label: '上一张', when: () => multiple, run: (event) => navigateRepeated(-1, event) })
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await previewRef.current?.requestFullscreen()
    } catch (error) {
      props.onToast({ kind: 'error', text: errorMessage(error) })
    }
  }
  const favorite = async () => { try { await window.albumApi.library.setFavorite(props.asset.id, !props.asset.favorite); props.onClose() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  return (
    <Modal title={fileName(props.asset.primaryPath)} onClose={props.onClose} wide>
      <div className="detail-layout">
        <div className="detail-preview" ref={previewRef}>
          <div className="preview-counter">{currentIndex + 1} / {props.assets.length}</div>
          <button className="fullscreen-button" disabled={props.asset.missing || previewFailed} onClick={() => void toggleFullscreen()}>{fullscreen ? '退出全屏' : '全屏查看'}</button>
          {multiple && <><button className="preview-nav previous" aria-label="上一张" onClick={() => navigate(-1)}>‹</button><button className="preview-nav next" aria-label="下一张" onClick={() => navigate(1)}>›</button></>}
          <div className="preview-image-wrap">
            {!props.asset.missing && !previewFailed && <img key={props.asset.id} className={`preview-full ${previewLoaded ? 'loaded' : ''}`} src={previewUrl(props.asset.id, 1600)} alt="照片预览" decoding="async" onLoad={() => setPreviewLoaded(true)} onError={() => setPreviewFailed(true)} onDoubleClick={() => void toggleFullscreen()} />}
            {(props.asset.missing || previewFailed) && <div className="preview-missing-message"><strong>原图不可用</strong><span>{props.asset.primaryPath ?? '文件位置已移除或磁盘离线'}</span></div>}
          </div>
        </div>
        <div className="detail-info"><dl><dt>拍摄时间</dt><dd>{formatDate(props.asset.capturedAt)}</dd><dt>尺寸</dt><dd>{props.asset.width} × {props.asset.height}</dd><dt>拍摄参数</dt><dd>{formatCamera(props.asset)}</dd><dt>相机评星</dt><dd>{props.asset.rating > 0 ? `${ratingStars(props.asset.rating)} ${props.asset.rating} / 5` : '未评级'}</dd></dl><button className="button secondary" onClick={() => void favorite()}>{props.asset.favorite ? '取消收藏' : '加入收藏'}</button><h3>文件位置</h3>{locations.map((location) => <div className={`location-row ${location.status === 'missing' ? 'missing' : ''}`} key={location.id}><span title={location.absolutePath}>{location.absolutePath}</span>{location.status === 'available' && <button className="text-button" onClick={() => void window.albumApi.library.showInFolder(location.id)}>定位</button>}</div>)}</div>
      </div>
    </Modal>
  )
}

function DuplicatesPage(props: { onToast: (toast: { kind: 'info' | 'error'; text: string }) => void; onRefresh: () => Promise<void> }) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const load = useCallback(async () => setGroups(await window.albumApi.library.listDuplicates()), [])
  useEffect(() => { void load() }, [load])
  return <section className="page"><header className="page-header"><div><p className="eyebrow">EXACT DUPLICATES</p><h1>重复项</h1><p className="subtle">只按文件内容识别完全相同的照片，不主动删除任何副本。</p></div></header>{groups.length === 0 ? <EmptyState title="没有发现重复文件" text="来源目录中相同内容的 JPG 或 PNG 会在这里显示。" /> : <div className="duplicate-list">{groups.map((group) => <DuplicateCard key={group.assetId} group={group} onChanged={async () => { await Promise.all([load(), props.onRefresh()]) }} onToast={props.onToast} />)}</div>}</section>
}

function DuplicateCard(props: { group: DuplicateGroup; onChanged: () => Promise<void>; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void }) {
  const [locations, setLocations] = useState<MediaLocation[]>([])
  const [dialog, setDialog] = useState<{ kind: 'location'; location: MediaLocation } | { kind: 'group' } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void window.albumApi.library.listLocations(props.group.assetId).then(setLocations) }, [props.group.assetId])
  const run = async (action: () => Promise<void>) => { try { await action(); await props.onChanged() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  const confirmDelete = async () => {
    if (!dialog) return
    setBusy(true)
    try {
      if (dialog.kind === 'location') await window.albumApi.library.deleteOriginal(dialog.location.id)
      else await window.albumApi.library.ignoreAsset(props.group.assetId)
      await props.onChanged()
      setDialog(null)
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } finally { setBusy(false) }
  }
  return (
    <>
      <article className="duplicate-card"><img src={thumbnailUrl(props.group.assetId)} alt="重复照片" /><div className="duplicate-content"><div className="duplicate-title"><strong>{props.group.locationCount} 个相同副本</strong><span>磁盘仅保留原文件，不额外复制</span></div>{locations.map((location) => <div className={`location-row ${location.status === 'missing' ? 'missing' : ''}`} key={location.id}><span title={location.absolutePath}>{location.absolutePath}</span>{location.status === 'available' && <button className="text-button" onClick={() => void run(() => window.albumApi.library.setPreferredLocation(props.group.assetId, location.id))}>设为原图</button>}{location.status === 'available' && <button className="text-button danger" onClick={() => setDialog({ kind: 'location', location })}>删除到回收站</button>}</div>)}<button className="text-button danger" onClick={() => setDialog({ kind: 'group' })}>从图库移除</button></div></article>
      {dialog && <Modal title={dialog.kind === 'location' ? '删除原图' : '从图库移除'} onClose={() => { if (!busy) setDialog(null) }}><div className="confirm-dialog"><div className="confirm-icon">{dialog.kind === 'location' ? '⌫' : '−'}</div><div><strong>{dialog.kind === 'location' ? '将原图移入系统回收站？' : '从图库移除整组照片？'}</strong><p>{dialog.kind === 'location' ? '文件会进入 Windows 回收站，可从回收站恢复。' : '只删除应用中的记录，磁盘文件不会删除。'}</p></div><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setDialog(null)}>取消</button><button className="button danger-solid" disabled={busy} onClick={() => void confirmDelete()}>{busy ? '处理中…' : '确认'}</button></div></div></Modal>}
    </>
  )
}

function AlbumsPage(props: { albums: Album[]; selectedAlbumId: string | null; onSelectAlbum: (albumId: string | null) => void; onRefreshAlbums: () => Promise<void>; templates: TemplateDefinition[]; onOpenWork: (workId: string) => void; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void; onCreateAlbum: () => void; settings: AppSettings; onSettingsChange: (patch: Partial<AppSettings>, persist?: 'now' | 'debounce') => void }) {
  const selected = props.albums.find((album) => album.id === props.selectedAlbumId)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; album: Album } | null>(null)
  const removeAlbum = async (album: Album) => {
    if (!window.confirm(`删除相册“${album.name}”？作品和相册关系会一起删除，磁盘原图不受影响。`)) return
    try { await window.albumApi.albums.remove(album.id); await props.onRefreshAlbums(); props.onToast({ kind: 'info', text: '相册已删除' }) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  if (selected) return <AlbumDetail album={selected} onBack={() => props.onSelectAlbum(null)} onRefreshAlbums={props.onRefreshAlbums} templates={props.templates} onOpenWork={props.onOpenWork} onToast={props.onToast} settings={props.settings} onSettingsChange={props.onSettingsChange} />
  return <section className="page"><header className="page-header"><div><p className="eyebrow">ALBUMS</p><h1>相册</h1><p className="subtle">同一张照片可放入多个相册，不会产生额外副本。</p></div><button className="button primary" onClick={() => void props.onCreateAlbum()}>＋ 新建相册</button></header>{props.albums.length === 0 ? <EmptyState title="还没有相册" text="创建相册后，可以从图库批量选图加入。" action="新建相册" onAction={() => void props.onCreateAlbum()} /> : <div className="album-grid">{props.albums.map((album) => <button className="album-card" key={album.id} onClick={() => props.onSelectAlbum(album.id)} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, album }) }}>{album.coverAssetId ? <img src={thumbnailUrl(album.coverAssetId, 640)} alt={album.name} /> : <div className="album-placeholder">▤</div>}<span><strong>{album.name}</strong><small>{formatDate(new Date(album.updatedAt).toISOString())} 更新</small></span></button>)}</div>}{contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[{ label: '打开相册', onClick: () => props.onSelectAlbum(contextMenu.album.id) }, { label: '删除相册', separator: true, danger: true, onClick: () => void removeAlbum(contextMenu.album) }]} />}</section>
}

function AlbumDetail(props: {
  album: Album
  onBack: () => void
  onRefreshAlbums: () => Promise<void>
  templates: TemplateDefinition[]
  onOpenWork: (workId: string) => void
  onToast: (toast: { kind: 'info' | 'error'; text: string }) => void
  settings: AppSettings
  onSettingsChange: (patch: Partial<AppSettings>, persist?: 'now' | 'debounce') => void
}) {
  const [assets, setAssets] = useState<MediaAssetSummary[]>([])
  const [works, setWorks] = useState<Work[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [workDialogOpen, setWorkDialogOpen] = useState(false)
  const [waterfallOpen, setWaterfallOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [coverAssetId, setCoverAssetId] = useState(props.album.coverAssetId)
  const [workCovers, setWorkCovers] = useState<Record<string, string | null>>({})
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; asset: MediaAssetSummary } | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth >= 1280)
  const load = useCallback(async () => { const [nextAssets, nextWorks] = await Promise.all([window.albumApi.albums.listAssets(props.album.id), window.albumApi.works.list(props.album.id)]); setAssets(nextAssets); setWorks(nextWorks) }, [props.album.id])
  const loadCovers = useCallback(async () => {
    try {
      const covers = await window.albumApi.works.listCovers(props.album.id)
      setWorkCovers(Object.fromEntries(covers.map((cover) => [cover.workId, cover.assetId])))
    } catch { setWorkCovers({}) }
  }, [props.album.id])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadCovers() }, [loadCovers])
  useEffect(() => setCoverAssetId(props.album.coverAssetId), [props.album.coverAssetId])
  useShortcut({
    id: 'album.lightbox',
    keys: ['space'],
    scope: 'album',
    label: '全屏查看选中的照片',
    when: () => !waterfallOpen && !contextMenu && lightboxIndex == null,
    run: () => {
      const index = assets.findIndex((asset) => asset.id === activeId)
      if (index >= 0) setLightboxIndex(index)
    }
  })
  useShortcut({ id: 'album.fullscreen', keys: ['f'], scope: 'album', label: '全屏浏览相册', when: () => !waterfallOpen && assets.length > 0, run: () => setWaterfallOpen(true) })
  useShortcut({ id: 'album.select-all', keys: ['ctrl+a'], scope: 'album', label: '全选相册照片', skipInInput: true, when: () => assets.length > 0, run: () => setSelected(new Set(assets.map((asset) => asset.id))) })
  useShortcut({ id: 'album.clear-selection', keys: ['escape'], scope: 'album', label: '取消选择', when: () => selected.size > 0, run: () => setSelected(new Set()) })
  const setCover = async (assetId: string) => {
    try {
      await window.albumApi.albums.setCover(props.album.id, assetId)
      setCoverAssetId(assetId)
      await props.onRefreshAlbums()
      props.onToast({ kind: 'info', text: '相册封面已更新' })
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const removeAlbum = async () => { if (!window.confirm(`删除相册“${props.album.name}”？作品和相册关系会一起删除，磁盘原图不受影响。`)) return; try { await window.albumApi.albums.remove(props.album.id); await props.onRefreshAlbums(); props.onBack() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  const removeSelected = async () => { if (!selected.size) return; try { for (const assetId of selected) await window.albumApi.albums.removeAsset(props.album.id, assetId); setSelected(new Set()); await load() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  const removeAsset = async (asset: MediaAssetSummary) => {
    if (!window.confirm('从相册移除这张照片？磁盘原图不会删除。')) return
    try { await window.albumApi.albums.removeAsset(props.album.id, asset.id); await load(); await props.onRefreshAlbums() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const removeWork = async (work: Work) => {
    if (!window.confirm(`删除作品“${work.name}”？作品排版会删除，磁盘原图不受影响。`)) return
    try { await window.albumApi.works.remove(work.id); await load() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const activePhoto = assets.find((asset) => asset.id === activeId) ?? null
  const activate = (asset: MediaAssetSummary, additive: boolean): void => {
    setActiveId(asset.id)
    setSelected((current) => {
      if (!additive) return new Set([asset.id])
      const next = new Set(current)
      if (next.has(asset.id)) next.delete(asset.id)
      else next.add(asset.id)
      if (next.size === 0) next.add(asset.id)
      return next
    })
    setInspectorOpen(true)
  }
  const openLightbox = (asset: MediaAssetSummary): void => {
    const index = assets.findIndex((item) => item.id === asset.id)
    if (index >= 0) setLightboxIndex(index)
  }
  const toggleFavorite = async (asset: MediaAssetSummary): Promise<void> => {
    try {
      await window.albumApi.library.setFavorite(asset.id, !asset.favorite)
      setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, favorite: !asset.favorite } : item))
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const allSelected = assets.length > 0 && selected.size === assets.length
  const inspectorWidth = props.settings.inspectorWidth ?? 320
  const albumColumns = ['minmax(0, 1fr)', inspectorOpen ? '4px' : null, inspectorOpen ? `${inspectorWidth}px` : null].filter(Boolean).join(' ')
  const scrollRef = useRef<HTMLDivElement>(null)
  useThumbWheel(scrollRef, props.settings.thumbnailSize, 120, 360, (value) => props.onSettingsChange({ thumbnailSize: value }, 'debounce'))

  return (
    <section className="browse-page album-browse" style={{ gridTemplateColumns: albumColumns }}>
      <div className="browse-main">
        <header className="browse-toolbar">
          <div className="browse-title">
            <button type="button" className="icon-button" onClick={props.onBack} title="返回全部相册" aria-label="返回全部相册"><IconChevronLeft size={16} /></button>
            <strong>{props.album.name}</strong>
            <span>{assets.length} 张 · {works.length} 套作品</span>
          </div>
          <ThumbSizeSlider value={props.settings.thumbnailSize} onChange={(value) => props.onSettingsChange({ thumbnailSize: value }, 'debounce')} />
          <div className="browse-tools">
            <button type="button" className="icon-button" title="全屏浏览（F）" disabled={assets.length === 0} onClick={() => setWaterfallOpen(true)}><IconExpand size={16} /></button>
            <button type="button" className="icon-button" title="选择照片" onClick={() => setPickerOpen(true)}><IconPlus size={16} /></button>
            <button type="button" className="button primary compact" onClick={() => setWorkDialogOpen(true)}>开始排版</button>
            <button type="button" className="icon-button danger" title="删除相册" onClick={() => void removeAlbum()}><IconTrash size={16} /></button>
            <button type="button" className={`icon-button ${inspectorOpen ? 'active' : ''}`} title={inspectorOpen ? '收起信息栏' : '显示信息栏'} onClick={() => setInspectorOpen((open) => !open)}><IconPanelRight size={16} /></button>
          </div>
        </header>

        <div className="browse-subbar">
          <div className="button-row">
            {assets.length > 0 && <button type="button" className="text-button" onClick={() => setSelected(allSelected ? new Set() : new Set(assets.map((asset) => asset.id)))}>{allSelected ? '取消全选' : '全选'}</button>}
            {selected.size > 0 && <button type="button" className="text-button danger" onClick={() => void removeSelected()}>从相册移除 {selected.size} 张</button>}
          </div>
        </div>

        <div className="browse-scroll" ref={scrollRef}>
          {assets.length === 0
            ? <EmptyState title="相册还是空的" text="从图库选择照片加入，不会复制原文件。" action="选择照片" onAction={() => setPickerOpen(true)} />
            : <JustifiedPhotoGrid
              photos={assets}
              targetHeight={props.settings.thumbnailSize}
              selectedIds={selected}
              activeId={activeId}
              onActivate={activate}
              onOpen={openLightbox}
              onContextMenu={(event, asset) => setContextMenu({ x: event.clientX, y: event.clientY, asset })}
            />}
          <section className="section-block">
            <div className="section-heading"><h2>作品版本</h2></div>
            {works.length === 0 ? <p className="subtle">还没有作品。一个相册可以保存多套不同排版。</p> : <div className="work-grid">{works.map((work) => { const cover = workCovers[work.id]; return <article className="work-card" key={work.id}><button className="work-open" onClick={() => props.onOpenWork(work.id)}><div className="work-preview">{cover ? <img src={thumbnailUrl(cover, 640)} alt={work.name} loading="lazy" /> : <span>{work.outputMode === 'long_image' ? '长图' : '多页'}</span>}</div><strong>{work.name}</strong><small>{work.canvasWidth} × {work.canvasHeight}</small></button><button className="work-delete" onClick={() => void removeWork(work)}>删除作品</button></article> })}</div>}
          </section>
        </div>
      </div>

      {inspectorOpen && <>
        <Splitter width={inspectorWidth} min={240} max={520} invert onResize={(value) => props.onSettingsChange({ inspectorWidth: value }, 'debounce')} />
        <PhotoInspector
          asset={activePhoto}
          albums={[]}
          selectedCount={selected.size}
          onClose={() => setInspectorOpen(false)}
          onAddToAlbum={async () => undefined}
          onToggleFavorite={toggleFavorite}
          onRemoveFromLibrary={removeAsset}
          onToast={props.onToast}
        />
      </>}

      {pickerOpen && <AssetPicker title="选择照片加入相册" thumbnailSize={props.settings.thumbnailSize} onClose={() => setPickerOpen(false)} onConfirm={async (ids) => { try { await window.albumApi.albums.addAssets(props.album.id, ids); setPickerOpen(false); await load() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }} />}
      {lightboxIndex != null && assets[lightboxIndex] && <Lightbox assets={assets} index={lightboxIndex} onChangeIndex={setLightboxIndex} onClose={() => setLightboxIndex(null)} />}
      {waterfallOpen && <WaterfallView source={{ kind: 'assets', title: `全屏浏览 · ${props.album.name}`, assets }} onClose={() => setWaterfallOpen(false)} onToast={props.onToast} />}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[
        { label: '查看大图', hint: '空格', onClick: () => openLightbox(contextMenu.asset) },
        { label: contextMenu.asset.id === coverAssetId ? '当前已是封面' : '设为相册封面', disabled: contextMenu.asset.id === coverAssetId, onClick: () => void setCover(contextMenu.asset.id) },
        { label: '从相册移除', separator: true, danger: true, onClick: () => void removeAsset(contextMenu.asset) }
      ]} />}
      {workDialogOpen && <WorkCreateDialog album={props.album} existingWorks={works} templates={props.templates} onClose={() => setWorkDialogOpen(false)} onCreate={async (request) => { try { const document = await window.albumApi.works.create(request); await load(); setWorkDialogOpen(false); props.onOpenWork(document.work.id) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }} />}
    </section>
  )
}

function WorkCreateDialog(props: { album: Album; existingWorks: Work[]; templates: TemplateDefinition[]; onClose: () => void; onCreate: (request: CreateWorkRequest) => Promise<void> }) {
  const [name, setName] = useState(() => nextWorkName(props.album.name, props.existingWorks))
  const [templateId, setTemplateId] = useState(props.templates[0]?.id ?? '')
  const template = props.templates.find((item) => item.id === templateId)
  const outputMode: OutputMode = template?.category ?? 'pages'
  return <Modal title="创建排版作品" onClose={props.onClose}><div className="form-stack"><label>作品名称<input value={name} onChange={(event) => setName(event.target.value)} /></label><div><label>起始模板</label><div className="template-picker">{props.templates.map((item) => <button key={item.id} className={item.id === templateId ? 'active' : ''} onClick={() => setTemplateId(item.id)}><i className={`template-shape template-${item.id}`} /><span>{item.name}</span></button>)}</div></div><p className="subtle">输出方式：{outputMode === 'long_image' ? '单张长图' : '封面与多页图片组'}</p><button className="button primary full" disabled={!name.trim() || !templateId} onClick={() => void props.onCreate({ albumId: props.album.id, name: name.trim(), outputMode, templateId })}>创建并进入编辑器</button></div></Modal>
}

function AssetPicker(props: { title: string; thumbnailSize: number; onClose: () => void; onConfirm: (ids: string[]) => Promise<void> }) {
  const pageSize = 120
  const [filters, setFilters] = useState<Omit<SearchFilters, 'limit' | 'offset'>>({ sort: 'captured_desc' })
  const [viewMode, setViewMode] = useState<'folders' | 'all'>('folders')
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [page, setPage] = useState(0)
  const [assets, setAssets] = useState<MediaAssetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<MediaAssetSummary | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const requestIdRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { void window.albumApi.library.listFolders().then(setFolders) }, [])
  useEffect(() => {
    const timer = setTimeout(async () => {
      const requestId = ++requestIdRef.current
      if (page > 0) setLoadingMore(true)
      try {
        const result = await window.albumApi.library.search({ ...filters, limit: pageSize, offset: page * pageSize })
        if (requestId !== requestIdRef.current) return
        setTotal(result.total)
        void window.albumApi.library.listFolders().then(setFolders)
        setAssets((current) => page === 0 ? result.items : [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))])
      } finally {
        if (requestId === requestIdRef.current) setLoadingMore(false)
      }
    }, page === 0 ? 180 : 0)
    return () => clearTimeout(timer)
  }, [filters, page])

  const hasMore = assets.length < total
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loadingMore) return
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) setPage((current) => current + 1) }, { rootMargin: '240px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadingMore])

  const updateFilters = (patch: Partial<Omit<SearchFilters, 'limit' | 'offset'>>) => { setFilters((current) => ({ ...current, ...patch })); setPage(0) }

  return (
    <Modal title={props.title} onClose={props.onClose} wide className="picker-modal">
      <div className="picker-layout">
        <aside className="picker-side">
          <FolderTree
            folders={folders}
            roots={[]}
            selectedPaths={viewMode === 'all' ? [] : filters.folderPaths ?? []}
            onToggle={(path, additive) => {
              setViewMode('folders')
              const current = filters.folderPaths ?? []
              if (!additive) {
                updateFilters({ folderPaths: current.length === 1 && current[0] === path ? undefined : [path] })
                return
              }
              const next = current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
              updateFilters({ folderPaths: next.length ? next : undefined })
            }}
            onClear={() => updateFilters({ folderPaths: undefined })}
            totalCount={total}
          />
        </aside>
        <div className="picker-main">
          <div className="picker-toolbar">
            <label className="search-field"><IconSearch size={14} /><input placeholder="搜索文件名或文件夹路径" value={filters.text ?? ''} onChange={(event) => updateFilters({ text: event.target.value || undefined })} /></label>
            <select value={filters.sort ?? 'captured_desc'} onChange={(event) => updateFilters({ sort: event.target.value as SearchFilters['sort'] })}><SortOptions /></select>
            <span className="picker-count">共 {total.toLocaleString()} 张</span>
          </div>
          <div className="picker-scroll">
            <JustifiedPhotoGrid
              photos={assets}
              targetHeight={props.thumbnailSize}
              selectedIds={selected}
              activeId={null}
              onActivate={(asset, additive) => setSelected((current) => {
                if (!additive) return new Set([asset.id])
                const next = new Set(current)
                if (next.has(asset.id)) next.delete(asset.id)
                return next
              })}
              onOpen={(asset) => setDetail(asset)}
            />
            {assets.length > 0 && <div className="load-more" ref={sentinelRef}>{hasMore ? <button className="button secondary" disabled={loadingMore} onClick={() => setPage((current) => current + 1)}>{loadingMore ? '正在加载…' : '加载更多'}</button> : <span>已显示全部 {total.toLocaleString()} 张</span>}</div>}
          </div>
        </div>
      </div>
      <div className="modal-actions"><div className="button-row"><button className="text-button" onClick={() => setSelected(selected.size === assets.length ? new Set() : new Set(assets.map((asset) => asset.id)))}>{selected.size === assets.length ? '取消全选' : '全选已加载'}</button><span>已选 {selected.size} 张</span></div><button className="button primary" disabled={!selected.size} onClick={() => void props.onConfirm([...selected])}>确认加入</button></div>
      {detail && <PhotoDetail asset={detail} assets={assets} onChange={setDetail} onClose={() => setDetail(null)} onToast={() => undefined} />}
    </Modal>
  )
}
function SettingsPage(props: {
  roots: SourceRoot[]
  onAddRoots: () => Promise<void>
  onRemoveRoot: (rootId: string, mode: SourceRemovalMode) => Promise<SourceRemovalResult>
  onSetRootEnabled: (rootId: string, enabled: boolean) => Promise<void>
  onScanAll: () => Promise<void>
  onRefreshStats: () => Promise<void>
  onToast: (toast: { kind: 'info' | 'error'; text: string }) => void
  settings: AppSettings
  onSettingsChange: (patch: Partial<AppSettings>, persist?: 'now' | 'debounce') => void
  onUiScaleChange: (value: number) => void
}) {
  const [removeTarget, setRemoveTarget] = useState<SourceRoot | null>(null)
  const [impact, setImpact] = useState<SourceRootImpact | null>(null)
  const [cacheInput, setCacheInput] = useState(String(props.settings.thumbnailCacheLimitGb))
  const settings = props.settings
  useEffect(() => { setCacheInput(String(settings.thumbnailCacheLimitGb)) }, [settings.thumbnailCacheLimitGb])
  const backup = async () => { try { const path = await window.albumApi.app.backupNow(); props.onToast({ kind: 'info', text: `备份已保存：${path}` }); await props.onRefreshStats() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  const openRemove = async (root: SourceRoot) => {
    setRemoveTarget(root)
    setImpact(null)
    try { setImpact(await window.albumApi.library.getRootImpact(root.id)) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const toggleRoot = async (root: SourceRoot) => {
    try { await props.onSetRootEnabled(root.id, !root.enabled); props.onToast({ kind: 'info', text: root.enabled ? '已停止扫描该目录' : '已重新启用该目录' }) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  return (
    <section className="page settings-page">
      <header className="page-header"><div><p className="eyebrow">SETTINGS</p><h1>设置</h1><p className="subtle">所有数据保存在本机应用目录，原图始终留在原位置。</p></div></header>
      <section className="settings-card">
        <div className="section-heading"><h2>照片来源目录</h2><button className="button secondary" onClick={() => void props.onAddRoots()}>添加文件夹</button></div>
        <div className="source-list">{props.roots.map((root) => <div className={`settings-row source-row ${root.enabled ? '' : 'disabled'}`} key={root.id}><span title={root.path}><strong>{sourceName(root.path)}</strong><small>{root.path}</small></span><span className="settings-actions"><i className={`status-badge ${root.enabled ? '' : 'disabled'}`}>{root.enabled ? '已启用' : '已停用'}</i><button className="text-button" onClick={() => void toggleRoot(root)}>{root.enabled ? '停用' : '重新启用'}</button><button className="text-button danger" onClick={() => void openRemove(root)}>移除</button></span></div>)}</div>
      </section>
      <section className="settings-card">
        <h2>外观</h2>
        <p className="subtle">主题和界面缩放会立即应用，并保存在本机设置文件。</p>
        <div className="theme-grid">{([
          ['dark', '深色', '专注看图的深色工作区'],
          ['light', '浅色', '明亮清爽的浅色工作区']
        ] as Array<[AppTheme, string, string]>).map(([value, label, description]) => <button key={value} className={`theme-option theme-${value} ${settings.theme === value ? 'active' : ''}`} onClick={() => props.onSettingsChange({ theme: value })}><i /><span><strong>{label}</strong><small>{description}</small></span></button>)}</div>
        <div className="settings-row">
          <span><strong>界面缩放</strong><small>整体缩放所有界面元素，包括排版画布；快捷键 Ctrl+= / Ctrl+- / Ctrl+0</small></span>
          <div className="segmented">{UI_SCALE_PRESETS.map((value) => <button key={value} className={Math.abs(settings.uiScale - value) < 0.001 ? 'active' : ''} onClick={() => props.onUiScaleChange(value)}>{Math.round(value * 100)}%</button>)}</div>
        </div>
      </section>
      <section className="settings-card">
        <h2>扫描与缓存</h2>
        <label className="settings-row"><span><strong>自动监听目录</strong><small>新增、改名和删除照片时自动更新索引</small></span><input type="checkbox" checked={settings.autoWatch} onChange={(event) => props.onSettingsChange({ autoWatch: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>缩略图缓存上限</strong><small>单位 GB，缓存可随时重新生成</small></span><input type="number" min="1" max="100" value={cacheInput} onChange={(event) => setCacheInput(event.target.value)} onBlur={() => props.onSettingsChange({ thumbnailCacheLimitGb: Number(cacheInput) || settings.thumbnailCacheLimitGb })} /></label>
        <label className="settings-row"><span><strong>默认缩略图大小</strong><small>图库和相册里对齐行的目标行高，也可以直接用工具栏滑杆调</small></span><ThumbSizeSlider value={settings.thumbnailSize} onChange={(value) => props.onSettingsChange({ thumbnailSize: value }, 'debounce')} /></label>
        <div className="button-row"><button className="button secondary" onClick={() => void props.onScanAll()}>重新扫描全部目录</button><button className="button secondary" onClick={() => void backup()}>立即备份数据库</button></div>
      </section>
      {removeTarget && <RemoveRootDialog root={removeTarget} impact={impact} onClose={() => { setRemoveTarget(null); setImpact(null) }} onConfirm={async (mode) => {
        try {
          const result = await props.onRemoveRoot(removeTarget.id, mode)
          const message = mode === 'disable' ? '已停止扫描该目录' : `已处理 ${result.affectedAssets} 张照片，移除 ${result.removedLocations} 个文件位置`
          props.onToast({ kind: 'info', text: message })
          setRemoveTarget(null)
          setImpact(null)
        } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
      }} />}
    </section>
  )
}

function RemoveRootDialog(props: { root: SourceRoot; impact: SourceRootImpact | null; onClose: () => void; onConfirm: (mode: SourceRemovalMode) => Promise<void> }) {
  const [mode, setMode] = useState<SourceRemovalMode>('library')
  const [busy, setBusy] = useState(false)
  const options: Array<{ value: SourceRemovalMode; title: string; text: string }> = [
    { value: 'library', title: '从图库移除，相册保留引用', text: '照片不再出现在图库；已加入相册的照片会标记来源已移除。' },
    { value: 'disable', title: '仅停止扫描', text: '照片继续保留在图库，来源目录保留在设置页，可随时重新启用。' },
    { value: 'all', title: '从图库、相册和作品一起移除', text: '删除图库记录、相册引用和对应图片图层，保留文字与页面背景。' }
  ]
  const submit = async () => { setBusy(true); try { await props.onConfirm(mode) } finally { setBusy(false) } }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) props.onClose() }}>
      <div className="modal">
        <header><h2>移除来源目录</h2><button disabled={busy} onClick={props.onClose}>×</button></header>
        <div className="modal-body">
          <p className="source-path">{props.root.path}</p>
          <div className="removal-impact">{props.impact ? `当前目录关联 ${props.impact.assetCount.toLocaleString()} 张照片、${props.impact.locationCount.toLocaleString()} 个文件位置` : '正在统计影响范围…'}</div>
          <div className="removal-options">{options.map((option) => <label className={mode === option.value ? 'active' : ''} key={option.value}><input type="radio" name="source-removal" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} /><span><strong>{option.title}</strong><small>{option.text}</small></span></label>)}</div>
          <p className="danger-note">这里只修改光影册的数据，不会删除、移动或重命名磁盘原图。</p>
          <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={props.onClose}>取消</button><button className={`button ${mode === 'all' ? 'danger-solid' : 'primary'}`} disabled={busy || !props.impact} onClick={() => void submit()}>{busy ? '处理中…' : '确认'}</button></div>
        </div>
      </div>
    </div>
  )
}
export function Modal(props: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; className?: string }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}><div className={`modal ${props.wide ? 'wide' : ''} ${props.className ?? ''}`}><header><h2>{props.title}</h2><button aria-label="关闭" onClick={props.onClose}>×</button></header><div className="modal-body">{props.children}</div></div></div>
}

function EmptyState(props: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-symbol">▧</div><h2>{props.title}</h2><p>{props.text}</p>{props.action && <button className="button primary" onClick={props.onAction}>{props.action}</button>}</div>
}

function Toast(props: { toast: { kind: 'info' | 'error'; text: string }; onClose: () => void }) {
  return <div className={`toast ${props.toast.kind}`}><span>{props.toast.text}</span><button onClick={props.onClose}>×</button></div>
}

function SortOptions() {
  return <>
    <option value="captured_desc">拍摄时间：新到旧（默认）</option>
    <option value="captured_asc">拍摄时间：旧到新</option>
    <option value="added_desc">导入时间：新到旧</option>
    <option value="added_asc">导入时间：旧到新</option>
    <option value="rating_desc">星级：高到低</option>
    <option value="filename_asc">文件名：A-Z</option>
    <option value="filename_desc">文件名：Z-A</option>
  </>
}

function nextWorkName(albumName: string, works: Work[]): string {
  const base = `${albumName} 作品`
  const used = new Set(works.map((work) => work.name))
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

function sourceName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}
function fileName(path: string | null): string {
  if (!path) return '文件缺失'
  return path.split(/[\\/]/).pop() || path
}
