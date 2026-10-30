/**
 * @dskripchenko/bpmn — BPMN 2.0 diagrams to SVG, with no runtime
 * dependencies and no DOM.
 *
 *     import { render } from '@dskripchenko/bpmn'
 *     const { svg } = render(xml)
 *
 * The file is drawn as it was laid out by the tool that saved it (its
 * BPMNDiagram section); nothing is moved.
 */
export { render, documentation } from './render'
export type { RenderOptions, RenderResult } from './render'
export { parse, fromDocument, NS } from './model'
export type { BpmnModel, BpmnElement, BpmnDiagram, DiShape, DiEdge, DiColors, Bounds, Point, LoopKind, ParseOptions } from './model'
export { parseXml, writeXml } from './xml'
export type { XmlDocument, XmlElement, XmlNode, XmlAttribute, XmlText, XmlInstruction, XmlLimits } from './xml'
export { BpmnError } from './errors'
export { VARIABLES as THEME_VARIABLES, safeColor } from './theme'
export { approximateMeasurer, defaultMeasurer } from './core/text'
export type { TextMeasurer, FontSpec, TextSize } from './core/text'
export { BpmnDocument, emptyDiagram } from './edit/document'
export type { DocumentOptions, CreateOptions, LoopType } from './edit/document'
export { route } from './edit/route'
export {
  EVENT_TYPES,
  TASK_TYPES,
  GATEWAY_TYPES,
  SUBPROCESS_TYPES,
  EVENT_DEFINITIONS,
  defaultSize,
  isActivity,
  isEvent,
  isGateway,
  isSubProcess,
  isFlowNode,
  isData,
  isFlow,
} from './edit/rules'
export type { ShapeType, FlowType, EventDefinitionKind } from './edit/rules'
