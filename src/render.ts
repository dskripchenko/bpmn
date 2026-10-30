/**
 * BPMN diagram → SVG, laid out exactly as the file's diagram interchange
 * (DI) places it: nothing is moved, only drawn.
 */
import { el, PathBuilder, serialize, txt, type SvgElement } from './core/svg'
import { defaultMeasurer, wrapText, type FontSpec, type TextMeasurer } from './core/text'
import { BpmnError } from './errors'
import { activityMarker, eventIcon, gatewayMarker, taskIcon } from './icons'
import { children, parse, prop, type BpmnDiagram, type BpmnElement, type BpmnModel, type Bounds, type DiColors, type DiEdge, type DiShape, type ParseOptions, type Point } from './model'
import { safeColor, stylesheet } from './theme'
import { attr, textContent } from './xml'

export interface RenderOptions extends ParseOptions {
  /** Which diagram of the file: its id or its index. Defaults to the first. */
  diagram?: string | number
  /** How text is measured; defaults to a canvas in the browser and a glyph table elsewhere. */
  measureText?: TextMeasurer
  /**
   * Prefix of the ids inside the SVG. Must be unique on the page when the
   * same file is shown twice; defaults to a hash of the file.
   */
  idPrefix?: string
  /** Accessible title; defaults to the name of the diagram or of the process. */
  title?: string
  /** Space around the drawing, in pixels. Default 10. */
  padding?: number
}

export interface RenderResult {
  svg: string
  width: number
  height: number
  /** The id of the diagram drawn, when it has one. */
  diagram?: string
  /** What was skipped and why: shapes of unknown elements, edges without points. */
  warnings: string[]
}

const FONT = 'Arial, sans-serif'
const INNER: FontSpec = { size: 12, family: FONT }
const OUTER: FontSpec = { size: 11, family: FONT }
const LINE = 1.2
/** External labels wrap at this width, as BPMN modelers lay them out. */
const EXTERNAL_WIDTH = 90

const EVENTS = new Set(['startEvent', 'endEvent', 'intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent', 'implicitThrowEvent'])
const TASKS = new Set(['task', 'userTask', 'serviceTask', 'scriptTask', 'sendTask', 'receiveTask', 'manualTask', 'businessRuleTask'])
const SUBPROCESSES = new Set(['subProcess', 'transaction', 'adHocSubProcess'])
const CONVERSATIONS = new Set(['conversation', 'subConversation', 'callConversation'])

function hashId(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `bpmn-${(h >>> 0).toString(36)}`
}

function sanitizeId(prefix: string): string {
  const cleaned = prefix.replace(/[^a-zA-Z0-9_-]/g, '-')
  return /^[a-zA-Z]/.test(cleaned) ? cleaned : `bpmn-${cleaned}`
}

/** Custom properties that recolour one element and everything drawn inside its group. */
function colorStyle(colors: DiColors): string | undefined {
  const fill = safeColor(colors.fill)
  const stroke = safeColor(colors.stroke)
  const parts: string[] = []
  if (fill) parts.push(`--bpmn-fill:${fill}`, `--bpmn-pool-fill:${fill}`, `--bpmn-lane-fill:${fill}`)
  if (stroke) parts.push(`--bpmn-stroke:${stroke}`, `--bpmn-group-stroke:${stroke}`, `--bpmn-annotation-stroke:${stroke}`)
  return parts.length > 0 ? parts.join(';') : undefined
}

function labelStyle(colors: DiColors): string | undefined {
  const color = safeColor(colors.label) ?? safeColor(colors.stroke)
  return color ? `fill:${color}` : undefined
}

interface Extent {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function grow(extent: Extent, x: number, y: number, w = 0, h = 0) {
  extent.minX = Math.min(extent.minX, x)
  extent.minY = Math.min(extent.minY, y)
  extent.maxX = Math.max(extent.maxX, x + w)
  extent.maxY = Math.max(extent.maxY, y + h)
}

function pickDiagram(model: BpmnModel, which: string | number | undefined): BpmnDiagram {
  if (model.diagrams.length === 0) {
    throw new BpmnError(
      'The file has no diagram: its elements have no positions',
      0,
      0,
      'Open the file in a BPMN modeler and save it; the modeler stores the layout (BPMNDiagram).',
    )
  }
  if (which === undefined) return model.diagrams[0]!
  const found = typeof which === 'number' ? model.diagrams[which] : model.diagrams.find((d) => d.id === which)
  if (!found) {
    const ids = model.diagrams.map((d, i) => d.id ?? `#${i}`).join(', ')
    throw new BpmnError(`The file has no diagram "${which}"`, 0, 0, `It has: ${ids}.`)
  }
  return found
}

/** Draws one diagram of a BPMN file as SVG. */
export function render(source: string | BpmnModel, options: RenderOptions = {}): RenderResult {
  const model = typeof source === 'string' ? parse(source, options) : source
  const diagram = pickDiagram(model, options.diagram)
  const measure = options.measureText ?? defaultMeasurer()
  const warnings: string[] = []
  const rootId = sanitizeId(options.idPrefix ?? hashId(typeof source === 'string' ? source : `${model.definitions.id ?? ''}/${diagram.id ?? ''}`))
  const extent: Extent = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }

  const layers = {
    pools: [] as SvgElement[],
    lanes: [] as SvgElement[],
    containers: [] as { area: number; node: SvgElement }[],
    shapes: [] as SvgElement[],
    edges: [] as SvgElement[],
    boundary: [] as SvgElement[],
    groups: [] as SvgElement[],
    labels: [] as SvgElement[],
  }

  // Elements that have a shape of their own in this diagram, by id: tells an
  // expanded sub-process from a collapsed one when the file does not say.
  const shown = new Set(diagram.shapes.map((s) => s.element))
  const hasShownChildren = new Set<string>()
  for (const id of shown) {
    const parent = model.elements.get(id)?.parent
    if (parent) hasShownChildren.add(parent)
  }

  // ---------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------

  /** Lines of text as a `<text>`, the block's top at `top`. */
  const textBlock = (
    lines: string[],
    x: number,
    top: number,
    font: FontSpec,
    opts: { anchor?: 'start' | 'middle'; className?: string; style?: string; transform?: string } = {},
  ): SvgElement => {
    const lh = font.size * LINE
    return el(
      'text',
      {
        class: opts.className ?? 'bpmn-label',
        'text-anchor': opts.anchor ?? 'middle',
        style: opts.style,
        transform: opts.transform,
      },
      lines.map((line, i) => el('tspan', { x, y: top + lh * i + font.size * 0.9 }, [txt(line)])),
    )
  }

  /** A label below or beside a shape or on a flow: at the DI bounds, or at `fallback`. */
  const external = (text: string | undefined, label: Bounds | undefined, fallback: Point, style: string | undefined, halo: boolean) => {
    if (!text || !text.trim()) return
    const lines = wrapText(text.trim(), EXTERNAL_WIDTH, OUTER, measure)
    const lh = OUTER.size * LINE
    const height = lines.length * lh
    const widest = Math.max(...lines.map((l) => measure(l, OUTER).width))
    const cx = label ? label.x + label.width / 2 : fallback.x
    // A label box from the file is where its text starts; the fallback is
    // the top-centre of the space below the shape.
    const top = label ? label.y + Math.max(0, (label.height - height) / 2) : fallback.y
    grow(extent, cx - widest / 2, top, widest, height)
    layers.labels.push(
      textBlock(lines, cx, top, OUTER, {
        className: `bpmn-label bpmn-label-external${halo ? ' bpmn-label-halo' : ''}`,
        style,
      }),
    )
  }

  // ---------------------------------------------------------------------
  // Shapes
  // ---------------------------------------------------------------------

  const group = (element: BpmnElement, shape: DiShape | DiEdge, kids: (SvgElement | null | false | undefined)[]): SvgElement =>
    el('g', { class: `bpmn-element bpmn-type-${element.type}`, 'data-element-id': element.id, style: colorStyle(shape.colors) }, kids)

  const drawEvent = (element: BpmnElement, shape: DiShape) => {
    const { x, y, width: w, height: h } = shape.bounds
    const cx = x + w / 2
    const cy = y + h / 2
    const r = Math.min(w, h) / 2
    const type = element.type
    const interrupting =
      type === 'boundaryEvent' ? prop(element, 'cancelActivity') !== 'false' : type === 'startEvent' ? prop(element, 'isInterrupting') !== 'false' : true
    const dashed = interrupting ? '' : ' bpmn-dashed'
    const kids: SvgElement[] = []
    if (type === 'startEvent') {
      kids.push(el('circle', { cx, cy, r, class: `bpmn-shape${dashed}` }))
    } else if (type === 'endEvent') {
      kids.push(el('circle', { cx, cy, r, class: 'bpmn-shape bpmn-thick' }))
    } else {
      kids.push(el('circle', { cx, cy, r, class: `bpmn-shape bpmn-thin${dashed}` }))
      kids.push(el('circle', { cx, cy, r: Math.max(1, r - 3), class: `bpmn-shape bpmn-thin${dashed}` }))
    }
    const defs = element.eventDefinitions
    const kind = defs.length > 1 ? 'multiple' : defs[0]
    if (kind) {
      const throwing = type === 'endEvent' || type === 'intermediateThrowEvent' || type === 'implicitThrowEvent'
      const icon = eventIcon(kind, throwing, prop(element, 'parallelMultiple') === 'true')
      if (icon.length > 0) kids.push(el('g', { transform: `translate(${cx},${cy}) scale(${r / 18})` }, icon))
    }
    ;(type === 'boundaryEvent' ? layers.boundary : layers.shapes).push(group(element, shape, kids))
    external(element.name, shape.label, { x: cx, y: y + h + 5 }, labelStyle(shape.colors), false)
  }

  const markersRow = (kinds: string[], cx: number, bottom: number): SvgElement[] => {
    const size = 14
    const gap = 4
    const total = kinds.length * size + (kinds.length - 1) * gap
    return kinds.map((kind, i) =>
      el('g', { transform: `translate(${cx - total / 2 + size / 2 + i * (size + gap)},${bottom - size / 2 - 4})` }, activityMarker(kind)),
    )
  }

  const activityMarkers = (element: BpmnElement, collapsed: boolean): string[] => {
    const kinds: string[] = []
    if (element.loop) kinds.push(element.loop)
    if (prop(element, 'isForCompensation') === 'true') kinds.push('compensation')
    if (element.type === 'adHocSubProcess') kinds.push('adHoc')
    if (collapsed) kinds.push('collapsed')
    return kinds
  }

  const innerLabel = (element: BpmnElement, shape: DiShape, kids: SvgElement[], position: 'middle' | 'top') => {
    const name = element.name?.trim()
    if (!name) return
    const { x, y, width: w, height: h } = shape.bounds
    const lines = wrapText(name, Math.max(10, w - 10), INNER, measure)
    const height = lines.length * INNER.size * LINE
    const top = position === 'top' ? y + 7 : y + (h - height) / 2
    kids.push(textBlock(lines, x + w / 2, top, INNER, { style: labelStyle(shape.colors) }))
  }

  const drawActivity = (element: BpmnElement, shape: DiShape) => {
    const { x, y, width: w, height: h } = shape.bounds
    const type = element.type
    const sub = SUBPROCESSES.has(type)
    const expanded = sub && (shape.isExpanded ?? hasShownChildren.has(element.id))
    const kids: SvgElement[] = []
    const rect = (inset: number, className: string) =>
      el('rect', { x: x + inset, y: y + inset, width: Math.max(0, w - inset * 2), height: Math.max(0, h - inset * 2), rx: Math.max(0, 10 - inset), class: className })
    if (type === 'callActivity') {
      kids.push(rect(0, 'bpmn-shape bpmn-call'))
    } else if (sub && prop(element, 'triggeredByEvent') === 'true') {
      kids.push(rect(0, 'bpmn-shape bpmn-thin bpmn-dotted'))
    } else if (type === 'transaction') {
      kids.push(rect(0, 'bpmn-shape bpmn-thin'), rect(3, 'bpmn-shape bpmn-thin'))
    } else {
      kids.push(rect(0, 'bpmn-shape'))
    }
    if (TASKS.has(type)) {
      const icon = taskIcon(type)
      if (icon.length > 0) kids.push(el('g', { transform: `translate(${x + 5},${y + 5})` }, icon))
    }
    innerLabel(element, shape, kids, expanded ? 'top' : 'middle')
    kids.push(...markersRow(activityMarkers(element, sub && !expanded), x + w / 2, y + h))
    const node = group(element, shape, kids)
    if (expanded) layers.containers.push({ area: w * h, node })
    else layers.shapes.push(node)
  }

  const drawGateway = (element: BpmnElement, shape: DiShape) => {
    const { x, y, width: w, height: h } = shape.bounds
    const cx = x + w / 2
    const cy = y + h / 2
    const diamond = new PathBuilder().moveTo(cx, y).lineTo(x + w, cy).lineTo(cx, y + h).lineTo(x, cy).close()
    const marker = gatewayMarker(element.type, Math.min(w, h) / 2, {
      markerVisible: shape.isMarkerVisible === true,
      instantiate: prop(element, 'instantiate') === 'true',
      parallel: prop(element, 'eventGatewayType') === 'Parallel',
    })
    layers.shapes.push(
      group(element, shape, [
        el('path', { d: diamond.toString(), class: 'bpmn-shape' }),
        marker.length > 0 ? el('g', { transform: `translate(${cx},${cy})` }, marker) : null,
      ]),
    )
    external(element.name, shape.label, { x: cx, y: y + h + 5 }, labelStyle(shape.colors), false)
  }

  const drawData = (element: BpmnElement, shape: DiShape) => {
    const { x, y, width: w, height: h } = shape.bounds
    const kids: SvgElement[] = []
    if (element.type === 'dataStoreReference' || element.type === 'dataStore') {
      const ry = Math.min(h * 0.14, 9)
      const body = new PathBuilder()
        .moveTo(x, y + ry)
        .lineTo(x, y + h - ry)
        .arcTo(w / 2, ry, 0, false, false, x + w, y + h - ry)
        .lineTo(x + w, y + ry)
        .arcTo(w / 2, ry, 0, false, false, x, y + ry)
        .close()
      const rims = new PathBuilder()
        .moveTo(x, y + ry + 5)
        .arcTo(w / 2, ry, 0, false, false, x + w, y + ry + 5)
        .moveTo(x, y + ry + 10)
        .arcTo(w / 2, ry, 0, false, false, x + w, y + ry + 10)
      kids.push(
        el('path', { d: body.toString(), class: 'bpmn-shape bpmn-thin' }),
        el('ellipse', { cx: x + w / 2, cy: y + ry, rx: w / 2, ry, class: 'bpmn-shape bpmn-thin' }),
        el('path', { d: rims.toString(), class: 'bpmn-icon', style: 'stroke-width:1.5px' }),
      )
    } else {
      const fold = Math.min(w, h) * 0.3
      const page = new PathBuilder().moveTo(x, y).lineTo(x + w - fold, y).lineTo(x + w, y + fold).lineTo(x + w, y + h).lineTo(x, y + h).close()
      const corner = new PathBuilder().moveTo(x + w - fold, y).lineTo(x + w - fold, y + fold).lineTo(x + w, y + fold)
      kids.push(el('path', { d: page.toString(), class: 'bpmn-shape bpmn-thin' }), el('path', { d: corner.toString(), class: 'bpmn-icon' }))
      const objectRef = prop(element, 'dataObjectRef')
      const object = objectRef ? model.elements.get(objectRef) : undefined
      const collection = prop(element, 'isCollection') === 'true' || (object && prop(object, 'isCollection') === 'true')
      if (collection) kids.push(el('g', { transform: `translate(${x + w / 2},${y + h - 9}) scale(0.7)` }, activityMarker('parallel')))
      if (element.type === 'dataInput' || element.type === 'dataOutput') {
        const arrow = new PathBuilder().moveTo(x + 4, y + 7).lineTo(x + 10, y + 7).lineTo(x + 10, y + 4).lineTo(x + 16, y + 9.5).lineTo(x + 10, y + 15).lineTo(x + 10, y + 12).lineTo(x + 4, y + 12).close()
        kids.push(el('path', { d: arrow.toString(), class: element.type === 'dataOutput' ? 'bpmn-icon-fill' : 'bpmn-icon' }))
      }
    }
    layers.shapes.push(group(element, shape, kids))
    const state = children(element, 'dataState')[0]
    const stateName = state && attr(state, 'name')
    const name = stateName ? `${element.name ?? ''}\n[${stateName}]` : element.name
    external(name, shape.label, { x: x + w / 2, y: y + h + 5 }, labelStyle(shape.colors), false)
  }

  const drawAnnotation = (element: BpmnElement, shape: DiShape) => {
    const { x, y, width: w, height: h } = shape.bounds
    const bracket = new PathBuilder().moveTo(x + 10, y).lineTo(x, y).lineTo(x, y + h).lineTo(x + 10, y + h)
    const kids: SvgElement[] = [
      el('rect', { x, y, width: w, height: h, style: 'fill:transparent;stroke:none' }),
      el('path', { d: bracket.toString(), class: 'bpmn-annotation' }),
    ]
    const text = element.name?.trim()
    if (text) kids.push(textBlock(wrapText(text, Math.max(10, w - 10), INNER, measure), x + 5, y + 5, INNER, { anchor: 'start', style: labelStyle(shape.colors) }))
    layers.shapes.push(group(element, shape, kids))
  }

  const drawGroup = (element: BpmnElement, shape: DiShape) => {
    const { x, y, width: w, height: h } = shape.bounds
    layers.groups.push(group(element, shape, [el('rect', { x, y, width: w, height: h, rx: 10, class: 'bpmn-group' })]))
    const ref = prop(element, 'categoryValueRef')
    const value = ref ? model.elements.get(ref) : undefined
    const name = (value && prop(value, 'value')) ?? element.name
    external(name, shape.label, { x: x + w / 2, y: y + 7 }, labelStyle(shape.colors), false)
  }

  /** A pool or a lane: the name in a band along the start edge. */
  const drawSwimlane = (element: BpmnElement, shape: DiShape) => {
    const { x, y, width: w, height: h } = shape.bounds
    const lane = element.type === 'lane'
    const horizontal = shape.isHorizontal !== false
    const expanded = lane || (shape.isExpanded ?? (prop(element, 'processRef') !== undefined || hasShownChildren.has(element.id)))
    const kids: SvgElement[] = [el('rect', { x, y, width: w, height: h, class: lane ? 'bpmn-lane' : 'bpmn-pool' })]
    const band = 30
    const name = element.name?.trim()
    const style = labelStyle(shape.colors)
    if (!expanded) {
      if (name) {
        const lines = wrapText(name, Math.max(10, w - 20), INNER, measure)
        kids.push(textBlock(lines, x + w / 2, y + (h - lines.length * INNER.size * LINE) / 2, INNER, { style }))
      }
    } else {
      if (!lane) {
        const line = horizontal ? new PathBuilder().moveTo(x + band, y).lineTo(x + band, y + h) : new PathBuilder().moveTo(x, y + band).lineTo(x + w, y + band)
        kids.push(el('path', { d: line.toString(), class: 'bpmn-pool', style: 'fill:none' }))
      }
      if (name) {
        if (horizontal) {
          const lines = wrapText(name, Math.max(10, h - 10), INNER, measure)
          const cx = x + band / 2
          const cy = y + h / 2
          const height = lines.length * INNER.size * LINE
          kids.push(textBlock(lines, cx, cy - height / 2, INNER, { style, transform: `rotate(-90 ${cx} ${cy})` }))
        } else {
          const lines = wrapText(name, Math.max(10, w - 10), INNER, measure)
          kids.push(textBlock(lines, x + w / 2, y + (band - lines.length * INNER.size * LINE) / 2, INNER, { style }))
        }
      }
    }
    const multiplicity = !lane && children(element, 'participantMultiplicity').length > 0
    if (multiplicity) kids.push(...markersRow(['parallel'], x + w / 2, y + h))
    ;(lane ? layers.lanes : layers.pools).push(group(element, shape, kids))
  }

  const drawConversation = (element: BpmnElement, shape: DiShape) => {
    const { x, y, width: w, height: h } = shape.bounds
    const q = w / 4
    const hex = new PathBuilder().moveTo(x + q, y).lineTo(x + w - q, y).lineTo(x + w, y + h / 2).lineTo(x + w - q, y + h).lineTo(x + q, y + h).lineTo(x, y + h / 2).close()
    const kids: SvgElement[] = [el('path', { d: hex.toString(), class: element.type === 'callConversation' ? 'bpmn-shape bpmn-thick' : 'bpmn-shape' })]
    if (element.type === 'subConversation') kids.push(...markersRow(['collapsed'], x + w / 2, y + h + 2))
    layers.shapes.push(group(element, shape, kids))
    external(element.name, shape.label, { x: x + w / 2, y: y + h + 5 }, labelStyle(shape.colors), false)
  }

  /** Anything else with a shape: a rounded box with its name, so nothing silently disappears. */
  const drawGeneric = (element: BpmnElement, shape: DiShape) => {
    const { x, y, width: w, height: h } = shape.bounds
    const kids: SvgElement[] = [el('rect', { x, y, width: w, height: h, rx: 10, class: 'bpmn-shape bpmn-thin' })]
    innerLabel(element, shape, kids, 'middle')
    layers.shapes.push(group(element, shape, kids))
  }

  // ---------------------------------------------------------------------
  // Flows
  // ---------------------------------------------------------------------

  const unit = (from: Point, to: Point): Point => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy) || 1
    return { x: dx / len, y: dy / len }
  }

  /** The direction the flow arrives in at its last point (or leaves its first). */
  const direction = (points: Point[], atEnd: boolean): Point => {
    const list = atEnd ? points : [...points].reverse()
    const tip = list[list.length - 1]!
    for (let i = list.length - 2; i >= 0; i--) {
      const p = list[i]!
      if (p.x !== tip.x || p.y !== tip.y) return unit(p, tip)
    }
    return { x: 1, y: 0 }
  }

  /** A triangle with its tip at `tip`, pointing along `d`. */
  const head = (tip: Point, d: Point, length: number, half: number): PathBuilder => {
    const bx = tip.x - d.x * length
    const by = tip.y - d.y * length
    return new PathBuilder()
      .moveTo(tip.x, tip.y)
      .lineTo(bx - d.y * half, by + d.x * half)
      .lineTo(bx + d.y * half, by - d.x * half)
      .close()
  }

  const lineHead = (tip: Point, d: Point): PathBuilder => {
    const bx = tip.x - d.x * 10
    const by = tip.y - d.y * 10
    return new PathBuilder().moveTo(bx - d.y * 5, by + d.x * 5).lineTo(tip.x, tip.y).lineTo(bx + d.y * 5, by - d.x * 5)
  }

  const midpoint = (points: Point[]): Point => {
    let total = 0
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
    let left = total / 2
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!
      const b = points[i]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (left <= len && len > 0) return { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len }
      left -= len
    }
    return points[0]!
  }

  const drawEdge = (element: BpmnElement, edge: DiEdge) => {
    const points = edge.waypoints
    if (points.length < 2) {
      warnings.push(`The flow "${element.id}" has fewer than two points and is not drawn`)
      return
    }
    for (const p of points) grow(extent, p.x, p.y)
    const line = new PathBuilder()
    points.forEach((p, i) => (i === 0 ? line.moveTo(p.x, p.y) : line.lineTo(p.x, p.y)))
    const start = points[0]!
    const end = points[points.length - 1]!
    const dEnd = direction(points, true)
    const dStart = direction(points, false)
    // Pointing away from the source, along the first segment.
    const out = { x: -dStart.x, y: -dStart.y }
    const kids: SvgElement[] = []
    switch (element.type) {
      case 'sequenceFlow': {
        kids.push(el('path', { d: line.toString(), class: 'bpmn-flow' }))
        kids.push(el('path', { d: head(end, dEnd, 11, 4).toString(), class: 'bpmn-head' }))
        const source = model.elements.get(prop(element, 'sourceRef') ?? '')
        if (source && prop(source, 'default') === element.id) {
          const p = { x: start.x + out.x * 10, y: start.y + out.y * 10 }
          const slash = new PathBuilder()
            .moveTo(p.x - out.y * 5 - out.x * 3, p.y + out.x * 5 - out.y * 3)
            .lineTo(p.x + out.y * 5 + out.x * 3, p.y - out.x * 5 + out.y * 3)
          kids.push(el('path', { d: slash.toString(), class: 'bpmn-flow' }))
        } else if (source && !source.type.endsWith('Gateway') && children(element, 'conditionExpression').length > 0) {
          const tip = { x: start.x + out.x * 16, y: start.y + out.y * 16 }
          const mid = { x: start.x + out.x * 8, y: start.y + out.y * 8 }
          const diamond = new PathBuilder()
            .moveTo(start.x, start.y)
            .lineTo(mid.x - out.y * 4.5, mid.y + out.x * 4.5)
            .lineTo(tip.x, tip.y)
            .lineTo(mid.x + out.y * 4.5, mid.y - out.x * 4.5)
            .close()
          kids.push(el('path', { d: diamond.toString(), class: 'bpmn-head-open' }))
        }
        break
      }
      case 'messageFlow': {
        kids.push(el('path', { d: line.toString(), class: 'bpmn-flow bpmn-message-flow' }))
        kids.push(el('circle', { cx: start.x + out.x * 4, cy: start.y + out.y * 4, r: 4, class: 'bpmn-head-open' }))
        kids.push(el('path', { d: head(end, dEnd, 11, 5).toString(), class: 'bpmn-head-open' }))
        if (edge.message) {
          const m = midpoint(points)
          kids.push(
            el('g', { transform: `translate(${m.x},${m.y})` }, [
              el('rect', { x: -10, y: -7, width: 20, height: 14, class: edge.message === 'initiating' ? 'bpmn-head-open' : 'bpmn-head', style: edge.message === 'initiating' ? undefined : 'fill-opacity:0.35' }),
              el('path', { d: new PathBuilder().moveTo(-10, -7).lineTo(0, 1).lineTo(10, -7).toString(), class: 'bpmn-head-line', style: 'stroke-width:1px' }),
            ]),
          )
        }
        break
      }
      case 'association': {
        kids.push(el('path', { d: line.toString(), class: 'bpmn-flow bpmn-association' }))
        const dir = prop(element, 'associationDirection')
        if (dir === 'One' || dir === 'Both') kids.push(el('path', { d: lineHead(end, dEnd).toString(), class: 'bpmn-head-line' }))
        if (dir === 'Both') kids.push(el('path', { d: lineHead(start, out.x === 0 && out.y === 0 ? dStart : { x: -out.x, y: -out.y }).toString(), class: 'bpmn-head-line' }))
        break
      }
      case 'dataInputAssociation':
      case 'dataOutputAssociation':
        kids.push(el('path', { d: line.toString(), class: 'bpmn-flow bpmn-association' }))
        kids.push(el('path', { d: lineHead(end, dEnd).toString(), class: 'bpmn-head-line' }))
        break
      case 'conversationLink':
        kids.push(el('path', { d: line.toString(), class: 'bpmn-flow', style: 'stroke-width:5px' }))
        kids.push(el('path', { d: line.toString(), class: 'bpmn-flow', style: 'stroke:var(--bpmn-fill, #ffffff);stroke-width:2px' }))
        break
      default:
        kids.push(el('path', { d: line.toString(), class: 'bpmn-flow' }))
    }
    layers.edges.push(group(element, edge, kids))
    const m = midpoint(points)
    external(element.name, edge.label, { x: m.x, y: m.y - OUTER.size * LINE - 4 }, labelStyle(edge.colors), true)
  }

  // ---------------------------------------------------------------------

  for (const shape of diagram.shapes) {
    const element = model.elements.get(shape.element)
    if (!element) {
      warnings.push(`A shape refers to "${shape.element}", which is not in the file`)
      continue
    }
    const { x, y, width, height } = shape.bounds
    grow(extent, x, y, width, height)
    const type = element.type
    if (EVENTS.has(type)) drawEvent(element, shape)
    else if (TASKS.has(type) || SUBPROCESSES.has(type) || type === 'callActivity') drawActivity(element, shape)
    else if (type.endsWith('Gateway')) drawGateway(element, shape)
    else if (/^data(ObjectReference|Object|StoreReference|Store|Input|Output)$/.test(type)) drawData(element, shape)
    else if (type === 'textAnnotation') drawAnnotation(element, shape)
    else if (type === 'group') drawGroup(element, shape)
    else if (type === 'participant' || type === 'lane') drawSwimlane(element, shape)
    else if (CONVERSATIONS.has(type)) drawConversation(element, shape)
    else drawGeneric(element, shape)
  }
  for (const edge of diagram.edges) {
    const element = model.elements.get(edge.element)
    if (!element) {
      warnings.push(`A flow refers to "${edge.element}", which is not in the file`)
      continue
    }
    drawEdge(element, edge)
  }

  const padding = options.padding ?? 10
  if (!Number.isFinite(extent.minX)) {
    extent.minX = extent.minY = 0
    extent.maxX = extent.maxY = 0
  }
  const x0 = Math.floor(extent.minX - padding)
  const y0 = Math.floor(extent.minY - padding)
  const width = Math.ceil(extent.maxX + padding) - x0
  const height = Math.ceil(extent.maxY + padding) - y0

  const plane = diagram.plane ? model.elements.get(diagram.plane) : undefined
  const processName = [...model.elements.values()].find((e) => e.type === 'process' && e.name)?.name
  const title = options.title ?? diagram.name ?? plane?.name ?? model.definitions.name ?? processName ?? 'BPMN diagram'
  const titleId = `${rootId}-title`

  const root = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      id: rootId,
      class: 'bpmn',
      width,
      height,
      viewBox: `${x0} ${y0} ${width} ${height}`,
      role: 'img',
      'aria-labelledby': titleId,
      style: 'max-width:100%;height:auto',
    },
    [
      el('title', { id: titleId }, [txt(title)]),
      el('style', {}, [txt(stylesheet(rootId))]),
      // Containers are drawn largest first, so a nested one stays visible.
      ...[layers.pools, layers.lanes, [...layers.containers].sort((a, b) => b.area - a.area).map((c) => c.node), layers.shapes, layers.edges, layers.boundary, layers.groups, layers.labels].map((items, i) =>
        el('g', { class: `bpmn-layer bpmn-layer-${['pools', 'lanes', 'containers', 'shapes', 'flows', 'boundary', 'groups', 'labels'][i]}` }, items),
      ),
    ],
  )
  return { svg: serialize(root), width, height, diagram: diagram.id, warnings }
}

/** The text of a BPMN `documentation` element of an element, if any. */
export function documentation(element: BpmnElement): string | undefined {
  const doc = children(element, 'documentation')[0]
  return doc ? textContent(doc) : undefined
}
