/**
 * An editable DMN file: the decision requirements diagram and the logic of
 * its decisions — decision tables and literal expressions — with undo.
 *
 * Like `BpmnDocument`, it edits the XML tree in place. The layout is kept
 * where the file keeps it: DMNDI (DMN 1.2 and later) or bpmn.io's `biodi`
 * extension (DMN 1.1). A file without one gets the computed layout written
 * on its first change.
 */
import { BpmnError } from '../errors'
import type { Bounds, Point } from '../model'
import { safeColor } from '../theme'
import { attr, childElements, parseXml, writeXml, type XmlDocument, type XmlElement, type XmlLimits, type XmlNode } from '../xml'
import { detach, insert, makeIn, parentMap, prefixFor, setAttr, walk } from '../edit/tree'
import { autoLayout, dmnSize } from './layout'
import { dmnFromDocument, DMN_BIODI, hrefId, isDmnModelNs, type DecisionTable, type DmnDecision, type DmnDiagram, type DmnElement, type DmnModel, type HitPolicy, type RequirementKind } from './model'

const DMNDI_13 = 'https://www.omg.org/spec/DMN/20191111/DMNDI/'
const DMNDI_12 = 'http://www.omg.org/spec/DMN/20180521/DMNDI/'
const DC = 'http://www.omg.org/spec/DMN/20180521/DC/'
const DI = 'http://www.omg.org/spec/DMN/20180521/DI/'
const BIOC = 'http://bpmn.io/schema/bpmn/biocolor/1.0'
const COLOR = 'http://www.omg.org/spec/BPMN/non-normative/color/1.0'

export type DrdShapeType = 'decision' | 'inputData' | 'businessKnowledgeModel' | 'knowledgeSource' | 'textAnnotation'
export type DecisionLogicKind = 'table' | 'literal' | 'none'

export interface DmnDocumentOptions {
  idSuffix?: () => string
  historyLimit?: number
  limits?: XmlLimits
}

export interface InputColumn {
  label?: string
  expression?: string
  typeRef?: string
}

export interface OutputColumn {
  label?: string
  name?: string
  typeRef?: string
}

/** A blank DMN 1.3 file with one decision holding an empty decision table. */
export function emptyDmn(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="${DMNDI_13}" xmlns:dc="${DC}" id="Definitions_1" name="Decisions" namespace="http://bpmn.io/schema/dmn">
  <decision id="Decision_1" name="Decision 1">
    <decisionTable id="DecisionTable_1">
      <input id="Input_1">
        <inputExpression id="InputExpression_1" typeRef="string">
          <text></text>
        </inputExpression>
      </input>
      <output id="Output_1" typeRef="string" />
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="DMNDiagram_1">
      <dmndi:DMNShape id="DMNShape_1" dmnElementRef="Decision_1">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
`
}

function randomSuffix(): string {
  let s = ''
  for (let i = 0; i < 7; i++) s += Math.floor(Math.random() * 36).toString(36)
  return s
}

const r = Math.round
const centre = (b: Bounds): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/** Where a line from a shape's centre towards `to` leaves it. */
function border(b: Bounds, to: Point): Point {
  const c = centre(b)
  const dx = to.x - c.x
  const dy = to.y - c.y
  if (dx === 0 && dy === 0) return c
  const s = Math.min(dx === 0 ? Infinity : b.width / 2 / Math.abs(dx), dy === 0 ? Infinity : b.height / 2 / Math.abs(dy))
  return { x: c.x + dx * s, y: c.y + dy * s }
}

/** A straight requirement line between two shapes. */
export function drdLine(source: Bounds, target: Bounds): Point[] {
  const a = border(source, centre(target))
  const b = border(target, centre(source))
  return [
    { x: r(a.x), y: r(a.y) },
    { x: r(b.x), y: r(b.y) },
  ]
}

/** The requirement a connection from `source` to `target` makes, or null. */
export function requirementBetween(source: string, target: string): RequirementKind | 'association' | null {
  if (source === 'textAnnotation' || target === 'textAnnotation') return source === target ? null : 'association'
  if (target === 'decision' && (source === 'decision' || source === 'inputData')) return 'information'
  if (source === 'businessKnowledgeModel' && (target === 'decision' || target === 'businessKnowledgeModel')) return 'knowledge'
  if (source === 'knowledgeSource' && (target === 'decision' || target === 'businessKnowledgeModel' || target === 'knowledgeSource')) return 'authority'
  if ((source === 'decision' || source === 'inputData') && target === 'knowledgeSource') return 'authority'
  return null
}

export class DmnDocument {
  private doc!: XmlDocument
  private current!: DmnModel
  private generated: DmnDiagram | undefined
  private parents = new Map<XmlElement, XmlElement>()
  private undoStack: string[] = []
  private redoStack: string[] = []
  private listeners = new Set<() => void>()
  private readonly options: DmnDocumentOptions

  constructor(xml: string = emptyDmn(), options: DmnDocumentOptions = {}) {
    this.options = options
    this.read(xml)
  }

  // -------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------

  get model(): DmnModel {
    return this.current
  }

  /** The diagram: the file's own, or (until the first change) a computed one. */
  get diagram(): DmnDiagram {
    return this.current.diagrams[0] ?? (this.generated ??= autoLayout(this.current))
  }

  get xml(): string {
    return writeXml(this.doc)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

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

  element(id: string): DmnElement | undefined {
    return this.current.elements.get(id)
  }

  decision(id: string): DmnDecision | undefined {
    return this.current.decisions.find((d) => d.id === id)
  }

  shape(id: string): Bounds | undefined {
    return this.diagram.shapes.find((s) => s.element === id)?.bounds
  }

  /** What `connect` would create, or null. */
  canConnect(source: string, target: string): RequirementKind | 'association' | null {
    const s = this.current.elements.get(source)
    const t = this.current.elements.get(target)
    if (!s || !t || source === target) return null
    const kind = requirementBetween(s.type, t.type)
    if (kind && kind !== 'association' && this.current.requirements.some((q) => q.source === source && q.target === target)) return null
    return kind
  }

  // -------------------------------------------------------------------
  // Diagram
  // -------------------------------------------------------------------

  /** Adds an element centred on `at`. A decision starts with an empty decision table unless `logic` says otherwise. */
  createElement(type: DrdShapeType, at: Point, options: { name?: string; logic?: DecisionLogicKind } = {}): string {
    return this.change(() => {
      const size = dmnSize(type)
      const id = this.newId(type === 'textAnnotation' ? 'TextAnnotation' : type[0]!.toUpperCase() + type.slice(1))
      const name = options.name ?? (type === 'textAnnotation' ? undefined : this.defaultName(type))
      let node: XmlElement
      if (type === 'textAnnotation') {
        node = this.make('textAnnotation', { id }, [this.make('text', {}, name ? [{ kind: 'text', value: name }] : [])])
      } else {
        node = this.make(type, { id, name })
        if (type === 'decision') this.writeLogic(node, options.logic ?? 'table')
      }
      const before = type === 'textAnnotation' ? this.firstOf(['DMNDI']) : this.firstOf(['textAnnotation', 'association', 'group', 'DMNDI'])
      insert(this.doc.root, node, undefined, before)
      this.refresh()
      this.addShape(id, { x: r(at.x - size.width / 2), y: r(at.y - size.height / 2), ...size })
      return id
    })
  }

  /** Connects two elements with the requirement (or association) the notation allows. */
  connect(source: string, target: string): string {
    return this.change(() => {
      const kind = this.canConnect(source, target)
      if (!kind) throw new BpmnError(`"${source}" cannot be connected to "${target}"`)
      const s = this.current.elements.get(source)!
      const t = this.current.elements.get(target)!
      let id: string
      if (kind === 'association') {
        id = this.newId('Association')
        const node = this.make('association', { id }, [this.make('sourceRef', { href: `#${source}` }), this.make('targetRef', { href: `#${target}` })])
        insert(this.doc.root, node, undefined, this.firstOf(['DMNDI']))
      } else {
        const local = `${kind}Requirement`
        const ref =
          kind === 'information'
            ? s.type === 'decision'
              ? 'requiredDecision'
              : 'requiredInput'
            : kind === 'knowledge'
              ? 'requiredKnowledge'
              : s.type === 'knowledgeSource'
                ? 'requiredAuthority'
                : s.type === 'decision'
                  ? 'requiredDecision'
                  : 'requiredInput'
        const legacy = this.current.version === '1.1'
        id = legacy ? `${source}→${target}` : this.newId(local[0]!.toUpperCase() + local.slice(1))
        const node = this.make(local, { id: legacy ? undefined : id }, [this.make(ref, { href: `#${source}` })])
        this.insertRequirement(t.xml, node)
      }
      this.refresh()
      const a = this.shape(source)
      const b = this.shape(target)
      if (a && b) this.writeEdge(id, target, source, drdLine(a, b))
      return id
    })
  }

  /** Moves elements; their lines are drawn again. */
  move(ids: string[], dx: number, dy: number): void {
    if (ids.length === 0 || (dx === 0 && dy === 0)) return
    this.change(() => {
      const moving = new Set(ids)
      for (const id of ids) {
        const b = this.shape(id)
        if (b) this.writeBounds(id, { ...b, x: b.x + dx, y: b.y + dy })
      }
      this.refresh()
      this.reroute(moving, dx, dy)
    })
  }

  resize(id: string, bounds: Bounds): void {
    this.change(() => {
      if (!this.shape(id)) throw new BpmnError(`"${id}" has no shape`)
      this.writeBounds(id, { x: r(bounds.x), y: r(bounds.y), width: Math.max(30, r(bounds.width)), height: Math.max(20, r(bounds.height)) })
      this.refresh()
      this.reroute(new Set([id]), 0, 0, true)
    })
  }

  /** Removes elements, requirements or associations, with everything that refers to them. */
  remove(ids: string[]): void {
    if (ids.length === 0) return
    this.change(() => {
      const gone = new Set(ids)
      for (const q of this.current.requirements) if (gone.has(q.source) || gone.has(q.target)) gone.add(q.id)
      for (const e of this.current.elements.values()) {
        if (e.type !== 'association') continue
        const refs = ['sourceRef', 'targetRef'].map((l) => hrefId(attr(childElements(e.xml).find((c) => c.local === l) ?? e.xml, 'href')))
        if (refs.some((x) => x && gone.has(x))) gone.add(e.id)
      }
      const doomed: XmlElement[] = []
      for (const q of this.current.requirements) if (gone.has(q.id)) doomed.push(q.xml)
      for (const node of walk(this.doc.root)) {
        const id = attr(node, 'id')
        if (node !== this.doc.root && isDmnModelNs(node.ns) && id && gone.has(id) && node.local !== 'decisionTable') {
          if (this.current.elements.has(id)) doomed.push(node)
        }
        const ref = attr(node, 'dmnElementRef')
        if (ref && gone.has(hrefId(ref)!)) doomed.push(node)
        // Decision services list their decisions by href.
        if (isDmnModelNs(node.ns) && /^(outputDecision|encapsulatedDecision|inputDecision|inputData)$/.test(node.local) && gone.has(hrefId(attr(node, 'href')) ?? '')) doomed.push(node)
        if (node.ns === DMN_BIODI && node.local === 'edge' && gone.has(hrefId(attr(node, 'source')) ?? '')) doomed.push(node)
      }
      for (const n of new Set(doomed)) {
        const p = this.parents.get(n)
        if (p) detach(p, n)
      }
    })
  }

  /** Renames an element (a decision's variable follows), or sets an annotation's text. */
  rename(id: string, name: string): void {
    this.change(() => {
      const e = this.need(id)
      const value = name.trim() === '' ? undefined : name
      if (e.type === 'textAnnotation') {
        let t = childElements(e.xml).find((c) => c.local === 'text')
        if (!t) {
          t = this.make('text')
          insert(e.xml, t, this.doc.root)
        }
        t.children = value ? [{ kind: 'text', value }] : []
        return
      }
      setAttr(e.xml, 'name', value)
      const variable = childElements(e.xml).find((c) => isDmnModelNs(c.ns) && c.local === 'variable')
      if (variable && value) setAttr(variable, 'name', value)
    })
  }

  /** Renames an id with every reference to it. */
  setId(id: string, next: string): void {
    this.change(() => {
      if (!/^[A-Za-z_][\w.-]*$/.test(next)) throw new BpmnError(`"${next}" is not a valid id`)
      if (this.current.elements.has(next)) throw new BpmnError(`The id "${next}" is taken`)
      this.need(id)
      for (const node of walk(this.doc.root)) {
        for (const a of node.attributes) {
          if (a.local === 'id' && a.value === id) a.value = next
          else if ((a.local === 'href' || a.local === 'dmnElementRef' || (a.local === 'source' && node.ns === DMN_BIODI)) && hrefId(a.value) === id) a.value = a.value.slice(0, a.value.length - id.length) + next
        }
      }
    })
  }

  setColors(ids: string[], colors: { fill?: string; stroke?: string }): void {
    for (const c of [colors.fill, colors.stroke]) if (c !== undefined && !safeColor(c)) throw new BpmnError(`"${c}" is not a colour`)
    this.change(() => {
      this.ensureLayout()
      const plane = this.plane()
      if (!plane) throw new BpmnError('Colours are kept in DMNDI, which DMN 1.1 files do not have')
      const bioc = prefixFor(this.doc, BIOC, 'bioc')
      const color = prefixFor(this.doc, COLOR, 'color')
      for (const id of ids) {
        const node = childElements(plane).find((c) => hrefId(attr(c, 'dmnElementRef')) === id)
        if (!node) continue
        setAttr(node, `${bioc}:stroke`, colors.stroke, BIOC)
        setAttr(node, `${color}:border-color`, colors.stroke, COLOR)
        setAttr(node, `${bioc}:fill`, node.local === 'DMNEdge' ? undefined : colors.fill, BIOC)
        setAttr(node, `${color}:background-color`, node.local === 'DMNEdge' ? undefined : colors.fill, COLOR)
      }
    })
  }

  // -------------------------------------------------------------------
  // Decision logic
  // -------------------------------------------------------------------

  /** Replaces a decision's logic with an empty table, an empty literal expression, or nothing. */
  setLogic(decision: string, kind: DecisionLogicKind): void {
    this.change(() => {
      const d = this.needDecision(decision)
      for (const c of childElements(d.xml)) if (isDmnModelNs(c.ns) && LOGIC.has(c.local)) detach(d.xml, c)
      this.writeLogic(d.xml, kind)
    })
  }

  setLiteral(decision: string, text: string): void {
    this.change(() => {
      const d = this.needDecision(decision)
      if (d.logic?.kind !== 'literal') throw new BpmnError(`"${decision}" has no literal expression`)
      let t = childElements(d.logic.xml).find((c) => c.local === 'text')
      if (!t) {
        t = this.make('text')
        insert(d.logic.xml, t, d.xml)
      }
      t.children = text ? [{ kind: 'text', value: text }] : []
    })
  }

  /** The type of a decision's result (its variable). */
  setResultType(decision: string, typeRef: string | undefined): void {
    this.change(() => {
      const d = this.needDecision(decision)
      let v = childElements(d.xml).find((c) => isDmnModelNs(c.ns) && c.local === 'variable')
      if (!v) {
        if (!typeRef) return
        v = this.make('variable', { id: this.newId('InformationItem'), name: d.name ?? d.id })
        this.insertRequirement(d.xml, v, true)
      }
      setAttr(v, 'typeRef', typeRef || undefined)
      if (d.logic?.kind === 'literal') setAttr(d.logic.xml, 'typeRef', typeRef || undefined)
    })
  }

  setHitPolicy(decision: string, hitPolicy: HitPolicy, aggregation?: DecisionTable['aggregation']): void {
    this.change(() => {
      const t = this.table(decision)
      setAttr(t.xml, 'hitPolicy', hitPolicy === 'UNIQUE' ? undefined : hitPolicy)
      setAttr(t.xml, 'aggregation', hitPolicy === 'COLLECT' ? aggregation : undefined)
    })
  }

  /** Adds a rule (every cell empty) at `index`, at the end by default. Returns its id. */
  addRule(decision: string, index?: number): string {
    return this.change(() => {
      const t = this.table(decision)
      const id = this.newId('DecisionRule')
      const kids: XmlElement[] = [
        ...t.inputs.map(() => this.make('inputEntry', { id: this.newId('UnaryTests') }, [this.make('text')])),
        ...t.outputs.map(() => this.make('outputEntry', { id: this.newId('LiteralExpression') }, [this.make('text')])),
        ...t.annotations.map(() => this.make('annotationEntry', {}, [this.make('text')])),
      ]
      const rules = this.ruleNodes(t)
      insert(t.xml, this.make('rule', { id }, kids), this.parents.get(t.xml), index !== undefined ? rules[index] : undefined)
      return id
    })
  }

  removeRule(decision: string, index: number): void {
    this.change(() => {
      const t = this.table(decision)
      const rule = this.ruleNodes(t)[index]
      if (!rule) throw new BpmnError(`The table has no rule ${index + 1}`)
      detach(t.xml, rule)
    })
  }

  /** Moves a rule from one position to another. */
  moveRule(decision: string, from: number, to: number): void {
    this.change(() => {
      const t = this.table(decision)
      const rules = this.ruleNodes(t)
      const rule = rules[from]
      if (!rule || to < 0 || to >= rules.length || from === to) return
      detach(t.xml, rule)
      const after = this.ruleNodes(t)
      insert(t.xml, rule, this.parents.get(t.xml), after[to])
    })
  }

  /**
   * Sets a cell: an input entry (unary tests), an output entry, an
   * annotation (DMN 1.3 annotation column, or the rule's description when
   * the table has none).
   */
  setCell(decision: string, rule: number, column: { kind: 'input' | 'output' | 'annotation'; index: number }, text: string): void {
    this.change(() => {
      const t = this.table(decision)
      const node = this.ruleNodes(t)[rule]
      if (!node) throw new BpmnError(`The table has no rule ${rule + 1}`)
      if (column.kind === 'annotation' && t.annotations.length === 0) {
        let d = childElements(node).find((c) => c.local === 'description')
        if (!d) {
          d = this.make('description')
          insert(node, d, t.xml, childElements(node)[0])
        }
        d.children = text ? [{ kind: 'text', value: text }] : []
        if (!text) detach(node, d)
        return
      }
      const local = column.kind === 'input' ? 'inputEntry' : column.kind === 'output' ? 'outputEntry' : 'annotationEntry'
      const entry = childElements(node).filter((c) => c.local === local)[column.index]
      if (!entry) throw new BpmnError(`The table has no ${column.kind} column ${column.index + 1}`)
      let tx = childElements(entry).find((c) => c.local === 'text')
      if (!tx) {
        tx = this.make('text')
        insert(entry, tx, node)
      }
      tx.children = text ? [{ kind: 'text', value: text }] : []
    })
  }

  /** Adds an input column at `index` (the end by default); every rule gets an empty cell. */
  addInput(decision: string, column: InputColumn = {}, index?: number): void {
    this.change(() => {
      const t = this.table(decision)
      const inputs = childElements(t.xml).filter((c) => c.local === 'input')
      const node = this.make('input', { id: this.newId('InputClause'), label: column.label || undefined }, [
        this.make('inputExpression', { id: this.newId('LiteralExpression'), typeRef: column.typeRef ?? 'string' }, [this.make('text', {}, column.expression ? [{ kind: 'text', value: column.expression }] : [])]),
      ])
      const before = index !== undefined && inputs[index] ? inputs[index] : childElements(t.xml).find((c) => c.local === 'output')
      insert(t.xml, node, this.parents.get(t.xml), before)
      for (const rule of this.ruleNodes(t)) {
        const entries = childElements(rule).filter((c) => c.local === 'inputEntry')
        const at = index !== undefined && entries[index] ? entries[index] : childElements(rule).find((c) => c.local === 'outputEntry')
        insert(rule, this.make('inputEntry', { id: this.newId('UnaryTests') }, [this.make('text')]), t.xml, at)
      }
    })
  }

  addOutput(decision: string, column: OutputColumn = {}, index?: number): void {
    this.change(() => {
      const t = this.table(decision)
      const outputs = childElements(t.xml).filter((c) => c.local === 'output')
      const node = this.make('output', { id: this.newId('OutputClause'), label: column.label || undefined, name: column.name || undefined, typeRef: column.typeRef ?? 'string' })
      const before = index !== undefined && outputs[index] ? outputs[index] : childElements(t.xml).find((c) => c.local === 'annotation' || c.local === 'rule')
      insert(t.xml, node, this.parents.get(t.xml), before)
      for (const rule of this.ruleNodes(t)) {
        const entries = childElements(rule).filter((c) => c.local === 'outputEntry')
        const at = index !== undefined && entries[index] ? entries[index] : childElements(rule).find((c) => c.local === 'annotationEntry')
        insert(rule, this.make('outputEntry', { id: this.newId('LiteralExpression') }, [this.make('text')]), t.xml, at)
      }
    })
  }

  /** Removes a column with its cells; a table keeps at least one input and one output. */
  removeColumn(decision: string, kind: 'input' | 'output', index: number): void {
    this.change(() => {
      const t = this.table(decision)
      const columns = childElements(t.xml).filter((c) => c.local === kind)
      if (columns.length <= 1) throw new BpmnError(`A decision table needs at least one ${kind}`)
      const column = columns[index]
      if (!column) throw new BpmnError(`The table has no ${kind} column ${index + 1}`)
      detach(t.xml, column)
      for (const rule of this.ruleNodes(t)) {
        const entry = childElements(rule).filter((c) => c.local === `${kind}Entry`)[index]
        if (entry) detach(rule, entry)
      }
    })
  }

  updateInput(decision: string, index: number, column: InputColumn): void {
    this.change(() => {
      const node = childElements(this.table(decision).xml).filter((c) => c.local === 'input')[index]
      if (!node) throw new BpmnError(`The table has no input column ${index + 1}`)
      if (column.label !== undefined) setAttr(node, 'label', column.label || undefined)
      const expr = childElements(node).find((c) => c.local === 'inputExpression')
      if (expr) {
        if (column.typeRef !== undefined) setAttr(expr, 'typeRef', column.typeRef || undefined)
        if (column.expression !== undefined) {
          let t = childElements(expr).find((c) => c.local === 'text')
          if (!t) {
            t = this.make('text')
            insert(expr, t, node)
          }
          t.children = column.expression ? [{ kind: 'text', value: column.expression }] : []
        }
      }
    })
  }

  updateOutput(decision: string, index: number, column: OutputColumn): void {
    this.change(() => {
      const node = childElements(this.table(decision).xml).filter((c) => c.local === 'output')[index]
      if (!node) throw new BpmnError(`The table has no output column ${index + 1}`)
      if (column.label !== undefined) setAttr(node, 'label', column.label || undefined)
      if (column.name !== undefined) setAttr(node, 'name', column.name || undefined)
      if (column.typeRef !== undefined) setAttr(node, 'typeRef', column.typeRef || undefined)
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
    this.current = dmnFromDocument(this.doc)
    this.parents = parentMap(this.doc)
    this.generated = undefined
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  private change<T>(fn: () => T): T {
    const before = this.xml
    let result: T
    try {
      this.ensureLayout()
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
    const taken = new Set<string>()
    for (const n of walk(this.doc.root)) {
      const id = attr(n, 'id')
      if (id) taken.add(id)
    }
    for (;;) {
      const id = `${prefix}_${suffix()}`
      if (!taken.has(id)) return id
    }
  }

  private defaultName(type: string): string {
    const base = { decision: 'Decision', inputData: 'Input', businessKnowledgeModel: 'Knowledge model', knowledgeSource: 'Knowledge source' }[type] ?? type
    const count = [...this.current.elements.values()].filter((e) => e.type === type).length
    return `${base} ${count + 1}`
  }

  private need(id: string): DmnElement {
    const e = this.current.elements.get(id)
    if (!e) throw new BpmnError(`"${id}" is not in the file`)
    return e
  }

  private needDecision(id: string): DmnDecision {
    const d = this.decision(id)
    if (!d) throw new BpmnError(`"${id}" is not a decision`)
    return d
  }

  private table(decision: string): DecisionTable {
    const d = this.needDecision(decision)
    if (d.logic?.kind !== 'table') throw new BpmnError(`"${decision}" has no decision table`)
    return d.logic
  }

  private ruleNodes(t: DecisionTable): XmlElement[] {
    return childElements(t.xml).filter((c) => isDmnModelNs(c.ns) && c.local === 'rule')
  }

  /** An element of the file's DMN version, in the namespace it uses. */
  private make(local: string, attrs: Record<string, string | number | undefined> = {}, children: XmlNode[] = []): XmlElement {
    return makeIn(this.doc, this.doc.root.ns, 'dmn', local, attrs, children)
  }

  private firstOf(locals: string[]): XmlElement | undefined {
    return childElements(this.doc.root).find((c) => locals.includes(c.local))
  }

  private writeLogic(decision: XmlElement, kind: DecisionLogicKind): void {
    if (kind === 'none') return
    const node =
      kind === 'table'
        ? this.make('decisionTable', { id: this.newId('DecisionTable') }, [
            this.make('input', { id: this.newId('InputClause') }, [this.make('inputExpression', { id: this.newId('LiteralExpression'), typeRef: 'string' }, [this.make('text')])]),
            this.make('output', { id: this.newId('OutputClause'), typeRef: 'string' }),
          ])
        : this.make('literalExpression', { id: this.newId('LiteralExpression') }, [this.make('text')])
    insert(decision, node, this.parents.get(decision) ?? this.doc.root)
  }

  /** Inserts a requirement (or a variable) where the schema puts it: after the heading elements, before the logic. */
  private insertRequirement(owner: XmlElement, node: XmlElement, first = false): void {
    const head = first
      ? ['description', 'extensionElements', 'question', 'allowedAnswers']
      : ['description', 'extensionElements', 'question', 'allowedAnswers', 'variable', 'informationRequirement', 'knowledgeRequirement', 'authorityRequirement']
    const kids = childElements(owner)
    const before = kids.find((c) => !head.includes(c.local))
    insert(owner, node, this.parents.get(owner) ?? this.doc.root, before)
  }

  // Layout -------------------------------------------------------------

  private legacy(): boolean {
    return this.current.version === '1.1'
  }

  private plane(): XmlElement | undefined {
    const dmndi = childElements(this.doc.root).find((c) => c.local === 'DMNDI')
    return dmndi && childElements(dmndi).find((c) => c.local === 'DMNDiagram')
  }

  /** Writes the computed layout into a file that has none, so it can be changed. */
  private ensureLayout(): void {
    if (this.current.diagrams.length > 0) return
    const layout = autoLayout(this.current)
    if (!this.legacy()) {
      const uri = this.current.version === '1.2' ? DMNDI_12 : DMNDI_13
      const dmndi = makeIn(this.doc, uri, 'dmndi', 'DMNDI', {}, [makeIn(this.doc, uri, 'dmndi', 'DMNDiagram', { id: this.newId('DMNDiagram') })])
      insert(this.doc.root, dmndi, undefined)
      this.refresh()
    }
    for (const s of layout.shapes) this.addShape(s.element, s.bounds)
    this.refresh()
    for (const e of layout.edges) {
      const q = this.current.requirements.find((x) => x.id === e.element)
      if (q) this.writeEdge(q.id, q.target, q.source, e.waypoints)
    }
    this.refresh()
  }

  private addShape(id: string, b: Bounds): void {
    if (this.legacy()) {
      const e = this.need(id)
      this.extension(e.xml).push(makeIn(this.doc, DMN_BIODI, 'biodi', 'bounds', { x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height) }))
      this.flushExtension(e.xml)
      return
    }
    const plane = this.plane()!
    const uri = plane.ns
    const node = makeIn(this.doc, uri, 'dmndi', 'DMNShape', { id: this.newId('DMNShape'), dmnElementRef: id }, [
      makeIn(this.doc, DC, 'dc', 'Bounds', { height: r(b.height), width: r(b.width), x: r(b.x), y: r(b.y) }),
    ])
    insert(plane, node, this.parents.get(plane), childElements(plane).find((c) => c.local === 'DMNEdge'))
  }

  private writeBounds(id: string, b: Bounds): void {
    let node: XmlElement | undefined
    if (this.legacy()) {
      const ext = childElements(this.need(id).xml).find((c) => c.local === 'extensionElements')
      node = ext && childElements(ext, DMN_BIODI, 'bounds')[0]
    } else {
      const shape = childElements(this.plane()!).find((c) => c.local === 'DMNShape' && hrefId(attr(c, 'dmnElementRef')) === id)
      node = shape && childElements(shape).find((c) => c.local === 'Bounds')
    }
    if (!node) throw new BpmnError(`"${id}" has no shape`)
    for (const [k, v] of Object.entries({ x: b.x, y: b.y, width: b.width, height: b.height })) setAttr(node, k, String(r(v)))
  }

  /** Writes a line's points: a DMNEdge, or a `biodi:edge` on the requiring element. */
  private writeEdge(id: string, target: string, source: string, points: Point[]): void {
    if (this.legacy()) {
      const owner = this.current.elements.get(target)
      if (!owner || owner.type === 'textAnnotation') return
      const ext = this.extension(owner.xml)
      const old = ext.findIndex((c) => c.kind === 'element' && c.local === 'edge' && hrefId(attr(c, 'source')) === source)
      const node = makeIn(this.doc, DMN_BIODI, 'biodi', 'edge', { source }, points.map((p) => makeIn(this.doc, DMN_BIODI, 'biodi', 'waypoints', { x: r(p.x), y: r(p.y) })))
      if (old >= 0) ext.splice(old, 1, node)
      else ext.push(node)
      this.flushExtension(owner.xml)
      return
    }
    const plane = this.plane()!
    const existing = childElements(plane).find((c) => c.local === 'DMNEdge' && hrefId(attr(c, 'dmnElementRef')) === id)
    const waypoints = points.map((p) => makeIn(this.doc, DI, 'di', 'waypoint', { x: r(p.x), y: r(p.y) }))
    if (existing) {
      for (const w of childElements(existing).filter((c) => c.local === 'waypoint')) detach(existing, w)
      for (const w of waypoints) insert(existing, w, plane)
      return
    }
    insert(plane, makeIn(this.doc, plane.ns, 'dmndi', 'DMNEdge', { id: this.newId('DMNEdge'), dmnElementRef: id }, waypoints), this.parents.get(plane))
  }

  /** Lines touching moved shapes: translated when both ends moved, otherwise drawn straight again. */
  private reroute(moved: Set<string>, dx: number, dy: number, always = false): void {
    const lines: { id: string; source: string; target: string }[] = [...this.current.requirements]
    for (const e of this.current.elements.values()) {
      if (e.type !== 'association') continue
      const ends = ['sourceRef', 'targetRef'].map((l) => hrefId(attr(childElements(e.xml).find((c) => c.local === l) ?? e.xml, 'href')))
      if (ends[0] && ends[1]) lines.push({ id: e.id, source: ends[0], target: ends[1] })
    }
    for (const l of lines) {
      if (!moved.has(l.source) && !moved.has(l.target)) continue
      const edge = this.diagram.edges.find((e) => e.element === l.id)
      if (!always && moved.has(l.source) && moved.has(l.target) && edge) {
        this.writeEdge(l.id, l.target, l.source, edge.waypoints.map((p) => ({ x: p.x + dx, y: p.y + dy })))
        continue
      }
      const a = this.shape(l.source)
      const b = this.shape(l.target)
      if (a && b && (edge || !this.legacy())) this.writeEdge(l.id, l.target, l.source, drdLine(a, b))
    }
  }

  /** The children of an element's `extensionElements`, created when missing (edit, then `flushExtension`). */
  private extension(owner: XmlElement): XmlNode[] {
    let ext = childElements(owner).find((c) => c.local === 'extensionElements')
    if (!ext) {
      ext = this.make('extensionElements')
      const first = childElements(owner).find((c) => c.local !== 'description')
      insert(owner, ext, this.parents.get(owner) ?? this.doc.root, first)
    }
    this.pendingExt = ext
    return ext.children
  }

  private pendingExt: XmlElement | undefined

  /** Re-indents the extension after `extension()` edits. */
  private flushExtension(owner: XmlElement): void {
    const ext = this.pendingExt
    if (!ext) return
    const kids = ext.children.filter((c): c is XmlElement => c.kind === 'element')
    ext.children = []
    for (const k of kids) insert(ext, k, owner)
    this.pendingExt = undefined
  }
}

const LOGIC = new Set(['decisionTable', 'literalExpression', 'context', 'invocation', 'relation', 'list', 'functionDefinition', 'conditional', 'filter', 'for', 'every', 'some'])
