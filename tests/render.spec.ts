import { fixture } from './fixtures'
import { approximateMeasurer, BpmnError, parse, render, safeColor } from '../src'

const draw = (xml: string, options = {}) => render(xml, { measureText: approximateMeasurer, ...options })

const NS = `xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"`

function small(name: string, extra = '', shapeAttrs = '') {
  return `<bpmn:definitions ${NS} id="D">
  <bpmn:process id="P">
    <bpmn:task id="T" name="${name}" ${extra} />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1"><bpmndi:BPMNPlane bpmnElement="P">
    <bpmndi:BPMNShape bpmnElement="T" ${shapeAttrs}><dc:Bounds x="100" y="100" width="100" height="80" /></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`
}

describe('parse', () => {
  it('reads semantics and the diagram', () => {
    const model = parse(fixture('order.bpmn'))
    expect(model.definitions).toMatchObject({ id: 'Definitions_Order', exporter: 'Camunda Modeler' })
    expect(model.elements.get('Start_Order')).toMatchObject({ type: 'startEvent', name: 'Order received', eventDefinitions: ['message'] })
    expect(model.elements.get('Sub_Ship')).toMatchObject({ loop: 'parallel' })
    expect(model.elements.get('Task_Pack')).toMatchObject({ loop: 'standard', parent: 'Sub_Ship' })
    expect(model.elements.get('Note_Check')!.name).toBe('Checked by the sales team within one working day')
    expect(model.diagrams).toHaveLength(1)
    const check = model.diagrams[0]!.shapes.find((s) => s.element === 'Task_Check')!
    expect(check.bounds).toEqual({ x: 320, y: 210, width: 100, height: 80 })
    expect(check.colors).toEqual({ fill: '#bbdefb', stroke: '#0d4372' })
    expect(model.diagrams[0]!.edges.find((e) => e.element === 'Flow_OrderMsg')!.message).toBe('initiating')
  })

  it('refuses a file that is not BPMN', () => {
    expect(() => parse('<svg xmlns="http://www.w3.org/2000/svg"/>')).toThrow(/is not a BPMN 2.0 file/)
  })

  it('needs numeric bounds', () => {
    expect(() => parse(small('x').replace('width="100"', 'width="wide"'))).toThrow(/numeric "width"/)
  })
})

describe('render', () => {
  it.each(['order', 'gallery'])('draws %s.bpmn as before', async (name) => {
    const result = draw(fixture(`${name}.bpmn`))
    expect(result.warnings).toEqual([])
    await expect(result.svg).toMatchFileSnapshot(`./__snapshots__/${name}.svg`)
  })

  it('is deterministic and sized to the drawing', () => {
    const a = draw(fixture('order.bpmn'))
    const b = draw(fixture('order.bpmn'))
    expect(a.svg).toBe(b.svg)
    expect(a.width).toBeGreaterThan(1100)
    expect(a.svg).toContain(`viewBox="150 50 ${a.width} ${a.height}"`)
  })

  it('marks every element with its id and type', () => {
    const { svg } = draw(fixture('order.bpmn'))
    expect(svg).toContain('class="bpmn-element bpmn-type-userTask" data-element-id="Task_Check"')
    expect(svg).toContain('data-element-id="Flow_Yes"')
  })

  it('escapes names', () => {
    const { svg } = draw(small('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'))
    expect(svg).not.toContain('<script')
    expect(svg).toContain('&lt;script&gt;')
  })

  it('applies valid colours and drops anything else', () => {
    const ok = draw(small('a', '', 'bioc:fill="#ffcc00" bioc:stroke="rgb(10, 20, 30)"')).svg
    expect(ok).toContain('--bpmn-fill:#ffcc00')
    expect(ok).toContain('--bpmn-stroke:rgb(10, 20, 30)')
    const bad = draw(small('a', '', `bioc:fill="red;background:url(http://x)" bioc:stroke="var(--x)"`)).svg
    expect(bad).not.toContain('url(')
    expect(bad).not.toContain('--bpmn-fill:red')
    expect(bad).not.toContain('var(--x)')
  })

  it('validates colour values', () => {
    for (const c of ['#fff', '#a1b2c3', '#a1b2c3d4', 'teal', 'rgb(1,2,3)', 'rgba(1, 2, 3, 0.5)', 'hsl(120 50% 50%)']) expect(safeColor(c)).toBe(c)
    for (const c of ['url(x)', 'red;x', 'expression(1)', 'inherit', '#ggg', 'rgb(1,2,3);', '']) expect(safeColor(c)).toBeUndefined()
  })

  it('wraps a long name inside its box', () => {
    const { svg } = draw(small('Approve the purchase order and notify the requester'))
    expect((svg.match(/<tspan/g) ?? []).length).toBeGreaterThan(2)
  })

  it('breaks lines where the name has a line break', () => {
    const { svg } = draw(small('Line one&#10;Line two'))
    expect(svg).toMatch(/>Line one<\/tspan><tspan[^>]*>Line two</)
  })

  it('chooses a diagram by id or index', () => {
    const two = small('a').replace(
      '</bpmn:definitions>',
      `<bpmndi:BPMNDiagram id="Diagram_2" name="Second"><bpmndi:BPMNPlane bpmnElement="P">
        <bpmndi:BPMNShape bpmnElement="T"><dc:Bounds x="0" y="0" width="300" height="200" /></bpmndi:BPMNShape>
      </bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`,
    )
    expect(draw(two).diagram).toBe('Diagram_1')
    expect(draw(two, { diagram: 'Diagram_2' })).toMatchObject({ diagram: 'Diagram_2', width: 320 })
    expect(draw(two, { diagram: 1 }).svg).toContain('<title id="bpmn-')
    expect(() => draw(two, { diagram: 'nope' })).toThrow(/no diagram "nope"/)
  })

  it('explains a file without layout', () => {
    const xml = `<bpmn:definitions ${NS}><bpmn:process id="P"><bpmn:task id="T"/></bpmn:process></bpmn:definitions>`
    expect(() => draw(xml)).toThrow(BpmnError)
    expect(() => draw(xml)).toThrow(/has no diagram/)
  })

  it('warns about shapes of missing elements', () => {
    const xml = small('a').replace('bpmnElement="T"', 'bpmnElement="Ghost"')
    expect(draw(xml).warnings).toEqual(['A shape refers to "Ghost", which is not in the file'])
  })

  it('takes the title from the options, the diagram or the process', () => {
    expect(draw(small('a'), { title: 'Mine' }).svg).toContain('>Mine</title>')
    expect(draw(fixture('order.bpmn')).svg).toContain('>Order handling</title>')
  })
})
