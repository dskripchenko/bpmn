/**
 * A layout for DMN files that carry none — decision tables exported by
 * engines, hand-written files: required elements below, the decisions that
 * need them above, in layers.
 */
import type { Bounds } from '../model'
import { associationEnds, type DmnDiagram, type DmnModel } from './model'

/** Default sizes, as DMN modelers use them. */
export function dmnSize(type: string): { width: number; height: number } {
  switch (type) {
    case 'decision':
      return { width: 180, height: 80 }
    case 'inputData':
      return { width: 125, height: 45 }
    case 'businessKnowledgeModel':
      return { width: 135, height: 46 }
    case 'knowledgeSource':
      return { width: 100, height: 63 }
    case 'decisionService':
      return { width: 320, height: 240 }
    case 'textAnnotation':
      return { width: 120, height: 45 }
    default:
      return { width: 120, height: 60 }
  }
}

const GAP_X = 50
const GAP_Y = 90

export function autoLayout(model: DmnModel): DmnDiagram {
  const drg = [...model.elements.values()].filter((e) => ['decision', 'inputData', 'businessKnowledgeModel', 'knowledgeSource'].includes(e.type))
  const sources = new Map<string, string[]>()
  for (const r of model.requirements) {
    if (!model.elements.has(r.source)) continue
    sources.set(r.target, [...(sources.get(r.target) ?? []), r.source])
  }
  // Layer: 0 for elements that need nothing; one above the highest they need.
  const rank = new Map<string, number>()
  const visiting = new Set<string>()
  const rankOf = (id: string): number => {
    const known = rank.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return 0
    visiting.add(id)
    const r = Math.max(-1, ...(sources.get(id) ?? []).map(rankOf)) + 1
    visiting.delete(id)
    rank.set(id, r)
    return r
  }
  drg.forEach((e) => rankOf(e.id))
  const top = Math.max(0, ...rank.values())
  const layers: string[][] = Array.from({ length: top + 1 }, () => [])
  for (const e of drg) layers[rank.get(e.id)!]!.push(e.id)

  const bounds = new Map<string, Bounds>()
  const typeOf = (id: string) => model.elements.get(id)!.type
  // Place from the bottom up, each layer ordered by where its requirements sit.
  let y = top * (80 + GAP_Y)
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!
    if (i > 0) {
      const centre = (id: string) => {
        const xs = (sources.get(id) ?? []).map((s) => bounds.get(s)).filter((b): b is Bounds => !!b).map((b) => b.x + b.width / 2)
        return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity
      }
      layer.sort((a, b) => centre(a) - centre(b))
    }
    let x = 0
    const height = Math.max(...layer.map((id) => dmnSize(typeOf(id)).height))
    for (const id of layer) {
      const size = dmnSize(typeOf(id))
      bounds.set(id, { x, y: y + (height - size.height) / 2, ...size })
      x += size.width + GAP_X
    }
    y -= 80 + GAP_Y
  }
  // Centre each layer over the widest.
  const width = (layer: string[]) => layer.reduce((w, id) => w + bounds.get(id)!.width, 0) + GAP_X * (layer.length - 1)
  const widest = Math.max(0, ...layers.map(width))
  for (const layer of layers) {
    const shift = (widest - width(layer)) / 2
    for (const id of layer) bounds.get(id)!.x += shift
  }
  // Annotations to the right of what they describe.
  let spare = 0
  for (const a of [...model.elements.values()].filter((e) => e.type === 'textAnnotation')) {
    const link = [...model.elements.values()].find((e) => e.type === 'association' && associationEnds(e)?.includes(a.id))
    const other = link && associationEnds(link)!.find((x) => x !== a.id)
    const near = other && bounds.get(other)
    const size = dmnSize('textAnnotation')
    bounds.set(a.id, near ? { x: near.x + near.width + 40, y: near.y - size.height - 10, ...size } : { x: widest + GAP_X, y: spare, ...size })
    if (!near) spare += size.height + 20
  }
  for (const b of bounds.values()) b.x = Math.round(b.x)
  // Requirements that skip a layer go around what lies between, not through it.
  const edges: DmnDiagram['edges'] = []
  for (const r of model.requirements) {
    const a = bounds.get(r.source)
    const b = bounds.get(r.target)
    if (!a || !b) continue
    const from = { x: a.x + a.width / 2, y: a.y }
    const to = { x: b.x + b.width / 2, y: b.y + b.height }
    const blocking = [...bounds].filter(([id, o]) => id !== r.source && id !== r.target && crosses(from, to, o)).map(([, o]) => o)
    if (blocking.length === 0) continue
    const right = Math.max(...blocking.map((o) => o.x + o.width), a.x + a.width, b.x + b.width) + 30
    const left = Math.min(...blocking.map((o) => o.x), a.x, b.x) - 30
    const goRight = Math.abs(right - from.x) <= Math.abs(from.x - left)
    const x = goRight ? right : left
    // Out of the source's side, along the detour, into the target's side.
    const ay = a.y + a.height / 2
    const by = b.y + b.height / 2
    edges.push({
      element: r.id,
      waypoints: [
        { x: goRight ? a.x + a.width : a.x, y: ay },
        { x, y: ay },
        { x, y: by },
        { x: goRight ? b.x + b.width : b.x, y: by },
      ],
      colors: {},
    })
  }
  return {
    shapes: [...bounds].map(([element, b]) => ({ element, bounds: { x: b.x, y: Math.round(b.y), width: b.width, height: b.height }, colors: {} })),
    edges,
    generated: true,
  }
}

/** Whether a segment passes through a rectangle (sampled; shapes are large next to the step). */
function crosses(a: { x: number; y: number }, b: { x: number; y: number }, r: Bounds): boolean {
  const steps = 40
  for (let i = 1; i < steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps
    const y = a.y + ((b.y - a.y) * i) / steps
    if (x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height) return true
  }
  return false
}
