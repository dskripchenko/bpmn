/**
 * Pan and zoom of the canvas: wheel, drag, pinch, and the programmatic
 * moves (fit, zoom buttons, centre on a node). Updates are batched to one
 * per animation frame.
 */
import { ref, shallowRef, type Ref } from 'vue'
import { centreOn, clampZoom, fitView, toWorld, zoomAt, type Point, type Viewport, type ZoomLimits } from '../index'

export function useViewport(el: Ref<HTMLElement | null>, limits: () => ZoomLimits) {
  const view = shallowRef<Viewport>({ x: 0, y: 0, k: 1 })
  const size = ref({ width: 0, height: 0 })
  let pending: Viewport | null = null
  let frame = 0
  /** Smooth transitions for button-driven moves only. */
  const animate = ref(false)
  let animTimer: ReturnType<typeof setTimeout> | undefined

  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number
  const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id: number) => clearTimeout(id)

  function set(v: Viewport, smooth = false): void {
    if (smooth) {
      animate.value = true
      clearTimeout(animTimer)
      animTimer = setTimeout(() => (animate.value = false), 260)
      caf(frame)
      frame = 0
      pending = null
      view.value = v
      return
    }
    pending = v
    if (frame) return
    frame = raf(() => {
      frame = 0
      if (pending) view.value = pending
      pending = null
    })
  }
  const current = () => pending ?? view.value

  function fit(rect: { x: number; y: number; w: number; h: number }, smooth = false, padding = 48): void {
    const bounds = { x: rect.x, y: rect.y, width: rect.w, height: rect.h }
    const { width, height } = size.value
    if (!width || !height) return
    set(fitView(bounds, width, height, Math.min(padding, width / 8), limits(), 1), smooth)
  }
  function zoomBy(factor: number, at?: Point, smooth = false): void {
    const p = at ?? { x: size.value.width / 2, y: size.value.height / 2 }
    set(zoomAt(current(), factor, p, limits()), smooth)
  }
  function zoomTo(k: number, smooth = true): void {
    const v = current()
    zoomBy(clampZoom(k, limits()) / v.k, undefined, smooth)
  }
  function panBy(dx: number, dy: number): void {
    const v = current()
    set({ ...v, x: v.x + dx, y: v.y + dy })
  }
  function centre(p: Point, smooth = true): void {
    set(centreOn(current(), p, size.value.width, size.value.height), smooth)
  }
  /** Client coordinates (a pointer event) to world coordinates. */
  function clientToWorld(clientX: number, clientY: number): Point {
    const r = el.value?.getBoundingClientRect()
    return toWorld(current(), { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) })
  }
  function clientToLocal(clientX: number, clientY: number): Point {
    const r = el.value?.getBoundingClientRect()
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) }
  }
  function dispose(): void {
    caf(frame)
    clearTimeout(animTimer)
  }

  return { view, size, animate, set, current, fit, zoomBy, zoomTo, panBy, centre, clientToWorld, clientToLocal, dispose }
}

export type ViewportApi = ReturnType<typeof useViewport>
