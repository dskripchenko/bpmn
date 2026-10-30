/**
 * The small pictures of the notation: event definitions, task types,
 * activity markers and gateway markers.
 *
 * Each is drawn in its own coordinate system around (0, 0) and placed with a
 * transform, so the same picture serves a 36-pixel event and a scaled one.
 */
import { el, PathBuilder, type SvgElement } from './core/svg'

const ICON = 'bpmn-icon'
const FILL = 'bpmn-icon-fill'

/** `style` overrides the class: a presentation attribute would lose to it. */
function path(d: string | PathBuilder, className: string, style?: string): SvgElement {
  return el('path', { d: d.toString(), class: className, style })
}

function polygon(points: [number, number][], className: string): SvgElement {
  const p = new PathBuilder()
  points.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)))
  return path(p.close(), className)
}

/** A regular polygon around (0, 0), the first vertex at the top. */
function regular(sides: number, radius: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides
    out.push([Math.cos(a) * radius, Math.sin(a) * radius])
  }
  return out
}

/** A plus sign as an outline: arms of `half` length and `width` thickness. */
function cross(half: number, width: number): [number, number][] {
  const w = width / 2
  return [
    [-w, -half],
    [w, -half],
    [w, -w],
    [half, -w],
    [half, w],
    [w, w],
    [w, half],
    [-w, half],
    [-w, w],
    [-half, w],
    [-half, -w],
    [-w, -w],
  ]
}

function rotate(points: [number, number][], degrees: number): [number, number][] {
  const a = (degrees * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return points.map(([x, y]) => [x * c - y * s, x * s + y * c])
}

function envelope(throwing: boolean, w = 16, h = 11): SvgElement[] {
  const x = -w / 2
  const y = -h / 2
  const flap = new PathBuilder().moveTo(x, y).lineTo(0, y + h * 0.55).lineTo(x + w, y)
  return [
    el('rect', { x, y, width: w, height: h, class: throwing ? FILL : ICON }),
    path(flap, throwing ? 'bpmn-icon-inverse' : ICON, throwing ? 'fill:none;stroke-width:1.5px' : undefined),
  ]
}

/**
 * The picture of an event definition, for an event of radius 18.
 * `throwing` fills it, as the notation does for throw and end events.
 */
export function eventIcon(kind: string, throwing: boolean, parallel = false): SvgElement[] {
  const cls = throwing ? FILL : ICON
  switch (kind) {
    case 'message':
      return envelope(throwing)
    case 'timer': {
      const ticks = new PathBuilder()
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6
        ticks.moveTo(Math.cos(a) * 8.5, Math.sin(a) * 8.5).lineTo(Math.cos(a) * 10.5, Math.sin(a) * 10.5)
      }
      return [
        el('circle', { cx: 0, cy: 0, r: 11, class: ICON }),
        path(ticks, ICON, 'stroke-width:1px'),
        path(new PathBuilder().moveTo(0, -7).lineTo(0, 0).lineTo(5, 2.5), ICON),
      ]
    }
    case 'signal':
      return [polygon([[0, -9], [8.5, 6], [-8.5, 6]], cls)]
    case 'error':
      return [polygon([[-8, 8], [-3.5, -8], [1.5, 1], [7.5, -8], [3, 8], [-2, -1]], cls)]
    case 'escalation':
      return [polygon([[0, -9], [7, 8], [0, 2], [-7, 8]], cls)]
    case 'conditional': {
      const lines = new PathBuilder()
      for (const y of [-4.5, -1.5, 1.5, 4.5]) lines.moveTo(-4, y).lineTo(4, y)
      return [el('rect', { x: -6.5, y: -8.5, width: 13, height: 17, class: ICON }), path(lines, ICON, 'stroke-width:1px')]
    }
    case 'link':
      return [polygon([[-8, -3], [1, -3], [1, -7.5], [8.5, 0], [1, 7.5], [1, 3], [-8, 3]], cls)]
    case 'compensate':
      return [polygon([[-1, -6.5], [-1, 6.5], [-9, 0]], cls), polygon([[8, -6.5], [8, 6.5], [0, 0]], cls)]
    case 'cancel':
      return [polygon(rotate(cross(9.5, 4), 45), cls)]
    case 'terminate':
      return [el('circle', { cx: 0, cy: 0, r: 11, class: FILL })]
    case 'multiple':
      return parallel ? [polygon(cross(9, 5), cls)] : [polygon(regular(5, 9.5), cls)]
    default:
      return []
  }
}

function gear(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const p = new PathBuilder()
  const step = (2 * Math.PI) / teeth
  for (let i = 0; i < teeth; i++) {
    const a = i * step
    const points: [number, number][] = [
      [a - step * 0.18, outer],
      [a + step * 0.18, outer],
      [a + step * 0.32, inner],
      [a + step * 0.68, inner],
    ]
    points.forEach(([angle, r], j) => {
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      if (i === 0 && j === 0) p.moveTo(x, y)
      else p.lineTo(x, y)
    })
  }
  return p.close().toString()
}

/** The picture of a task type, top-left aligned in a 20×20 box. */
export function taskIcon(type: string): SvgElement[] {
  switch (type) {
    case 'userTask':
      return [
        el('circle', { cx: 10, cy: 6, r: 4, class: ICON }),
        path(new PathBuilder().moveTo(2, 18).curveTo(2, 12, 5, 10.5, 10, 10.5).curveTo(15, 10.5, 18, 12, 18, 18).close(), ICON),
      ]
    case 'serviceTask':
      return [
        path(gear(8, 8, 7, 5, 8), ICON, 'stroke-width:1.2px'),
        el('circle', { cx: 8, cy: 8, r: 2, class: ICON, style: 'stroke-width:1.2px' }),
        path(gear(14, 14, 5.5, 4, 7), ICON, 'stroke-width:1.2px;fill:var(--bpmn-fill, #ffffff)'),
        el('circle', { cx: 14, cy: 14, r: 1.5, class: ICON, style: 'stroke-width:1.2px' }),
      ]
    case 'scriptTask': {
      const scroll = new PathBuilder()
        .moveTo(5, 2)
        .lineTo(17, 2)
        .curveTo(13, 6, 17, 10, 15, 18)
        .lineTo(3, 18)
        .curveTo(5, 10, 1, 6, 5, 2)
        .close()
      const lines = new PathBuilder().moveTo(6, 6).lineTo(13, 6).moveTo(6.5, 10).lineTo(13.5, 10).moveTo(6, 14).lineTo(12.5, 14)
      return [path(scroll, ICON), path(lines, ICON, 'stroke-width:1px')]
    }
    case 'sendTask':
      return [el('g', { transform: 'translate(10,9)' }, envelope(true, 16, 11))]
    case 'receiveTask':
      return [el('g', { transform: 'translate(10,9)' }, envelope(false, 16, 11))]
    case 'manualTask': {
      const hand = new PathBuilder()
        .moveTo(2, 9)
        .lineTo(6, 5)
        .lineTo(16, 5)
        .curveTo(17.5, 5, 17.5, 7.5, 16, 7.5)
        .lineTo(10, 7.5)
        .moveTo(17, 7.5)
        .curveTo(18.5, 7.5, 18.5, 10, 17, 10)
        .lineTo(10, 10)
        .moveTo(16, 10)
        .curveTo(17.5, 10, 17.5, 12.5, 16, 12.5)
        .lineTo(10, 12.5)
        .moveTo(15, 12.5)
        .curveTo(16.5, 12.5, 16.5, 15, 15, 15)
        .lineTo(6, 15)
        .lineTo(2, 13)
      return [path(hand, ICON, 'stroke-width:1.2px')]
    }
    case 'businessRuleTask': {
      const grid = new PathBuilder().moveTo(2, 9).lineTo(18, 9).moveTo(2, 13).lineTo(18, 13).moveTo(7, 5).lineTo(7, 17)
      return [
        el('rect', { x: 2, y: 3, width: 16, height: 14, class: ICON, style: 'stroke-width:1.2px' }),
        el('rect', { x: 2, y: 3, width: 16, height: 3, class: FILL }),
        path(grid, ICON, 'stroke-width:1px'),
      ]
    }
    default:
      return []
  }
}

/** Activity markers along the bottom edge, each 14 wide, centred on (0, 0). */
export function activityMarker(kind: string): SvgElement[] {
  switch (kind) {
    case 'standard':
      return [
        path(new PathBuilder().moveTo(-3.5, 5.5).arcTo(6, 6, 0, true, true, 3.5, 5.5), ICON),
        path(new PathBuilder().moveTo(3.5, 1.5).lineTo(3.5, 5.8).lineTo(7.5, 5.8), ICON),
      ]
    case 'parallel':
      return [path(new PathBuilder().moveTo(-4.5, -6).lineTo(-4.5, 6).moveTo(0, -6).lineTo(0, 6).moveTo(4.5, -6).lineTo(4.5, 6), ICON, 'stroke-width:2px')]
    case 'sequential':
      return [path(new PathBuilder().moveTo(-6, -4.5).lineTo(6, -4.5).moveTo(-6, 0).lineTo(6, 0).moveTo(-6, 4.5).lineTo(6, 4.5), ICON, 'stroke-width:2px')]
    case 'compensation':
      return [polygon([[-0.5, -5], [-0.5, 5], [-7, 0]], ICON), polygon([[6.5, -5], [6.5, 5], [0, 0]], ICON)]
    case 'adHoc':
      return [path(new PathBuilder().moveTo(-7, 1.5).curveTo(-4, -4, -1, 0, 0, 0).curveTo(1, 0, 4, 4, 7, -1.5), ICON, 'stroke-width:1.5px')]
    case 'collapsed':
      return [
        el('rect', { x: -7, y: -7, width: 14, height: 14, class: ICON, style: 'stroke-width:1.2px' }),
        path(new PathBuilder().moveTo(-4, 0).lineTo(4, 0).moveTo(0, -4).lineTo(0, 4), ICON, 'stroke-width:1.5px'),
      ]
    default:
      return []
  }
}

/** The marker inside a gateway diamond of half-size `r` (25 for a 50×50 gateway). */
export function gatewayMarker(type: string, r: number, options: { markerVisible: boolean; instantiate: boolean; parallel: boolean }): SvgElement[] {
  const s = r / 25
  const scale = (points: [number, number][]) => points.map(([x, y]) => [x * s, y * s] as [number, number])
  switch (type) {
    case 'exclusiveGateway':
      return options.markerVisible ? [polygon(scale(rotate(cross(11, 4.5), 45)), FILL)] : []
    case 'parallelGateway':
      return [polygon(scale(cross(12, 4.5)), FILL)]
    case 'inclusiveGateway':
      return [el('circle', { cx: 0, cy: 0, r: 10 * s, class: ICON, style: 'stroke-width:2.5px' })]
    case 'complexGateway':
      return [
        polygon(scale(cross(12, 3.5)), FILL),
        polygon(scale(rotate(cross(12, 3.5), 45)), FILL),
      ]
    case 'eventBasedGateway': {
      const out: SvgElement[] = [el('circle', { cx: 0, cy: 0, r: 11 * s, class: ICON, style: 'stroke-width:1px' })]
      if (!options.instantiate) out.push(el('circle', { cx: 0, cy: 0, r: 8.5 * s, class: ICON, style: 'stroke-width:1px' }))
      out.push(polygon(scale(options.parallel ? cross(6, 3) : regular(5, 5.5)), ICON))
      return out
    }
    default:
      return []
  }
}
