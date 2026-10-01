import { useEffect, useRef } from 'react'

/**
 * Ctrl/⌘ + 滚轮调整缩略图大小。用非 passive 监听顺手挡掉 Electron 的整页缩放，
 * 并且一帧只提交一次，连续滚动不会卡。
 */
export function useThumbWheel(
  targetRef: React.RefObject<HTMLElement | null>,
  size: number,
  min: number,
  max: number,
  onChange: (size: number) => void
): void {
  const sizeRef = useRef(size)
  const changeRef = useRef(onChange)
  const frameRef = useRef<number | null>(null)
  sizeRef.current = size
  changeRef.current = onChange

  useEffect(() => {
    const node = targetRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const direction = event.deltaY > 0 ? -1 : 1
      sizeRef.current = Math.max(min, Math.min(max, sizeRef.current + direction * 20))
      if (frameRef.current != null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        changeRef.current(sizeRef.current)
      })
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      node.removeEventListener('wheel', onWheel)
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [targetRef, min, max])
}
