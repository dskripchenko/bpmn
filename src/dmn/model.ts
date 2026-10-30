/**
 * DMN semantics and diagram interchange, read from the XML tree.
 *
 * Every published version is read: 1.1 (with the `biodi` layout extension
 * older Camunda tools wrote), 1.2, 1.3, 1.4 and 1.5 (with DMNDI). Namespaces
 * are recognised by their shape, not by a fixed list, so a newer revision of
 * the specification does not break reading.
 */
import { BpmnError } from '../errors'
import type { Bounds, DiColors, Point } from '../model'
import { attr, childElements, parseXml, textContent, type XmlDocument, type XmlElement, type XmlLimits } from '../xml'

export const DMN_BIODI = 'http://bpmn.io/schema/dmn/biodi/1.0'
const BIOC = 'http://bpmn.io/schema/bpmn/biocolor/1.0'
const COLOR = 'http://www.omg.org/spec/BPMN/non-normative/color/1.0'

export const isDmnModelNs = (ns: string) => /omg\.org\/spec\/DMN\/\d{8}\/(?:MODEL\/?|dmn\.xsd)$/.test(ns)
const isDmndiNs = (ns: string) => /\/DMNDI\/?$/.test(ns)
const isDcNs = (ns: string) => /\/DC\/?$/.test(ns)
const isDiNs = (ns: string) => /\/DI\/?$/.test(ns) && !isDmndiNs(ns)

/** The specification version a namespace belongs to. */
function versionOf(ns: string): string {
  const date = /\/(\d{8})\//.exec(ns)?.[1]
  return { '20151101': '1.1', '20180521': '1.2', '20191111': '1.3', '20211108': '1.4', '20230324': '1.5' }[date ?? ''] ?? 'unknown'
}

export type DrgType = 'decision' | 'inputData' | 'businessKnowledgeModel' | 'knowledgeSource' | 'decisionService'

export const DRG_TYPES: readonly DrgType[] = ['decision', 'inputData', 'businessKnowledgeModel', 'knowledgeSource', 'decisionService']

export interface DmnElement {
  id: string
  /** The local name: `decision`, `inputData`, `textAnnotation`, `association`… */
  type: string
  name?: string
  xml: XmlElement
}

export type RequirementKind = 'information' | 'knowledge' | 'authority'

export interface DmnRequirement {
  /** Its id in the file, or a made-up `source→target` for files that give none. */
  id: string
  kind: RequirementKind
  /** The required element. */
  source: string
  /** The element that requires it. */
  target: string
  xml: XmlElement
}

export type HitPolicy = 'UNIQUE' | 'FIRST' | 'PRIORITY' | 'ANY' | 'COLLECT' | 'RULE ORDER' | 'OUTPUT ORDER'

export interface TableInput {
  id?: string
  label?: string
  expression: string
  typeRef?: string
  /** Allowed values, as written (`"a","b"`). */
  values?: string
}

export interface TableOutput {
  id?: string
  name?: string
  label?: string
  typeRef?: string
  values?: string
}

export interface TableRule {
  id?: string
  description?: string
  inputs: string[]
  outputs: string[]
  /** DMN 1.3 annotation columns. */
  annotations: string[]
}

export interface DecisionTable {
  kind: 'table'
  id?: string
  hitPolicy: HitPolicy
  aggregation?: 'SUM' | 'COUNT' | 'MIN' | 'MAX'
  inputs: TableInput[]
  outputs: TableOutput[]
  /** Names of the annotation columns (DMN 1.3+). */
  annotations: string[]
  rules: TableRule[]
  xml: XmlElement
}

export interface LiteralExpression {
  kind: 'literal'
  id?: string
  text: string
  typeRef?: string
  language?: string
  xml: XmlElement
}

/** Another boxed expression (context, invocation, relation, list…), not shown as a table. */
export interface OtherExpression {
  kind: 'other'
  type: string
  xml: XmlElement
}

export type DecisionLogic = DecisionTable | LiteralExpression | OtherExpression

export interface DmnDecision extends DmnElement {
  type: 'decision'
  question?: string
  variable?: { name?: string; typeRef?: string }
  logic?: DecisionLogic
}

export interface DmnShape {
  element: string
  bounds: Bounds
  label?: Bounds
  colors: DiColors
}

export interface DmnEdge {
  /** The requirement or association drawn. */
  element: string
  waypoints: Point[]
  colors: DiColors
}

export interface DmnDiagram {
  id?: string
  name?: string
  shapes: DmnShape[]
  edges: DmnEdge[]
  /** True when the file had no layout and this one was computed. */
  generated: boolean
}

export interface DmnModel {
  document: XmlDocument
  /** `1.1` … `1.5`. */
  version: string
  definitions: { id?: string; name?: string; namespace?: string; exporter?: string; exporterVersion?: string }
  elements: Map<string, DmnElement>
  decisions: DmnDecision[]
  requirements: DmnRequirement[]
  diagrams: DmnDiagram[]
}

function number(element: XmlElement, name: string): number {
  const v = Number(attr(element, name))
  if (!Number.isFinite(v)) throw new BpmnError(`<${element.name}> needs a numeric "${name}"`, element.line, element.column)
  return v
}

function boundsOf(element: XmlElement | undefined): Bounds | undefined {
  if (!element) return undefined
  return { x: number(element, 'x'), y: number(element, 'y'), width: number(element, 'width'), height: number(element, 'height') }
}

function colorsOf(element: XmlElement): DiColors {
  const out: DiColors = {}
  const fill = attr(element, 'fill', BIOC) ?? attr(element, 'background-color', COLOR)
  const stroke = attr(element, 'stroke', BIOC) ?? attr(element, 'border-color', COLOR)
  if (fill) out.fill = fill
  if (stroke) out.stroke = stroke
  return out
}

/** `#id` or `other.dmn#id` → `id`. */
export function hrefId(href: string | undefined): string | undefined {
  if (!href) return undefined
  const i = href.lastIndexOf('#')
  return i >= 0 ? href.slice(i + 1) : href
}

const own = (e: XmlElement, local: string) => e.children.filter((c): c is XmlElement => c.kind === 'element' && isDmnModelNs(c.ns) && c.local === local)
const text = (e: XmlElement | undefined) => (e ? textContent(e) : '')
const textOf = (e: XmlElement, local: string) => {
  const c = own(e, local)[0]
  return c ? text(own(c, 'text')[0] ?? c) : undefined
}

const HIT_POLICIES: HitPolicy[] = ['UNIQUE', 'FIRST', 'PRIORITY', 'ANY', 'COLLECT', 'RULE ORDER', 'OUTPUT ORDER']

function readTable(t: XmlElement): DecisionTable {
  const hp = (attr(t, 'hitPolicy') ?? 'UNIQUE').toUpperCase().replace('_', ' ') as HitPolicy
  const aggregation = attr(t, 'aggregation') as DecisionTable['aggregation']
  return {
    kind: 'table',
    id: attr(t, 'id'),
    hitPolicy: HIT_POLICIES.includes(hp) ? hp : 'UNIQUE',
    aggregation: aggregation && ['SUM', 'COUNT', 'MIN', 'MAX'].includes(aggregation) ? aggregation : undefined,
    inputs: own(t, 'input').map((i) => {
      const expr = own(i, 'inputExpression')[0]
      return {
        id: attr(i, 'id'),
        label: attr(i, 'label'),
        expression: expr ? text(own(expr, 'text')[0]) : '',
        typeRef: expr ? attr(expr, 'typeRef') : undefined,
        values: textOf(i, 'inputValues'),
      }
    }),
    outputs: own(t, 'output').map((o) => ({
      id: attr(o, 'id'),
      name: attr(o, 'name'),
      label: attr(o, 'label'),
      typeRef: attr(o, 'typeRef'),
      values: textOf(o, 'outputValues'),
    })),
    annotations: own(t, 'annotation').map((a) => attr(a, 'name') ?? ''),
    rules: own(t, 'rule').map((r) => ({
      id: attr(r, 'id'),
      description: textOf(r, 'description'),
      inputs: own(r, 'inputEntry').map((e) => text(own(e, 'text')[0])),
      outputs: own(r, 'outputEntry').map((e) => text(own(e, 'text')[0])),
      annotations: own(r, 'annotationEntry').map((e) => text(own(e, 'text')[0])),
    })),
    xml: t,
  }
}

function readLogic(d: XmlElement): DecisionLogic | undefined {
  for (const c of d.children) {
    if (c.kind !== 'element' || !isDmnModelNs(c.ns)) continue
    if (c.local === 'decisionTable') return readTable(c)
    if (c.local === 'literalExpression') {
      return { kind: 'literal', id: attr(c, 'id'), text: text(own(c, 'text')[0]), typeRef: attr(c, 'typeRef'), language: attr(c, 'expressionLanguage'), xml: c }
    }
    if (['context', 'invocation', 'relation', 'list', 'functionDefinition', 'conditional', 'filter', 'for', 'every', 'some'].includes(c.local)) {
      return { kind: 'other', type: c.local, xml: c }
    }
  }
  return undefined
}

const REQUIREMENTS: Record<string, { kind: RequirementKind; refs: string[] }> = {
  informationRequirement: { kind: 'information', refs: ['requiredDecision', 'requiredInput'] },
  knowledgeRequirement: { kind: 'knowledge', refs: ['requiredKnowledge'] },
  authorityRequirement: { kind: 'authority', refs: ['requiredDecision', 'requiredInput', 'requiredAuthority'] },
}

export interface DmnParseOptions {
  limits?: XmlLimits
}

/** Source and target of an association, which point at elements by `href`. */
export function associationEnds(e: DmnElement): [string, string] | undefined {
  const source = hrefId(own(e.xml, 'sourceRef')[0] && attr(own(e.xml, 'sourceRef')[0]!, 'href'))
  const target = hrefId(own(e.xml, 'targetRef')[0] && attr(own(e.xml, 'targetRef')[0]!, 'href'))
  return source && target ? [source, target] : undefined
}

/** Parses a DMN file. */
export function parseDmn(xml: string, options: DmnParseOptions = {}): DmnModel {
  return dmnFromDocument(parseXml(xml, options.limits))
}

/** The model of an XML tree already read (or edited in place). */
export function dmnFromDocument(document: XmlDocument): DmnModel {
  const root = document.root
  if (!isDmnModelNs(root.ns) || root.local !== 'definitions') {
    throw new BpmnError(`<${root.name}> is not a DMN file`, root.line, root.column, 'The root element must be DMN <definitions>.')
  }
  const elements = new Map<string, DmnElement>()
  const decisions: DmnDecision[] = []
  const requirements: DmnRequirement[] = []

  for (const c of root.children) {
    if (c.kind !== 'element' || !isDmnModelNs(c.ns)) continue
    const id = attr(c, 'id')
    if (!id) continue
    if (c.local === 'decision') {
      const variable = own(c, 'variable')[0]
      const d: DmnDecision = {
        id,
        type: 'decision',
        name: attr(c, 'name'),
        xml: c,
        question: textOf(c, 'question'),
        variable: variable ? { name: attr(variable, 'name'), typeRef: attr(variable, 'typeRef') } : undefined,
        logic: readLogic(c),
      }
      decisions.push(d)
      elements.set(id, d)
    } else if (c.local === 'textAnnotation') {
      elements.set(id, { id, type: c.local, name: textOf(c, 'text') ?? text(own(c, 'text')[0]), xml: c })
    } else {
      elements.set(id, { id, type: c.local, name: attr(c, 'name'), xml: c })
    }
    // Requirements live inside the element that requires.
    for (const r of c.children) {
      if (r.kind !== 'element' || !isDmnModelNs(r.ns)) continue
      const spec = REQUIREMENTS[r.local]
      if (!spec) continue
      for (const refName of spec.refs) {
        const ref = own(r, refName)[0]
        const source = hrefId(ref && attr(ref, 'href'))
        if (source) requirements.push({ id: attr(r, 'id') ?? `${source}→${id}`, kind: spec.kind, source, target: id, xml: r })
      }
    }
  }
  // Decision services also list their decisions; their requirements are on the decisions.
  const definitions = {
    id: attr(root, 'id'),
    name: attr(root, 'name'),
    namespace: attr(root, 'namespace'),
    exporter: attr(root, 'exporter'),
    exporterVersion: attr(root, 'exporterVersion'),
  }
  const model: DmnModel = { document, version: versionOf(root.ns), definitions, elements, decisions, requirements, diagrams: [] }
  model.diagrams = readDiagrams(model)
  return model
}

function readDiagrams(model: DmnModel): DmnDiagram[] {
  const root = model.document.root
  const dmndi = root.children.find((c): c is XmlElement => c.kind === 'element' && isDmndiNs(c.ns) && c.local === 'DMNDI')
  const out: DmnDiagram[] = []
  if (dmndi) {
    for (const d of childElements(dmndi).filter((c) => isDmndiNs(c.ns) && c.local === 'DMNDiagram')) {
      const diagram: DmnDiagram = { id: attr(d, 'id'), name: attr(d, 'name'), shapes: [], edges: [], generated: false }
      for (const c of childElements(d)) {
        const ref = attr(c, 'dmnElementRef')
        if (!ref || !isDmndiNs(c.ns)) continue
        const element = hrefId(ref)!
        if (c.local === 'DMNShape') {
          const b = boundsOf(childElements(c).find((x) => isDcNs(x.ns) && x.local === 'Bounds'))
          if (!b) throw new BpmnError(`The shape of "${element}" has no bounds`, c.line, c.column)
          const label = childElements(c).find((x) => isDmndiNs(x.ns) && x.local === 'DMNLabel')
          diagram.shapes.push({ element, bounds: b, label: boundsOf(label && childElements(label).find((x) => isDcNs(x.ns) && x.local === 'Bounds')), colors: colorsOf(c) })
        } else if (c.local === 'DMNEdge') {
          diagram.edges.push({
            element,
            waypoints: childElements(c)
              .filter((x) => isDiNs(x.ns) && x.local === 'waypoint')
              .map((w) => ({ x: number(w, 'x'), y: number(w, 'y') })),
            colors: colorsOf(c),
          })
        }
      }
      out.push(diagram)
    }
    return out
  }
  // DMN 1.1 with bpmn.io's layout extension.
  const legacy: DmnDiagram = { shapes: [], edges: [], generated: false }
  for (const e of model.elements.values()) {
    const ext = own(e.xml, 'extensionElements')[0]
    const b = ext && childElements(ext, DMN_BIODI, 'bounds')[0]
    if (b) legacy.shapes.push({ element: e.id, bounds: boundsOf(b)!, colors: {} })
    for (const edge of ext ? childElements(ext, DMN_BIODI, 'edge') : []) {
      const source = hrefId(attr(edge, 'source'))
      const req = model.requirements.find((r) => r.target === e.id && r.source === source)
      if (!req) continue
      legacy.edges.push({
        element: req.id,
        waypoints: childElements(edge, DMN_BIODI, 'waypoints').map((w) => ({ x: number(w, 'x'), y: number(w, 'y') })),
        colors: {},
      })
    }
  }
  if (legacy.shapes.length > 0) return [legacy]
  return []
}
