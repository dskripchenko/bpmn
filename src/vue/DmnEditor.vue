<script setup lang="ts">
/**
 * A DMN editor: the decision requirements diagram — palette, selection,
 * moving and resizing, connecting, names typed in place — and, one click
 * away, the logic of each decision: a decision table or a literal
 * expression. `v-model` is the file's XML; `readonly` makes it a viewer.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { UidButton, UidTooltip } from '@dskripchenko/ui'
import { ArrowLeft, Download, Maximize, Minus, Palette, Plus, Redo2, Table, Trash2, Undo2 } from 'lucide-vue-next'
import { BpmnError, distanceToPath, DmnDocument, dmnSize, renderDecision, renderDmn, type Bounds, type DrdShapeType, type Point } from '../index'
import { bpmnIcon } from './icons'
import { resolveDmnLabels, type DmnLabels } from './dmnLabels'
import { canvasMeasurer } from './measure'
import { useViewport } from './useViewport'
import DecisionTableEditor from './DecisionTableEditor.vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    readonly?: boolean
    /** Opens this decision's logic instead of the diagram. */
    decision?: string
    highlight?: string[]
    locale?: string
    labels?: Partial<DmnLabels>
  }>(),
  { modelValue: null, readonly: false, decision: undefined, highlight: () => [], locale: undefined, labels: undefined },
)

const emit = defineEmits<{
  'update:modelValue': [xml: string]
  change: [xml: string]
  select: [ids: string[]]
  elementClick: [id: string]
  /** The decision whose logic is shown, or null for the diagram. */
  open: [decision: string | null]
  error: [error: Error]
}>()

const L = computed(() => resolveDmnLabels(props.locale, props.labels))
const uid = `dmn-ed-${Math.random().toString(36).slice(2, 9)}`

function openDocument(xml: string | null): DmnDocument {
  try {
    return new DmnDocument(xml || undefined)
  } catch (e) {
    emit('error', e as Error)
    return new DmnDocument()
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
  selection.value = selection.value.filter((id) => doc.value.element(id) || doc.value.model.requirements.some((q) => q.id === id))
  if (opened.value && !doc.value.decision(opened.value)) opened.value = null
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
const drawing = computed(() => renderDmn(model.value, { nested: true, idPrefix: uid, measureText: measure, padding: 0 }))

const opened = ref<string | null>(props.decision ?? null)
watch(
  () => props.decision,
  (d) => (opened.value = d ?? null),
)
// Back from a decision, the diagram is where it was left.
watch(opened, (d) => emit('open', d))

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch (e) {
    if (e instanceof BpmnError) {
      flash(e.message)
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
const stage = ref<HTMLElement | null>(null)
const vp = useViewport(stage, () => ({ min: 0.2, max: 4 }))
const view = vp.view
const transform = computed(() => `translate(${view.value.x},${view.value.y}) scale(${view.value.k})`)

function fit(smooth = false): void {
  const shapes = diagram.value.shapes
  if (shapes.length === 0) return
  const xs = shapes.flatMap((s) => [s.bounds.x, s.bounds.x + s.bounds.width])
  const ys = shapes.flatMap((s) => [s.bounds.y, s.bounds.y + s.bounds.height])
  vp.fit({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, smooth, props.readonly ? 24 : 72)
}

let observer: ResizeObserver | undefined
onMounted(() => {
  const measureSize = () => {
    const el = stage.value
    if (el) vp.size.value = { width: el.clientWidth, height: el.clientHeight }
  }
  measureSize()
  if (typeof ResizeObserver !== 'undefined' && stage.value) {
    observer = new ResizeObserver(measureSize)
    observer.observe(stage.value)
  }
  fit()
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  vp.dispose()
  unsubscribe()
  window.removeEventListener('keyup', onKeyUp)
})

const screenOf = (p: Point): Point => ({ x: p.x * view.value.k + view.value.x, y: p.y * view.value.k + view.value.y })

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

const typeOf = (id: string) => model.value.elements.get(id)?.type ?? ''
const boundsOf = (id: string) => diagram.value.shapes.find((s) => s.element === id)?.bounds

/** The lines as drawn: the file's points, or straight between the shapes. */
function linePoints(id: string): Point[] | undefined {
  const own = diagram.value.edges.find((e) => e.element === id)
  if (own && own.waypoints.length >= 2) return own.waypoints
  const q = model.value.requirements.find((x) => x.id === id)
  const a = q && boundsOf(q.source)
  const b = q && boundsOf(q.target)
  if (!a || !b) return undefined
  return [
    { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
  ]
}

function hit(p: Point): string | undefined {
  const under = diagram.value.shapes
    .filter((s) => typeOf(s.element) !== 'decisionService' && p.x >= s.bounds.x && p.x <= s.bounds.x + s.bounds.width && p.y >= s.bounds.y && p.y <= s.bounds.y + s.bounds.height)
    .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)
  if (under[0]) return under[0].element
  const tolerance = 6 / view.value.k
  let best: { id: string; d: number } | undefined
  const ids = [...model.value.requirements.map((q) => q.id), ...diagram.value.edges.map((e) => e.element)]
  for (const id of new Set(ids)) {
    const pts = linePoints(id)
    if (!pts) continue
    const d = distanceToPath(p, pts)
    if (d <= tolerance && (!best || d < best.d)) best = { id, d }
  }
  return best?.id
}

// ---------------------------------------------------------------------------
// Gestures
// ---------------------------------------------------------------------------

const selection = ref<string[]>([])
watch(selection, (ids) => emit('select', ids))

type Interaction =
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'move'; start: Point; dx: number; dy: number; armed: boolean }
  | { kind: 'marquee'; start: Point; end: Point }
  | { kind: 'resize'; id: string; handle: string; start: Point; from: Bounds; bounds: Bounds }
type Mode = { kind: 'idle' } | { kind: 'create'; type: DrdShapeType; at?: Point } | { kind: 'connect'; source: string; at?: Point; target?: string; ok: boolean }

const inter = shallowRef<Interaction | null>(null)
const mode = shallowRef<Mode>({ kind: 'idle' })
const hovered = ref<string | undefined>()
const spaceDown = ref(false)
const snap = (n: number) => Math.round(n / 5) * 5
const world = (e: PointerEvent | MouseEvent) => vp.clientToWorld(e.clientX, e.clientY)
const isShape = (id: string) => !!boundsOf(id)

function capture(e: PointerEvent): void {
  try {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  } catch {
    // Synthetic events cannot capture.
  }
}

function onPointerDown(e: PointerEvent): void {
  root.value?.focus({ preventScroll: true })
  menu.value = null
  if (editing.value) commitEdit()
  const p = world(e)
  if (e.button === 1 || spaceDown.value || (props.readonly && e.button === 0 && !hit(p))) {
    inter.value = { kind: 'pan', x: e.clientX, y: e.clientY }
    capture(e)
    return
  }
  if (e.button !== 0) return
  const m = mode.value
  if (m.kind === 'create') {
    mode.value = { kind: 'idle' }
    const id = attempt(() => doc.value.createElement(m.type, { x: snap(p.x), y: snap(p.y) }))
    if (id) {
      selection.value = [id]
      // After the click: its default action moves focus to the canvas.
      setTimeout(() => startEdit(id))
    }
    return
  }
  if (m.kind === 'connect') {
    mode.value = { kind: 'idle' }
    if (m.target && m.target !== m.source) {
      if (!m.ok) flash(L.value.notAllowed)
      else {
        const id = attempt(() => doc.value.connect(m.source, m.target!))
        if (id) selection.value = [id]
      }
    }
    return
  }
  const handle = (e.target as Element | null)?.getAttribute?.('data-handle')
  if (handle && selection.value.length === 1) {
    const b = boundsOf(selection.value[0]!)
    if (b) {
      inter.value = { kind: 'resize', id: selection.value[0]!, handle, start: p, from: b, bounds: b }
      capture(e)
      return
    }
  }
  const h = hit(p)
  if (props.readonly) {
    if (h) emit('elementClick', h)
    return
  }
  if (h) {
    if (e.shiftKey) selection.value = selection.value.includes(h) ? selection.value.filter((x) => x !== h) : [...selection.value, h]
    else if (!selection.value.includes(h)) selection.value = [h]
    emit('elementClick', h)
    if (isShape(h)) inter.value = { kind: 'move', start: p, dx: 0, dy: 0, armed: false }
  } else {
    if (!e.shiftKey) selection.value = []
    inter.value = { kind: 'marquee', start: p, end: p }
  }
  capture(e)
}

function onPointerMove(e: PointerEvent): void {
  const p = world(e)
  const i = inter.value
  const m = mode.value
  if (i?.kind === 'pan') {
    vp.panBy(e.clientX - i.x, e.clientY - i.y)
    inter.value = { ...i, x: e.clientX, y: e.clientY }
  } else if (i?.kind === 'move') {
    const dx = p.x - i.start.x
    const dy = p.y - i.start.y
    inter.value = { ...i, dx: snap(dx), dy: snap(dy), armed: i.armed || Math.hypot(dx, dy) * view.value.k > 3 }
  } else if (i?.kind === 'marquee') {
    inter.value = { ...i, end: p }
  } else if (i?.kind === 'resize') {
    const f = i.from
    let { x, y, width, height } = f
    const dx = p.x - i.start.x
    const dy = p.y - i.start.y
    if (i.handle.includes('e')) width = Math.max(40, snap(f.width + dx))
    if (i.handle.includes('s')) height = Math.max(30, snap(f.height + dy))
    if (i.handle.includes('w')) {
      width = Math.max(40, snap(f.width - dx))
      x = f.x + f.width - width
    }
    if (i.handle.includes('n')) {
      height = Math.max(30, snap(f.height - dy))
      y = f.y + f.height - height
    }
    inter.value = { ...i, bounds: { x, y, width, height } }
  } else if (m.kind === 'create') {
    mode.value = { ...m, at: p }
  } else if (m.kind === 'connect') {
    const target = hit(p)
    mode.value = { ...m, at: p, target, ok: !!target && doc.value.canConnect(m.source, target) !== null }
  } else {
    hovered.value = hit(p)
  }
}

function onPointerUp(): void {
  const i = inter.value
  inter.value = null
  if (!i) return
  if (i.kind === 'move' && i.armed && (i.dx || i.dy)) {
    attempt(() => doc.value.move(selection.value.filter(isShape), i.dx, i.dy))
  } else if (i.kind === 'marquee') {
    const r = { x: Math.min(i.start.x, i.end.x), y: Math.min(i.start.y, i.end.y), w: Math.abs(i.end.x - i.start.x), h: Math.abs(i.end.y - i.start.y) }
    if (r.w * view.value.k > 3 || r.h * view.value.k > 3) {
      const inside = diagram.value.shapes
        .filter((s) => s.bounds.x >= r.x && s.bounds.y >= r.y && s.bounds.x + s.bounds.width <= r.x + r.w && s.bounds.y + s.bounds.height <= r.y + r.h)
        .map((s) => s.element)
      selection.value = [...new Set([...selection.value, ...inside])]
    }
  } else if (i.kind === 'resize' && JSON.stringify(i.bounds) !== JSON.stringify(i.from)) {
    attempt(() => doc.value.resize(i.id, i.bounds))
  }
}

function onWheel(e: WheelEvent): void {
  if (e.ctrlKey || e.metaKey) vp.zoomBy(Math.exp(-e.deltaY * 0.002), vp.clientToLocal(e.clientX, e.clientY))
  else vp.panBy(-e.deltaX, -e.deltaY)
}

function onDblClick(e: MouseEvent): void {
  const h = hit(world(e))
  if (!h) return
  if (props.readonly) {
    if (typeOf(h) === 'decision') opened.value = h
    return
  }
  if (isShape(h)) startEdit(h)
}

// ---------------------------------------------------------------------------
// Palette, pad, menus
// ---------------------------------------------------------------------------

const palette: { type: DrdShapeType; icon: string }[] = [
  { type: 'decision', icon: 'decision' },
  { type: 'inputData', icon: 'inputData' },
  { type: 'businessKnowledgeModel', icon: 'businessKnowledgeModel' },
  { type: 'knowledgeSource', icon: 'knowledgeSource' },
  { type: 'textAnnotation', icon: 'textAnnotation' },
]

const single = computed(() => (selection.value.length === 1 ? selection.value[0]! : undefined))
const pad = computed(() => {
  const id = single.value
  if (!id || props.readonly || inter.value || mode.value.kind !== 'idle' || editing.value) return null
  const b = boundsOf(id)
  const pts = b ? undefined : linePoints(id)
  const anchor = b ? screenOf({ x: b.x + b.width, y: b.y }) : pts ? screenOf(pts[pts.length - 1]!) : null
  if (!anchor) return null
  const actions: { id: string; label: string; icon: unknown; run: () => void; danger?: boolean }[] = []
  if (typeOf(id) === 'decision') actions.push({ id: 'open', label: L.value.open, icon: Table, run: () => (opened.value = id) })
  if (b) actions.push({ id: 'connect', label: L.value.connect, icon: bpmnIcon('connect'), run: () => (mode.value = { kind: 'connect', source: id, ok: false }) })
  if (model.value.version !== '1.1') actions.push({ id: 'color', label: L.value.color, icon: Palette, run: () => (menu.value = { kind: 'color', x: anchor.x + 48, y: anchor.y }) })
  actions.push({ id: 'delete', label: L.value.delete, icon: Trash2, run: () => removeSelection(), danger: true })
  return { x: anchor.x + 8, y: anchor.y, actions }
})

const COLORS = [
  { swatch: 'transparent' } as { fill?: string; stroke?: string; swatch: string },
  { fill: '#bbdefb', stroke: '#0d4372', swatch: '#bbdefb' },
  { fill: '#ffe0b2', stroke: '#6b3c00', swatch: '#ffe0b2' },
  { fill: '#c8e6c9', stroke: '#205022', swatch: '#c8e6c9' },
  { fill: '#ffcdd2', stroke: '#831311', swatch: '#ffcdd2' },
]
const menu = shallowRef<{ kind: 'color' | 'download'; x: number; y: number } | null>(null)

function removeSelection(): void {
  const ids = selection.value
  if (ids.length === 0) return
  attempt(() => doc.value.remove(ids))
  selection.value = []
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const editing = shallowRef<{ id: string; text: string; box: Bounds } | null>(null)
const editor = ref<HTMLTextAreaElement | null>(null)

function startEdit(id: string): void {
  const b = boundsOf(id)
  const e = model.value.elements.get(id)
  if (!b || !e) return
  selection.value = [id]
  editing.value = { id, text: e.name ?? '', box: b }
  nextTick(() => {
    editor.value?.focus()
    editor.value?.select()
  })
}

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

const editorStyle = computed(() => {
  const ed = editing.value
  if (!ed) return {}
  const p = screenOf(ed.box)
  const k = view.value.k
  return { left: `${p.x}px`, top: `${p.y}px`, width: `${ed.box.width * k}px`, height: `${ed.box.height * k}px`, fontSize: `${12 * k}px` }
})

// ---------------------------------------------------------------------------
// Keyboard, messages, download
// ---------------------------------------------------------------------------

function onKey(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  const mod = e.ctrlKey || e.metaKey
  if (e.key === ' ' && !opened.value) {
    spaceDown.value = true
    e.preventDefault()
    return
  }
  if (e.key === 'Escape') {
    if (opened.value) opened.value = null
    mode.value = { kind: 'idle' }
    menu.value = null
    selection.value = []
    return
  }
  if (props.readonly) return
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) doc.value.redo()
    else doc.value.undo()
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    doc.value.redo()
  } else if (opened.value) {
    return
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    removeSelection()
  } else if (e.key.startsWith('Arrow') && selection.value.length > 0) {
    e.preventDefault()
    const s = e.shiftKey ? 10 : 1
    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key] ?? [0, 0]
    attempt(() => doc.value.move(selection.value.filter(isShape), d[0]!, d[1]!))
  } else if (e.key === 'F2' && single.value) {
    startEdit(single.value)
  }
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.key === ' ') spaceDown.value = false
}

const message = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
function flash(text: string): void {
  message.value = text
  clearTimeout(timer)
  timer = setTimeout(() => (message.value = ''), 3000)
}

function save(name: string, type: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const fileName = () => (model.value.definitions.name ?? 'decisions').replace(/[\\/:*?"<>|]+/g, '_')

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function outline(id: string, pad = 4): { d: string; edge: boolean } | null {
  const b = boundsOf(id)
  if (b) return { d: `M${b.x - pad},${b.y - pad}h${b.width + 2 * pad}v${b.height + 2 * pad}h${-(b.width + 2 * pad)}Z`, edge: false }
  const pts = linePoints(id)
  return pts ? { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(''), edge: true } : null
}
const selected = computed(() => selection.value.map((id) => ({ id, o: outline(id) })).filter((x) => x.o))
const highlighted = computed(() => props.highlight.map((id) => ({ id, o: outline(id, 6) })).filter((x) => x.o))
const hover = computed(() => (hovered.value && !selection.value.includes(hovered.value) && !props.readonly ? outline(hovered.value) : null))
const ghosts = computed(() => {
  const i = inter.value
  if (i?.kind !== 'move' || !i.armed) return []
  return selection.value.map((id) => ({ id, b: boundsOf(id) })).filter((x) => x.b).map((x) => ({ id: x.id, ...x.b!, x: x.b!.x + i.dx, y: x.b!.y + i.dy }))
})
const marquee = computed(() => {
  const i = inter.value
  return i?.kind === 'marquee' ? { x: Math.min(i.start.x, i.end.x), y: Math.min(i.start.y, i.end.y), width: Math.abs(i.end.x - i.start.x), height: Math.abs(i.end.y - i.start.y) } : null
})
const resizing = computed(() => (inter.value?.kind === 'resize' ? inter.value.bounds : null))
const handles = computed(() => {
  const id = single.value
  if (!id || props.readonly || mode.value.kind !== 'idle' || inter.value?.kind === 'move') return []
  const b = inter.value?.kind === 'resize' ? inter.value.bounds : boundsOf(id)
  if (!b) return []
  const size = 8 / view.value.k
  return (['nw', 'ne', 'sw', 'se'] as const).map((h) => ({ h, x: (h.includes('w') ? b.x : b.x + b.width) - size / 2, y: (h.includes('n') ? b.y : b.y + b.height) - size / 2, size }))
})
const ghost = computed(() => {
  const m = mode.value
  if (m.kind !== 'create' || !m.at) return null
  const s = dmnSize(m.type)
  return { x: m.at.x - s.width / 2, y: m.at.y - s.height / 2, ...s }
})
const connectLine = computed(() => {
  const m = mode.value
  if (m.kind !== 'connect' || !m.at) return null
  const b = boundsOf(m.source)
  return b ? { x1: b.x + b.width / 2, y1: b.y + b.height / 2, x2: m.at.x, y2: m.at.y, ok: m.ok } : null
})
const dropTarget = computed(() => {
  const m = mode.value
  return m.kind === 'connect' && m.target && m.target !== m.source ? { o: outline(m.target, 6), ok: m.ok } : null
})
const dotGap = computed(() => 20 * view.value.k)
const cursor = computed(() => (inter.value?.kind === 'pan' || spaceDown.value ? 'grabbing' : mode.value.kind !== 'idle' ? 'crosshair' : hovered.value ? (props.readonly ? 'pointer' : 'move') : props.readonly ? 'grab' : 'default'))

defineExpose({
  document: computed(() => doc.value),
  fit,
  undo: () => doc.value.undo(),
  redo: () => doc.value.redo(),
  toSvg: () => renderDmn(model.value, { measureText: measure }).svg,
  /** A decision's logic as standalone HTML. */
  toHtml: (decision?: string) => renderDecision(model.value, decision).html,
  selection,
  opened,
})
</script>

<template>
  <div
    ref="root"
    class="bpmn-ed dmn-ed"
    :class="{ 'bpmn-ed--readonly': readonly }"
    tabindex="0"
    @keydown="onKey"
  >
    <div
      ref="stage"
      class="bpmn-ed-stage"
    >
      <!-- The decision's logic -->
      <div
        v-if="opened"
        class="dmn-ed-logic-view"
      >
        <div class="dmn-ed-crumbs">
          <UidButton
            size="sm"
            variant="ghost"
            :icon="ArrowLeft"
            data-control="back"
            @click="opened = null"
          >
            {{ L.diagram }}
          </UidButton>
          <template v-if="!readonly">
            <span class="bpmn-ed-sep" />
            <UidButton
              size="sm"
              variant="ghost"
              :icon="Undo2"
              :aria-label="L.undo"
              :disabled="(version, !doc.canUndo)"
              data-control="undo"
              @click="doc.undo()"
            />
            <UidButton
              size="sm"
              variant="ghost"
              :icon="Redo2"
              :aria-label="L.redo"
              :disabled="(version, !doc.canRedo)"
              data-control="redo"
              @click="doc.redo()"
            />
          </template>
        </div>
        <DecisionTableEditor
          :document="doc"
          :version="version"
          :decision="opened"
          :labels="L"
          :readonly="readonly"
          @error="(e: Error) => (flash(e.message), emit('error', e))"
        />
      </div>

      <template v-else>
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
                cx="1"
                cy="1"
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
                v-if="hover"
                :d="hover.d"
                class="bpmn-ed-hover"
                :stroke-width="1 / view.k"
              />
              <path
                v-for="h in highlighted"
                :key="`h-${h.id}`"
                :d="h.o!.d"
                class="bpmn-ed-highlight"
                :class="{ 'bpmn-ed-edge-outline': h.o!.edge }"
                :stroke-width="(h.o!.edge ? 6 : 3) / view.k"
              />
              <path
                v-for="s in selected"
                :key="`s-${s.id}`"
                :d="s.o!.d"
                class="bpmn-ed-selected"
                :class="{ 'bpmn-ed-edge-outline': s.o!.edge }"
                :stroke-width="(s.o!.edge ? 5 : 1.5) / view.k"
              />
              <rect
                v-for="g in ghosts"
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
                v-bind="resizing"
                class="bpmn-ed-ghost"
                :stroke-width="1.5 / view.k"
              />
              <rect
                v-if="marquee"
                v-bind="marquee"
                class="bpmn-ed-marquee"
                :stroke-width="1 / view.k"
              />
              <rect
                v-if="ghost"
                v-bind="ghost"
                class="bpmn-ed-ghost"
                :stroke-width="1.5 / view.k"
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
              @click="mode = mode.kind === 'create' && mode.type === item.type ? { kind: 'idle' } : { kind: 'create', type: item.type }"
            />
          </UidTooltip>
        </div>

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
              variant="ghost"
              :icon="a.icon as any"
              :aria-label="a.label"
              :data-action="a.id"
              :class="{ 'bpmn-ed-danger': a.danger }"
              @click="a.run()"
            />
          </UidTooltip>
        </div>

        <div
          v-if="menu"
          class="bpmn-ed-panel bpmn-ed-menu"
          :class="`bpmn-ed-menu--${menu.kind}`"
          :style="menu.kind === 'download' ? {} : { left: `${menu.x}px`, top: `${menu.y}px` }"
        >
          <div
            v-if="menu.kind === 'color'"
            class="bpmn-ed-swatches"
          >
            <button
              v-for="(c, i) in COLORS"
              :key="i"
              type="button"
              class="bpmn-ed-swatch"
              :style="{ background: c.swatch, borderColor: c.stroke ?? 'var(--bpmn-ed-border)' }"
              :aria-label="c.fill ?? L.noColor"
              @click="(attempt(() => doc.setColors(selection, { fill: c.fill, stroke: c.stroke })), (menu = null))"
            />
          </div>
          <template v-else>
            <button
              type="button"
              class="bpmn-ed-menu-item"
              data-download="xml"
              @click="(save(`${fileName()}.dmn`, 'application/xml', doc.xml), (menu = null))"
            >
              {{ L.downloadXml }}
            </button>
            <button
              type="button"
              class="bpmn-ed-menu-item"
              data-download="svg"
              @click="(save(`${fileName()}.svg`, 'image/svg+xml', renderDmn(model, { measureText: measure }).svg), (menu = null))"
            >
              {{ L.downloadSvg }}
            </button>
          </template>
        </div>

        <textarea
          v-if="editing"
          ref="editor"
          class="bpmn-ed-text bpmn-ed-text--inside"
          :style="editorStyle"
          :value="editing.text"
          spellcheck="false"
          @keydown="onEditorKey"
          @blur="commitEdit"
        />

        <div class="bpmn-ed-panel bpmn-ed-controls">
          <template v-if="!readonly">
            <UidButton
              size="sm"
              variant="ghost"
              :icon="Undo2"
              :aria-label="L.undo"
              :disabled="(version, !doc.canUndo)"
              data-control="undo"
              @click="doc.undo()"
            />
            <UidButton
              size="sm"
              variant="ghost"
              :icon="Redo2"
              :aria-label="L.redo"
              :disabled="(version, !doc.canRedo)"
              data-control="redo"
              @click="doc.redo()"
            />
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
            {{ Math.round(view.k * 100) }}%
          </button>
          <UidButton
            size="sm"
            variant="ghost"
            :icon="Plus"
            :aria-label="L.zoomIn"
            @click="vp.zoomBy(1.2, undefined, true)"
          />
          <UidButton
            size="sm"
            variant="ghost"
            :icon="Maximize"
            :aria-label="L.fit"
            data-control="fit"
            @click="fit(true)"
          />
          <template v-if="!readonly">
            <span class="bpmn-ed-sep" />
            <UidButton
              size="sm"
              variant="ghost"
              :icon="Download"
              :aria-label="L.download"
              data-control="download"
              @click="menu = menu?.kind === 'download' ? null : { kind: 'download', x: 0, y: 0 }"
            />
          </template>
        </div>
      </template>

      <div
        v-if="message"
        class="bpmn-ed-message"
        role="status"
      >
        {{ message }}
      </div>
    </div>
  </div>
</template>
