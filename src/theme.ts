/**
 * Colours and type as CSS custom properties, and the colours a file carries.
 *
 * Every colour the renderer draws is a `var(--bpmn-…, default)`, so a page
 * restyles all its diagrams — or switches them to a dark theme — with a few
 * declarations. A colour stored in the file (bpmn.io's `bioc:fill`, the OMG's
 * `color:background-color`) overrides the variables for its own element only,
 * and is validated first: a file is someone else's text.
 */

export const FONT_FAMILY = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

/** Variable name → light-theme default. The documented theming surface. */
export const VARIABLES: Readonly<Record<string, string>> = {
  '--bpmn-font-family': FONT_FAMILY,
  '--bpmn-background': 'transparent',
  /** Outlines, flows and markers. */
  '--bpmn-stroke': '#22242a',
  /** The inside of shapes. */
  '--bpmn-fill': '#ffffff',
  '--bpmn-text': '#22242a',
  /** Pools and lanes: the band that holds the name. */
  '--bpmn-pool-fill': '#ffffff',
  '--bpmn-lane-fill': 'transparent',
  '--bpmn-group-stroke': '#22242a',
  '--bpmn-annotation-stroke': '#22242a',
  /** The halo behind flow labels, so a line does not cross the text. */
  '--bpmn-label-halo': '#ffffff',
}

export function v(name: string): string {
  const fallback = VARIABLES[name]
  return fallback === undefined ? `var(${name})` : `var(${name}, ${fallback})`
}

export function stylesheet(rootId: string): string {
  const r = `#${rootId}`
  return [
    `${r}{font-family:${v('--bpmn-font-family')};background:${v('--bpmn-background')}}`,
    `${r} .bpmn-shape{fill:${v('--bpmn-fill')};stroke:${v('--bpmn-stroke')};stroke-width:2px}`,
    `${r} .bpmn-thin{stroke-width:1.5px}`,
    `${r} .bpmn-thick{stroke-width:4px}`,
    `${r} .bpmn-call{stroke-width:5px}`,
    `${r} .bpmn-dashed{stroke-dasharray:6 4}`,
    `${r} .bpmn-dotted{stroke-dasharray:1.5 3;stroke-linecap:round}`,
    `${r} .bpmn-pool{fill:${v('--bpmn-pool-fill')};stroke:${v('--bpmn-stroke')};stroke-width:1.5px}`,
    `${r} .bpmn-lane{fill:${v('--bpmn-lane-fill')};stroke:${v('--bpmn-stroke')};stroke-width:1px}`,
    `${r} .bpmn-group{fill:none;stroke:${v('--bpmn-group-stroke')};stroke-width:1px;stroke-dasharray:10 4 1 4}`,
    `${r} .bpmn-annotation{fill:none;stroke:${v('--bpmn-annotation-stroke')};stroke-width:1px}`,
    `${r} .bpmn-icon{fill:none;stroke:${v('--bpmn-stroke')};stroke-width:1.5px;stroke-linejoin:round}`,
    `${r} .bpmn-icon-fill{fill:${v('--bpmn-stroke')};stroke:${v('--bpmn-stroke')};stroke-width:1px;stroke-linejoin:round}`,
    `${r} .bpmn-icon-inverse{fill:${v('--bpmn-fill')};stroke:${v('--bpmn-fill')};stroke-width:1px}`,
    `${r} .bpmn-flow{fill:none;stroke:${v('--bpmn-stroke')};stroke-width:1.5px;stroke-linejoin:round}`,
    `${r} .bpmn-message-flow{stroke-dasharray:10 6}`,
    `${r} .bpmn-association{stroke-dasharray:1 4;stroke-linecap:round}`,
    `${r} .bpmn-head{fill:${v('--bpmn-stroke')};stroke:${v('--bpmn-stroke')};stroke-width:1px;stroke-linejoin:round}`,
    `${r} .bpmn-head-open{fill:${v('--bpmn-fill')};stroke:${v('--bpmn-stroke')};stroke-width:1.5px;stroke-linejoin:round}`,
    `${r} .bpmn-head-line{fill:none;stroke:${v('--bpmn-stroke')};stroke-width:1.5px;stroke-linejoin:round}`,
    `${r} .bpmn-label{fill:${v('--bpmn-text')};font-size:12px}`,
    `${r} .bpmn-label-external{font-size:11px}`,
    `${r} .bpmn-label-halo{stroke:${v('--bpmn-label-halo')};stroke-width:3px;paint-order:stroke;stroke-linejoin:round}`,
  ].join('')
}

const NAMED = /^[a-zA-Z]{3,24}$/
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const NUMBER = String.raw`\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:%|deg)?\s*`
const FUNCTION = new RegExp(`^(?:rgba?|hsla?)\\((?:${NUMBER},){2,3}${NUMBER}\\)$|^(?:rgba?|hsla?)\\((?:${NUMBER}){3}(?:/${NUMBER})?\\)$`, 'i')

/**
 * A colour from the file when it is a plain colour value — hex, a name,
 * `rgb()`/`hsl()` with numbers — and nothing else; otherwise undefined.
 */
export function safeColor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const v = value.trim()
  if (HEX.test(v) || FUNCTION.test(v)) return v
  if (NAMED.test(v) && !/^(?:inherit|initial|unset|revert|var|url|expression)$/i.test(v)) return v
  return undefined
}
