/**
 * BPMN semantics and diagram interchange (DI), read from the XML tree.
 *
 * The model is a view over the tree, not a copy of it: every element keeps
 * its XML node, so what this package does not understand (vendor extensions,
 * execution attributes) is still there for a tool that writes the file back.
 */
import { BpmnError } from './errors'
import { attr, childElements, parseXml, textContent, type XmlDocument, type XmlElement, type XmlLimits } from './xml'

export const NS = {
  bpmn: 'http://www.omg.org/spec/BPMN/20100524/MODEL',
  bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
  dc: 'http://www.omg.org/spec/DD/20100524/DC',
  di: 'http://www.omg.org/spec/DD/20100524/DI',
  /** bpmn.io's colour extension. */
  bioc: 'http://bpmn.io/schema/bpmn/biocolor/1.0',
  /** The OMG's non-normative colour extension (bpmn-in-color). */
  color: 'http://www.omg.org/spec/BPMN/non-normative/color/1.0',
} as const

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** Colours a modeler stored with a shape or edge, unvalidated. */
export interface DiColors {
  fill?: string
  stroke?: string
  label?: string
}

export type LoopKind = 'standard' | 'parallel' | 'sequential'

export interface BpmnElement {
  id: string
  /** The local name of the BPMN element: `userTask`, `startEvent`, `sequenceFlow`… */
  type: string
  name?: string
  /** The id of the enclosing element (process, sub-process, lane set's owner). */
  parent?: string
  /** `escalationEventDefinition` → `escalation`, in document order. */
  eventDefinitions: string[]
  loop?: LoopKind
  xml: XmlElement
}

export interface DiShape {
  id?: string
  element: string
  bounds: Bounds
  label?: Bounds
  isExpanded?: boolean
  isHorizontal?: boolean
  isMarkerVisible?: boolean
  colors: DiColors
}

export interface DiEdge {
  id?: string
  element: string
  waypoints: Point[]
  label?: Bounds
  /** A message flow's envelope, when the modeler shows it. */
  message?: 'initiating' | 'non_initiating'
  colors: DiColors
}

export interface BpmnDiagram {
  id?: string
  name?: string
  /** The element the plane shows: a collaboration, a process or a sub-process. */
  plane?: string
  shapes: DiShape[]
  edges: DiEdge[]
}

export interface BpmnModel {
  document: XmlDocument
  definitions: {
    id?: string
    name?: string
    targetNamespace?: string
    exporter?: string
    exporterVersion?: string
  }
  elements: Map<string, BpmnElement>
  diagrams: BpmnDiagram[]
}

export interface ParseOptions {
  limits?: XmlLimits
}

function number(element: XmlElement, name: string): number {
  const raw = attr(element, name)
  const value = raw === undefined ? NaN : Number(raw)
  if (!Number.isFinite(value)) {
    throw new BpmnError(`<${element.name}> needs a numeric "${name}"`, element.line, element.column)
  }
  return value
}

function bounds(element: XmlElement | undefined): Bounds | undefined {
  if (!element) return undefined
  return { x: number(element, 'x'), y: number(element, 'y'), width: number(element, 'width'), height: number(element, 'height') }
}

function flag(element: XmlElement, name: string): boolean | undefined {
  const value = attr(element, name)
  return value === undefined ? undefined : value === 'true'
}

function colors(element: XmlElement): DiColors {
  const out: DiColors = {}
  const fill = attr(element, 'fill', NS.bioc) ?? attr(element, 'background-color', NS.color)
  const stroke = attr(element, 'stroke', NS.bioc) ?? attr(element, 'border-color', NS.color)
  if (fill) out.fill = fill
  if (stroke) out.stroke = stroke
  const label = childElements(element, NS.bpmndi, 'BPMNLabel')[0]
  const text = label && attr(label, 'color', NS.color)
  if (text) out.label = text
  return out
}

function messageKind(value: string | undefined): DiEdge['message'] {
  return value === 'initiating' || value === 'non_initiating' ? value : undefined
}

function loopOf(element: XmlElement): LoopKind | undefined {
  for (const c of childElements(element, NS.bpmn)) {
    if (c.local === 'standardLoopCharacteristics') return 'standard'
    if (c.local === 'multiInstanceLoopCharacteristics') return attr(c, 'isSequential') === 'true' ? 'sequential' : 'parallel'
  }
  return undefined
}

/** Parses a BPMN 2.0 XML file into semantics and diagrams. */
export function parse(xml: string, options: ParseOptions = {}): BpmnModel {
  const document = parseXml(xml, options.limits)
  const root = document.root
  if (root.ns !== NS.bpmn || root.local !== 'definitions') {
    throw new BpmnError(
      `<${root.name}> is not a BPMN 2.0 file`,
      root.line,
      root.column,
      `The root element must be <definitions xmlns="${NS.bpmn}">.`,
    )
  }
  const elements = new Map<string, BpmnElement>()
  const definitionIds = new Map<string, string[]>()

  const visit = (node: XmlElement, parent: string | undefined) => {
    let owner = parent
    const id = attr(node, 'id')
    if (node.ns === NS.bpmn && id && node !== root) {
      const element: BpmnElement = {
        id,
        type: node.local,
        name: attr(node, 'name'),
        parent,
        eventDefinitions: [],
        loop: loopOf(node),
        xml: node,
      }
      for (const c of childElements(node, NS.bpmn)) {
        if (c.local.endsWith('EventDefinition')) element.eventDefinitions.push(c.local.slice(0, -'EventDefinition'.length))
        if (c.local === 'eventDefinitionRef') definitionIds.set(id, [...(definitionIds.get(id) ?? []), textContent(c).trim()])
      }
      if (node.local === 'textAnnotation') {
        const text = childElements(node, NS.bpmn, 'text')[0]
        if (text) element.name = textContent(text)
      }
      if (!elements.has(id)) elements.set(id, element)
      owner = id
    }
    for (const c of childElements(node)) {
      // Extensions and DI are not semantics.
      if (c.ns === NS.bpmn && c.local !== 'extensionElements') visit(c, owner)
    }
  }
  visit(root, undefined)

  // Event definitions declared at the top level and referenced by id.
  for (const [id, refs] of definitionIds) {
    const element = elements.get(id)!
    for (const ref of refs) {
      const def = elements.get(ref)
      if (def && def.type.endsWith('EventDefinition')) element.eventDefinitions.push(def.type.slice(0, -'EventDefinition'.length))
    }
  }

  const diagrams: BpmnDiagram[] = childElements(root, NS.bpmndi, 'BPMNDiagram').map((d) => {
    const plane = childElements(d, NS.bpmndi, 'BPMNPlane')[0]
    const diagram: BpmnDiagram = { id: attr(d, 'id'), name: attr(d, 'name'), plane: plane && attr(plane, 'bpmnElement'), shapes: [], edges: [] }
    if (!plane) return diagram
    for (const c of childElements(plane, NS.bpmndi)) {
      const element = attr(c, 'bpmnElement')
      if (!element) continue
      const label = childElements(c, NS.bpmndi, 'BPMNLabel')[0]
      const labelBounds = label ? bounds(childElements(label, NS.dc, 'Bounds')[0]) : undefined
      if (c.local === 'BPMNShape') {
        const b = bounds(childElements(c, NS.dc, 'Bounds')[0])
        if (!b) throw new BpmnError(`The shape of "${element}" has no bounds`, c.line, c.column)
        diagram.shapes.push({
          id: attr(c, 'id'),
          element,
          bounds: b,
          label: labelBounds,
          isExpanded: flag(c, 'isExpanded'),
          isHorizontal: flag(c, 'isHorizontal'),
          isMarkerVisible: flag(c, 'isMarkerVisible'),
          colors: colors(c),
        })
      } else if (c.local === 'BPMNEdge') {
        diagram.edges.push({
          id: attr(c, 'id'),
          element,
          waypoints: childElements(c, NS.di, 'waypoint').map((w) => ({ x: number(w, 'x'), y: number(w, 'y') })),
          label: labelBounds,
          message: messageKind(attr(c, 'messageVisibleKind')),
          colors: colors(c),
        })
      }
    }
    return diagram
  })

  return {
    document,
    definitions: {
      id: attr(root, 'id'),
      name: attr(root, 'name'),
      targetNamespace: attr(root, 'targetNamespace'),
      exporter: attr(root, 'exporter'),
      exporterVersion: attr(root, 'exporterVersion'),
    },
    elements,
    diagrams,
  }
}

/** The value of an attribute of an element's XML, without namespace. */
export function prop(element: BpmnElement, name: string): string | undefined {
  return attr(element.xml, name)
}

/** The element's BPMN children of the given local name. */
export function children(element: BpmnElement, local: string): XmlElement[] {
  return childElements(element.xml, NS.bpmn, local)
}
