import { useEffect, useState } from 'react'
import type { Album, MediaAssetSummary, MediaLocation } from '../../shared/types'
import { errorMessage, fileName, formatDateTime, formatDimensions, formatFileSize, previewUrl, ratingStars, thumbnailUrl } from './helpers'
import { IconClose, IconLocation, IconStar, IconTrash } from './icons'

interface PhotoInspectorProps {
  asset: MediaAssetSummary | null
  albums: Album[]
  selectedCount: number
  onClose: () => void
  onAddToAlbum: (albumId: string) => Promise<void>
  onToggleFavorite: (asset: MediaAssetSummary) => Promise<void>
  onRemoveFromLibrary: (asset: MediaAssetSummary) => Promise<void>
  onToast: (toast: { kind: 'info' | 'error'; text: string }) => void
}

export default function PhotoInspector(props: PhotoInspectorProps) {
  const [locations, setLocations] = useState<MediaLocation[]>([])
  const [previewFailed, setPreviewFailed] = useState(false)
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const asset = props.asset

  useEffect(() => {
    setPreviewFailed(false)
    setPreviewLoaded(false)
    if (!asset) { setLocations([]); return }
    void window.albumApi.library.listLocations(asset.id).then(setLocations).catch(() => setLocations([]))
  }, [asset?.id])

  const available = locations.find((location) => location.status === 'available')

  const showInFolder = async (location: MediaLocation): Promise<void> => {
    try { await window.albumApi.library.showInFolder(location.id) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const setPreferred = async (location: MediaLocation): Promise<void> => {
    try {
      if (!asset) return
      await window.albumApi.library.setPreferredLocation(asset.id, location.id)
      setLocations(await window.albumApi.library.listLocations(asset.id))
      props.onToast({ kind: 'info', text: '已设为原图位置' })
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  return (
    <aside className="inspector-panel">
      <header className="inspector-header">
        <strong>{props.selectedCount > 1 ? `已选 ${props.selectedCount} 张` : '照片信息'}</strong>
        <button type="button" className="icon-button" onClick={props.onClose} title="收起信息栏" aria-label="收起信息栏"><IconClose size={14} /></button>
      </header>

      {props.selectedCount > 1 ? (
        <div className="inspector-body">
          <p className="inspector-hint">已选 {props.selectedCount} 张照片，可以批量加入相册。</p>
          {props.albums.length > 0 && <div className="inspector-actions column">
            <select defaultValue="" onChange={(event) => { const value = event.target.value; event.target.value = ''; if (value) void props.onAddToAlbum(value) }}>
              <option value="" disabled>加入相册…</option>
              {props.albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
            </select>
          </div>}
        </div>
      ) : !asset ? (
        <div className="inspector-body">
          <p className="inspector-hint">单击任意照片查看预览和拍摄信息。</p>
        </div>
      ) : (
        <div className="inspector-body">
          <div className="inspector-preview">
            {asset.missing || previewFailed
              ? <div className="inspector-preview-missing">原图不可用</div>
              : <>
                <img className="inspector-preview-thumb" src={thumbnailUrl(asset.id, 640)} alt="" aria-hidden="true" />
                <img
                  className={`inspector-preview-full ${previewLoaded ? 'loaded' : ''}`}
                  src={previewUrl(asset.id, 1600)}
                  alt={fileName(asset.primaryPath)}
                  decoding="async"
                  onLoad={() => setPreviewLoaded(true)}
                  onError={() => setPreviewFailed(true)}
                />
              </>}
          </div>

          <div className="inspector-name" title={asset.primaryPath ?? ''}>{fileName(asset.primaryPath)}</div>

          <div className="inspector-stars-row">
            <span className={`inspector-stars ${asset.rating > 0 ? '' : 'muted'}`} title="相机内评星（只读）">
              {asset.rating > 0 ? ratingStars(asset.rating) : '未评级'}
            </span>
            <button type="button" className={`icon-button ${asset.favorite ? 'active' : ''}`} onClick={() => void props.onToggleFavorite(asset)} title={asset.favorite ? '取消收藏' : '加入收藏'}>
              <IconStar size={15} filled={asset.favorite} />
            </button>
          </div>

          <div className="inspector-actions">
            <button type="button" className="button secondary compact" disabled={!available} onClick={() => available && void showInFolder(available)}>
              <IconLocation size={14} />定位
            </button>
            <button type="button" className="button secondary compact danger" onClick={() => void props.onRemoveFromLibrary(asset)}>
              <IconTrash size={14} />从图库移除
            </button>
          </div>

          <section className="inspector-section">
            <h4>基本信息</h4>
            <dl>
              <dt>尺寸</dt><dd>{formatDimensions(asset)}</dd>
              <dt>格式</dt><dd>{asset.format.toUpperCase()}</dd>
              <dt>文件大小</dt><dd>{formatFileSize(available?.sizeBytes ?? 0)}</dd>
              <dt>拍摄时间</dt><dd>{formatDateTime(asset.capturedAt)}</dd>
              <dt>添加时间</dt><dd>{formatDateTime(asset.addedAt)}</dd>
            </dl>
          </section>

          <section className="inspector-section">
            <h4>拍摄参数</h4>
            <dl>
              <dt>相机</dt><dd>{[asset.cameraMake, asset.cameraModel].filter(Boolean).join(' ') || '未知'}</dd>
              <dt>镜头</dt><dd>{asset.lens || '未知'}</dd>
              <dt>焦距</dt><dd>{asset.focalLength ? `${Math.round(asset.focalLength)} mm` : '未知'}</dd>
              <dt>光圈</dt><dd>{asset.aperture ? `f/${asset.aperture}` : '未知'}</dd>
              <dt>快门</dt><dd>{asset.shutterSpeed || '未知'}</dd>
              <dt>ISO</dt><dd>{asset.iso ?? '未知'}</dd>
            </dl>
          </section>

          <section className="inspector-section">
            <h4>文件位置</h4>
            <div className="inspector-locations">
              {locations.map((location) => (
                <div className={`inspector-location ${location.status === 'missing' ? 'missing' : ''}`} key={location.id}>
                  <span title={location.absolutePath}>{location.absolutePath}</span>
                  {location.status === 'available' && <button type="button" className="text-button" onClick={() => void setPreferred(location)}>{location.preferred ? '当前原图' : '设为原图'}</button>}
                </div>
              ))}
              {locations.length === 0 && <p className="inspector-hint">没有可用的文件位置。</p>}
            </div>
          </section>
        </div>
      )}
    </aside>
  )
}
