import { useEffect, useMemo, useRef, useState } from 'react'
import type { MediaAssetSummary } from '../../shared/types'
import { computeJustifiedRows } from './grid'
import { fileName, formatDimensions, ratingStars, thumbnailUrl } from './helpers'
import { IconCheck, IconStar } from './icons'

export interface JustifiedPhotoGridProps {
  photos: MediaAssetSummary[]
  /** 目标行高，来自设置里的缩略图尺寸。 */
  targetHeight: number
  selectedIds: Set<string>
  activeId: string | null
  onActivate: (asset: MediaAssetSummary, additive: boolean) => void
  onOpen: (asset: MediaAssetSummary) => void
  onContextMenu?: (event: React.MouseEvent, asset: MediaAssetSummary) => void
}

export default function JustifiedPhotoGrid(props: JustifiedPhotoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const update = () => setContainerWidth(node.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const assetById = useMemo(() => new Map(props.photos.map((photo) => [photo.id, photo])), [props.photos])
  const layout = useMemo(() => computeJustifiedRows(
    props.photos.map((photo) => ({ id: photo.id, width: photo.width, height: photo.height })),
    { containerWidth: containerWidth || 960, targetHeight: props.targetHeight, gap: 6 }
  ), [containerWidth, props.photos, props.targetHeight])

  return (
    <div className="justified-grid" ref={containerRef}>
      {layout.rows.map((row, rowIndex) => (
        <div className="justified-row" key={rowIndex} style={{ height: `${row.height}px` }}>
          {row.items.map((item) => {
            const asset = assetById.get(item.id)
            if (!asset) return null
            return (
              <PhotoTile
                key={asset.id}
                asset={asset}
                width={item.width}
                height={row.height}
                selected={props.selectedIds.has(asset.id)}
                active={props.activeId === asset.id}
                onActivate={props.onActivate}
                onOpen={props.onOpen}
                onContextMenu={props.onContextMenu}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function PhotoTile(props: {
  asset: MediaAssetSummary
  width: number
  height: number
  selected: boolean
  active: boolean
  onActivate: (asset: MediaAssetSummary, additive: boolean) => void
  onOpen: (asset: MediaAssetSummary) => void
  onContextMenu?: (event: React.MouseEvent, asset: MediaAssetSummary) => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setLoaded(false); setFailed(false) }, [props.asset.id])

  const unavailable = props.asset.missing || failed
  return (
    <figure className={`tile ${props.selected ? 'selected' : ''} ${props.active ? 'active' : ''}`} style={{ width: `${props.width}px` }}>
      <button
        type="button"
        className="tile-image"
        onClick={(event) => props.onActivate(props.asset, event.ctrlKey || event.metaKey)}
        onDoubleClick={() => props.onOpen(props.asset)}
        onContextMenu={(event) => { if (props.onContextMenu) { event.preventDefault(); props.onContextMenu(event, props.asset) } }}
        title={fileName(props.asset.primaryPath)}
      >
        {unavailable
          ? <span className="tile-placeholder">原图不可用</span>
          : <img
            src={thumbnailUrl(props.asset.id, 480)}
            alt={fileName(props.asset.primaryPath)}
            loading="lazy"
            decoding="async"
            className={loaded ? 'loaded' : ''}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />}
        <span className="tile-check" aria-hidden="true">{props.selected ? <IconCheck size={12} /> : null}</span>
        {props.asset.favorite && <span className="tile-favorite" title="已收藏"><IconStar size={14} filled /></span>}
        {props.asset.locationCount > 1 && <span className="tile-badge">{props.asset.locationCount} 份副本</span>}
      </button>
      <figcaption className="tile-caption">
        <span className="tile-name">{fileName(props.asset.primaryPath)}</span>
        {props.asset.rating > 0 && <span className="tile-stars" title={`相机内评星 ${props.asset.rating} 星`}>{ratingStars(props.asset.rating)}</span>}
        <span className="tile-dims">{formatDimensions(props.asset)}</span>
      </figcaption>
    </figure>
  )
}
