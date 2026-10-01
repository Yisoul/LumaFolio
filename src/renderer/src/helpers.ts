import type { MediaAssetSummary, SearchFilters } from '../../shared/types'

export function thumbnailUrl(assetId: string, size = 320): string {
  return `album-media://thumbnail/${encodeURIComponent(assetId)}?size=${size}`
}

export function previewUrl(assetId: string, size = 1600): string {
  return `album-media://preview/${encodeURIComponent(assetId)}?size=${size}`
}

export function formatDate(value: string | null): string {
  if (!value) return '未知日期'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知日期'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}

export function formatCamera(asset: MediaAssetSummary): string {
  const model = [asset.cameraMake, asset.cameraModel].filter(Boolean).join(' ')
  const details = [
    model,
    asset.lens,
    asset.focalLength ? `${Math.round(asset.focalLength)}mm` : null,
    asset.aperture ? `f/${asset.aperture}` : null,
    asset.shutterSpeed,
    asset.iso ? `ISO ${asset.iso}` : null
  ].filter(Boolean)
  return details.join(' · ') || '无拍摄参数'
}

export interface RatingFilterOption {
  value: string
  label: string
  ratingMin?: number
  ratingMax?: number
}

/** 星级筛选固定为：全部 / 未评级 / ≥1…≥4 / 5 星。 */
export const RATING_FILTER_OPTIONS: RatingFilterOption[] = [
  { value: '', label: '全部星级' },
  { value: 'unrated', label: '未评级', ratingMin: 0, ratingMax: 0 },
  { value: 'min1', label: '≥1 星', ratingMin: 1 },
  { value: 'min2', label: '≥2 星', ratingMin: 2 },
  { value: 'min3', label: '≥3 星', ratingMin: 3 },
  { value: 'min4', label: '≥4 星', ratingMin: 4 },
  { value: 'exact5', label: '5 星', ratingMin: 5, ratingMax: 5 }
]

export function ratingFilterValue(filters: Pick<SearchFilters, 'ratingMin' | 'ratingMax'>): string {
  return RATING_FILTER_OPTIONS.find((option) => option.ratingMin === filters.ratingMin && option.ratingMax === filters.ratingMax)?.value ?? ''
}

export function ratingFilterPatch(value: string): Pick<SearchFilters, 'ratingMin' | 'ratingMax'> {
  const option = RATING_FILTER_OPTIONS.find((item) => item.value === value)
  return { ratingMin: option?.ratingMin, ratingMax: option?.ratingMax }
}

export function ratingStars(rating: number): string {
  return '★'.repeat(Math.max(0, Math.min(5, Math.round(rating))))
}

export function fileName(path: string | null): string {
  if (!path) return '文件缺失'
  return path.split(/[\\/]/).pop() || path
}

export function formatDimensions(asset: Pick<MediaAssetSummary, 'width' | 'height'>): string {
  if (!asset.width || !asset.height) return '尺寸未知'
  return `${asset.width} × ${asset.height}`
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatDateTime(value: number | string | null): string {
  if (value == null) return '未知'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
