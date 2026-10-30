# Getting started

```sh
npm install @dskripchenko/bpmn
```

## Drawing a file

```ts
import { render } from '@dskripchenko/bpmn'

const { svg, width, height, warnings } = render(xml)
container.innerHTML = svg
```

`render` takes the text of a `.bpmn` file and returns:

| Field      | What it is                                                              |
| ---------- | ----------------------------------------------------------------------- |
| `svg`      | The drawing, a complete `<svg>` element as text                         |
| `width`    | Its width in pixels                                                     |
| `height`   | Its height in pixels                                                    |
| `diagram`  | The id of the diagram drawn                                             |
| `warnings` | What was skipped: shapes of elements missing from the file, broken flows |

The drawing follows the layout stored in the file (the `BPMNDiagram`
section) — every modeler saves one. Nothing is moved. A file without a
layout is refused with an explanation.

## Options

```ts
render(xml, {
  diagram: 'Diagram_2', // or an index; the first diagram by default
  title: 'Order handling', // accessible title; defaults to the diagram's name
  idPrefix: 'order', // ids inside the SVG; unique on the page when a file is shown twice
  padding: 10, // space around the drawing
  measureText, // how text is measured; a canvas in the browser by default
  limits: { maxLength: 1_000_000 }, // stricter limits for untrusted files
})
```

## Errors

A file that cannot be read throws a `BpmnError` with the line and column of
the fault and, when there is one, a hint:

```ts
import { BpmnError, render } from '@dskripchenko/bpmn'

try {
  render(xml)
} catch (e) {
  if (e instanceof BpmnError) console.log(e.message, e.line, e.column, e.hint)
}
```

## Reading the model

`parse` returns the semantics and the layout without drawing:

```ts
import { parse } from '@dskripchenko/bpmn'

const model = parse(xml)
model.elements.get('Task_Check') // { id, type: 'userTask', name, parent, eventDefinitions, loop, xml }
model.diagrams[0].shapes // [{ element, bounds, label, isExpanded, colors }, …]
```

Every element keeps its XML node (`xml`), with all attributes and children
of every namespace — vendor extensions included. `writeXml(model.document)`
writes the file back.

A model can be passed to `render` instead of the text, to draw several
diagrams of one file without reading it again.

## In the browser and on the server

`render` needs no DOM. On a server it measures text with a table of glyph
widths; in the browser with a canvas, so labels wrap as the reader's fonts
need. To get the same output everywhere, pass `approximateMeasurer`:

```ts
import { approximateMeasurer, render } from '@dskripchenko/bpmn'
render(xml, { measureText: approximateMeasurer })
```

## What is drawn

Events of every kind and definition, tasks of every type, call activities,
sub-processes (collapsed, expanded, event, transaction, ad hoc), loop,
multi-instance and compensation markers, gateways, data objects and stores,
text annotations, groups, pools and lanes, every kind of flow, and
conversations. Choreographies are drawn as plain boxes with their names.

Each element is a `<g class="bpmn-element bpmn-type-userTask" data-element-id="Task_Check">`,
so a page can find it, highlight it or attach a handler.
