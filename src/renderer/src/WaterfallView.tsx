import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MediaAssetSummary, SearchFilters } from '../../shared/types'
import {
  RATING_FILTER_OPTIONS, errorMessage, formatCamera, formatDate, previewUrl, ratingFilterPatch, ratingStars, thumbnailUrl
} from './helpers'

export interface WaterfallLibrarySource {
  kind: 'library'
  title: string
  filters: Omit<SearchFilters, 'limit' | 'offset'>
}

export interface WaterfallAssetsSource {
  kind: 'assets'
  title: string
  assets: MediaAssetSummary[]
}

export type WaterfallSource = WaterfallLibrarySource | WaterfallAssetsSource

interface WaterfallViewProps {
  source: WaterfallSource
  onClose: () => void
  onToast: (toast: { kind: 'info' | 'error'; text: string }) => void
}

const PAGE_SIZE = 120
const LOAD_MORE_MARGIN = 480
const COLUMN_WIDTHS: Array<{ value: number; label: string }> = [
  { value: 180, label: '密' },
  { value: 240, label: '中' },
  { value: 320, label: '疏' }
]

type MarkFilter = 'all' | 'marked' | 'unmarked'

export default function WaterfallView(props: WaterfallViewProps) {
  const source = props.source
  const isLibrary = source.kind === 'library'
  const sourceFilters = isLibrary ? (source as WaterfallLibrarySource).filters : null
  const sourceKey = isLibrary ? JSON.stringify(sourceFilters) : `assets:${(source as WaterfallAssetsSource).assets.length}`

  const [assets, setAssets] = useState<MediaAssetSummary[]>(() => source.kind === 'assets' ? source.assets : [])
  const [total, setTotal] = useState(() => source.kind === 'assets' ? source.assets.length : 0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(isLibrary)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [marked, setMarked] = useState<Set<string>>(() => new Set())
  const [tempAlbumName, setTempAlbumName] = useState<string | null>(null)
  const [columnWidth, setColumnWidth] = useState(240)
  const [ratingFilter, setRatingFilter] = useState('')
  const [markFilter, setMarkFilter] = useState<MarkFilter>('all')
  const [pendingMarkId, setPendingMarkId] = useState<string | null>(null)
  const tempAlbumRef = useRef<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)

  const ratingPatch = useMemo(() => ratingFilterPatch(ratingFilter), [ratingFilter])
  const ratingPatchKey = `${ratingPatch.ratingMin ?? ''}:${ratingPatch.ratingMax ?? ''}`

  useEffect(() => {
    if (!isLibrary || !sourceFilters) return
    const requestId = ++requestIdRef.current
    if (page === 0) setLoading(true)
    window.albumApi.library.search({ ...sourceFilters, ...ratingPatch, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((result) => {
        if (requestId !== requestIdRef.current) return
        setTotal(result.total)
        setAssets((current) => page === 0
          ? result.items
          : [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))])
      })
      .catch((error) => {
        if (requestId === requestIdRef.current) props.onToast({ kind: 'error', text: errorMessage(error) })
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })
    // sourceFilters / ratingPatch 通过 sourceKey、ratingPatchKey 参与依赖，避免父组件重建对象导致重复请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLibrary, sourceKey, page, ratingPatchKey])

  const visible = useMemo(() => {
    let list = assets
    if (source.kind === 'assets') {
      if (ratingPatch.ratingMin != null) list = list.filter((asset) => asset.rating >= ratingPatch.ratingMin!)
      if (ratingPatch.ratingMax != null) list = list.filter((asset) => asset.rating <= ratingPatch.ratingMax!)
    }
    if (markFilter === 'marked') list = list.filter((asset) => marked.has(asset.id))
    if (markFilter === 'unmarked') list = list.filter((asset) => !marked.has(asset.id))
    return list
  }, [assets, source.kind, ratingPatch, markFilter, marked])

  // 选中项回退到第一张，保证刚进全屏就能直接按 T / Enter 操作。
  const selected = visible.find((asset) => asset.id === selectedId) ?? visible[0] ?? null
  const hasMore = isLibrary && assets.length < total

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loading) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setPage((current) => current + 1)
    }, { rootMargin: `${LOAD_MORE_MARGIN}px` })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loading])

  const ensureTempAlbum = useCallback(async (): Promise<{ id: string; name: string }> => {
    if (tempAlbumRef.current) {
      return { id: tempAlbumRef.current, name: tempAlbumName ?? '临时选片' }
    }
    const base = `临时选片 ${tempAlbumNameStamp(new Date())}`
    let lastError: unknown = new Error('创建临时相册失败')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const album = await window.albumApi.albums.create(attempt === 0 ? base : `${base} (${attempt + 1})`)
        tempAlbumRef.current = album.id
        setTempAlbumName(album.name)
        return album
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }, [tempAlbumName])

  const toggleMark = useCallback(async (asset: MediaAssetSummary | null) => {
    if (!asset || pendingMarkId) return
    const wasMarked = marked.has(asset.id)
    setPendingMarkId(asset.id)
    setMarked((current) => {
      const next = new Set(current)
      if (wasMarked) next.delete(asset.id)
      else next.add(asset.id)
      return next
    })
    try {
      const created = !tempAlbumRef.current
      const album = await ensureTempAlbum()
      if (wasMarked) await window.albumApi.albums.removeAsset(album.id, asset.id)
      else await window.albumApi.albums.addAssets(album.id, [asset.id])
      if (created && !wasMarked) props.onToast({ kind: 'info', text: `已创建临时相册「${album.name}」` })
    } catch (error) {
      setMarked((current) => {
        const next = new Set(current)
        if (wasMarked) next.add(asset.id)
        else next.delete(asset.id)
        return next
      })
      props.onToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      setPendingMarkId(null)
    }
  }, [ensureTempAlbum, marked, pendingMarkId, props])

  const step = useCallback((delta: number) => {
    if (visible.length === 0) return
    const index = Math.max(0, visible.findIndex((asset) => asset.id === selectedId))
    const nextIndex = Math.min(visible.length - 1, Math.max(0, index + delta))
    setSelectedId(visible[nextIndex].id)
  }, [selectedId, visible])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      const key = event.key
      if (key === 'Escape') {
        event.preventDefault()
        if (lightboxOpen) setLightboxOpen(false)
        else props.onClose()
        return
      }
      if (key === 'ArrowRight' || key === 'ArrowDown') { event.preventDefault(); step(1); return }
      if (key === 'ArrowLeft' || key === 'ArrowUp') { event.preventDefault(); step(-1); return }
      if (key === 'Enter') { event.preventDefault(); if (selected) setLightboxOpen(true); return }
      if (key === 't' || key === 'T') { event.preventDefault(); void toggleMark(selected); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxOpen, props, selected, step, toggleMark])

  return (
    <div className="waterfall-shell">
      <header className="waterfall-header">
        <div className="waterfall-title">
          <strong>{source.title}</strong>
          <span>
            {marked.size > 0 ? `已标记 ${marked.size} 张 · ` : ''}
            {isLibrary ? `已加载 ${assets.length} / ${total}` : `共 ${total} 张`}
          </span>
        </div>
        <div className="waterfall-tools">
          <select value={ratingFilter} onChange={(event) => { setRatingFilter(event.target.value); setPage(0) }} aria-label="星级筛选">
            {RATING_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <div className="segmented compact-segmented">
            <button className={markFilter === 'all' ? 'active' : ''} onClick={() => setMarkFilter('all')}>全部</button>
            <button className={markFilter === 'marked' ? 'active' : ''} onClick={() => setMarkFilter('marked')}>已标记</button>
            <button className={markFilter === 'unmarked' ? 'active' : ''} onClick={() => setMarkFilter('unmarked')}>未标记</button>
          </div>
          <div className="segmented compact-segmented">
            {COLUMN_WIDTHS.map((option) => <button key={option.value} className={columnWidth === option.value ? 'active' : ''} onClick={() => setColumnWidth(option.value)}>{option.label}</button>)}
          </div>
          <button className="button secondary compact" onClick={() => void toggleMark(selected)} disabled={!selected || Boolean(pendingMarkId)}>
            {selected && marked.has(selected.id) ? '移出临时相册' : '加入临时相册'}（T）
          </button>
          <button className="button primary compact" onClick={props.onClose}>退出（Esc）</button>
        </div>
      </header>

      <div className="waterfall-body">
        {loading && assets.length === 0
          ? <div className="waterfall-hint">正在读取照片…</div>
          : visible.length === 0
            ? <div className="waterfall-hint">{markFilter === 'marked' ? '还没有标记任何照片，选中后按 T 加入临时相册。' : '没有匹配的照片。'}</div>
            : <div className="waterfall-grid" style={{ columnWidth }}>
              {visible.map((asset) => <WaterfallItem
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedId}
                marked={marked.has(asset.id)}
                pending={pendingMarkId === asset.id}
                onSelect={() => setSelectedId(asset.id)}
                onOpen={() => { setSelectedId(asset.id); setLightboxOpen(true) }}
                onToggleMark={() => void toggleMark(asset)}
              />)}
            </div>}
        {hasMore && <div className="waterfall-sentinel" ref={sentinelRef}><button className="button secondary" disabled={loading} onClick={() => setPage((current) => current + 1)}>{loading ? '正在加载…' : '加载更多'}</button></div>}
      </div>

      {selected && <div className="waterfall-statusbar">
        <span className="waterfall-file">{fileName(selected.primaryPath)}</span>
        <span>{selected.width} × {selected.height}</span>
        <span>{formatCamera(selected)}</span>
        <span>{selected.rating > 0 ? `${ratingStars(selected.rating)} 相机 ${selected.rating} 星` : '未评级'}</span>
        {marked.has(selected.id) && <b className="waterfall-marked-tag">已加入临时相册{tempAlbumName ? `「${tempAlbumName}」` : ''}</b>}
      </div>}

      {lightboxOpen && selected && <div className="lightbox" onClick={(event) => { if (event.target === event.currentTarget) setLightboxOpen(false) }}>
        <button className="lightbox-close" onClick={() => setLightboxOpen(false)} aria-label="关闭大图">×</button>
        <button className="lightbox-nav previous" onClick={() => step(-1)} aria-label="上一张">‹</button>
        <img className="lightbox-image" src={previewUrl(selected.id, 2560)} alt={fileName(selected.primaryPath)} />
        <button className="lightbox-nav next" onClick={() => step(1)} aria-label="下一张">›</button>
        <div className="lightbox-info">
          <strong>{fileName(selected.primaryPath)}</strong>
          <span>{formatDate(selected.capturedAt)}</span>
          <span>{formatCamera(selected)}</span>
          <span>{selected.rating > 0 ? `${ratingStars(selected.rating)} 相机 ${selected.rating} 星` : '未评级'}</span>
          <button className="button secondary compact" onClick={() => void toggleMark(selected)} disabled={Boolean(pendingMarkId)}>
            {marked.has(selected.id) ? '移出临时相册（T）' : '加入临时相册（T）'}
          </button>
        </div>
      </div>}
    </div>
  )
}

function WaterfallItem(props: {
  asset: MediaAssetSummary
  selected: boolean
  marked: boolean
  pending: boolean
  onSelect: () => void
  onOpen: () => void
  onToggleMark: () => void
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [props.asset.id])
  const ratio = props.asset.width > 0 && props.asset.height > 0 ? props.asset.width / props.asset.height : 1
  const unavailable = props.asset.missing || failed
  return (
    <button
      className={`waterfall-item ${props.selected ? 'selected' : ''} ${props.marked ? 'marked' : ''}`}
      onClick={props.onSelect}
      onDoubleClick={props.onOpen}
      title={fileName(props.asset.primaryPath)}
    >
      {unavailable
        ? <div className="waterfall-placeholder" style={{ aspectRatio: ratio }}><span>▧</span><small>来源不可用</small></div>
        : <img src={thumbnailUrl(props.asset.id, 640)} alt={fileName(props.asset.primaryPath)} loading="lazy" style={{ aspectRatio: ratio }} onError={() => setFailed(true)} />}
      {props.asset.rating > 0 && <span className="waterfall-stars" title={`相机内评星 ${props.asset.rating} 星`}>{ratingStars(props.asset.rating)}</span>}
      {props.asset.favorite && <span className="waterfall-favorite" title="已收藏">★</span>}
      {props.marked && <span className="waterfall-mark-badge" title="已加入临时相册">{props.pending ? '…' : '✓'}</span>}
    </button>
  )
}

function fileName(path: string | null): string {
  if (!path) return '文件缺失'
  return path.split(/[\\/]/).pop() || path
}

/** 临时相册名：临时选片 10-01 15:30 */
function tempAlbumNameStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
