/**
 * Changes to the XML tree that keep the file looking as its author's tool
 * wrote it: elements get the prefixes the file already uses for their
 * namespaces, and new lines are indented like their neighbours.
 */
import { NS } from '../model'
import type { XmlAttribute, XmlDocument, XmlElement, XmlNode } from '../xml'

export type NsKey = keyof typeof NS

/** Prefixes conventional for each namespace, used when the file declares none. */
const PREFERRED: Record<NsKey, string> = {
  bpmn: 'bpmn',
  bpmndi: 'bpmndi',
  dc: 'dc',
  di: 'di',
  bioc: 'bioc',
  color: 'color',
}

export const XSI = 'http://www.w3.org/2001/XMLSchema-instance'

/**
 * The prefix the root element declares for a namespace (`''` for the default
 * namespace); declares the conventional one when there is none.
 */
export function prefixFor(doc: XmlDocument, uri: string, preferred: string): string {
  const root = doc.root
  for (const a of root.attributes) {
    if (a.name === 'xmlns' && a.value === uri) return ''
    if (a.name.startsWith('xmlns:') && a.value === uri) return a.name.slice(6)
  }
  let prefix = preferred
  for (let i = 2; root.attributes.some((a) => a.name === `xmlns:${prefix}`); i++) prefix = `${preferred}${i}`
  root.attributes.push({ name: `xmlns:${prefix}`, value: uri, ns: 'http://www.w3.org/2000/xmlns/', local: prefix })
  return prefix
}

export function nsPrefix(doc: XmlDocument, key: NsKey): string {
  return prefixFor(doc, NS[key], PREFERRED[key])
}

/** A new element in one of the known namespaces. */
export function make(
  doc: XmlDocument,
  key: NsKey,
  local: string,
  attrs: Record<string, string | number | undefined> = {},
  children: XmlNode[] = [],
): XmlElement {
  const prefix = nsPrefix(doc, key)
  const attributes: XmlAttribute[] = []
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) continue
    attributes.push({ name, value: String(value), ns: '', local: name })
  }
  return { kind: 'element', name: prefix ? `${prefix}:${local}` : local, ns: NS[key], local, attributes, children, line: 0, column: 0 }
}

/** A BPMN element holding only text, such as `<bpmn:incoming>Flow_1</bpmn:incoming>`. */
export function makeText(doc: XmlDocument, local: string, text: string): XmlElement {
  return make(doc, 'bpmn', local, {}, [{ kind: 'text', value: text }])
}

/** Sets or removes an attribute; a prefixed name is declared under `uri`. */
export function setAttr(element: XmlElement, name: string, value: string | undefined, uri = ''): void {
  const i = element.attributes.findIndex((a) => a.name === name)
  if (value === undefined) {
    if (i >= 0) element.attributes.splice(i, 1)
    return
  }
  if (i >= 0) element.attributes[i]!.value = value
  else element.attributes.push({ name, value, ns: uri, local: name.includes(':') ? name.slice(name.indexOf(':') + 1) : name })
}

function isBlank(node: XmlNode | undefined): node is { kind: 'text'; value: string } {
  return node !== undefined && node.kind === 'text' && node.value.trim() === ''
}

/** The indentation of `element`'s own line, judged from the whitespace before it in `parent`. */
function indentOf(parent: XmlElement, element: XmlElement): string | undefined {
  const i = parent.children.indexOf(element)
  const before = parent.children[i - 1]
  if (isBlank(before) && before.value.includes('\n')) return before.value.slice(before.value.lastIndexOf('\n') + 1)
  return undefined
}

/** Parents of each element, for indentation and removal. */
export function parentMap(doc: XmlDocument): Map<XmlElement, XmlElement> {
  const map = new Map<XmlElement, XmlElement>()
  const walk = (e: XmlElement) => {
    for (const c of e.children) {
      if (c.kind !== 'element') continue
      map.set(c, e)
      walk(c)
    }
  }
  walk(doc.root)
  return map
}

/**
 * Inserts `child` into `parent` — before `before` when given, otherwise
 * after the last element child — on a line of its own when the file is
 * indented. Nested children of `child` are indented too.
 */
export function insert(parent: XmlElement, child: XmlElement, parentOfParent: XmlElement | undefined, before?: XmlElement): void {
  const elements = parent.children.filter((c): c is XmlElement => c.kind === 'element')
  const sibling = elements[elements.length - 1]
  let indent = sibling ? indentOf(parent, sibling) : undefined
  let closing: string | undefined
  if (indent === undefined) {
    const own = parentOfParent ? indentOf(parentOfParent, parent) : ''
    if (own !== undefined) {
      const unit = own.length > 0 && own[0] === '\t' ? '\t' : '  '
      indent = own + unit
      closing = own
    }
  }
  if (indent !== undefined) format(child, indent)
  const at = before ? parent.children.indexOf(before) : -1
  if (at >= 0) {
    // Before a sibling: the sibling's own indentation is already in place.
    const nodes: XmlNode[] = indent !== undefined ? [child, { kind: 'text', value: `\n${indent}` }] : [child]
    parent.children.splice(at, 0, ...nodes)
    return
  }
  // After the last element: before the closing tag's indentation.
  let end = parent.children.length
  const last = parent.children[end - 1]
  if (indent !== undefined) {
    if (isBlank(last) && last.value.includes('\n')) {
      parent.children.splice(end - 1, 0, { kind: 'text', value: `\n${indent}` }, child)
    } else {
      parent.children.push({ kind: 'text', value: `\n${indent}` }, child, { kind: 'text', value: `\n${closing ?? indent.slice(0, -2)}` })
    }
    return
  }
  if (isBlank(last)) end -= 1
  parent.children.splice(end, 0, child)
}

/** Indents the children of a new element one level below `indent`, recursively. */
function format(element: XmlElement, indent: string): void {
  const kids = element.children.filter((c): c is XmlElement => c.kind === 'element')
  if (kids.length === 0) return
  const unit = indent.length > 0 && indent[0] === '\t' ? '\t' : '  '
  const inner = indent + unit
  const out: XmlNode[] = []
  for (const c of element.children) {
    if (isBlank(c)) continue
    out.push({ kind: 'text', value: `\n${inner}` }, c)
    if (c.kind === 'element') format(c, inner)
  }
  out.push({ kind: 'text', value: `\n${indent}` })
  element.children = out
}

/** Removes an element and the whitespace that put it on its own line. */
export function detach(parent: XmlElement, child: XmlElement): void {
  const i = parent.children.indexOf(child)
  if (i < 0) return
  const before = parent.children[i - 1]
  if (isBlank(before)) parent.children.splice(i - 1, 2)
  else parent.children.splice(i, 1)
  // An element left without element children loses its leftover whitespace.
  if (!parent.children.some((c) => c.kind === 'element' || (c.kind !== 'text' && c.kind !== 'comment') || (c.kind === 'text' && c.value.trim()))) {
    if (parent.children.every((c) => isBlank(c))) parent.children = []
  }
}

/** Every element of the tree, depth first. */
export function* walk(element: XmlElement): Generator<XmlElement> {
  yield element
  for (const c of element.children) if (c.kind === 'element') yield* walk(c)
}

/** Text of a text-only element (a reference such as `<incoming>`). */
export function refText(element: XmlElement): string {
  return element.children.map((c) => (c.kind === 'text' || c.kind === 'cdata' ? c.value : '')).join('').trim()
}
