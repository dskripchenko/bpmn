/**
 * A decision's logic as HTML: a decision table, or a literal expression.
 * Text from the file is escaped; the markup carries its own stylesheet,
 * scoped to its root, with colours as `--dmn-…` custom properties.
 */
import { escapeAttr, escapeText } from '../core/svg'
import { BpmnError } from '../errors'
import { parseDmn, type DecisionTable, type DmnDecision, type DmnModel, type DmnParseOptions, type HitPolicy } from './model'

export interface DecisionRenderOptions extends DmnParseOptions {
  /** Prefix of the root id; unique on the page when a decision is shown twice. */
  idPrefix?: string
}

export interface DecisionRenderResult {
  html: string
  /** `table`, `literal`, `other`, or `none` for a decision without logic. */
  kind: 'table' | 'literal' | 'other' | 'none'
  decision: string
}

const HIT: Record<HitPolicy, string> = {
  UNIQUE: 'U',
  FIRST: 'F',
  PRIORITY: 'P',
  ANY: 'A',
  COLLECT: 'C',
  'RULE ORDER': 'R',
  'OUTPUT ORDER': 'O',
}
const AGGREGATION: Record<string, string> = { SUM: '+', MIN: '<', MAX: '>', COUNT: '#' }

/** The short form of a hit policy: `U`, `F`, `C+`… */
export function hitPolicyCode(table: Pick<DecisionTable, 'hitPolicy' | 'aggregation'>): string {
  return HIT[table.hitPolicy] + (table.hitPolicy === 'COLLECT' && table.aggregation ? AGGREGATION[table.aggregation] : '')
}

const t = (s: string | undefined) => escapeText(s ?? '')
const a = (s: string) => escapeAttr(s)

function css(root: string): string {
  const r = `#${root}`
  const v = (name: string, fallback: string) => `var(${name}, ${fallback})`
  return [
    `${r}{font-family:${v('--dmn-font-family', 'Arial, "Helvetica Neue", Helvetica, sans-serif')};font-size:13px;color:${v('--dmn-text', '#22242a')}}`,
    `${r} .dmn-decision__head{display:flex;gap:12px;align-items:baseline;margin:0 0 8px}`,
    `${r} .dmn-decision__name{font-weight:600;font-size:15px}`,
    `${r} .dmn-decision__meta{color:${v('--dmn-muted', '#5b6472')};font-size:12px}`,
    `${r} .dmn-table{border-collapse:collapse;background:${v('--dmn-background', '#ffffff')}}`,
    `${r} .dmn-table th,${r} .dmn-table td{border:1px solid ${v('--dmn-border', '#c7cbd1')};padding:4px 8px;vertical-align:top;text-align:left}`,
    `${r} .dmn-table thead th{background:${v('--dmn-head', '#f3f4f6')};font-weight:600}`,
    `${r} .dmn-table .dmn-sub{font-weight:normal;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:${v('--dmn-muted', '#5b6472')}}`,
    `${r} .dmn-table .dmn-type{font-weight:normal;font-size:11px;color:${v('--dmn-muted', '#5b6472')}}`,
    `${r} .dmn-table .dmn-hit{text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`,
    `${r} .dmn-table .dmn-index{text-align:right;color:${v('--dmn-muted', '#5b6472')}}`,
    `${r} .dmn-table .dmn-entry{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap}`,
    `${r} .dmn-table .dmn-first-output{border-left:3px double ${v('--dmn-border', '#c7cbd1')}}`,
    `${r} .dmn-table .dmn-first-annotation{border-left:3px double ${v('--dmn-border', '#c7cbd1')}}`,
    `${r} .dmn-table .dmn-any{color:${v('--dmn-muted', '#5b6472')}}`,
    `${r} .dmn-literal{margin:0;padding:8px 10px;border:1px solid ${v('--dmn-border', '#c7cbd1')};background:${v('--dmn-background', '#ffffff')};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap}`,
  ].join('')
}

function tableHtml(table: DecisionTable): string {
  const annotationCols = table.annotations.length > 0 ? table.annotations : table.rules.some((r) => r.description) ? ['Annotation'] : []
  const head1: string[] = [`<th class="dmn-hit" rowspan="2" title="${a(table.hitPolicy + (table.aggregation ? ` ${table.aggregation}` : ''))}">${t(hitPolicyCode(table))}</th>`]
  const head2: string[] = []
  table.inputs.forEach((i) => {
    head1.push(`<th class="dmn-input">${t(i.label || i.expression || '')}</th>`)
    const sub = i.label && i.expression && i.label !== i.expression ? `<div class="dmn-sub">${t(i.expression)}</div>` : ''
    head2.push(`<th class="dmn-input">${sub}${i.typeRef ? `<div class="dmn-type">${t(i.typeRef)}</div>` : ''}</th>`)
  })
  table.outputs.forEach((o, n) => {
    const cls = n === 0 ? 'dmn-output dmn-first-output' : 'dmn-output'
    head1.push(`<th class="${cls}">${t(o.label || o.name || '')}</th>`)
    const sub = o.label && o.name && o.label !== o.name ? `<div class="dmn-sub">${t(o.name)}</div>` : ''
    head2.push(`<th class="${cls}">${sub}${o.typeRef ? `<div class="dmn-type">${t(o.typeRef)}</div>` : ''}</th>`)
  })
  annotationCols.forEach((name, n) => head1.push(`<th class="dmn-annotation${n === 0 ? ' dmn-first-annotation' : ''}" rowspan="2">${t(name)}</th>`))

  const rows = table.rules.map((rule, index) => {
    const cells = [`<td class="dmn-index">${index + 1}</td>`]
    table.inputs.forEach((_, n) => {
      const v = (rule.inputs[n] ?? '').trim()
      cells.push(v === '' || v === '-' ? '<td class="dmn-entry dmn-any">-</td>' : `<td class="dmn-entry">${t(v)}</td>`)
    })
    table.outputs.forEach((_, n) => cells.push(`<td class="dmn-entry${n === 0 ? ' dmn-first-output' : ''}">${t(rule.outputs[n] ?? '')}</td>`))
    const notes = table.annotations.length > 0 ? rule.annotations : annotationCols.length > 0 ? [rule.description ?? ''] : []
    annotationCols.forEach((_, n) => cells.push(`<td class="dmn-note${n === 0 ? ' dmn-first-annotation' : ''}">${t(notes[n] ?? '')}</td>`))
    return `<tr data-rule-id="${a(rule.id ?? '')}">${cells.join('')}</tr>`
  })
  return `<table class="dmn-table"><thead><tr>${head1.join('')}</tr><tr>${head2.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
}

function hashId(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `dmn-${(h >>> 0).toString(36)}`
}

/**
 * A decision's logic as HTML. Without `decision`, the first decision that
 * has a decision table or a literal expression.
 */
export function renderDecision(source: string | DmnModel, decision?: string, options: DecisionRenderOptions = {}): DecisionRenderResult {
  const model = typeof source === 'string' ? parseDmn(source, options) : source
  let d: DmnDecision | undefined
  if (decision) {
    d = model.decisions.find((x) => x.id === decision)
    if (!d) throw new BpmnError(`The file has no decision "${decision}"`, 0, 0, `It has: ${model.decisions.map((x) => x.id).join(', ') || 'none'}.`)
  } else {
    d = model.decisions.find((x) => x.logic && x.logic.kind !== 'other') ?? model.decisions[0]
    if (!d) throw new BpmnError('The file has no decisions')
  }
  const root = `${(options.idPrefix ?? hashId(`${model.definitions.id ?? ''}/${d.id}`)).replace(/[^a-zA-Z0-9_-]/g, '-')}-${d.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const logic = d.logic
  const variable = d.variable?.typeRef ? `<span class="dmn-decision__meta">${t(d.variable.name ?? d.name)}: ${t(d.variable.typeRef)}</span>` : ''
  let body: string
  let kind: DecisionRenderResult['kind']
  if (logic?.kind === 'table') {
    kind = 'table'
    body = tableHtml(logic)
  } else if (logic?.kind === 'literal') {
    kind = 'literal'
    body = `<pre class="dmn-literal">${t(logic.text)}</pre>`
  } else if (logic?.kind === 'other') {
    kind = 'other'
    body = `<p class="dmn-decision__meta">${t(logic.type)}</p>`
  } else {
    kind = 'none'
    body = ''
  }
  const html =
    `<div class="dmn-decision" id="${a(root)}" data-decision-id="${a(d.id)}"><style>${css(root)}</style>` +
    `<div class="dmn-decision__head"><span class="dmn-decision__name">${t(d.name ?? d.id)}</span>${variable}</div>${body}</div>`
  return { html, kind, decision: d.id }
}
