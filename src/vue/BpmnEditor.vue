<script setup lang="ts">
/**
 * A BPMN editor: palette, selection, moving and resizing, connecting,
 * a context pad, label editing in place, a properties panel, undo, pan and
 * zoom. The drawing is the core renderer's; the editor adds handles on top
 * and turns gestures into `BpmnDocument` operations.
 *
 * `v-model` is the file's XML. With `readonly` it is a viewer that reports
 * clicks.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { UidButton, UidTooltip } from '@dskripchenko/ui'
import { Download, Maximize, Minus, Palette, PanelRight, Plus, Redo2, Trash2, Undo2, Wrench } from 'lucide-vue-next'
import {
  BpmnDocument,
  BpmnError,
  borderOf,
  defaultSize,
  elementsIn,
  EVENT_TYPES,
  GATEWAY_TYPES,
  hitTest,
  isActivity,
  isEvent,
  isFlow,
  isFlowNode,
  isFrame,
  isGateway,
  isResizable,
  isSubProcess,
  render,
  TASK_TYPES,
  type Bounds,
  type Point,
  type ShapeType,
} from '../index'
import { bpmnIcon } from './icons'
import { resolveLabels, type BpmnLabels } from './labels'
import { canvasMeasurer } from './measure'
import { useViewport } from './useViewport'
import BpmnProperties from './BpmnProperties.vue'

const props = withDefaults(
  defineProps<{
    /** The file's XML; empty for a new diagram. */
    modelValue?: string | null
    readonly?: boolean
    /** Shows the properties panel from the start. */
    properties?: boolean
    /** Which diagram of the file: its id or index. */
    diagram?: string | number
    /** Elements to outline (a viewer's highlight). */
    highlight?: string[]
    locale?: string
    labels?: Partial<BpmnLabels>
  }>(),
  { modelValue: null, readonly: false, properties: false, diagram: undefined, highlight: () => [], locale: undefined, labels: undefined },
)

const emit = defineEmits<{
  'update:modelValue': [xml: string]
  change: [xml: string]
  select: [ids: string[]]
  /** A click on an element (in a viewer, the only interaction). */
  elementClick: [id: string]
  /** An operation the notation does not allow, or a file that cannot be read. */
  error: [error: Error]
}>()

const L = computed(() => resolveLabels(props.locale, props.labels))
const uid = `bpmn-ed-${Math.random().toString(36).slice(2, 9)}`

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

function openDocument(xml: string | null): BpmnDocument {
  try {
    return new BpmnDocument(xml || undefined, { diagram: props.diagram })
  } catch (e) {
    emit('error', e as Error)
    return new BpmnDocument(undefined)
  }
}

const doc = shallowRef(openDocument(props.modelValue))
const version = ref(0)
let lastXml = doc.value.xml
let unsubscribe = doc.value.onChange(changed)

function changed(): void {
  version.value++
  lastXml = doc.value.xml
  emit('update:modelValue', lastXml)
  emit('change', lastXml)
  selection.value = selection.value.filter((id) => doc.value.element(id))
}

watch(
  () => props.modelValue,
  (xml) => {
    if (xml === lastXml || (!xml && version.value === 0)) return
    unsubscribe()
    doc.value = openDocument(xml)
    unsubscribe = doc.value.onChange(changed)
    lastXml = doc.value.xml
    selection.value = []
    version.value++
    nextTick(() => fit())
  },
)

const model = computed(() => (version.value, doc.value.model))
const diagram = computed(() => (version.value, doc.value.diagram))
const measure = canvasMeasurer('Arial, "Helvetica Neue", Helvetica, sans-serif')
const drawing = computed(() => render(model.value, { nested: true, idPrefix: uid, measureText: measure, diagram: props.diagram, padding: 0 }))

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch (e) {
    if (e instanceof BpmnError) {
      flash(e.message === 'Place it inside a pool' ? L.value.placeInPool : e.message)
      emit('error', e)
      return undefined
    }
    throw e
  }
}

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

const root = ref<HTMLElement | null>(null)
/** The canvas area: the viewport's size and origin (the properties panel is beside it). */
const stage = ref<HTMLElement | null>(null)
const vp = useViewport(stage, () => ({ min: 0.2, max: 4 }))
const view = vp.view
const transform = computed(() => `translate(${view.value.x},${view.value.y}) scale(${view.value.k})`)
const zoomLabel = computed(() => `${Math.round(view.value.k * 100)}%`)

function contentBounds(): { x: number; y: number; w: number; h: number } {
  const shapes = diagram.value.shapes
  if (shapes.length === 0) return { x: 0, y: 0, w: 400, h: 300 }
  const xs = shapes.flatMap((s) => [s.bounds.x, s.bounds.x + s.bounds.width])
  const ys = shapes.flatMap((s) => [s.bounds.y, s.bounds.y + s.bounds.height])
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

function fit(smooth = false): void {
  // Room for the palette on the left.
  vp.fit(contentBounds(), smooth, props.readonly ? 24 : 72)
}

let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  const el = stage.value!
  const measureSize = () => {
    vp.size.value = { width: el.clientWidth, height: el.clientHeight }
  }
  measureSize()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measureSize)
    resizeObserver.observe(el)
  }
  fit()
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  vp.dispose()
  unsubscribe()
  window.removeEventListener('keyup', onKeyUp)
})

function screenOf(p: Point): Point {
  const v = view.value
  return { x: p.x * v.k + v.x, y: p.y * v.k + v.y }
}

// ---------------------------------------------------------------------------
// Selection and gestures
// ---------------------------------------------------------------------------

const selection = ref<string[]>([])
watch(selection, (ids) => emit('select', ids))

type Interaction =
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'move'; start: Point; dx: number; dy: number; armed: boolean }
  | { kind: 'marquee'; start: Point; end: Point }
  | { kind: 'resize'; id: string; handle: string; start: Point; from: Bounds; bounds: Bounds }

type Mode =
  | { kind: 'idle' }
  | { kind: 'create'; type: ShapeType; at?: Point; attach?: string }
  | { kind: 'connect'; source: string; at?: Point; target?: string; ok: boolean }

const inter = shallowRef<Interaction | null>(null)
const mode = shallowRef<Mode>({ kind: 'idle' })
const hovered = ref<string | undefined>()
const spaceDown = ref(false)

const typeOf = (id: string) => model.value.elements.get(id)?.type ?? ''
const shapeOf = (id: string) => diagram.value.shapes.find((s) => s.element === id)
const edgeOf = (id: string) => diagram.value.edges.find((e) => e.element === id)

function world(e: PointerEvent | MouseEvent): Point {
  return vp.clientToWorld(e.clientX, e.clientY)
}

const snap = (n: number) => Math.round(n / 5) * 5

function onPointerDown(e: PointerEvent): void {
  root.value?.focus({ preventScroll: true })
  closeMenu()
  if (editing.value) commitEdit()
  const p = world(e)
  if (e.button === 1 || spaceDown.value || (props.readonly && e.button === 0 && !hitTest(model.value, diagram.value, p, 6 / view.value.k))) {
    inter.value = { kind: 'pan', x: e.clientX, y: e.clientY }
    capture(e)
    return
  }
  if (e.button !== 0) return
  const m = mode.value
  if (m.kind === 'create') {
    place(m.type, p, m.attach)
    return
  }
  if (m.kind === 'connect') {
    finishConnect()
    return
  }
  const handle = (e.target as Element | null)?.getAttribute?.('data-handle')
  if (handle && selection.value.length === 1) {
    const s = shapeOf(selection.value[0]!)
    if (s) {
      inter.value = { kind: 'resize', id: s.element, handle, start: p, from: s.bounds, bounds: s.bounds }
      capture(e)
      return
    }
  }
  const hit = hitTest(model.value, diagram.value, p, 6 / view.value.k)
  if (props.readonly) {
    if (hit) emit('elementClick', hit)
    return
  }
  if (hit) {
    if (e.shiftKey) selection.value = selection.value.includes(hit) ? selection.value.filter((x) => x !== hit) : [...selection.value, hit]
    else if (!selection.value.includes(hit)) selection.value = [hit]
    emit('elementClick', hit)
    if (!isFlow(typeOf(hit))) inter.value = { kind: 'move', start: p, dx: 0, dy: 0, armed: false }
  } else {
    if (!e.shiftKey) selection.value = []
    inter.value = { kind: 'marquee', start: p, end: p }
  }
  capture(e)
}

function capture(e: PointerEvent): void {
  try {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  } catch {
    // Not every target can capture (synthetic events in tests).
  }
}

function onPointerMove(e: PointerEvent): void {
  const p = world(e)
  const i = inter.value
  const m = mode.value
  if (i?.kind === 'pan') {
    vp.panBy(e.clientX - i.x, e.clientY - i.y)
    inter.value = { ...i, x: e.clientX, y: e.clientY }
    return
  }
  if (i?.kind === 'move') {
    const dx = p.x - i.start.x
    const dy = p.y - i.start.y
    const armed = i.armed || Math.hypot(dx, dy) * view.value.k > 3
    inter.value = { ...i, dx: snap(dx), dy: snap(dy), armed }
    return
  }
  if (i?.kind === 'marquee') {
    inter.value = { ...i, end: p }
    return
  }
  if (i?.kind === 'resize') {
    inter.value = { ...i, bounds: resized(i.from, i.handle, p.x - i.start.x, p.y - i.start.y) }
    return
  }
  if (m.kind === 'create') {
    const attach = m.type === 'intermediateThrowEvent' ? borderOf(model.value, diagram.value, p) : undefined
    mode.value = { ...m, at: p, attach }
    return
  }
  if (m.kind === 'connect') {
    const target = hitTest(model.value, diagram.value, p, 6 / view.value.k)
    const ok = !!target && target !== m.source && doc.value.canConnect(m.source, target) !== null
    mode.value = { ...m, at: p, target, ok }
    return
  }
  hovered.value = hitTest(model.value, diagram.value, p, 6 / view.value.k)
}

function onPointerUp(): void {
  const i = inter.value
  inter.value = null
  if (!i) return
  if (i.kind === 'move' && i.armed && (i.dx !== 0 || i.dy !== 0)) {
    const ids = selection.value.filter((id) => !isFlow(typeOf(id)))
    attempt(() => doc.value.move(ids, i.dx, i.dy))
  } else if (i.kind === 'marquee') {
    const r = rectOf(i.start, i.end)
    if (r.width * view.value.k > 3 || r.height * view.value.k > 3) {
      const inside = elementsIn(model.value, diagram.value, r)
      selection.value = [...new Set([...selection.value, ...inside])]
    }
  } else if (i.kind === 'resize') {
    if (JSON.stringify(i.bounds) !== JSON.stringify(i.from)) attempt(() => doc.value.resize(i.id, i.bounds))
  }
}

function rectOf(a: Point, b: Point): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

function resized(from: Bounds, handle: string, dx: number, dy: number): Bounds {
  let { x, y, width, height } = from
  const min = 30
  if (handle.includes('e')) width = Math.max(min, snap(from.width + dx))
  if (handle.includes('s')) height = Math.max(min, snap(from.height + dy))
  if (handle.includes('w')) {
    width = Math.max(min, snap(from.width - dx))
    x = from.x + from.width - width
  }
  if (handle.includes('n')) {
    height = Math.max(min, snap(from.height - dy))
    y = from.y + from.height - height
  }
  return { x, y, width, height }
}

function onWheel(e: WheelEvent): void {
  if (e.ctrlKey || e.metaKey) vp.zoomBy(Math.exp(-e.deltaY * 0.002), vp.clientToLocal(e.clientX, e.clientY))
  else vp.panBy(-e.deltaX, -e.deltaY)
}

function onDblClick(e: MouseEvent): void {
  if (props.readonly) return
  const hit = hitTest(model.value, diagram.value, world(e), 6 / view.value.k)
  if (hit) startEdit(hit)
}

// ---------------------------------------------------------------------------
// Creating and connecting
// ---------------------------------------------------------------------------

const palette: { type: ShapeType; icon: string }[] = [
  { type: 'startEvent', icon: 'startEvent' },
  { type: 'intermediateThrowEvent', icon: 'intermediateThrowEvent' },
  { type: 'endEvent', icon: 'endEvent' },
  { type: 'exclusiveGateway', icon: 'gateway' },
  { type: 'task', icon: 'task' },
  { type: 'subProcess', icon: 'subProcess' },
  { type: 'dataObjectReference', icon: 'dataObjectReference' },
  { type: 'dataStoreReference', icon: 'dataStoreReference' },
  { type: 'participant', icon: 'participant' },
  { type: 'group', icon: 'group' },
  { type: 'textAnnotation', icon: 'textAnnotation' },
]

function pick(type: ShapeType): void {
  closeMenu()
  mode.value = mode.value.kind === 'create' && mode.value.type === type ? { kind: 'idle' } : { kind: 'create', type }
}

function place(type: ShapeType, at: Point, attach?: string): void {
  mode.value = { kind: 'idle' }
  const p = { x: snap(at.x), y: snap(at.y) }
  const id = attempt(() =>
    attach ? doc.value.createShape('boundaryEvent', p, { attachTo: attach }) : doc.value.createShape(type, p),
  )
  if (!id) return
  selection.value = [id]
  if (isActivity(type) || type === 'textAnnotation' || type === 'participant') nextTick(() => startEdit(id))
}

const ghost = computed(() => {
  const m = mode.value
  if (m.kind !== 'create' || !m.at) return null
  const size = defaultSize(m.attach ? 'boundaryEvent' : m.type, true)
  return { x: m.at.x - size.width / 2, y: m.at.y - size.height / 2, width: size.width, height: size.height, round: isEvent(m.type) }
})

function startConnect(source: string): void {
  mode.value = { kind: 'connect', source, ok: false }
}

function finishConnect(): void {
  const m = mode.value
  mode.value = { kind: 'idle' }
  if (m.kind !== 'connect' || !m.target || m.target === m.source) return
  if (!m.ok) {
    flash(L.value.notAllowed)
    return
  }
  const id = attempt(() => doc.value.connect(m.source, m.target!))
  if (id) selection.value = [id]
}

const connectLine = computed(() => {
  const m = mode.value
  if (m.kind !== 'connect' || !m.at) return null
  const s = shapeOf(m.source)
  if (!s) return null
  return { x1: s.bounds.x + s.bounds.width / 2, y1: s.bounds.y + s.bounds.height / 2, x2: m.at.x, y2: m.at.y, ok: m.ok }
})

/** Appends a new element to the right of `source` and connects it. */
function append(source: string, type: ShapeType): void {
  const s = shapeOf(source)
  if (!s) return
  const size = defaultSize(type)
  const b = s.bounds
  const x = b.x + b.width + 60 + size.width / 2
  let y = b.y + b.height / 2
  const free = (cy: number) =>
    !diagram.value.shapes.some((o) => {
      if (isFrame(model.value, diagram.value, o)) return false
      const ob = o.bounds
      return x + size.width / 2 > ob.x && x - size.width / 2 < ob.x + ob.width && cy + size.height / 2 > ob.y && cy - size.height / 2 < ob.y + ob.height
    })
  for (let i = 0; i < 6 && !free(y); i++) y += size.height + 40
  const created = attempt(() => {
    const id = doc.value.createShape(type, { x, y })
    doc.value.connect(source, id)
    return id
  })
  if (!created) return
  selection.value = [created]
  if (isActivity(type)) nextTick(() => startEdit(created))
}

function annotate(source: string): void {
  const s = shapeOf(source)
  if (!s) return
  const created = attempt(() => {
    const id = doc.value.createShape('textAnnotation', { x: s.bounds.x + s.bounds.width + 100, y: s.bounds.y - 50 })
    doc.value.connect(id, source)
    return id
  })
  if (created) {
    selection.value = [created]
    nextTick(() => startEdit(created))
  }
}

// ---------------------------------------------------------------------------
// Context pad and menus
// ---------------------------------------------------------------------------

const single = computed(() => (selection.value.length === 1 ? selection.value[0]! : undefined))

const pad = computed(() => {
  const id = single.value
  if (!id || props.readonly || inter.value || mode.value.kind !== 'idle' || editing.value) return null
  const type = typeOf(id)
  const s = shapeOf(id)
  const e = edgeOf(id)
  let anchor: Point
  if (s) anchor = screenOf({ x: s.bounds.x + s.bounds.width, y: s.bounds.y })
  else if (e && e.waypoints.length > 0) anchor = screenOf(e.waypoints[e.waypoints.length - 1]!)
  else return null
  const actions: { id: string; label: string; icon: unknown; run: () => void; danger?: boolean }[] = []
  if (isFlowNode(type) && type !== 'endEvent') {
    actions.push(
      { id: 'task', label: L.value.appendTask, icon: bpmnIcon('task'), run: () => append(id, 'task') },
      { id: 'gateway', label: L.value.appendGateway, icon: bpmnIcon('gateway'), run: () => append(id, 'exclusiveGateway') },
      { id: 'intermediate', label: L.value.appendIntermediate, icon: bpmnIcon('intermediateThrowEvent'), run: () => append(id, 'intermediateThrowEvent') },
      { id: 'end', label: L.value.appendEnd, icon: bpmnIcon('endEvent'), run: () => append(id, 'endEvent') },
    )
  }
  if (s && type !== 'lane' && type !== 'group') actions.push({ id: 'connect', label: L.value.connect, icon: bpmnIcon('connect'), run: () => startConnect(id) })
  if (s && type !== 'textAnnotation' && type !== 'lane' && type !== 'group') actions.push({ id: 'annotate', label: L.value.annotate, icon: bpmnIcon('textAnnotation'), run: () => annotate(id) })
  if (type === 'participant' && doc.value.processOf(id)) actions.push({ id: 'lane', label: L.value.addLane, icon: bpmnIcon('lane'), run: () => addLane(id) })
  if (type === 'lane') actions.push({ id: 'lane', label: L.value.addLane, icon: bpmnIcon('lane'), run: () => addLane(id) })
  if (typeChoices(type).length > 1) actions.push({ id: 'type', label: L.value.changeType, icon: Wrench, run: () => openMenu('type', id) })
  if (type !== 'lane') actions.push({ id: 'color', label: L.value.color, icon: Palette, run: () => openMenu('color', id) })
  actions.push({ id: 'delete', label: L.value.delete, icon: Trash2, run: () => removeSelection(), danger: true })
  return { x: anchor.x + 8, y: anchor.y, actions }
})

function addLane(id: string): void {
  const pool = typeOf(id) === 'lane' ? diagram.value.shapes.find((s) => typeOf(s.element) === 'participant' && doc.value.processOf(s.element) === doc.value.processOf(id))?.element : id
  if (pool) attempt(() => doc.value.addLane(pool))
}

function typeChoices(type: string): string[] {
  if (type === 'boundaryEvent') return []
  if (isEvent(type)) return EVENT_TYPES.filter((t) => t !== 'boundaryEvent')
  if (isGateway(type)) return [...GATEWAY_TYPES]
  if (isActivity(type)) return [...TASK_TYPES, 'callActivity', 'subProcess', 'transaction', 'adHocSubProcess']
  return []
}

const COLORS: { fill?: string; stroke?: string; swatch: string }[] = [
  { swatch: 'transparent' },
  { fill: '#bbdefb', stroke: '#0d4372', swatch: '#bbdefb' },
  { fill: '#ffe0b2', stroke: '#6b3c00', swatch: '#ffe0b2' },
  { fill: '#c8e6c9', stroke: '#205022', swatch: '#c8e6c9' },
  { fill: '#ffcdd2', stroke: '#831311', swatch: '#ffcdd2' },
  { fill: '#e1bee7', stroke: '#5b176d', swatch: '#e1bee7' },
]

const menu = shallowRef<{ kind: 'type' | 'color' | 'download'; id?: string; x: number; y: number } | null>(null)

function openMenu(kind: 'type' | 'color' | 'download', id?: string): void {
  const p = pad.value
  menu.value = { kind, id, x: p ? p.x + 40 : 0, y: p ? p.y : 0 }
}

function closeMenu(): void {
  menu.value = null
}

function setType(id: string, type: string): void {
  closeMenu()
  attempt(() => doc.value.setType(id, type))
}

function setColor(c: { fill?: string; stroke?: string }): void {
  const ids = selection.value
  closeMenu()
  attempt(() => doc.value.setColors(ids, { fill: c.fill, stroke: c.stroke }))
}

function removeSelection(): void {
  const ids = selection.value
  if (ids.length === 0) return
  attempt(() => doc.value.remove(ids))
  selection.value = []
}

// ---------------------------------------------------------------------------
// Label editing
// ---------------------------------------------------------------------------

const editing = shallowRef<{ id: string; text: string; box: Bounds; inside: boolean } | null>(null)
const editor = ref<HTMLTextAreaElement | null>(null)

function startEdit(id: string): void {
  const e = model.value.elements.get(id)
  if (!e) return
  const s = shapeOf(id)
  const edge = edgeOf(id)
  let box: Bounds
  let inside = false
  const type = e.type
  if (s && (isActivity(type) || type === 'textAnnotation' || (type === 'participant' && !isFrame(model.value, diagram.value, s)))) {
    inside = true
    box = isSubProcess(type) && isFrame(model.value, diagram.value, s) ? { x: s.bounds.x, y: s.bounds.y, width: s.bounds.width, height: 36 } : s.bounds
  } else if (s && (type === 'participant' || type === 'lane')) {
    inside = true
    box = { x: s.bounds.x, y: s.bounds.y + s.bounds.height / 2 - 24, width: 160, height: 48 }
  } else if (s && type === 'group') {
    box = { x: s.bounds.x + s.bounds.width / 2 - 60, y: s.bounds.y + 4, width: 120, height: 36 }
  } else if (s) {
    const l = s.label
    box = l ? { x: l.x + l.width / 2 - 50, y: l.y - 2, width: 100, height: Math.max(36, l.height + 8) } : { x: s.bounds.x + s.bounds.width / 2 - 50, y: s.bounds.y + s.bounds.height + 4, width: 100, height: 36 }
  } else if (edge) {
    const mid = edge.waypoints[Math.floor((edge.waypoints.length - 1) / 2)]!
    const l = edge.label
    box = l ? { x: l.x + l.width / 2 - 50, y: l.y - 2, width: 100, height: 36 } : { x: mid.x - 50, y: mid.y - 40, width: 100, height: 36 }
  } else return
  selection.value = [id]
  editing.value = { id, text: e.name ?? '', box, inside }
  nextTick(() => {
    editor.value?.focus()
    editor.value?.select()
  })
}

const editorStyle = computed(() => {
  const ed = editing.value
  if (!ed) return {}
  const p = screenOf({ x: ed.box.x, y: ed.box.y })
  const k = view.value.k
  return {
    left: `${p.x}px`,
    top: `${p.y}px`,
    width: `${ed.box.width * k}px`,
    height: `${ed.box.height * k}px`,
    fontSize: `${(ed.inside ? 12 : 11) * k}px`,
  }
})

function commitEdit(): void {
  const ed = editing.value
  if (!ed) return
  editing.value = null
  const text = editor.value?.value ?? ed.text
  if (text !== (model.value.elements.get(ed.id)?.name ?? '')) attempt(() => doc.value.rename(ed.id, text))
  root.value?.focus({ preventScroll: true })
}

function onEditorKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    editing.value = null
    root.value?.focus({ preventScroll: true })
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    commitEdit()
  }
  e.stopPropagation()
}

// ---------------------------------------------------------------------------
// Keyboard, history, messages
// ---------------------------------------------------------------------------

function undo(): void {
  doc.value.undo()
}

function redo(): void {
  doc.value.redo()
}

function onKey(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  const mod = e.ctrlKey || e.metaKey
  if (e.key === ' ') {
    spaceDown.value = true
    e.preventDefault()
    return
  }
  if (e.key === 'Escape') {
    mode.value = { kind: 'idle' }
    closeMenu()
    selection.value = []
    return
  }
  if (props.readonly) return
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    redo()
  } else if (mod && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    selection.value = diagram.value.shapes.filter((s) => typeOf(s.element) !== 'lane').map((s) => s.element)
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    removeSelection()
  } else if (e.key.startsWith('Arrow') && selection.value.length > 0) {
    e.preventDefault()
    const step = e.shiftKey ? 10 : 1
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0]
    const ids = selection.value.filter((id) => !isFlow(typeOf(id)))
    attempt(() => doc.value.move(ids, d[0]!, d[1]!))
  } else if (e.key === 'F2' && single.value) {
    startEdit(single.value)
  }
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.key === ' ') spaceDown.value = false
}

const message = ref('')
let messageTimer: ReturnType<typeof setTimeout> | undefined
function flash(text: string): void {
  message.value = text
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => (message.value = ''), 3000)
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function outline(id: string, pad = 4): { d: string } | null {
  const s = shapeOf(id)
  if (s) {
    const b = s.bounds
    return { d: `M${b.x - pad},${b.y - pad}h${b.width + 2 * pad}v${b.height + 2 * pad}h${-(b.width + 2 * pad)}Z` }
  }
  const e = edgeOf(id)
  if (e && e.waypoints.length > 1) return { d: e.waypoints.map((w, i) => `${i === 0 ? 'M' : 'L'}${w.x},${w.y}`).join('') }
  return null
}

const selectedOutlines = computed(() =>
  selection.value.map((id) => ({ id, o: outline(id), edge: !shapeOf(id) })).filter((x): x is { id: string; o: { d: string }; edge: boolean } => !!x.o),
)
const highlightOutlines = computed(() => props.highlight.map((id) => ({ id, o: outline(id, 6), edge: !shapeOf(id) })).filter((x) => x.o))
const hoverOutline = computed(() => (hovered.value && !selection.value.includes(hovered.value) && !props.readonly ? outline(hovered.value) : null))

const moveGhosts = computed(() => {
  const i = inter.value
  if (i?.kind !== 'move' || !i.armed) return []
  return selection.value
    .map((id) => shapeOf(id))
    .filter((s) => !!s)
    .map((s) => ({ id: s!.element, x: s!.bounds.x + i.dx, y: s!.bounds.y + i.dy, width: s!.bounds.width, height: s!.bounds.height }))
})

const marquee = computed(() => (inter.value?.kind === 'marquee' ? rectOf(inter.value.start, inter.value.end) : null))
const resizing = computed(() => (inter.value?.kind === 'resize' ? inter.value.bounds : null))

const handles = computed(() => {
  const id = single.value
  if (!id || props.readonly || inter.value?.kind === 'move' || mode.value.kind !== 'idle') return []
  const s = shapeOf(id)
  if (!s || !isResizable(typeOf(id))) return []
  const b = inter.value?.kind === 'resize' ? inter.value.bounds : s.bounds
  const k = view.value.k
  const size = 8 / k
  const at = (h: string, x: number, y: number) => ({ h, x: x - size / 2, y: y - size / 2, size })
  return [at('nw', b.x, b.y), at('ne', b.x + b.width, b.y), at('sw', b.x, b.y + b.height), at('se', b.x + b.width, b.y + b.height)]
})

const dropTarget = computed(() => {
  const m = mode.value
  if (m.kind === 'connect' && m.target && m.target !== m.source) return { o: outline(m.target, 6), ok: m.ok }
  if (m.kind === 'create' && m.attach) return { o: outline(m.attach, 6), ok: true }
  return null
})

const dotGap = computed(() => 20 * view.value.k)
const cursor = computed(() => {
  if (inter.value?.kind === 'pan' || spaceDown.value) return 'grabbing'
  if (mode.value.kind !== 'idle') return 'crosshair'
  if (hovered.value) return props.readonly ? 'pointer' : 'move'
  return props.readonly ? 'grab' : 'default'
})

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

function save(name: string, type: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fileName(): string {
  const plane = diagram.value.plane ? model.value.elements.get(diagram.value.plane) : undefined
  const process = [...model.value.elements.values()].find((e) => e.type === 'process' && e.name)
  return (plane?.name ?? process?.name ?? 'diagram').replace(/[\\/:*?"<>|]+/g, '_')
}

function downloadXml(): void {
  closeMenu()
  save(`${fileName()}.bpmn`, 'application/xml', doc.value.xml)
}

function downloadSvg(): void {
  closeMenu()
  save(`${fileName()}.svg`, 'image/svg+xml', render(model.value, { diagram: props.diagram, measureText: measure }).svg)
}

const showProperties = ref(props.properties)

defineExpose({
  /** The editable document: every operation of the core is available. */
  document: computed(() => doc.value),
  fit,
  undo,
  redo,
  /** The diagram as a standalone SVG. */
  toSvg: () => render(model.value, { diagram: props.diagram, measureText: measure }).svg,
  selection,
})
</script>

<template>
  <div
    ref="root"
    class="bpmn-ed"
    :class="{ 'bpmn-ed--readonly': readonly, 'bpmn-ed--props': showProperties && !readonly }"
    tabindex="0"
    @keydown="onKey"
  >
    <div
      ref="stage"
      class="bpmn-ed-stage"
    >
      <svg
        class="bpmn-ed-canvas"
        :style="{ cursor }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="hovered = undefined"
        @wheel.prevent="onWheel"
        @dblclick="onDblClick"
        @contextmenu.prevent
      >
        <defs>
          <pattern
            :id="`${uid}-grid`"
            :width="dotGap"
            :height="dotGap"
            patternUnits="userSpaceOnUse"
            :x="view.x % dotGap"
            :y="view.y % dotGap"
          >
            <circle
              :cx="1"
              :cy="1"
              :r="Math.max(0.6, Math.min(1.2, view.k))"
              class="bpmn-ed-dot"
            />
          </pattern>
        </defs>
        <rect
          v-if="!readonly"
          width="100%"
          height="100%"
          :fill="`url(#${uid}-grid)`"
        />
        <g :transform="transform">
          <!-- The core renderer's drawing: escaped by its SVG builder. -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <g v-html="drawing.svg" />
          <g class="bpmn-ed-overlay">
            <path
              v-if="hoverOutline"
              :d="hoverOutline.d"
              class="bpmn-ed-hover"
              :stroke-width="1 / view.k"
            />
            <path
              v-for="h in highlightOutlines"
              :key="`h-${h.id}`"
              :d="h.o!.d"
              class="bpmn-ed-highlight"
              :class="{ 'bpmn-ed-edge-outline': h.edge }"
              :stroke-width="(h.edge ? 6 : 3) / view.k"
            />
            <path
              v-for="s in selectedOutlines"
              :key="`s-${s.id}`"
              :d="s.o.d"
              class="bpmn-ed-selected"
              :class="{ 'bpmn-ed-edge-outline': s.edge }"
              :stroke-width="(s.edge ? 5 : 1.5) / view.k"
            />
            <rect
              v-for="g in moveGhosts"
              :key="`g-${g.id}`"
              :x="g.x"
              :y="g.y"
              :width="g.width"
              :height="g.height"
              class="bpmn-ed-ghost"
              :stroke-width="1.5 / view.k"
            />
            <rect
              v-if="resizing"
              :x="resizing.x"
              :y="resizing.y"
              :width="resizing.width"
              :height="resizing.height"
              class="bpmn-ed-ghost"
              :stroke-width="1.5 / view.k"
            />
            <rect
              v-if="marquee"
              :x="marquee.x"
              :y="marquee.y"
              :width="marquee.width"
              :height="marquee.height"
              class="bpmn-ed-marquee"
              :stroke-width="1 / view.k"
            />
            <path
              v-if="dropTarget?.o"
              :d="dropTarget.o.d"
              :class="dropTarget.ok ? 'bpmn-ed-drop' : 'bpmn-ed-drop-bad'"
              :stroke-width="2 / view.k"
            />
            <line
              v-if="connectLine"
              v-bind="connectLine"
              class="bpmn-ed-connect"
              :class="{ 'bpmn-ed-connect--ok': connectLine.ok }"
              :stroke-width="1.5 / view.k"
            />
            <template v-if="ghost">
              <ellipse
                v-if="ghost.round"
                :cx="ghost.x + ghost.width / 2"
                :cy="ghost.y + ghost.height / 2"
                :rx="ghost.width / 2"
                :ry="ghost.height / 2"
                class="bpmn-ed-ghost"
                :stroke-width="1.5 / view.k"
              />
              <rect
                v-else
                :x="ghost.x"
                :y="ghost.y"
                :width="ghost.width"
                :height="ghost.height"
                rx="6"
                class="bpmn-ed-ghost"
                :stroke-width="1.5 / view.k"
              />
            </template>
            <rect
              v-for="h in handles"
              :key="h.h"
              :x="h.x"
              :y="h.y"
              :width="h.size"
              :height="h.size"
              :data-handle="h.h"
              class="bpmn-ed-handle"
              :class="`bpmn-ed-handle--${h.h}`"
              :stroke-width="1 / view.k"
            />
          </g>
        </g>
      </svg>

      <!-- Palette -->
      <div
        v-if="!readonly"
        class="bpmn-ed-panel bpmn-ed-palette"
        role="toolbar"
      >
        <UidTooltip
          v-for="item in palette"
          :key="item.type"
          :content="L.palette[item.type] ?? item.type"
          placement="right"
        >
          <UidButton
            size="sm"
            :variant="mode.kind === 'create' && mode.type === item.type ? 'secondary' : 'ghost'"
            :icon="bpmnIcon(item.icon)"
            :aria-label="L.palette[item.type] ?? item.type"
            :data-palette="item.type"
            @click="pick(item.type)"
          />
        </UidTooltip>
      </div>

      <!-- Context pad -->
      <div
        v-if="pad"
        class="bpmn-ed-panel bpmn-ed-pad"
        :style="{ left: `${pad.x}px`, top: `${pad.y}px` }"
      >
        <UidTooltip
          v-for="a in pad.actions"
          :key="a.id"
          :content="a.label"
          placement="top"
        >
          <UidButton
            size="sm"
            :variant="a.danger ? 'ghost' : 'ghost'"
            :icon="a.icon as any"
            :aria-label="a.label"
            :data-action="a.id"
            :class="{ 'bpmn-ed-danger': a.danger }"
            @click="a.run()"
          />
        </UidTooltip>
      </div>

      <!-- Menus -->
      <div
        v-if="menu"
        class="bpmn-ed-panel bpmn-ed-menu"
        :class="`bpmn-ed-menu--${menu.kind}`"
        :style="menu.kind === 'download' ? {} : { left: `${menu.x}px`, top: `${menu.y}px` }"
      >
        <template v-if="menu.kind === 'type' && menu.id">
          <button
            v-for="t in typeChoices(typeOf(menu.id))"
            :key="t"
            type="button"
            class="bpmn-ed-menu-item"
            :class="{ 'bpmn-ed-menu-item--current': t === typeOf(menu.id) }"
            :data-type="t"
            @click="setType(menu.id!, t)"
          >
            {{ L.types[t] ?? t }}
          </button>
        </template>
        <div
          v-else-if="menu.kind === 'color'"
          class="bpmn-ed-swatches"
        >
          <button
            v-for="(c, i) in COLORS"
            :key="i"
            type="button"
            class="bpmn-ed-swatch"
            :style="{ background: c.swatch, borderColor: c.stroke ?? 'var(--bpmn-ed-border)' }"
            :aria-label="c.fill ?? L.noColor"
            :title="c.fill ?? L.noColor"
            @click="setColor(c)"
          />
        </div>
        <template v-else-if="menu.kind === 'download'">
          <button
            type="button"
            class="bpmn-ed-menu-item"
            data-download="xml"
            @click="downloadXml"
          >
            {{ L.downloadXml }}
          </button>
          <button
            type="button"
            class="bpmn-ed-menu-item"
            data-download="svg"
            @click="downloadSvg"
          >
            {{ L.downloadSvg }}
          </button>
        </template>
      </div>

      <!-- Label editor -->
      <textarea
        v-if="editing"
        ref="editor"
        class="bpmn-ed-text"
        :class="{ 'bpmn-ed-text--inside': editing.inside }"
        :style="editorStyle"
        :value="editing.text"
        spellcheck="false"
        @keydown="onEditorKey"
        @blur="commitEdit"
      />

      <!-- Controls -->
      <div class="bpmn-ed-panel bpmn-ed-controls">
        <template v-if="!readonly">
          <UidTooltip
            :content="L.undo"
            placement="top"
          >
            <UidButton
              size="sm"
              variant="ghost"
              :icon="Undo2"
              :aria-label="L.undo"
              :disabled="(version, !doc.canUndo)"
              data-control="undo"
              @click="undo"
            />
          </UidTooltip>
          <UidTooltip
            :content="L.redo"
            placement="top"
          >
            <UidButton
              size="sm"
              variant="ghost"
              :icon="Redo2"
              :aria-label="L.redo"
              :disabled="(version, !doc.canRedo)"
              data-control="redo"
              @click="redo"
            />
          </UidTooltip>
          <span class="bpmn-ed-sep" />
        </template>
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Minus"
          :aria-label="L.zoomOut"
          @click="vp.zoomBy(1 / 1.2, undefined, true)"
        />
        <button
          type="button"
          class="bpmn-ed-zoom"
          :title="L.fit"
          @click="fit(true)"
        >
          {{ zoomLabel }}
        </button>
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Plus"
          :aria-label="L.zoomIn"
          @click="vp.zoomBy(1.2, undefined, true)"
        />
        <UidTooltip
          :content="L.fit"
          placement="top"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="Maximize"
            :aria-label="L.fit"
            data-control="fit"
            @click="fit(true)"
          />
        </UidTooltip>
        <template v-if="!readonly">
          <span class="bpmn-ed-sep" />
          <UidTooltip
            :content="L.download"
            placement="top"
          >
            <UidButton
              size="sm"
              variant="ghost"
              :icon="Download"
              :aria-label="L.download"
              data-control="download"
              @click="menu?.kind === 'download' ? closeMenu() : openMenu('download')"
            />
          </UidTooltip>
          <UidTooltip
            :content="L.properties"
            placement="top"
          >
            <UidButton
              size="sm"
              :variant="showProperties ? 'secondary' : 'ghost'"
              :icon="PanelRight"
              :aria-label="L.properties"
              data-control="properties"
              @click="showProperties = !showProperties"
            />
          </UidTooltip>
        </template>
      </div>

      <div
        v-if="message"
        class="bpmn-ed-message"
        role="status"
      >
        {{ message }}
      </div>
    </div>

    <BpmnProperties
      v-if="showProperties && !readonly"
      class="bpmn-ed-properties"
      :document="doc"
      :version="version"
      :selection="selection"
      :labels="L"
      @error="(e: Error) => (e instanceof BpmnError ? flash(e.message) : null, emit('error', e))"
    />
  </div>
</template>
