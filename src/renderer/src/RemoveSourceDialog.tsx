import { useState } from 'react'
import type { FolderImpact, SourceRemovalMode } from '../../shared/types'

const MODE_TEXT: Record<SourceRemovalMode, { title: string; text: string }> = {
  library: { title: '从图库移除，相册保留引用', text: '照片不再出现在图库；已加入相册的照片会标记来源已移除。' },
  disable: { title: '仅停止扫描', text: '照片继续保留在图库，来源目录保留在设置页，可随时重新启用。' },
  all: { title: '从图库、相册和作品一起移除', text: '删除图库记录、相册引用和对应图片图层，保留文字与页面背景。' }
}

/**
 * 移除来源目录 / 子文件夹共用的确认弹窗：
 * 只改光影册的数据，磁盘原图永远不动。
 */
export default function RemoveSourceDialog(props: {
  title: string
  paths: string[]
  impact: FolderImpact | null
  modes: SourceRemovalMode[]
  onClose: () => void
  onConfirm: (mode: SourceRemovalMode) => Promise<void>
}) {
  const [mode, setMode] = useState<SourceRemovalMode>(props.modes[0] ?? 'library')
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    setBusy(true)
    try { await props.onConfirm(mode) } finally { setBusy(false) }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) props.onClose() }}>
      <div className="modal">
        <header><h2>{props.title}</h2><button disabled={busy} onClick={props.onClose}>×</button></header>
        <div className="modal-body">
          <p className="source-path">{props.paths.length === 1 ? props.paths[0] : `${props.paths.length} 个目录`}</p>
          {props.paths.length > 1 && <div className="removal-paths">{props.paths.map((path) => <span key={path} title={path}>{path}</span>)}</div>}
          <div className="removal-impact">
            {props.impact ? `当前选择关联 ${props.impact.assetCount.toLocaleString()} 张照片、${props.impact.locationCount.toLocaleString()} 个文件位置` : '正在统计影响范围…'}
          </div>
          <div className="removal-options">{props.modes.map((value) => <label className={mode === value ? 'active' : ''} key={value}><input type="radio" name="source-removal" value={value} checked={mode === value} onChange={() => setMode(value)} /><span><strong>{MODE_TEXT[value].title}</strong><small>{MODE_TEXT[value].text}</small></span></label>)}</div>
          <p className="danger-note">这里只修改光影册的数据，不会删除、移动或重命名磁盘原图。</p>
          <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={props.onClose}>取消</button><button className={`button ${mode === 'all' ? 'danger-solid' : 'primary'}`} disabled={busy || !props.impact} onClick={() => void submit()}>{busy ? '处理中…' : '确认'}</button></div>
        </div>
      </div>
    </div>
  )
}
