/**
 * An editable BPMN file: operations that change semantics and layout
 * together, with undo and redo.
 *
 * Every operation edits the XML tree in place — what the editor does not know
 * (vendor extensions, execution attributes, other diagrams) stays untouched —
 * and then re-reads the model. An operation either completes or leaves the
 * file as it was.
 */
import { BpmnError } from '../errors'
import { fromDocument, NS, type Bounds, type BpmnDiagram, type BpmnElement, type BpmnModel, type DiShape, type Point } from '../model'
import { safeColor } from '../theme'
import { attr, childElements, parseXml, writeXml, type XmlDocument, type XmlElement, type XmlLimits } from '../xml'
import { route, simplify, translate } from './route'
import {
  defaultSize,
  flowBetween,
  idPrefix,
  isActivity,
  isData,
  isEvent,
  isFlowNode,
  isGateway,
  isSubProcess,
  type EventDefinitionKind,
  type FlowType,
  type ShapeType,
} from './rules'
import { detach, insert, make, makeText, nsPrefix, parentMap, prefixFor, refText, setAttr, walk, XSI } from './tree'

export interface DocumentOptions {
  /** Which diagram of the file to edit: its id or index. The first by default. */
  diagram?: string | number
  /** Generates the random part of new ids; `Activity_` + this. Default: 7 random base-36 characters. */
  idSuffix?: () => string
  /** Steps kept for undo. Default 100. */
  historyLimit?: number
  limits?: XmlLimits
}

export interface CreateOptions {
  name?: string
  /** For events. */
  eventDefinition?: EventDefinitionKind
  /** For a boundary event: the activity it sits on. */
  attachTo?: string
  /** For sub-processes: drawn open with room for content. Default true. */
  expanded?: boolean
  /** Overrides the default size. */
  size?: { width: number; height: number }
}

export type LoopType = 'none' | 'standard' | 'parallel' | 'sequential'

/** A blank file: one process with one start event. */
export function emptyDiagram(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${NS.bpmn}" xmlns:bpmndi="${NS.bpmndi}" xmlns:dc="${NS.dc}" xmlns:di="${NS.di}" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`
}

function randomSuffix(): string {
  let s = ''
  for (let i = 0; i < 7; i++) s += Math.floor(Math.random() * 36).toString(36)
  return s
}

const r = (n: number) => Math.round(n)

function centre(b: Bounds): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

function inside(p: Point, b: Bounds): boolean {
  return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height
}

export class BpmnDocument {
  private doc!: XmlDocument
  private current!: BpmnModel
  private parents = new Map<XmlElement, XmlElement>()
  private di = new Map<string, XmlElement>()
  private plane: XmlElement | undefined
  private undoStack: string[] = []
  private redoStack: string[] = []
  private listeners = new Set<() => void>()
  private readonly options: DocumentOptions

  constructor(xml: string = emptyDiagram(), options: DocumentOptions = {}) {
    this.options = options
    this.read(xml)
  }

  // -------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------

  /** The model as it is now. Replaced (not mutated) by every change. */
  get model(): BpmnModel {
    return this.current
  }

  /** The diagram being edited. */
  get diagram(): BpmnDiagram {
    const d = this.options.diagram
    const found = typeof d === 'string' ? this.current.diagrams.find((x) => x.id === d) : this.current.diagrams[d ?? 0]
    if (!found) throw new BpmnError('The file has no diagram to edit')
    return found
  }

  /** The file as text. */
  get xml(): string {
    return writeXml(this.doc)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Called after every change, undo and redo. Returns the unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Replaces the whole file; the history is cleared. */
  load(xml: string): void {
    this.read(xml)
    this.undoStack = []
    this.redoStack = []
    this.emit()
  }

  undo(): boolean {
    const previous = this.undoStack.pop()
    if (previous === undefined) return false
    this.redoStack.push(this.xml)
    this.read(previous)
    this.emit()
    return true
  }

  redo(): boolean {
    const next = this.redoStack.pop()
    if (next === undefined) return false
    this.undoStack.push(this.xml)
    this.read(next)
    this.emit()
    return true
  }

  element(id: string): BpmnElement | undefined {
    return this.current.elements.get(id)
  }

  shape(id: string): DiShape | undefined {
    return this.diagram.shapes.find((s) => s.element === id)
  }

  /** The elements an edge connects: source and target ids. */
  ends(id: string): [string, string] | undefined {
    const e = this.current.elements.get(id)
    if (!e) return undefined
    const own = (local: string) => {
      const c = childElements(e.xml, NS.bpmn, local)[0]
      return c ? refText(c) : undefined
    }
    switch (e.type) {
      case 'dataInputAssociation': {
        const source = own('sourceRef')
        return source && e.parent ? [source, e.parent] : undefined
      }
      case 'dataOutputAssociation': {
        const target = own('targetRef')
        return target && e.parent ? [e.parent, target] : undefined
      }
      default: {
        const source = attr(e.xml, 'sourceRef')
        const target = attr(e.xml, 'targetRef')
        return source && target ? [source, target] : undefined
      }
    }
  }

  /** The flow `connect` would create between two elements, or null when none is allowed. */
  canConnect(source: string, target: string): FlowType | null {
    const s = this.current.elements.get(source)
    const t = this.current.elements.get(target)
    if (!s || !t) return null
    const sameProcess = this.processOf(source) !== undefined && this.processOf(source) === this.processOf(target)
    return flowBetween(s, t, s.parent === t.parent, sameProcess)
  }

  /**
   * The container a new element at `p` would go into: the innermost expanded
   * sub-process, lane or pool under it, or the process the diagram shows.
   */
  containerAt(p: Point, exclude: Set<string> = new Set()): { container?: string; lane?: string; process?: string } {
    let best: { shape: DiShape; area: number } | undefined
    let lane: { shape: DiShape; area: number } | undefined
    for (const shape of this.diagram.shapes) {
      if (exclude.has(shape.element) || !inside(p, shape.bounds)) continue
      const e = this.current.elements.get(shape.element)
      if (!e) continue
      const area = shape.bounds.width * shape.bounds.height
      if (e.type === 'lane') {
        if (!lane || area < lane.area) lane = { shape, area }
        continue
      }
      const container = (isSubProcess(e.type) && this.isExpanded(shape)) || e.type === 'participant'
      if (container && (!best || area < best.area)) best = { shape, area }
    }
    if (best) {
      const id = best.shape.element
      const e = this.current.elements.get(id)!
      const process = e.type === 'participant' ? attr(e.xml, 'processRef') : this.processOf(id)
      const laneId = lane && this.processOf(lane.shape.element) === process && lane.area <= best.area ? lane.shape.element : undefined
      return { container: e.type === 'participant' ? process : id, lane: e.type === 'participant' ? laneId : undefined, process }
    }
    const plane = this.diagram.plane ? this.current.elements.get(this.diagram.plane) : undefined
    if (plane && (plane.type === 'process' || isSubProcess(plane.type))) return { container: plane.id, process: this.processOf(plane.id) ?? plane.id }
    return {}
  }

  // -------------------------------------------------------------------
  // Operations
  // -------------------------------------------------------------------

  /**
   * Adds a shape centred on `at`. Flow nodes go into the container under
   * that point; outside every pool of a collaboration there is none, and the
   * call throws. Returns the new element's id.
   */
  createShape(type: ShapeType, at: Point, options: CreateOptions = {}): string {
    return this.change(() => {
      const expanded = options.expanded ?? true
      const size = options.size ?? defaultSize(type, expanded)
      const bounds = { x: r(at.x - size.width / 2), y: r(at.y - size.height / 2), width: size.width, height: size.height }
      if (type === 'participant') return this.addParticipant(bounds, options.name)
      const id = this.newId(idPrefix(type))
      const attrs: Record<string, string | undefined> = { id, name: options.name || undefined }
      let parent: XmlElement
      let lane: string | undefined

      if (type === 'group') {
        parent = this.rootContainer()
        const value = this.addCategoryValue(options.name)
        attrs.name = undefined
        attrs.categoryValueRef = value
      } else if (type === 'boundaryEvent') {
        const host = options.attachTo && this.current.elements.get(options.attachTo)
        if (!host || !isActivity(host.type)) throw new BpmnError('A boundary event must sit on an activity')
        parent = this.xmlOf(host.parent!)
        attrs.attachedToRef = host.id
      } else {
        const place = this.containerAt(centre(bounds))
        if (!place.container) {
          if (type === 'textAnnotation') parent = this.rootContainer()
          else throw new BpmnError('Place it inside a pool', 0, 0, 'In a collaboration every element belongs to a pool.')
        } else {
          parent = this.xmlOf(place.container)
        }
        lane = place.lane
      }

      const children: XmlElement[] = []
      if (type === 'textAnnotation') children.push(makeText(this.doc, 'text', options.name ?? ''))
      if (isEvent(type) && options.eventDefinition) children.push(this.eventDefinition(options.eventDefinition))
      if (type === 'textAnnotation') attrs.name = undefined
      if (type === 'dataObjectReference') {
        const objectId = this.newId('DataObject')
        insert(parent, make(this.doc, 'bpmn', 'dataObject', { id: objectId }), this.parentOf(parent))
        attrs.dataObjectRef = objectId
      }
      const node = make(this.doc, 'bpmn', type, attrs, children)
      insert(parent, node, this.parentOf(parent))
      if (lane && isFlowNode(type)) this.addFlowNodeRef(lane, id)

      this.addShape(id, bounds, {
        isExpanded: isSubProcess(type) ? String(expanded) : undefined,
        isMarkerVisible: type === 'exclusiveGateway' ? 'true' : undefined,
      })
      return id
    })
  }

  /** Adds a lane at the bottom of a pool; the first call splits the pool into two lanes. */
  addLane(participant: string, name?: string): string {
    return this.change(() => {
      const pool = this.current.elements.get(participant)
      const shape = this.shape(participant)
      const processId = pool && attr(pool.xml, 'processRef')
      if (!pool || pool.type !== 'participant' || !shape || !processId) throw new BpmnError('Lanes belong to an expanded pool')
      const process = this.xmlOf(processId)
      let laneSet = childElements(process, NS.bpmn, 'laneSet')[0]
      if (!laneSet) {
        laneSet = make(this.doc, 'bpmn', 'laneSet', { id: this.newId('LaneSet') })
        const first = childElements(process).find((c) => c.local !== 'documentation' && c.local !== 'extensionElements')
        insert(process, laneSet, this.parentOf(process), first)
      }
      const lanes = childElements(laneSet, NS.bpmn, 'lane')
      const b = shape.bounds
      const height = 125
      let id: string
      if (lanes.length === 0) {
        const all = this.current.elements
        const first = this.newId('Lane')
        const refs = [...all.values()].filter((e) => e.parent === processId && isFlowNode(e.type)).map((e) => makeText(this.doc, 'flowNodeRef', e.id))
        insert(laneSet, make(this.doc, 'bpmn', 'lane', { id: first }, refs), process)
        this.addShape(first, { x: b.x + 30, y: b.y, width: b.width - 30, height: b.height }, { isHorizontal: 'true' }, true)
        id = this.newId('Lane')
        insert(laneSet, make(this.doc, 'bpmn', 'lane', { id, name: name || undefined }), process)
        this.addShape(id, { x: b.x + 30, y: b.y + b.height, width: b.width - 30, height }, { isHorizontal: 'true' }, true)
      } else {
        id = this.newId('Lane')
        insert(laneSet, make(this.doc, 'bpmn', 'lane', { id, name: name || undefined }), process)
        this.addShape(id, { x: b.x + 30, y: b.y + b.height, width: b.width - 30, height }, { isHorizontal: 'true' }, true)
      }
      this.setBounds(participant, { ...b, height: b.height + height })
      return id
    })
  }

  /**
   * Moves shapes by (dx, dy). Contents move with their pool or sub-process,
   * boundary events with their activity; flows between moved shapes keep
   * their bends, flows to shapes left in place are routed again. A flow node
   * dropped into another lane, sub-process or pool moves there.
   */
  move(ids: string[], dx: number, dy: number): void {
    // Lanes move with their pool, never on their own.
    ids = ids.filter((id) => this.current.elements.get(id)?.type !== 'lane')
    if (ids.length === 0 || (dx === 0 && dy === 0)) return
    this.change(() => {
      const moving = this.closure(ids)
      for (const id of moving) this.translateShape(id, dx, dy)
      this.refresh()
      this.updateEdges(moving, dx, dy)
      this.refresh()
      for (const id of ids) this.reparent(id, moving)
    })
  }

  /** Changes a shape's bounds; lanes follow their pool, a pool its lanes. */
  resize(id: string, bounds: Bounds): void {
    this.change(() => {
      const e = this.current.elements.get(id)
      const old = this.shape(id)?.bounds
      if (!e || !old) throw new BpmnError(`"${id}" has no shape`)
      const b = { x: r(bounds.x), y: r(bounds.y), width: Math.max(10, r(bounds.width)), height: Math.max(10, r(bounds.height)) }
      this.setBounds(id, b)
      const touched = new Set([id])
      if (e.type === 'participant') {
        const lanes = this.lanesOf(id)
        for (const lane of lanes) {
          const lb = this.shape(lane)!.bounds
          this.setBounds(lane, { ...lb, x: b.x + 30, width: b.width - 30 })
          touched.add(lane)
        }
        const top = this.topLanes(id)
        if (top.length > 0) {
          const first = top[0]!
          const last = top[top.length - 1]!
          const fb = this.boundsNow(first)
          this.setBounds(first, { ...fb, y: b.y, height: Math.max(30, fb.height + (fb.y - b.y)) })
          const lb = this.boundsNow(last)
          this.setBounds(last, { ...lb, height: Math.max(30, b.y + b.height - lb.y) })
        }
      } else if (e.type === 'lane') {
        // Lanes below shift; the pool grows or shrinks with the lane.
        const dh = b.height - old.height
        const pool = this.poolOfLane(id)
        if (pool && dh !== 0) {
          for (const other of this.lanesOf(pool)) {
            const ob = this.boundsNow(other)
            if (other !== id && ob.y >= old.y + old.height - 1) this.setBounds(other, { ...ob, y: ob.y + dh })
          }
          const pb = this.boundsNow(pool)
          this.setBounds(pool, { ...pb, height: pb.height + dh })
          this.setBounds(id, { ...b, x: old.x, width: old.width, y: old.y })
        }
      }
      this.refresh()
      this.updateEdges(touched, 0, 0)
    })
  }

  /** Connects two elements with the flow the notation allows; throws when there is none. */
  connect(source: string, target: string): string {
    return this.change(() => {
      const type = this.canConnect(source, target)
      if (!type) throw new BpmnError(`"${source}" cannot be connected to "${target}"`)
      const id = this.newId(idPrefix(type))
      const s = this.current.elements.get(source)!
      const t = this.current.elements.get(target)!
      switch (type) {
        case 'sequenceFlow': {
          const parent = this.xmlOf(s.parent!)
          insert(parent, make(this.doc, 'bpmn', 'sequenceFlow', { id, sourceRef: source, targetRef: target }), this.parentOf(parent))
          this.addRef(s.xml, 'outgoing', id)
          this.addRef(t.xml, 'incoming', id)
          break
        }
        case 'messageFlow': {
          const collaboration = this.collaboration()
          insert(collaboration, make(this.doc, 'bpmn', 'messageFlow', { id, sourceRef: source, targetRef: target }), this.parentOf(collaboration))
          break
        }
        case 'association': {
          const annotation = s.type === 'textAnnotation' ? s : t
          const parent = annotation.parent ? this.xmlOf(annotation.parent) : this.rootContainer()
          insert(parent, make(this.doc, 'bpmn', 'association', { id, sourceRef: source, targetRef: target }), this.parentOf(parent))
          break
        }
        case 'dataInputAssociation': {
          const property = this.newId('Property')
          this.insertActivityChild(t.xml, make(this.doc, 'bpmn', 'property', { id: property, name: '__targetRef_placeholder' }))
          this.insertActivityChild(
            t.xml,
            make(this.doc, 'bpmn', 'dataInputAssociation', { id }, [makeText(this.doc, 'sourceRef', source), makeText(this.doc, 'targetRef', property)]),
          )
          break
        }
        case 'dataOutputAssociation':
          this.insertActivityChild(s.xml, make(this.doc, 'bpmn', 'dataOutputAssociation', { id }, [makeText(this.doc, 'targetRef', target)]))
          break
      }
      const sb = this.shape(source)!.bounds
      const tb = this.shape(target)!.bounds
      this.addEdge(id, route(sb, tb, { vertical: type === 'messageFlow' || isGateway(s.type) }))
      return id
    })
  }

  /** Removes elements with everything that depends on them: contents, attached events, flows, references. */
  remove(ids: string[]): void {
    if (ids.length === 0) return
    this.change(() => {
      const gone = this.closure(ids)
      // Processes of removed pools, and lanes inside them.
      for (const id of [...gone]) {
        const e = this.current.elements.get(id)
        if (e?.type !== 'participant') continue
        const process = attr(e.xml, 'processRef')
        const shared = [...this.current.elements.values()].some((o) => o.type === 'participant' && !gone.has(o.id) && attr(o.xml, 'processRef') === process)
        if (process && !shared) gone.add(process)
      }
      // Flows touching anything removed.
      for (const e of this.current.elements.values()) {
        if (!['sequenceFlow', 'messageFlow', 'association', 'dataInputAssociation', 'dataOutputAssociation'].includes(e.type)) continue
        const ends = this.ends(e.id)
        if (ends && (gone.has(ends[0]) || gone.has(ends[1]))) gone.add(e.id)
      }
      // Lanes: a neighbour takes the room of a removed lane.
      for (const id of ids) {
        const e = this.current.elements.get(id)
        if (e?.type === 'lane') this.closeLaneGap(id)
      }
      // Data objects no longer referenced.
      for (const id of [...gone]) {
        const e = this.current.elements.get(id)
        const object = e?.type === 'dataObjectReference' ? attr(e.xml, 'dataObjectRef') : undefined
        if (object && ![...this.current.elements.values()].some((o) => !gone.has(o.id) && o.type === 'dataObjectReference' && attr(o.xml, 'dataObjectRef') === object)) gone.add(object)
      }
      const refs = new Set(['incoming', 'outgoing', 'flowNodeRef'])
      const doomed: XmlElement[] = []
      for (const node of walk(this.doc.root)) {
        if (node === this.doc.root) continue
        const id = attr(node, 'id')
        if (node.ns === NS.bpmn && id && gone.has(id)) doomed.push(node)
        else if (node.ns === NS.bpmn && refs.has(node.local) && gone.has(refText(node))) doomed.push(node)
        else if (node.ns === NS.bpmndi && (node.local === 'BPMNShape' || node.local === 'BPMNEdge') && gone.has(attr(node, 'bpmnElement') ?? '')) doomed.push(node)
        else if (node.ns === NS.bpmndi && node.local === 'BPMNDiagram') {
          const plane = childElements(node, NS.bpmndi, 'BPMNPlane')[0]
          if (plane && gone.has(attr(plane, 'bpmnElement') ?? '')) doomed.push(node)
        }
        const def = attr(node, 'default')
        if (def && gone.has(def)) setAttr(node, 'default', undefined)
      }
      for (const node of doomed) {
        const parent = this.parents.get(node)
        if (parent) detach(parent, node)
      }
      // Sets left empty.
      for (const node of [...walk(this.doc.root)]) {
        if (node.ns === NS.bpmn && node.local === 'laneSet' && childElements(node, NS.bpmn, 'lane').length === 0) {
          const parent = parentMap(this.doc).get(node)
          if (parent) detach(parent, node)
        }
      }
    })
  }

  /** Renames an element: its name, an annotation's text, a group's category value. */
  rename(id: string, name: string): void {
    this.change(() => {
      const e = this.need(id)
      const value = name.trim() === '' ? undefined : name
      if (e.type === 'textAnnotation') {
        let text = childElements(e.xml, NS.bpmn, 'text')[0]
        if (!text) {
          text = makeText(this.doc, 'text', '')
          insert(e.xml, text, this.parentOf(e.xml))
        }
        text.children = value ? [{ kind: 'text', value }] : []
        return
      }
      if (e.type === 'group') {
        let ref = attr(e.xml, 'categoryValueRef')
        if (!ref) {
          ref = this.addCategoryValue(undefined)
          setAttr(e.xml, 'categoryValueRef', ref)
          this.refresh()
        }
        const cv = this.current.elements.get(ref)
        if (cv) setAttr(cv.xml, 'value', value)
        return
      }
      setAttr(e.xml, 'name', value)
    })
  }

  /**
   * Changes an element's type within its family — a task to a user task, an
   * exclusive gateway to a parallel one, a start event to an end event.
   * Flows the new type cannot have are removed.
   */
  setType(id: string, type: string): void {
    this.change(() => {
      const e = this.need(id)
      if (e.type === type) return
      const family = (t: string) => (isEvent(t) ? 'event' : isGateway(t) ? 'gateway' : isActivity(t) ? 'activity' : t)
      if (family(e.type) !== family(type) || type === 'boundaryEvent' || e.type === 'boundaryEvent') {
        throw new BpmnError(`"${e.type}" cannot become "${type}"`)
      }
      const prefix = e.xml.name.includes(':') ? e.xml.name.slice(0, e.xml.name.indexOf(':') + 1) : ''
      e.xml.name = prefix + type
      e.xml.local = type
      if (isGateway(type)) {
        for (const a of ['eventGatewayType', 'instantiate']) if (type !== 'eventBasedGateway') setAttr(e.xml, a, undefined)
        const shape = this.di.get(id)
        if (shape) setAttr(shape, 'isMarkerVisible', type === 'exclusiveGateway' ? 'true' : undefined)
      }
      if (isActivity(type)) {
        // Attributes of the old type that the new one does not have.
        for (const a of ['scriptFormat', 'calledElement', 'implementation', 'triggeredByEvent', 'messageRef']) setAttr(e.xml, a, undefined)
        for (const c of childElements(e.xml, NS.bpmn, 'script')) detach(e.xml, c)
        if (!isSubProcess(type) && isSubProcess(e.type)) {
          const shape = this.di.get(id)
          if (shape) setAttr(shape, 'isExpanded', undefined)
        }
      }
      if (isEvent(type)) {
        this.refresh()
        const invalid: string[] = []
        for (const ref of childElements(e.xml, NS.bpmn)) {
          if ((type === 'startEvent' && ref.local === 'incoming') || (type === 'endEvent' && ref.local === 'outgoing')) invalid.push(refText(ref))
        }
        if (type !== 'startEvent') setAttr(e.xml, 'isInterrupting', undefined)
        if (invalid.length > 0) {
          this.refresh()
          this.removeNow(invalid)
        }
      }
    })
  }

  /** Sets an event's definition (timer, message…) or makes it a plain event. */
  setEventDefinition(id: string, kind: EventDefinitionKind | undefined): void {
    this.change(() => {
      const e = this.need(id)
      if (!isEvent(e.type)) throw new BpmnError(`"${id}" is not an event`)
      for (const c of childElements(e.xml, NS.bpmn)) if (c.local.endsWith('EventDefinition') || c.local === 'eventDefinitionRef') detach(e.xml, c)
      if (kind) insert(e.xml, this.eventDefinition(kind), this.parentOf(e.xml))
    })
  }

  /** Sets an activity's loop marker. */
  setLoop(id: string, loop: LoopType): void {
    this.change(() => {
      const e = this.need(id)
      if (!isActivity(e.type)) throw new BpmnError(`"${id}" is not an activity`)
      for (const c of childElements(e.xml, NS.bpmn)) {
        if (c.local === 'standardLoopCharacteristics' || c.local === 'multiInstanceLoopCharacteristics') detach(e.xml, c)
      }
      if (loop === 'none') return
      const node =
        loop === 'standard'
          ? make(this.doc, 'bpmn', 'standardLoopCharacteristics')
          : make(this.doc, 'bpmn', 'multiInstanceLoopCharacteristics', { isSequential: loop === 'sequential' ? 'true' : undefined })
      this.insertActivityChild(e.xml, node)
    })
  }

  /** Sets an element's documentation; empty text removes it. */
  setDocumentation(id: string, text: string): void {
    this.change(() => {
      const e = this.need(id)
      for (const c of childElements(e.xml, NS.bpmn, 'documentation')) detach(e.xml, c)
      if (text.trim() === '') return
      const first = childElements(e.xml)[0]
      insert(e.xml, makeText(this.doc, 'documentation', text), this.parentOf(e.xml), first)
    })
  }

  /** Sets a sequence flow's condition; empty text removes it. */
  setCondition(id: string, expression: string): void {
    this.change(() => {
      const e = this.need(id)
      if (e.type !== 'sequenceFlow') throw new BpmnError(`"${id}" is not a sequence flow`)
      for (const c of childElements(e.xml, NS.bpmn, 'conditionExpression')) detach(e.xml, c)
      if (expression.trim() === '') return
      const xsi = prefixFor(this.doc, XSI, 'xsi')
      const node = makeText(this.doc, 'conditionExpression', expression)
      const bpmn = nsPrefix(this.doc, 'bpmn')
      node.attributes.push({ name: `${xsi}:type`, value: `${bpmn ? `${bpmn}:` : ''}tFormalExpression`, ns: XSI, local: 'type' })
      insert(e.xml, node, this.parentOf(e.xml))
    })
  }

  /** Makes a flow its source's default flow, or (with `false`) no longer the default. */
  setDefaultFlow(id: string, isDefault = true): void {
    this.change(() => {
      const ends = this.ends(id)
      const source = ends && this.current.elements.get(ends[0])
      if (!source || this.need(id).type !== 'sequenceFlow') throw new BpmnError(`"${id}" is not a sequence flow`)
      if (isDefault) setAttr(source.xml, 'default', id)
      else if (attr(source.xml, 'default') === id) setAttr(source.xml, 'default', undefined)
    })
  }

  /** Sets or removes a plain attribute of a BPMN element (`isExecutable`, `cancelActivity`…). */
  setAttribute(id: string, name: string, value: string | undefined): void {
    if (!/^[A-Za-z_][\w.-]*$/.test(name) || name === 'id') throw new BpmnError(`"${name}" cannot be set here`)
    this.change(() => setAttr(this.need(id).xml, name, value))
  }

  /** Renames an id everywhere it is referenced. */
  setId(id: string, next: string): void {
    this.change(() => {
      if (!/^[A-Za-z_][\w.-]*$/.test(next)) throw new BpmnError(`"${next}" is not a valid id`, 0, 0, 'Start with a letter; use letters, digits, "_", "-" and ".".')
      if (this.current.elements.has(next)) throw new BpmnError(`The id "${next}" is taken`)
      this.need(id)
      for (const node of walk(this.doc.root)) {
        for (const a of node.attributes) if (a.value === id && (a.ns === '' || a.ns === NS.bpmn) && a.name !== 'name') a.value = next
        if (node.children.length === 1 && node.children[0]!.kind === 'text' && node.children[0]!.value.trim() === id && node.ns === NS.bpmn) {
          node.children = [{ kind: 'text', value: next }]
        }
      }
      const shape = this.di.get(id)
      if (shape && attr(shape, 'id') === `${id}_di`) setAttr(shape, 'id', `${next}_di`)
    })
  }

  /** Colours shapes and flows; undefined values remove the colour. Invalid colours are refused. */
  setColors(ids: string[], colors: { fill?: string; stroke?: string }): void {
    for (const c of [colors.fill, colors.stroke]) if (c !== undefined && !safeColor(c)) throw new BpmnError(`"${c}" is not a colour`)
    this.change(() => {
      const bioc = prefixFor(this.doc, NS.bioc, 'bioc')
      const color = prefixFor(this.doc, NS.color, 'color')
      for (const id of ids) {
        const node = this.di.get(id)
        if (!node) continue
        const isEdge = node.local === 'BPMNEdge'
        setAttr(node, `${bioc}:stroke`, colors.stroke, NS.bioc)
        setAttr(node, `${color}:border-color`, colors.stroke, NS.color)
        setAttr(node, `${bioc}:fill`, isEdge ? undefined : colors.fill, NS.bioc)
        setAttr(node, `${color}:background-color`, isEdge ? undefined : colors.fill, NS.color)
      }
    })
  }

  /** Sets the bends of a flow. */
  setWaypoints(id: string, points: Point[]): void {
    if (points.length < 2) throw new BpmnError('A flow needs two points')
    this.change(() => this.writeWaypoints(id, points))
  }

  /** Moves the label of an event, gateway, data element or flow. */
  setLabelBounds(id: string, bounds: Bounds): void {
    this.change(() => {
      const node = this.di.get(id)
      if (!node) throw new BpmnError(`"${id}" has no shape`)
      let label = childElements(node, NS.bpmndi, 'BPMNLabel')[0]
      if (!label) {
        label = make(this.doc, 'bpmndi', 'BPMNLabel')
        insert(node, label, this.plane)
      }
      let b = childElements(label, NS.dc, 'Bounds')[0]
      if (!b) {
        b = make(this.doc, 'dc', 'Bounds')
        insert(label, b, node)
      }
      this.writeBounds(b, bounds)
    })
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private read(xml: string): void {
    this.doc = parseXml(xml, this.options.limits)
    this.refresh()
  }

  private refresh(): void {
    this.current = fromDocument(this.doc)
    this.parents = parentMap(this.doc)
    this.di.clear()
    const diagrams = childElements(this.doc.root, NS.bpmndi, 'BPMNDiagram')
    const d = this.options.diagram
    const diagram = typeof d === 'string' ? diagrams.find((x) => attr(x, 'id') === d) : diagrams[d ?? 0]
    this.plane = diagram && childElements(diagram, NS.bpmndi, 'BPMNPlane')[0]
    if (!this.plane) throw new BpmnError('The file has no diagram to edit', 0, 0, 'Open it in a BPMN modeler and save it first.')
    for (const c of childElements(this.plane, NS.bpmndi)) {
      const id = attr(c, 'bpmnElement')
      if (id) this.di.set(id, c)
    }
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  /** Runs an edit as one step of history; restores the file when it throws. */
  private change<T>(fn: () => T): T {
    const before = this.xml
    let result: T
    try {
      result = fn()
      this.refresh()
    } catch (error) {
      this.read(before)
      throw error
    }
    if (this.xml === before) return result
    this.undoStack.push(before)
    const limit = this.options.historyLimit ?? 100
    if (this.undoStack.length > limit) this.undoStack.splice(0, this.undoStack.length - limit)
    this.redoStack = []
    this.emit()
    return result
  }

  private newId(prefix: string): string {
    const suffix = this.options.idSuffix ?? randomSuffix
    for (;;) {
      const id = `${prefix}_${suffix()}`
      if (!this.current.elements.has(id) && !this.di.has(id) && !this.diIdTaken(`${id}_di`)) return id
    }
  }

  private diIdTaken(id: string): boolean {
    for (const n of this.di.values()) if (attr(n, 'id') === id) return true
    return false
  }

  private need(id: string): BpmnElement {
    const e = this.current.elements.get(id)
    if (!e) throw new BpmnError(`"${id}" is not in the file`)
    return e
  }

  private xmlOf(id: string): XmlElement {
    return this.need(id).xml
  }

  private parentOf(node: XmlElement): XmlElement | undefined {
    return this.parents.get(node)
  }

  private isExpanded(shape: DiShape): boolean {
    if (shape.isExpanded !== undefined) return shape.isExpanded
    return this.diagram.shapes.some((s) => this.current.elements.get(s.element)?.parent === shape.element)
  }

  /** The process an element belongs to (through sub-processes and lane sets), or a pool's process. */
  processOf(id: string): string | undefined {
    let e = this.current.elements.get(id)
    if (e?.type === 'participant') return attr(e.xml, 'processRef')
    while (e) {
      if (e.type === 'process') return e.id
      e = e.parent ? this.current.elements.get(e.parent) : undefined
    }
    return undefined
  }

  /** The collaboration of the file, created around the diagram's process when there is none. */
  private collaboration(): XmlElement {
    const plane = this.diagram.plane ? this.current.elements.get(this.diagram.plane) : undefined
    if (plane?.type === 'collaboration') return plane.xml
    throw new BpmnError('Message flows connect pools', 0, 0, 'Add a pool first.')
  }

  /** Where artifacts outside any process go: the collaboration, or the process the diagram shows. */
  private rootContainer(): XmlElement {
    const plane = this.diagram.plane ? this.current.elements.get(this.diagram.plane) : undefined
    if (!plane) throw new BpmnError('The diagram shows nothing to add to')
    return plane.xml
  }

  private addCategoryValue(name: string | undefined): string {
    const root = this.doc.root
    let category = childElements(root, NS.bpmn, 'category')[0]
    if (!category) {
      category = make(this.doc, 'bpmn', 'category', { id: this.newId('Category') })
      const before = childElements(root, NS.bpmndi, 'BPMNDiagram')[0]
      insert(root, category, undefined, before)
    }
    const id = this.newId('CategoryValue')
    insert(category, make(this.doc, 'bpmn', 'categoryValue', { id, value: name || undefined }), root)
    return id
  }

  private eventDefinition(kind: EventDefinitionKind): XmlElement {
    const local = `${kind}EventDefinition`
    return make(this.doc, 'bpmn', local, { id: this.newId(idPrefix(local)) })
  }

  private addParticipant(bounds: Bounds, name: string | undefined): string {
    const root = this.doc.root
    const plane = this.diagram.plane ? this.current.elements.get(this.diagram.plane) : undefined
    const id = this.newId('Participant')
    let collaboration: XmlElement
    let processId: string
    let b = bounds
    if (plane?.type === 'process') {
      // The first pool wraps the existing process and its drawing.
      collaboration = make(this.doc, 'bpmn', 'collaboration', { id: this.newId('Collaboration') })
      insert(root, collaboration, undefined, plane.xml)
      processId = plane.id
      const shapes = this.diagram.shapes
      if (shapes.length > 0) {
        const minX = Math.min(...shapes.map((s) => s.bounds.x))
        const minY = Math.min(...shapes.map((s) => s.bounds.y))
        const maxX = Math.max(...shapes.map((s) => s.bounds.x + s.bounds.width))
        const maxY = Math.max(...shapes.map((s) => s.bounds.y + s.bounds.height))
        b = { x: minX - 60, y: minY - 40, width: Math.max(bounds.width, maxX - minX + 90), height: Math.max(bounds.height, maxY - minY + 80) }
      }
      setAttr(this.plane!, 'bpmnElement', attr(collaboration, 'id'))
    } else if (plane?.type === 'collaboration') {
      collaboration = plane.xml
      processId = this.newId('Process')
      const lastProcess = childElements(root, NS.bpmn, 'process').pop()
      const after = lastProcess ? childElements(root).indexOf(lastProcess) + 1 : -1
      const before = after > 0 ? childElements(root)[after] : childElements(root, NS.bpmndi, 'BPMNDiagram')[0]
      insert(root, make(this.doc, 'bpmn', 'process', { id: processId, isExecutable: 'false' }), undefined, before)
    } else {
      throw new BpmnError('Pools can be added to a process or a collaboration')
    }
    insert(collaboration, make(this.doc, 'bpmn', 'participant', { id, name: name || undefined, processRef: processId }), root)
    this.addShape(id, b, { isHorizontal: 'true' }, true)
    return id
  }

  private addShape(id: string, bounds: Bounds, flags: Record<string, string | undefined> = {}, first = false): void {
    const shape = make(this.doc, 'bpmndi', 'BPMNShape', { id: `${id}_di`, bpmnElement: id, ...flags }, [make(this.doc, 'dc', 'Bounds', this.boundsAttrs(bounds))])
    const before = first ? childElements(this.plane!).find((c) => c.local === 'BPMNShape' && !this.isSwimlane(attr(c, 'bpmnElement'))) : undefined
    insert(this.plane!, shape, this.parentOf(this.plane!), before)
    this.di.set(id, shape)
  }

  private isSwimlane(id: string | undefined): boolean {
    const t = id ? this.current.elements.get(id)?.type : undefined
    return t === 'participant' || t === 'lane'
  }

  private addEdge(id: string, points: Point[]): void {
    const edge = make(
      this.doc,
      'bpmndi',
      'BPMNEdge',
      { id: `${id}_di`, bpmnElement: id },
      points.map((p) => make(this.doc, 'di', 'waypoint', { x: r(p.x), y: r(p.y) })),
    )
    insert(this.plane!, edge, this.parentOf(this.plane!))
    this.di.set(id, edge)
  }

  private boundsAttrs(b: Bounds): Record<string, number> {
    return { x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height) }
  }

  private writeBounds(node: XmlElement, b: Bounds): void {
    for (const [k, v] of Object.entries(this.boundsAttrs(b))) setAttr(node, k, String(v))
  }

  private setBounds(id: string, b: Bounds): void {
    const node = this.di.get(id)
    const bounds = node && childElements(node, NS.dc, 'Bounds')[0]
    if (!bounds) throw new BpmnError(`"${id}" has no shape`)
    this.writeBounds(bounds, b)
  }

  /** Bounds as written in the tree right now (the model may lag inside an operation). */
  private boundsNow(id: string): Bounds {
    const b = childElements(this.di.get(id)!, NS.dc, 'Bounds')[0]!
    return { x: Number(attr(b, 'x')), y: Number(attr(b, 'y')), width: Number(attr(b, 'width')), height: Number(attr(b, 'height')) }
  }

  private writeWaypoints(id: string, points: Point[]): void {
    const node = this.di.get(id)
    if (!node || node.local !== 'BPMNEdge') throw new BpmnError(`"${id}" is not a flow in the diagram`)
    for (const w of childElements(node, NS.di, 'waypoint')) detach(node, w)
    const label = childElements(node, NS.bpmndi, 'BPMNLabel')[0]
    for (const p of points) insert(node, make(this.doc, 'di', 'waypoint', { x: r(p.x), y: r(p.y) }), this.plane, label)
  }

  private translateShape(id: string, dx: number, dy: number): void {
    const node = this.di.get(id)
    if (!node || node.local !== 'BPMNShape') return
    const shape = this.shape(id)!
    this.setBounds(id, { ...shape.bounds, x: shape.bounds.x + dx, y: shape.bounds.y + dy })
    this.translateLabel(node, dx, dy)
  }

  private translateLabel(node: XmlElement, dx: number, dy: number): void {
    const label = childElements(node, NS.bpmndi, 'BPMNLabel')[0]
    const b = label && childElements(label, NS.dc, 'Bounds')[0]
    if (!b) return
    setAttr(b, 'x', String(r(Number(attr(b, 'x')) + dx)))
    setAttr(b, 'y', String(r(Number(attr(b, 'y')) + dy)))
  }

  /** The ids, their contents and the boundary events on them. */
  private closure(ids: string[]): Set<string> {
    const set = new Set(ids)
    const containers = ids.flatMap((id) => {
      const e = this.current.elements.get(id)
      if (!e) return []
      if (e.type === 'participant') {
        const process = attr(e.xml, 'processRef')
        return process ? [process] : []
      }
      return isSubProcess(e.type) ? [id] : []
    })
    const within = (e: BpmnElement) => {
      for (let p = e.parent; p; p = this.current.elements.get(p)?.parent) if (containers.includes(p)) return true
      return false
    }
    let grew = true
    while (grew) {
      grew = false
      for (const e of this.current.elements.values()) {
        if (set.has(e.id)) continue
        const attached = attr(e.xml, 'attachedToRef')
        if ((e.type === 'boundaryEvent' && attached && set.has(attached)) || within(e)) {
          set.add(e.id)
          grew = true
        }
      }
    }
    return set
  }

  /**
   * After shapes moved: flows with both ends moved are translated, flows
   * with one end moved are routed again.
   */
  private updateEdges(moved: Set<string>, dx: number, dy: number): void {
    for (const edge of this.diagram.edges) {
      const ends = this.ends(edge.element)
      if (!ends) continue
      const [s, t] = ends
      const node = this.di.get(edge.element)
      if (!node) continue
      if (moved.has(s) && moved.has(t)) {
        if (dx === 0 && dy === 0) continue
        this.writeWaypoints(edge.element, translate(edge.waypoints, dx, dy))
        this.translateLabel(node, dx, dy)
        continue
      }
      if (!moved.has(s) && !moved.has(t)) continue
      const sb = this.shape(s)?.bounds
      const tb = this.shape(t)?.bounds
      if (!sb || !tb) continue
      const type = this.current.elements.get(edge.element)?.type
      const source = this.current.elements.get(s)
      const before = edge.waypoints
      const next = route(sb, tb, { vertical: type === 'messageFlow' || (source !== undefined && isGateway(source.type)) })
      this.writeWaypoints(edge.element, simplify(next))
      // The label follows the middle of the flow.
      const mid = (pts: Point[]) => pts[Math.floor((pts.length - 1) / 2)]!
      const a = mid(before)
      const b = mid(next)
      this.translateLabel(node, b.x - a.x, b.y - a.y)
    }
  }

  /** Moves a flow node's semantics into the container its new position lies in. */
  private reparent(id: string, moving: Set<string>): void {
    const e = this.current.elements.get(id)
    const shape = this.shape(id)
    if (!e || !shape || !isFlowNode(e.type) || e.type === 'boundaryEvent') {
      if (e && shape && (isData(e.type) || e.type === 'textAnnotation')) this.reparentArtifact(e, shape, moving)
      return
    }
    const place = this.containerAt(centre(shape.bounds), moving)
    // Lane membership.
    const lanes = [...this.current.elements.values()].filter((l) => l.type === 'lane')
    for (const lane of lanes) {
      const ref = childElements(lane.xml, NS.bpmn, 'flowNodeRef').find((c) => refText(c) === id)
      if (ref && lane.id !== place.lane) detach(lane.xml, ref)
    }
    if (place.lane && !childElements(this.xmlOf(place.lane), NS.bpmn, 'flowNodeRef').some((c) => refText(c) === id)) this.addFlowNodeRef(place.lane, id)
    if (!place.container || place.container === e.parent) {
      this.refresh()
      return
    }
    // Into another process or sub-process: boundary events come along, flows to
    // what stayed behind can no longer be sequence flows.
    const target = this.xmlOf(place.container)
    const nodes = [e, ...[...this.current.elements.values()].filter((b) => b.type === 'boundaryEvent' && attr(b.xml, 'attachedToRef') === id)]
    for (const n of nodes) {
      const parent = this.parents.get(n.xml)
      if (parent) detach(parent, n.xml)
      insert(target, n.xml, this.parentOf(target))
    }
    this.refresh()
    const broken: string[] = []
    for (const flow of this.current.elements.values()) {
      if (flow.type !== 'sequenceFlow') continue
      const ends = this.ends(flow.id)
      if (!ends) continue
      const [s, t] = ends.map((x) => this.current.elements.get(x))
      if (s && t && s.parent !== t.parent) broken.push(flow.id)
      else if (s && t && s.parent !== flow.parent && s.parent) {
        // Both ends moved together: the flow moves with them.
        const parent = this.parents.get(flow.xml)
        if (parent) detach(parent, flow.xml)
        const into = this.xmlOf(s.parent)
        insert(into, flow.xml, this.parentOf(into))
      }
    }
    this.refresh()
    if (broken.length > 0) this.removeNow(broken)
  }

  private reparentArtifact(e: BpmnElement, shape: DiShape, moving: Set<string>): void {
    const place = this.containerAt(centre(shape.bounds), moving)
    const container = place.container && isData(e.type) ? place.container : place.process
    if (!container || container === e.parent) return
    const target = this.xmlOf(container)
    const parent = this.parents.get(e.xml)
    if (parent) detach(parent, e.xml)
    insert(target, e.xml, this.parentOf(target))
    this.refresh()
  }

  /** Removes elements inside a running operation. */
  private removeNow(ids: string[]): void {
    const gone = new Set(ids)
    const refs = new Set(['incoming', 'outgoing', 'flowNodeRef'])
    const doomed: XmlElement[] = []
    for (const node of walk(this.doc.root)) {
      const id = attr(node, 'id')
      if (node.ns === NS.bpmn && id && gone.has(id)) doomed.push(node)
      else if (node.ns === NS.bpmn && refs.has(node.local) && gone.has(refText(node))) doomed.push(node)
      else if (node.ns === NS.bpmndi && gone.has(attr(node, 'bpmnElement') ?? '') && node.local !== 'BPMNPlane') doomed.push(node)
      const def = attr(node, 'default')
      if (def && gone.has(def)) setAttr(node, 'default', undefined)
    }
    for (const node of doomed) {
      const parent = this.parents.get(node)
      if (parent) detach(parent, node)
    }
    this.refresh()
  }

  private addRef(node: XmlElement, local: 'incoming' | 'outgoing', id: string): void {
    const kids = childElements(node)
    const order = local === 'incoming' ? ['documentation', 'extensionElements', 'incoming'] : ['documentation', 'extensionElements', 'incoming', 'outgoing']
    let lastIndex = -1
    kids.forEach((k, i) => {
      if (k.ns === NS.bpmn && order.includes(k.local)) lastIndex = i
      else if (k.ns !== NS.bpmn && k.local === 'extensionElements') lastIndex = i
    })
    const before = kids[lastIndex + 1]
    insert(node, makeText(this.doc, local, id), this.parentOf(node), before)
  }

  /** Inserts into an activity after its references, before its content. */
  private insertActivityChild(node: XmlElement, child: XmlElement): void {
    const kids = childElements(node)
    const head = new Set(['documentation', 'extensionElements', 'incoming', 'outgoing', 'ioSpecification', 'property', 'dataInputAssociation', 'dataOutputAssociation'])
    const loop = new Set(['standardLoopCharacteristics', 'multiInstanceLoopCharacteristics'])
    let lastIndex = -1
    kids.forEach((k, i) => {
      if (head.has(k.local) && !(child.local === 'property' && (k.local === 'dataInputAssociation' || k.local === 'dataOutputAssociation'))) lastIndex = i
    })
    let before = kids[lastIndex + 1]
    if (loop.has(child.local)) before = kids.find((k) => !head.has(k.local))
    insert(node, child, this.parentOf(node), before)
  }

  private addFlowNodeRef(lane: string, id: string): void {
    const node = this.xmlOf(lane)
    const childLaneSet = childElements(node, NS.bpmn, 'childLaneSet')[0]
    insert(node, makeText(this.doc, 'flowNodeRef', id), this.parentOf(node), childLaneSet)
  }

  /** Every lane of a pool, nested ones included. */
  private lanesOf(participant: string): string[] {
    const process = this.processOf(participant)
    return [...this.current.elements.values()].filter((e) => e.type === 'lane' && this.processOf(e.id) === process && this.di.has(e.id)).map((e) => e.id)
  }

  /** The lanes directly in a pool's process, top to bottom. */
  private topLanes(participant: string): string[] {
    const process = this.processOf(participant)
    return [...this.current.elements.values()]
      .filter((e) => e.type === 'lane' && this.di.has(e.id) && this.current.elements.get(e.parent ?? '')?.parent === process)
      .map((e) => e.id)
      .sort((a, b) => this.boundsNow(a).y - this.boundsNow(b).y)
  }

  private poolOfLane(lane: string): string | undefined {
    const process = this.processOf(lane)
    return [...this.current.elements.values()].find((e) => e.type === 'participant' && attr(e.xml, 'processRef') === process && this.di.has(e.id))?.id
  }

  /** A removed lane's room goes to the lane above it, or below for the first one. */
  private closeLaneGap(lane: string): void {
    const pool = this.poolOfLane(lane)
    if (!pool) return
    const lanes = this.topLanes(pool)
    const i = lanes.indexOf(lane)
    if (i < 0) return
    const gone = this.boundsNow(lane)
    const neighbour = lanes[i - 1] ?? lanes[i + 1]
    if (!neighbour) return
    const nb = this.boundsNow(neighbour)
    if (i > 0) this.setBounds(neighbour, { ...nb, height: nb.height + gone.height })
    else this.setBounds(neighbour, { ...nb, y: gone.y, height: nb.height + gone.height })
  }
}
