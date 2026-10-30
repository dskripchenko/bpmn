/**
 * What lies under a point of the drawing — the questions an editor asks on
 * every pointer move, answered from the diagram's geometry alone.
 */
import type { Bounds, BpmnDiagram, BpmnModel, DiShape, Point } from '../model'
import { isEvent, isGateway, isSubProcess } from './rules'

/** The band of a pool or lane that holds its name. */
export const BAND = 30

/** Shapes drawn as frames around other shapes: only their edge and title band are theirs. */
export function isFrame(model: BpmnModel, diagram: BpmnDiagram, shape: DiShape): boolean {
  const type = model.elements.get(shape.element)?.type ?? ''
  if (type === 'participant') return shape.isExpanded !== false && (model.elements.get(shape.element)?.xml.attributes.some((a) => a.name === 'processRef') ?? false)
  if (type === 'lane' || type === 'group') return true
  if (isSubProcess(type)) return shape.isExpanded ?? diagram.shapes.some((s) => model.elements.get(s.element)?.parent === shape.element)
  return false
}

/** Shapes that can be resized. */
export function isResizable(type: string): boolean {
  return !isEvent(type) && !isGateway(type) && type !== 'dataObjectReference' && type !== 'dataStoreReference'
}

function inRect(p: Point, b: Bounds, pad = 0): boolean {
  return p.x >= b.x - pad && p.x <= b.x + b.width + pad && p.y >= b.y - pad && p.y <= b.y + b.height + pad
}

function inShape(p: Point, type: string, b: Bounds, pad: number): boolean {
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  if (isEvent(type)) return Math.hypot(p.x - cx, p.y - cy) <= Math.min(b.width, b.height) / 2 + pad
  if (isGateway(type)) return Math.abs(p.x - cx) / (b.width / 2 + pad) + Math.abs(p.y - cy) / (b.height / 2 + pad) <= 1
  return inRect(p, b, pad)
}

/** Distance from a point to a polyline. */
export function distanceToPath(p: Point, points: Point[]): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = dx * dx + dy * dy
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

/**
 * The element under `p`, top-most first: boundary events, plain shapes,
 * flows, external labels, then the edges and title bands of frames (pools,
 * lanes, expanded sub-processes, groups). `tolerance` is in drawing units.
 */
export function hitTest(model: BpmnModel, diagram: BpmnDiagram, p: Point, tolerance = 4): string | undefined {
  const typeOf = (id: string) => model.elements.get(id)?.type ?? ''
  const plain = diagram.shapes.filter((s) => !isFrame(model, diagram, s))
  for (const s of plain) if (typeOf(s.element) === 'boundaryEvent' && inShape(p, 'boundaryEvent', s.bounds, tolerance)) return s.element
  // Later shapes are drawn on top; smaller ones are usually inside bigger ones.
  const under = plain.filter((s) => inShape(p, typeOf(s.element), s.bounds, 0)).sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)
  if (under[0]) return under[0].element
  let edge: { id: string; d: number } | undefined
  for (const e of diagram.edges) {
    const d = distanceToPath(p, e.waypoints)
    if (d <= tolerance && (!edge || d < edge.d)) edge = { id: e.element, d }
  }
  if (edge) return edge.id
  for (const s of diagram.shapes) if (s.label && inRect(p, s.label, 2)) return s.element
  for (const e of diagram.edges) if (e.label && inRect(p, e.label, 2)) return e.element
  const frames = diagram.shapes
    .filter((s) => isFrame(model, diagram, s))
    .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)
  for (const s of frames) {
    const b = s.bounds
    if (!inRect(p, b, tolerance)) continue
    const nearEdge = !inRect(p, { x: b.x + tolerance, y: b.y + tolerance, width: b.width - 2 * tolerance, height: b.height - 2 * tolerance })
    if (nearEdge) return s.element
    const type = typeOf(s.element)
    const horizontal = s.isHorizontal !== false
    if ((type === 'participant' || type === 'lane') && (horizontal ? p.x <= b.x + BAND : p.y <= b.y + BAND)) return s.element
    if (isSubProcess(type) && p.y <= b.y + 24) return s.element
  }
  return undefined
}

/** Shapes and flows entirely inside a rectangle; lanes are left out (they move with their pool). */
export function elementsIn(model: BpmnModel, diagram: BpmnDiagram, rect: Bounds): string[] {
  const out: string[] = []
  for (const s of diagram.shapes) {
    if (model.elements.get(s.element)?.type === 'lane') continue
    const b = s.bounds
    if (b.x >= rect.x && b.y >= rect.y && b.x + b.width <= rect.x + rect.width && b.y + b.height <= rect.y + rect.height) out.push(s.element)
  }
  for (const e of diagram.edges) if (e.waypoints.length > 0 && e.waypoints.every((w) => inRect(w, rect))) out.push(e.element)
  return out
}

/**
 * The activity whose border passes near `p`, for dropping an intermediate
 * event onto it as a boundary event.
 */
export function borderOf(model: BpmnModel, diagram: BpmnDiagram, p: Point, tolerance = 12): string | undefined {
  for (const s of diagram.shapes) {
    const type = model.elements.get(s.element)?.type ?? ''
    if (!/^(task|userTask|serviceTask|scriptTask|sendTask|receiveTask|manualTask|businessRuleTask|callActivity|subProcess|transaction|adHocSubProcess)$/.test(type)) continue
    const b = s.bounds
    if (!inRect(p, b, tolerance)) continue
    const inner = { x: b.x + tolerance, y: b.y + tolerance, width: b.width - 2 * tolerance, height: b.height - 2 * tolerance }
    if (!inRect(p, inner)) return s.element
  }
  return undefined
}
