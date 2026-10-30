/**
 * DMN decision requirements diagram → SVG, as the file lays it out (DMNDI,
 * or bpmn.io's `biodi` in DMN 1.1), or with a computed layout when the file
 * has none.
 */
import { el, PathBuilder, serialize, txt, type SvgElement } from '../core/svg'
import { defaultMeasurer, wrapText, type FontSpec, type TextMeasurer } from '../core/text'
import { BpmnError } from '../errors'
import type { Bounds, Point } from '../model'
import { safeColor, stylesheet } from '../theme'
import { autoLayout } from './layout'
import { associationEnds, parseDmn, type DmnDiagram, type DmnElement, type DmnModel, type DmnParseOptions, type DmnShape } from './model'

export interface DmnRenderOptions extends DmnParseOptions {
  /** Which diagram: its id or index. The first by default. */
  diagram?: string | number
  measureText?: TextMeasurer
  idPrefix?: string
  title?: string
  padding?: number
  /** For an SVG inside another one: positioned at the drawing's coordinates, no sizing style. */
  nested?: boolean
}

export interface DmnRenderResult {
  svg: string
  width: number
  height: number
  diagram?: string
  /** True when the file had no layout and one was computed. */
  generated: boolean
  warnings: string[]
}

const FONT: FontSpec = { size: 12, family: 'Arial, sans-serif' }
const LINE = 1.2

function hashId(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `dmn-${(h >>> 0).toString(36)}`
}

/** The diagram to draw: chosen, the first, or a computed one. */
export function dmnDiagram(model: DmnModel, which?: string | number): DmnDiagram {
  if (model.diagrams.length === 0) return autoLayout(model)
  if (which === undefined) return model.diagrams[0]!
  const found = typeof which === 'number' ? model.diagrams[which] : model.diagrams.find((d) => d.id === which)
  if (!found) throw new BpmnError(`The file has no diagram "${which}"`)
  return found
}

/** Where a line from a shape's centre towards `to` leaves its bounds. */
function border(b: Bounds, to: Point): Point {
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const dx = to.x - cx
  const dy = to.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx === 0 ? Infinity : b.width / 2 / Math.abs(dx)
  const sy = dy === 0 ? Infinity : b.height / 2 / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

const centre = (b: Bounds): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/** Draws the decision requirements diagram of a DMN file. */
export function renderDmn(source: string | DmnModel, options: DmnRenderOptions = {}): DmnRenderResult {
  const model = typeof source === 'string' ? parseDmn(source, options) : source
  const diagram = dmnDiagram(model, options.diagram)
  const measure = options.measureText ?? defaultMeasurer()
  const warnings: string[] = []
  const rootId = (options.idPrefix ?? hashId(typeof source === 'string' ? source : `${model.definitions.id ?? ''}/${diagram.id ?? ''}`)).replace(/[^a-zA-Z0-9_-]/g, '-')
  const ext = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const grow = (x: number, y: number, w = 0, h = 0) => {
    ext.minX = Math.min(ext.minX, x)
    ext.minY = Math.min(ext.minY, y)
    ext.maxX = Math.max(ext.maxX, x + w)
    ext.maxY = Math.max(ext.maxY, y + h)
  }
  const shapes: SvgElement[] = []
  const services: SvgElement[] = []
  const edges: SvgElement[] = []

  const style = (c: { fill?: string; stroke?: string }) => {
    const parts: string[] = []
    const fill = safeColor(c.fill)
    const stroke = safeColor(c.stroke)
    if (fill) parts.push(`--bpmn-fill:${fill}`)
    if (stroke) parts.push(`--bpmn-stroke:${stroke}`, `--bpmn-text:${stroke}`, `--bpmn-annotation-stroke:${stroke}`)
    return parts.length > 0 ? parts.join(';') : undefined
  }
  const group = (e: DmnElement, colors: { fill?: string; stroke?: string }, kids: (SvgElement | null)[]) =>
    el('g', { class: `bpmn-element dmn-type-${e.type}`, 'data-element-id': e.id, style: style(colors) }, kids)

  const label = (text: string | undefined, b: Bounds, opts: { top?: boolean; anchor?: 'start' | 'middle'; pad?: number } = {}): SvgElement | null => {
    const t = text?.trim()
    if (!t) return null
    const pad = opts.pad ?? 8
    const lines = wrapText(t, Math.max(10, b.width - pad * 2), FONT, measure)
    const lh = FONT.size * LINE
    const top = opts.top ? b.y + 6 : b.y + (b.height - lines.length * lh) / 2
    const x = opts.anchor === 'start' ? b.x + pad : b.x + b.width / 2
    return el(
      'text',
      { class: 'bpmn-label', 'text-anchor': opts.anchor ?? 'middle' },
      lines.map((line, i) => el('tspan', { x, y: top + lh * i + FONT.size * 0.9 }, [txt(line)])),
    )
  }

  const drawShape = (e: DmnElement, s: DmnShape) => {
    const { x, y, width: w, height: h } = s.bounds
    grow(x, y, w, h)
    const kids: (SvgElement | null)[] = []
    switch (e.type) {
      case 'decision': {
        kids.push(el('rect', { x, y, width: w, height: h, class: 'bpmn-shape' }))
        const logic = model.decisions.find((d) => d.id === e.id)?.logic
        if (logic?.kind === 'table') {
          // A small table: the decision opens to one.
          const grid = new PathBuilder().moveTo(x + 6, y + 10).lineTo(x + 22, y + 10).moveTo(x + 6, y + 14).lineTo(x + 22, y + 14).moveTo(x + 12, y + 10).lineTo(x + 12, y + 18)
          kids.push(el('rect', { x: x + 6, y: y + 6, width: 16, height: 12, class: 'bpmn-icon', style: 'stroke-width:1px' }), el('path', { d: grid.toString(), class: 'bpmn-icon', style: 'stroke-width:1px' }))
        } else if (logic?.kind === 'literal') {
          kids.push(el('text', { x: x + 6, y: y + 16, class: 'bpmn-label', style: 'font-size:10px;font-style:italic' }, [txt('fx')]))
        }
        kids.push(label(e.name, s.bounds))
        break
      }
      case 'inputData':
        kids.push(el('rect', { x, y, width: w, height: h, rx: Math.min(h / 2, w / 2), class: 'bpmn-shape' }), label(e.name, s.bounds, { pad: h / 3 }))
        break
      case 'businessKnowledgeModel': {
        const c = Math.min(15, w / 4, h / 3)
        const p = new PathBuilder().moveTo(x + c, y).lineTo(x + w, y).lineTo(x + w, y + h - c).lineTo(x + w - c, y + h).lineTo(x, y + h).lineTo(x, y + c).close()
        kids.push(el('path', { d: p.toString(), class: 'bpmn-shape' }), label(e.name, s.bounds))
        break
      }
      case 'knowledgeSource': {
        const wave = Math.min(10, h / 5)
        const p = new PathBuilder()
          .moveTo(x, y)
          .lineTo(x + w, y)
          .lineTo(x + w, y + h - wave)
          .curveTo(x + w * 0.75, y + h - wave * 3, x + w * 0.25, y + h + wave, x, y + h - wave)
          .close()
        kids.push(el('path', { d: p.toString(), class: 'bpmn-shape' }), label(e.name, { ...s.bounds, height: h - wave }))
        break
      }
      case 'decisionService': {
        kids.push(el('rect', { x, y, width: w, height: h, rx: 14, class: 'bpmn-shape', style: 'fill:none' }))
        kids.push(label(e.name, s.bounds, { top: true }))
        services.push(group(e, s.colors, kids))
        return
      }
      case 'textAnnotation': {
        const bracket = new PathBuilder().moveTo(x + 10, y).lineTo(x, y).lineTo(x, y + h).lineTo(x + 10, y + h)
        kids.push(
          el('rect', { x, y, width: w, height: h, style: 'fill:transparent;stroke:none' }),
          el('path', { d: bracket.toString(), class: 'bpmn-annotation' }),
          label(e.name, s.bounds, { anchor: 'start', top: true, pad: 5 }),
        )
        break
      }
      default:
        kids.push(el('rect', { x, y, width: w, height: h, rx: 6, class: 'bpmn-shape bpmn-thin' }), label(e.name, s.bounds))
    }
    shapes.push(group(e, s.colors, kids))
  }

  const byId = new Map(diagram.shapes.map((s) => [s.element, s]))
  for (const s of diagram.shapes) {
    const e = model.elements.get(s.element)
    if (!e) {
      warnings.push(`A shape refers to "${s.element}", which is not in the file`)
      continue
    }
    drawShape(e, s)
  }

  // Flows: requirements and associations; drawn straight between borders when the file gives no points.
  const drawn = new Map(diagram.edges.map((e) => [e.element, e]))
  const lines: { id: string; kind: string; points: Point[]; colors: { fill?: string; stroke?: string } }[] = []
  const pointsFor = (id: string, source: string, target: string): Point[] | undefined => {
    const own = drawn.get(id)
    if (own && own.waypoints.length >= 2) return own.waypoints
    const a = byId.get(source)?.bounds
    const b = byId.get(target)?.bounds
    if (!a || !b) return undefined
    return [border(a, centre(b)), border(b, centre(a))]
  }
  for (const r of model.requirements) {
    if (!byId.has(r.source) || !byId.has(r.target)) continue
    // A decision inside a service it is an output of has no visible requirement line.
    const points = pointsFor(r.id, r.source, r.target)
    if (points) lines.push({ id: r.id, kind: r.kind, points, colors: drawn.get(r.id)?.colors ?? {} })
  }
  for (const a of model.elements.values()) {
    if (a.type !== 'association') continue
    const ends = associationEnds(a)
    if (!ends) continue
    const points = pointsFor(a.id, ends[0], ends[1])
    if (points) lines.push({ id: a.id, kind: 'association', points, colors: drawn.get(a.id)?.colors ?? {} })
  }
  for (const line of lines) {
    for (const p of line.points) grow(p.x, p.y)
    const path = new PathBuilder()
    line.points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)))
    const end = line.points[line.points.length - 1]!
    const prev = line.points[line.points.length - 2]!
    const len = Math.hypot(end.x - prev.x, end.y - prev.y) || 1
    const d = { x: (end.x - prev.x) / len, y: (end.y - prev.y) / len }
    const kids: SvgElement[] = []
    const base = (n: number) => ({ x: end.x - d.x * n, y: end.y - d.y * n })
    switch (line.kind) {
      case 'information': {
        kids.push(el('path', { d: path.toString(), class: 'bpmn-flow' }))
        const b = base(11)
        kids.push(el('path', { d: new PathBuilder().moveTo(end.x, end.y).lineTo(b.x - d.y * 5, b.y + d.x * 5).lineTo(b.x + d.y * 5, b.y - d.x * 5).close().toString(), class: 'bpmn-head' }))
        break
      }
      case 'knowledge': {
        kids.push(el('path', { d: path.toString(), class: 'bpmn-flow', style: 'stroke-dasharray:6 4' }))
        const b = base(11)
        kids.push(el('path', { d: new PathBuilder().moveTo(b.x - d.y * 6, b.y + d.x * 6).lineTo(end.x, end.y).lineTo(b.x + d.y * 6, b.y - d.x * 6).toString(), class: 'bpmn-head-line' }))
        break
      }
      case 'authority': {
        kids.push(el('path', { d: path.toString(), class: 'bpmn-flow', style: 'stroke-dasharray:6 4' }))
        const c = base(4)
        kids.push(el('circle', { cx: c.x, cy: c.y, r: 4, class: 'bpmn-head' }))
        break
      }
      default:
        kids.push(el('path', { d: path.toString(), class: 'bpmn-flow bpmn-association' }))
    }
    edges.push(el('g', { class: `bpmn-element dmn-type-${line.kind}Requirement`, 'data-element-id': line.id, style: style(line.colors) }, kids))
  }

  const padding = options.padding ?? 10
  if (!Number.isFinite(ext.minX)) ext.minX = ext.minY = ext.maxX = ext.maxY = 0
  const x0 = Math.floor(ext.minX - padding)
  const y0 = Math.floor(ext.minY - padding)
  const width = Math.ceil(ext.maxX + padding) - x0
  const height = Math.ceil(ext.maxY + padding) - y0
  const title = options.title ?? diagram.name ?? model.definitions.name ?? 'DMN diagram'
  const root = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      id: rootId,
      class: 'bpmn dmn',
      x: options.nested ? x0 : undefined,
      y: options.nested ? y0 : undefined,
      overflow: options.nested ? 'visible' : undefined,
      width,
      height,
      viewBox: `${x0} ${y0} ${width} ${height}`,
      role: 'img',
      'aria-labelledby': `${rootId}-title`,
      style: options.nested ? undefined : 'max-width:100%;height:auto',
    },
    [
      el('title', { id: `${rootId}-title` }, [txt(title)]),
      el('style', {}, [txt(stylesheet(rootId))]),
      el('g', { class: 'bpmn-layer bpmn-layer-containers' }, services),
      el('g', { class: 'bpmn-layer bpmn-layer-shapes' }, shapes),
      el('g', { class: 'bpmn-layer bpmn-layer-flows' }, edges),
    ],
  )
  return { svg: serialize(root), width, height, diagram: diagram.id, generated: diagram.generated, warnings }
}
