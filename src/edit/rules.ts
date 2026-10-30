/**
 * What may connect to what, what a new element is called and how big it is:
 * the BPMN rules an editor enforces, kept apart from the tree surgery.
 */
import type { BpmnElement } from '../model'

export const EVENT_TYPES = ['startEvent', 'intermediateCatchEvent', 'intermediateThrowEvent', 'endEvent', 'boundaryEvent'] as const
export const TASK_TYPES = ['task', 'userTask', 'serviceTask', 'scriptTask', 'sendTask', 'receiveTask', 'manualTask', 'businessRuleTask'] as const
export const GATEWAY_TYPES = ['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'complexGateway', 'eventBasedGateway'] as const
export const SUBPROCESS_TYPES = ['subProcess', 'transaction', 'adHocSubProcess'] as const
export const EVENT_DEFINITIONS = ['message', 'timer', 'error', 'escalation', 'signal', 'conditional', 'link', 'compensate', 'cancel', 'terminate'] as const

export type EventDefinitionKind = (typeof EVENT_DEFINITIONS)[number]

/** What the palette creates. */
export type ShapeType =
  | (typeof EVENT_TYPES)[number]
  | (typeof TASK_TYPES)[number]
  | (typeof GATEWAY_TYPES)[number]
  | (typeof SUBPROCESS_TYPES)[number]
  | 'callActivity'
  | 'dataObjectReference'
  | 'dataStoreReference'
  | 'textAnnotation'
  | 'group'
  | 'participant'

export type FlowType = 'sequenceFlow' | 'messageFlow' | 'association' | 'dataInputAssociation' | 'dataOutputAssociation'

const has = (list: readonly string[], type: string) => list.includes(type)

export const isEvent = (type: string) => has(EVENT_TYPES, type)
export const isGateway = (type: string) => type.endsWith('Gateway')
export const isSubProcess = (type: string) => has(SUBPROCESS_TYPES, type)
export const isActivity = (type: string) => has(TASK_TYPES, type) || isSubProcess(type) || type === 'callActivity'
export const isFlowNode = (type: string) => isEvent(type) || isActivity(type) || isGateway(type)
export const isData = (type: string) => type === 'dataObjectReference' || type === 'dataStoreReference'
export const isFlow = (type: string) =>
  type === 'sequenceFlow' || type === 'messageFlow' || type === 'association' || type === 'dataInputAssociation' || type === 'dataOutputAssociation'

/** Default sizes, as BPMN modelers use them. */
export function defaultSize(type: string, expanded = false): { width: number; height: number } {
  if (isEvent(type)) return { width: 36, height: 36 }
  if (isGateway(type)) return { width: 50, height: 50 }
  if (isSubProcess(type)) return expanded ? { width: 350, height: 200 } : { width: 100, height: 80 }
  if (isActivity(type)) return { width: 100, height: 80 }
  switch (type) {
    case 'dataObjectReference':
      return { width: 36, height: 50 }
    case 'dataStoreReference':
      return { width: 50, height: 50 }
    case 'textAnnotation':
      return { width: 100, height: 30 }
    case 'group':
      return { width: 300, height: 300 }
    case 'participant':
      return { width: 600, height: 250 }
    default:
      return { width: 100, height: 80 }
  }
}

/** The prefix of a generated id, as BPMN modelers name them. */
export function idPrefix(type: string): string {
  if (isEvent(type)) return 'Event'
  if (isGateway(type)) return 'Gateway'
  if (isActivity(type)) return 'Activity'
  if (type === 'sequenceFlow' || type === 'messageFlow') return 'Flow'
  if (type.endsWith('EventDefinition')) return type[0]!.toUpperCase() + type.slice(1)
  return type[0]!.toUpperCase() + type.slice(1)
}

/**
 * The flow that connects `source` to `target`, or null when the notation
 * does not allow one. `sameContainer` tells whether both sit directly in the
 * same process or sub-process; `sameProcess` whether they belong to one pool.
 */
export function flowBetween(source: BpmnElement, target: BpmnElement, sameContainer: boolean, sameProcess: boolean): FlowType | null {
  const s = source.type
  const t = target.type
  if (source.id === target.id) return null
  if (s === 'textAnnotation' || t === 'textAnnotation') return s === t ? null : 'association'
  if (s === 'group' || t === 'group' || s === 'lane' || t === 'lane') return null
  if (isData(s)) return isActivity(t) ? 'dataInputAssociation' : null
  if (isData(t)) return isActivity(s) ? 'dataOutputAssociation' : null
  if (s === 'participant' || t === 'participant' || !sameProcess) {
    if (isGateway(s) || isGateway(t)) return null
    if (s === 'startEvent' || s === 'intermediateCatchEvent' || s === 'boundaryEvent') return null
    if (t === 'endEvent' || t === 'intermediateThrowEvent') return null
    // Messages travel between pools, never inside one.
    return sameProcess ? null : 'messageFlow'
  }
  if (!isFlowNode(s) || !isFlowNode(t)) return null
  if (s === 'endEvent' || t === 'startEvent' || t === 'boundaryEvent') return null
  return sameContainer ? 'sequenceFlow' : null
}
