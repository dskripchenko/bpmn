/**
 * Waypoints for a new or reconnected flow: right angles only, docked at the
 * middle of a side — the layout BPMN modelers produce, so a file edited here
 * looks at home when opened elsewhere.
 */
import type { Bounds, Point } from '../model'

export type Dock = 'left' | 'right' | 'top' | 'bottom'

function centre(b: Bounds): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

export function dockPoint(b: Bounds, side: Dock): Point {
  const c = centre(b)
  switch (side) {
    case 'left':
      return { x: b.x, y: c.y }
    case 'right':
      return { x: b.x + b.width, y: c.y }
    case 'top':
      return { x: c.x, y: b.y }
    case 'bottom':
      return { x: c.x, y: b.y + b.height }
  }
}

function round(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

/** Drops repeated points and the middle of three points on one line. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points.map(round)) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    const prev = out[out.length - 2]
    if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) out.pop()
    out.push(p)
  }
  return out
}

export interface RouteOptions {
  /** Prefer leaving the source from its top or bottom (gateways splitting a flow, message flows). */
  vertical?: boolean
}

/** Waypoints from one shape to another. */
export function route(source: Bounds, target: Bounds, options: RouteOptions = {}): Point[] {
  const s = centre(source)
  const t = centre(target)
  const gapX = target.x - (source.x + source.width)
  const gapBack = source.x - (target.x + target.width)
  const gapY = target.y - (source.y + source.height)
  const gapUp = source.y - (target.y + target.height)

  if (options.vertical && (gapY > 0 || gapUp > 0)) {
    const down = gapY > 0
    const a = dockPoint(source, down ? 'bottom' : 'top')
    const b = dockPoint(target, down ? 'top' : 'bottom')
    // Straight down when the shapes overlap horizontally.
    const left = Math.max(source.x, target.x)
    const right = Math.min(source.x + source.width, target.x + target.width)
    if (right - left > 10) {
      const x = Math.abs(s.x - t.x) < 2 ? s.x : s.x >= left && s.x <= right ? s.x : (left + right) / 2
      return simplify([{ x, y: a.y }, { x, y: b.y }])
    }
    const midY = (a.y + b.y) / 2
    return simplify([a, { x: a.x, y: midY }, { x: b.x, y: midY }, b])
  }

  if (gapX > 0) {
    // Forward, left to right.
    if (Math.abs(s.y - t.y) < 2) return simplify([dockPoint(source, 'right'), { x: target.x, y: s.y }])
    if (options.vertical && (t.y > source.y + source.height || t.y < source.y)) {
      // Out of the top or bottom, then straight into the target's side.
      const a = dockPoint(source, t.y > s.y ? 'bottom' : 'top')
      return simplify([a, { x: a.x, y: t.y }, dockPoint(target, 'left')])
    }
    const a = dockPoint(source, 'right')
    const b = dockPoint(target, 'left')
    const midX = (a.x + b.x) / 2
    return simplify([a, { x: midX, y: a.y }, { x: midX, y: b.y }, b])
  }
  if (gapY > 0 || gapUp > 0) {
    const down = gapY > 0
    const a = dockPoint(source, down ? 'bottom' : 'top')
    const b = dockPoint(target, down ? 'top' : 'bottom')
    if (Math.abs(s.x - t.x) < 2) return simplify([a, { x: s.x, y: b.y }])
    const midY = (a.y + b.y) / 2
    return simplify([a, { x: a.x, y: midY }, { x: b.x, y: midY }, b])
  }
  if (gapBack > 0) {
    // Backwards: under both shapes and up into the target.
    const a = dockPoint(source, 'bottom')
    const b = dockPoint(target, 'bottom')
    const y = Math.max(source.y + source.height, target.y + target.height) + 30
    return simplify([a, { x: a.x, y }, { x: b.x, y }, b])
  }
  // Overlapping shapes: centre to centre.
  return simplify([s, t])
}

/** Moves every point of a route. */
export function translate(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}
