import { approximateMeasurer, BpmnError, hitPolicyCode, parseDmn, renderDecision, renderDmn } from '../src'
import { fixture } from './fixtures'

const draw = (xml: string) => renderDmn(xml, { measureText: approximateMeasurer })

describe('parseDmn', () => {
  it('reads DMN 1.3 with its diagram', () => {
    const model = parseDmn(fixture('loan.dmn'))
    expect(model.version).toBe('1.3')
    expect(model.definitions).toMatchObject({ id: 'Definitions_Loan', name: 'Loan approval', exporter: 'Camunda Modeler' })
    expect(model.decisions.map((d) => d.id)).toEqual(['Decision_Approval', 'Decision_Risk', 'Decision_Eligibility'])
    expect(model.requirements.map((r) => `${r.kind}:${r.source}→${r.target}`)).toEqual([
      'information:Decision_Risk→Decision_Approval',
      'information:Decision_Eligibility→Decision_Approval',
      'information:Input_Score→Decision_Risk',
      'information:Input_Amount→Decision_Risk',
      'knowledge:Bkm_Rules→Decision_Risk',
      'authority:Source_Policy→Decision_Risk',
      'information:Input_Age→Decision_Eligibility',
    ])
    expect(model.diagrams[0]!.shapes).toHaveLength(9)
    expect(model.diagrams[0]!.shapes.find((s) => s.element === 'Decision_Risk')!.colors).toEqual({ fill: '#bbdefb', stroke: '#0d4372' })
  })

  it('reads decision tables and literal expressions', () => {
    const model = parseDmn(fixture('loan.dmn'))
    const risk = model.decisions[1]!.logic
    expect(risk).toMatchObject({ kind: 'table', hitPolicy: 'FIRST', annotations: ['Why'] })
    if (risk?.kind !== 'table') throw new Error()
    expect(risk.inputs).toEqual([
      { id: 'Input_1', label: 'Credit score', expression: 'creditScore', typeRef: 'number', values: undefined },
      { id: 'Input_2', label: 'Amount', expression: 'amount', typeRef: 'number', values: undefined },
    ])
    expect(risk.outputs[0]).toMatchObject({ name: 'risk', typeRef: 'string', values: '"low","medium","high"' })
    expect(risk.rules[0]).toMatchObject({ id: 'Rule_1', inputs: ['< 500', ''], outputs: ['"high"'], annotations: ['Poor history'] })
    expect(model.decisions[2]!.logic).toMatchObject({ hitPolicy: 'COLLECT', aggregation: 'COUNT' })
    expect(hitPolicyCode(model.decisions[2]!.logic as never)).toBe('C#')
    expect(model.decisions[0]!.logic).toMatchObject({ kind: 'literal', text: 'if eligible and risk != "high" then "approve" else "refer"' })
    expect(model.decisions[0]!.variable).toEqual({ name: 'approval', typeRef: 'string' })
  })

  it('reads DMN 1.1 with the biodi layout', () => {
    const model = parseDmn(fixture('legacy-11.dmn'))
    expect(model.version).toBe('1.1')
    expect(model.diagrams[0]!.shapes.map((s) => s.element)).toEqual(['shippingMethod', 'weight', 'express'])
    expect(model.diagrams[0]!.edges.map((e) => e.element)).toEqual(['weight→shippingMethod', 'express→shippingMethod'])
  })

  it('refuses a file that is not DMN', () => {
    expect(() => parseDmn(fixture('order.bpmn'))).toThrow(/is not a DMN file/)
  })
})

describe('renderDmn', () => {
  it.each(['loan', 'legacy-11', 'discount'])('draws %s.dmn as before', async (name) => {
    const result = draw(fixture(`${name}.dmn`))
    expect(result.warnings).toEqual([])
    await expect(result.svg).toMatchFileSnapshot(`./__snapshots__/${name}.dmn.svg`)
  })

  it('lays out a file without a diagram, routing around what is in between', () => {
    const result = draw(fixture('discount.dmn'))
    expect(result.generated).toBe(true)
    // The customer is below the segment, the segment below the discount.
    const y = (id: string) => Number(new RegExp(`data-element-id="${id}"[^>]*><(?:rect|path)[^>]*?y="([\\d.-]+)"`).exec(result.svg)?.[1])
    expect(y('Input_Customer')).toBeGreaterThan(y('Decision_Segment'))
    expect(y('Decision_Segment')).toBeGreaterThan(y('Decision_Discount'))
    expect(result.svg).toMatch(/data-element-id="Req_1"><path d="M[\d.]+,[\d.]+ L[\d.]+,[\d.]+ L[\d.]+,[\d.]+ L/)
  })

  it('draws every requirement kind', () => {
    const { svg } = draw(fixture('loan.dmn'))
    expect(svg).toContain('dmn-type-knowledgeRequirement')
    expect(svg).toContain('dmn-type-authorityRequirement')
    expect(svg).toContain('dmn-type-association')
  })
})

describe('renderDecision', () => {
  it('renders a decision table', () => {
    const { html, kind } = renderDecision(fixture('loan.dmn'), 'Decision_Risk')
    expect(kind).toBe('table')
    expect(html).toContain('<th class="dmn-hit" rowspan="2" title="FIRST">F</th>')
    expect(html).toContain('<td class="dmn-entry">&lt; 500</td>')
    expect(html).toContain('<td class="dmn-entry dmn-any">-</td>')
    expect(html).toContain('<td class="dmn-note dmn-first-annotation">Poor history</td>')
  })

  it('renders a literal expression, and picks the first decision with logic', () => {
    const { html, kind, decision } = renderDecision(fixture('loan.dmn'))
    expect(decision).toBe('Decision_Approval')
    expect(kind).toBe('literal')
    expect(html).toContain('<pre class="dmn-literal">if eligible and risk != "high" then "approve" else "refer"</pre>')
    expect(html).toContain('approval: string')
  })

  it('escapes what the file says', () => {
    const xml = fixture('discount.dmn').replace('<text>"gold"</text>', '<text>&lt;img src=x onerror=alert(1)&gt;</text>').replace('name="Discount"', 'name="&lt;b&gt;Discount&lt;/b&gt;"')
    const { html } = renderDecision(xml, 'Decision_Discount')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('names the decisions a file has when asked for another', () => {
    expect(() => renderDecision(fixture('discount.dmn'), 'Nope')).toThrow(BpmnError)
    expect(() => renderDecision(fixture('discount.dmn'), 'Nope')).toThrow(/no decision "Nope"/)
  })
})
