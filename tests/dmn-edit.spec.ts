import { approximateMeasurer, DmnDocument, parseDmn, renderDecision, renderDmn } from '../src'
import { fixture } from './fixtures'

function counter() {
  let n = 0
  return () => String(++n)
}
const open = (xml?: string) => new DmnDocument(xml, { idSuffix: counter() })
const valid = (doc: DmnDocument) => {
  const result = renderDmn(doc.xml, { measureText: approximateMeasurer })
  expect(result.warnings).toEqual([])
  return result
}

describe('DmnDocument: diagram', () => {
  it('adds elements and connects them with requirements', () => {
    const doc = open()
    const input = doc.createElement('inputData', { x: 250, y: 300 }, { name: 'Order' })
    const req = doc.connect(input, 'Decision_1')
    expect(doc.element(input)).toMatchObject({ type: 'inputData', name: 'Order' })
    expect(doc.model.requirements).toEqual([expect.objectContaining({ id: req, kind: 'information', source: input, target: 'Decision_1' })])
    // The requirement goes before the decision's logic.
    expect(doc.xml).toMatch(/<decision id="Decision_1" name="Decision 1">\s*<informationRequirement id="InformationRequirement_\d+">\s*<requiredInput href="#InputData_\d+" \/>\s*<\/informationRequirement>\s*<decisionTable/)
    expect(doc.diagram.edges).toHaveLength(1)
    valid(doc)
  })

  it('follows the requirement rules', () => {
    const doc = open()
    const bkm = doc.createElement('businessKnowledgeModel', { x: 0, y: 140 })
    const source = doc.createElement('knowledgeSource', { x: 500, y: 140 })
    const note = doc.createElement('textAnnotation', { x: 500, y: 20 }, { name: 'Note' })
    expect(doc.canConnect(bkm, 'Decision_1')).toBe('knowledge')
    expect(doc.canConnect(source, 'Decision_1')).toBe('authority')
    expect(doc.canConnect('Decision_1', bkm)).toBeNull()
    expect(doc.canConnect(note, 'Decision_1')).toBe('association')
    doc.connect(bkm, 'Decision_1')
    expect(doc.canConnect(bkm, 'Decision_1')).toBeNull()
    doc.connect(note, source)
    expect(doc.xml).toContain('<sourceRef href="#TextAnnotation_')
    valid(doc)
  })

  it('moves shapes and redraws their lines, and undoes', () => {
    const doc = open()
    const input = doc.createElement('inputData', { x: 250, y: 300 })
    doc.connect(input, 'Decision_1')
    const before = doc.diagram.edges[0]!.waypoints
    doc.move([input], 100, 0)
    expect(doc.shape(input)!.x).toBe(288)
    expect(doc.diagram.edges[0]!.waypoints).not.toEqual(before)
    doc.undo()
    expect(doc.shape(input)!.x).toBe(188)
  })

  it('removes elements with their requirements and shapes', () => {
    const doc = open(fixture('loan.dmn'))
    doc.remove(['Decision_Risk'])
    const xml = doc.xml
    expect(xml).not.toContain('#Decision_Risk')
    expect(xml).not.toContain('dmnElementRef="Decision_Risk"')
    expect(xml).not.toContain('InformationRequirement_3')
    expect(doc.model.requirements.map((r) => r.id)).toEqual(['InformationRequirement_2', 'InformationRequirement_5'])
    valid(doc)
  })

  it('renames an element with its variable, and ids with their references', () => {
    const doc = open(fixture('loan.dmn'))
    doc.rename('Decision_Approval', 'Approval')
    expect(doc.xml).toContain('<variable id="InformationItem_Approval" name="Approval" typeRef="string" />')
    doc.setId('Input_Score', 'Score')
    expect(doc.xml).toContain('<requiredInput href="#Score" />')
    expect(doc.xml).toContain('dmnElementRef="Score"')
    expect(() => doc.setId('Score', 'Input_Age')).toThrow(/taken/)
  })

  it('writes the computed layout on the first change to a file without one', () => {
    const doc = open(fixture('discount.dmn'))
    expect(parseDmn(doc.xml).diagrams).toHaveLength(0)
    doc.move(['Input_Customer'], 10, 0)
    const model = parseDmn(doc.xml)
    expect(model.diagrams[0]!.shapes).toHaveLength(3)
    expect(doc.xml).toContain('xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"')
    valid(doc)
  })

  it('keeps a DMN 1.1 layout in biodi', () => {
    const doc = open(fixture('legacy-11.dmn'))
    doc.move(['weight'], 20, 0)
    expect(doc.xml).toContain('<biodi:bounds x="110" y="250" width="125" height="45" />')
    const input = doc.createElement('inputData', { x: 600, y: 270 }, { name: 'Zone' })
    doc.connect(input, 'shippingMethod')
    expect(doc.xml).toContain(`<biodi:edge source="${input}">`)
    expect(doc.xml).not.toContain('DMNDI')
    // DMN 1.1 requirements have no ids.
    expect(doc.xml).toMatch(/<informationRequirement>\s*<requiredInput href="#InputData_\d+" \/>/)
    valid(doc)
  })
})

describe('DmnDocument: decision tables', () => {
  it('edits rules and cells', () => {
    const doc = open()
    doc.addRule('Decision_1')
    doc.addRule('Decision_1')
    doc.setCell('Decision_1', 0, { kind: 'input', index: 0 }, '"gold"')
    doc.setCell('Decision_1', 0, { kind: 'output', index: 0 }, '0.1')
    doc.setCell('Decision_1', 1, { kind: 'annotation', index: 0 }, 'Everyone else')
    const table = doc.decision('Decision_1')!.logic
    if (table?.kind !== 'table') throw new Error()
    expect(table.rules.map((r) => [r.inputs, r.outputs, r.description])).toEqual([
      [['"gold"'], ['0.1'], undefined],
      [[''], [''], 'Everyone else'],
    ])
    doc.moveRule('Decision_1', 1, 0)
    doc.removeRule('Decision_1', 1)
    const after = doc.decision('Decision_1')!.logic
    expect(after?.kind === 'table' && after.rules.map((r) => r.description)).toEqual(['Everyone else'])
  })

  it('adds, changes and removes columns with their cells', () => {
    const doc = open()
    doc.addRule('Decision_1')
    doc.updateInput('Decision_1', 0, { label: 'Segment', expression: 'segment' })
    doc.addInput('Decision_1', { label: 'Amount', expression: 'amount', typeRef: 'number' })
    doc.addOutput('Decision_1', { name: 'reason' })
    doc.updateOutput('Decision_1', 0, { name: 'discount', typeRef: 'number' })
    doc.setCell('Decision_1', 0, { kind: 'input', index: 1 }, '> 100')
    let t = doc.decision('Decision_1')!.logic
    if (t?.kind !== 'table') throw new Error()
    expect(t.inputs.map((i) => [i.label, i.expression, i.typeRef])).toEqual([
      ['Segment', 'segment', 'string'],
      ['Amount', 'amount', 'number'],
    ])
    expect(t.outputs.map((o) => [o.name, o.typeRef])).toEqual([
      ['discount', 'number'],
      ['reason', 'string'],
    ])
    expect(t.rules[0]!.inputs).toEqual(['', '> 100'])
    doc.removeColumn('Decision_1', 'input', 0)
    t = doc.decision('Decision_1')!.logic
    if (t?.kind !== 'table') throw new Error()
    expect(t.inputs.map((i) => i.label)).toEqual(['Amount'])
    expect(t.rules[0]!.inputs).toEqual(['> 100'])
    expect(() => doc.removeColumn('Decision_1', 'input', 0)).toThrow(/at least one input/)
    expect(renderDecision(doc.xml).kind).toBe('table')
  })

  it('sets the hit policy', () => {
    const doc = open()
    doc.setHitPolicy('Decision_1', 'COLLECT', 'SUM')
    expect(doc.xml).toContain('hitPolicy="COLLECT" aggregation="SUM"')
    doc.setHitPolicy('Decision_1', 'UNIQUE')
    expect(doc.xml).not.toContain('hitPolicy')
  })

  it('switches between a table and a literal expression', () => {
    const doc = open()
    doc.setLogic('Decision_1', 'literal')
    doc.setLiteral('Decision_1', 'amount * 0.1')
    doc.setResultType('Decision_1', 'number')
    expect(doc.decision('Decision_1')!.logic).toMatchObject({ kind: 'literal', text: 'amount * 0.1', typeRef: 'number' })
    expect(doc.xml).toMatch(/<variable id="InformationItem_\d+" name="Decision 1" typeRef="number" \/>\s*<literalExpression/)
    doc.setLogic('Decision_1', 'table')
    expect(doc.decision('Decision_1')!.logic?.kind).toBe('table')
  })

  it('keeps vendor attributes of a table it edits', () => {
    const doc = open(fixture('loan.dmn'))
    doc.setCell('Decision_Risk', 0, { kind: 'input', index: 0 }, '< 450')
    expect(doc.xml).toContain('camunda:inputVariable="score"')
    expect(doc.xml).toContain('<text>&lt; 450</text>')
  })
})
