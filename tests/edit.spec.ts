import { approximateMeasurer, BpmnDocument, BpmnError, emptyDiagram, parse, render } from '../src'
import { fixture } from './fixtures'

function counter() {
  let n = 0
  return () => String(++n)
}

const open = (xml = emptyDiagram()) => new BpmnDocument(xml, { idSuffix: counter() })
const valid = (doc: BpmnDocument) => {
  const result = render(doc.xml, { measureText: approximateMeasurer })
  expect(result.warnings).toEqual([])
  return result
}

describe('BpmnDocument: building a process', () => {
  it('adds shapes and connects them with sequence flows', () => {
    const doc = open()
    const task = doc.createShape('userTask', { x: 290, y: 120 }, { name: 'Check' })
    const flow = doc.connect('StartEvent_1', task)
    expect(task).toBe('Activity_1')
    expect(flow).toBe('Flow_2')
    expect(doc.shape(task)!.bounds).toEqual({ x: 240, y: 80, width: 100, height: 80 })
    expect(doc.diagram.edges.find((e) => e.element === flow)!.waypoints).toEqual([
      { x: 188, y: 120 },
      { x: 240, y: 120 },
    ])
    const xml = doc.xml
    expect(xml).toContain('<bpmn:outgoing>Flow_2</bpmn:outgoing>')
    expect(xml).toContain('<bpmn:incoming>Flow_2</bpmn:incoming>')
    expect(xml).toContain('<bpmn:userTask id="Activity_1" name="Check">')
    valid(doc)
  })

  it('keeps the file indented like its author wrote it', () => {
    const doc = open()
    doc.createShape('task', { x: 290, y: 120 })
    expect(doc.xml).toContain(`    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Activity_1" />
  </bpmn:process>`)
    expect(doc.xml).toContain(`      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>`)
  })

  it('undoes and redoes', () => {
    const doc = open()
    const original = doc.xml
    let changes = 0
    doc.onChange(() => changes++)
    doc.createShape('task', { x: 290, y: 120 })
    const edited = doc.xml
    expect(doc.canUndo).toBe(true)
    expect(doc.undo()).toBe(true)
    expect(doc.xml).toBe(original)
    expect(doc.redo()).toBe(true)
    expect(doc.xml).toBe(edited)
    expect(changes).toBe(3)
    expect(doc.redo()).toBe(false)
  })

  it('leaves the file untouched when an operation fails', () => {
    const doc = open()
    const before = doc.xml
    expect(() => doc.connect('StartEvent_1', 'StartEvent_1')).toThrow(BpmnError)
    expect(() => doc.setColors(['StartEvent_1'], { fill: 'red;x:url(y)' })).toThrow(/not a colour/)
    expect(doc.xml).toBe(before)
    expect(doc.canUndo).toBe(false)
  })

  it('follows the connection rules of the notation', () => {
    const doc = open()
    const end = doc.createShape('endEvent', { x: 400, y: 120 })
    const note = doc.createShape('textAnnotation', { x: 300, y: 40 })
    expect(doc.canConnect('StartEvent_1', end)).toBe('sequenceFlow')
    expect(doc.canConnect(end, 'StartEvent_1')).toBeNull()
    expect(doc.canConnect(note, end)).toBe('association')
    const data = doc.createShape('dataObjectReference', { x: 300, y: 250 })
    expect(doc.canConnect(data, end)).toBeNull()
    expect(doc.canConnect('StartEvent_1', end)).toBe('sequenceFlow')
  })

  it('creates boundary events, data and annotations', () => {
    const doc = open()
    const task = doc.createShape('task', { x: 290, y: 120 })
    const timer = doc.createShape('boundaryEvent', { x: 290, y: 160 }, { attachTo: task, eventDefinition: 'timer' })
    expect(doc.element(timer)).toMatchObject({ type: 'boundaryEvent', eventDefinitions: ['timer'] })
    const data = doc.createShape('dataObjectReference', { x: 290, y: 260 }, { name: 'Order' })
    const input = doc.connect(data, task)
    expect(doc.element(input)!.type).toBe('dataInputAssociation')
    expect(doc.xml).toMatch(/<bpmn:property id="Property_\d+" name="__targetRef_placeholder" \/>/)
    const note = doc.createShape('textAnnotation', { x: 450, y: 40 }, { name: 'Why' })
    doc.connect(note, task)
    expect(doc.xml).toContain('<bpmn:text>Why</bpmn:text>')
    valid(doc)
  })
})

describe('BpmnDocument: collaborations', () => {
  it('puts new flow nodes into the lane under them', () => {
    const doc = open(fixture('order.bpmn'))
    const id = doc.createShape('task', { x: 400, y: 600 }, { name: 'Pick' })
    expect(doc.element(id)!.parent).toBe('Process_Order')
    expect(doc.element('Lane_Warehouse')!.xml.children.some((c) => c.kind === 'element' && c.local === 'flowNodeRef' && c.children[0]?.kind === 'text' && c.children[0].value === id)).toBe(true)
  })

  it('refuses flow nodes outside every pool', () => {
    const doc = open(fixture('order.bpmn'))
    expect(() => doc.createShape('task', { x: 50, y: 900 })).toThrow(/inside a pool/)
  })

  it('moves a flow node to another lane and re-routes its flows', () => {
    const doc = open(fixture('order.bpmn'))
    doc.move(['Task_Reject'], 0, 200)
    const refs = (lane: string) => doc.element(lane)!.xml.children.filter((c) => c.kind === 'element' && c.local === 'flowNodeRef').map((c) => (c.kind === 'element' && c.children[0]?.kind === 'text' ? c.children[0].value : ''))
    expect(refs('Lane_Warehouse')).toContain('Task_Reject')
    expect(refs('Lane_Sales')).not.toContain('Task_Reject')
    const flow = doc.diagram.edges.find((e) => e.element === 'Flow_5')!
    expect(flow.waypoints[0]).toEqual({ x: 700, y: 570 })
    valid(doc)
  })

  it('moves a pool with everything in it', () => {
    const doc = open(fixture('order.bpmn'))
    doc.move(['Participant_Shop'], 10, 20)
    expect(doc.shape('Task_Pack')!.bounds).toMatchObject({ x: 860, y: 535 })
    expect(doc.shape('Lane_Sales')!.bounds).toMatchObject({ x: 200, y: 180 })
    expect(doc.diagram.edges.find((e) => e.element === 'Flow_4')!.waypoints[0]).toEqual({ x: 710, y: 270 })
    // The message flow to the pool that stayed is routed again.
    const message = doc.diagram.edges.find((e) => e.element === 'Flow_OrderMsg')!.waypoints
    expect(message[message.length - 1]!.y).toBe(252)
  })

  it('moves a task into a sub-process, dropping flows that can no longer exist', () => {
    const doc = open(fixture('order.bpmn'))
    doc.move(['Task_Reject'], 280, 220)
    expect(doc.element('Task_Reject')!.parent).toBe('Sub_Ship')
    expect(doc.element('Flow_No')).toBeUndefined()
    expect(doc.element('Flow_5')).toBeUndefined()
    expect(doc.xml).not.toContain('Flow_No')
    valid(doc)
  })

  it('removes an element with its flows and references', () => {
    const doc = open(fixture('order.bpmn'))
    doc.remove(['Gateway_Valid'])
    const xml = doc.xml
    for (const gone of ['Gateway_Valid', 'Flow_2', 'Flow_Yes', 'Flow_No']) expect(xml).not.toContain(`"${gone}"`)
    expect(xml).not.toContain('>Flow_2<')
    expect(xml).not.toContain('>Gateway_Valid<')
    valid(doc)
  })

  it('removes a pool with its process', () => {
    const doc = open(fixture('order.bpmn'))
    doc.remove(['Participant_Shop'])
    expect(doc.element('Process_Order')).toBeUndefined()
    expect(doc.element('Flow_OrderMsg')).toBeUndefined()
    // The group belongs to the collaboration, not to the pool.
    expect(doc.diagram.shapes.map((s) => s.element).sort()).toEqual(['Group_Review', 'Participant_Customer'])
    valid(doc)
  })

  it('connects pools with message flows', () => {
    const doc = open(fixture('order.bpmn'))
    expect(doc.canConnect('Task_Invoice', 'Participant_Customer')).toBe('messageFlow')
    expect(doc.canConnect('Task_Check', 'Task_Invoice')).toBe('sequenceFlow')
    expect(doc.canConnect('Participant_Shop', 'Task_Check')).toBeNull()
    const flow = doc.connect('Task_Invoice', 'Participant_Customer')
    expect(doc.element(flow)!.parent).toBe('Collaboration_1')
    expect(doc.diagram.edges.find((e) => e.element === flow)!.waypoints).toEqual([
      { x: 650, y: 210 },
      { x: 650, y: 120 },
    ])
  })

  it('keeps what it does not edit', () => {
    const doc = open(fixture('order.bpmn'))
    doc.rename('Task_Check', 'Check the order')
    const xml = doc.xml
    expect(xml).toContain('camunda:assignee="${initiator}"')
    expect(xml).toContain('<camunda:inputParameter name="limit">1000</camunda:inputParameter>')
    expect(xml).toContain('<![CDATA[execution.setVariable("reported", a < b && true);]]>')
    expect(xml).toContain('bioc:fill="#bbdefb"')
  })

  it('wraps a process into a pool, then splits it into lanes', () => {
    const doc = open()
    const task = doc.createShape('task', { x: 290, y: 120 })
    const pool = doc.createShape('participant', { x: 0, y: 0 }, { name: 'Company' })
    expect(doc.diagram.plane).toBe('Collaboration_3')
    expect(doc.processOf(pool)).toBe('Process_1')
    const b = doc.shape(pool)!.bounds
    expect(b.x).toBeLessThan(152)
    expect(b.x + b.width).toBeGreaterThan(340)
    const lane = doc.addLane(pool, 'Back office')
    const lanes = doc.diagram.shapes.filter((s) => doc.element(s.element)?.type === 'lane')
    expect(lanes).toHaveLength(2)
    expect(doc.element(lane)!.name).toBe('Back office')
    expect(doc.xml).toContain(`<bpmn:flowNodeRef>${task}</bpmn:flowNodeRef>`)
    expect(doc.shape(pool)!.bounds.height).toBe(b.height + 125)
    const second = doc.createShape('participant', { x: 400, y: 600 }, { name: 'Customer' })
    expect(doc.processOf(second)).toMatch(/^Process_/)
    valid(doc)
  })

  it('resizes a pool and its lanes together', () => {
    const doc = open(fixture('order.bpmn'))
    doc.resize('Participant_Shop', { x: 160, y: 160, width: 1200, height: 560 })
    expect(doc.shape('Lane_Sales')!.bounds).toEqual({ x: 190, y: 160, width: 1170, height: 280 })
    expect(doc.shape('Lane_Warehouse')!.bounds).toEqual({ x: 190, y: 440, width: 1170, height: 280 })
    doc.resize('Lane_Sales', { x: 190, y: 160, width: 1170, height: 300 })
    expect(doc.shape('Lane_Warehouse')!.bounds.y).toBe(460)
    expect(doc.shape('Participant_Shop')!.bounds.height).toBe(580)
  })
})

describe('BpmnDocument: properties', () => {
  it('changes types within a family', () => {
    const doc = open(fixture('order.bpmn'))
    doc.setType('Task_Check', 'serviceTask')
    expect(doc.xml).toContain('<bpmn:serviceTask id="Task_Check"')
    expect(doc.xml).toContain('</bpmn:serviceTask>')
    doc.setType('Gateway_Valid', 'parallelGateway')
    expect(doc.shape('Gateway_Valid')!.isMarkerVisible).toBeUndefined()
    doc.setType('Start_Order', 'endEvent')
    expect(doc.element('Flow_1')).toBeUndefined()
    expect(() => doc.setType('Task_Invoice', 'exclusiveGateway')).toThrow(/cannot become/)
    valid(doc)
  })

  it('sets event definitions, loops, conditions and default flows', () => {
    const doc = open(fixture('order.bpmn'))
    doc.setEventDefinition('End_Escalated', 'error')
    expect(doc.element('End_Escalated')!.eventDefinitions).toEqual(['error'])
    doc.setEventDefinition('End_Escalated', undefined)
    expect(doc.element('End_Escalated')!.eventDefinitions).toEqual([])
    doc.setLoop('Task_Invoice', 'sequential')
    expect(doc.element('Task_Invoice')!.loop).toBe('sequential')
    doc.setLoop('Task_Invoice', 'none')
    expect(doc.element('Task_Invoice')!.loop).toBeUndefined()
    doc.setCondition('Flow_No', '${!valid}')
    expect(doc.xml).toContain('<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${!valid}</bpmn:conditionExpression>')
    expect(doc.xml).toMatch(/xmlns:xsi="http:\/\/www.w3.org\/2001\/XMLSchema-instance"/)
    doc.setDefaultFlow('Flow_Yes')
    expect(doc.xml).toContain('default="Flow_Yes"')
    doc.setDocumentation('Task_Check', 'Look at it')
    expect(doc.xml).toContain('<bpmn:documentation>Look at it</bpmn:documentation>')
    valid(doc)
  })

  it('renames ids everywhere', () => {
    const doc = open(fixture('order.bpmn'))
    doc.setId('Task_Check', 'Review')
    const xml = doc.xml
    expect(xml).not.toContain('Task_Check')
    expect(xml).toContain('<bpmn:flowNodeRef>Review</bpmn:flowNodeRef>')
    expect(xml).toContain('attachedToRef="Review"')
    expect(xml).toContain('bpmnElement="Review"')
    expect(() => doc.setId('Review', 'Task_Invoice')).toThrow(/taken/)
    expect(() => doc.setId('Review', '1 bad')).toThrow(/not a valid id/)
    valid(doc)
  })

  it('renames annotations and groups', () => {
    const doc = open(fixture('order.bpmn'))
    doc.rename('Note_Check', 'Same day')
    doc.rename('Group_Review', 'Checks')
    const model = parse(doc.xml)
    expect(model.elements.get('Note_Check')!.name).toBe('Same day')
    expect(doc.xml).toContain('value="Checks"')
  })

  it('colours shapes', () => {
    const doc = open()
    doc.setColors(['StartEvent_1'], { fill: '#fff3e0', stroke: '#e65100' })
    expect(doc.shape('StartEvent_1')!.colors).toEqual({ fill: '#fff3e0', stroke: '#e65100' })
    expect(doc.xml).toContain('xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"')
    doc.setColors(['StartEvent_1'], {})
    expect(doc.shape('StartEvent_1')!.colors).toEqual({})
  })
})
