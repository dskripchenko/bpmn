import { borderOf, distanceToPath, elementsIn, hitTest, parse } from '../src'
import { fixture } from './fixtures'

const model = parse(fixture('order.bpmn'))
const diagram = model.diagrams[0]!

describe('hit testing', () => {
  it('finds plain shapes, smallest first', () => {
    expect(hitTest(model, diagram, { x: 870, y: 555 })).toBe('Task_Pack')
    expect(hitTest(model, diagram, { x: 250, y: 250 })).toBe('Start_Order')
    expect(hitTest(model, diagram, { x: 520, y: 250 })).toBe('Gateway_Valid')
  })

  it('prefers a boundary event over its activity', () => {
    expect(hitTest(model, diagram, { x: 370, y: 290 })).toBe('Timer_Check')
  })

  it('finds flows near their line', () => {
    expect(hitTest(model, diagram, { x: 730, y: 400 })).toBe('Flow_4')
    expect(distanceToPath({ x: 0, y: 5 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(5)
  })

  it('takes frames only at their edge or title band', () => {
    expect(hitTest(model, diagram, { x: 175, y: 400 })).toBe('Participant_Shop')
    expect(hitTest(model, diagram, { x: 205, y: 300 })).toBe('Lane_Sales')
    expect(hitTest(model, diagram, { x: 900, y: 480 })).toBe('Sub_Ship')
    expect(hitTest(model, diagram, { x: 1000, y: 620 })).toBeUndefined()
    expect(hitTest(model, diagram, { x: 700, y: 100 })).toBe('Participant_Customer')
  })

  it('selects shapes inside a rectangle, without lanes', () => {
    const ids = elementsIn(model, diagram, { x: 760, y: 470, width: 300, height: 170 })
    expect(ids).toEqual(expect.arrayContaining(['Sub_Ship', 'Sub_Start', 'Task_Pack', 'Sub_End', 'Flow_S1', 'Flow_S2']))
    expect(ids).not.toContain('Lane_Warehouse')
  })

  it('finds the activity border an event would attach to', () => {
    expect(borderOf(model, diagram, { x: 420, y: 250 })).toBe('Task_Check')
    expect(borderOf(model, diagram, { x: 370, y: 250 })).toBeUndefined()
  })
})
