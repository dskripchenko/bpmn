/**
 * Small pictures of BPMN symbols for the palette and the context pad, as
 * components a button can take (`:icon`). Drawn with `currentColor`.
 */
import { defineComponent, h, type Component } from 'vue'

type Part = [tag: string, attrs: Record<string, string | number>]

const S = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }
const F = { fill: 'currentColor', stroke: 'none' }

const PARTS: Record<string, Part[]> = {
  startEvent: [['circle', { cx: 12, cy: 12, r: 8, ...S }]],
  intermediateThrowEvent: [
    ['circle', { cx: 12, cy: 12, r: 8.5, ...S, 'stroke-width': 1.2 }],
    ['circle', { cx: 12, cy: 12, r: 6, ...S, 'stroke-width': 1.2 }],
  ],
  endEvent: [['circle', { cx: 12, cy: 12, r: 7.5, ...S, 'stroke-width': 3 }]],
  exclusiveGateway: [
    ['path', { d: 'M12 3 21 12 12 21 3 12Z', ...S }],
    ['path', { d: 'M9.5 9.5l5 5M14.5 9.5l-5 5', ...S, 'stroke-width': 2 }],
  ],
  gateway: [['path', { d: 'M12 3 21 12 12 21 3 12Z', ...S }]],
  task: [['rect', { x: 3, y: 6, width: 18, height: 12, rx: 3, ...S }]],
  subProcess: [
    ['rect', { x: 3, y: 5, width: 18, height: 14, rx: 3, ...S }],
    ['path', { d: 'M10 15.5h4M12 13.5v4', ...S, 'stroke-width': 1.2 }],
  ],
  dataObjectReference: [['path', { d: 'M6 3h8l4 4v14H6Z M14 3v4h4', ...S }]],
  dataStoreReference: [
    ['path', { d: 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', ...S }],
    ['ellipse', { cx: 12, cy: 6, rx: 8, ry: 3, ...S }],
  ],
  participant: [
    ['rect', { x: 2, y: 5, width: 20, height: 14, ...S }],
    ['path', { d: 'M6 5v14', ...S }],
  ],
  group: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 3, ...S, 'stroke-dasharray': '4 2 1 2' }]],
  textAnnotation: [
    ['path', { d: 'M9 4H5v16h4', ...S }],
    ['path', { d: 'M9 9h10M9 13h8', ...S, 'stroke-width': 1.2 }],
  ],
  connect: [
    ['path', { d: 'M4 19 18 5', ...S }],
    ['path', { d: 'M11 5h7v7', ...F, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }],
  ],
  decision: [['rect', { x: 3, y: 6, width: 18, height: 12, ...S }]],
  inputData: [['rect', { x: 2, y: 7, width: 20, height: 10, rx: 5, ...S }]],
  businessKnowledgeModel: [['path', { d: 'M6 6h15v9l-3 3H3V9Z', ...S }]],
  knowledgeSource: [['path', { d: 'M4 5h16v12c-3-2-5 2-8 0s-5-2-8 0Z', ...S }]],
  lane: [
    ['rect', { x: 2, y: 4, width: 20, height: 16, ...S }],
    ['path', { d: 'M6 4v16M6 12h16', ...S }],
  ],
}

const cache = new Map<string, Component>()

/** A button icon for a palette entry or pad action. */
export function bpmnIcon(kind: string): Component {
  let c = cache.get(kind)
  if (c) return c
  const parts = PARTS[kind] ?? PARTS.task!
  c = defineComponent({
    name: `BpmnIcon_${kind}`,
    props: { size: { type: [Number, String], default: 20 } },
    setup(props) {
      return () =>
        h(
          'svg',
          { width: props.size, height: props.size, viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'bpmn-ed-icon' },
          parts.map(([tag, attrs]) => h(tag, attrs)),
        )
    },
  })
  cache.set(kind, c)
  return c
}
