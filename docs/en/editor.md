# Editor

The package has two editing layers: `BpmnDocument`, a framework-free core
with every operation and undo, and `BpmnEditor`, a Vue component built on
it. Both edit the XML in place: what they do not know — execution attributes,
vendor extensions, other diagrams of the file — is written back untouched.

## The Vue editor

```sh
npm install @dskripchenko/bpmn vue @dskripchenko/ui
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { BpmnEditor } from '@dskripchenko/bpmn/vue'
import '@dskripchenko/bpmn/style.css'

const xml = ref<string | null>(null) // null: a new diagram with one start event
</script>

<template>
  <BpmnEditor v-model="xml" style="height: 600px" />
</template>
```

What a person can do:

- **Create** — pick a symbol in the palette on the left and click on the
  canvas. An intermediate event dropped on the border of an activity becomes
  a boundary event. In a collaboration, flow nodes go into the pool and lane
  under the pointer.
- **Append** — the context pad next to a selected element appends a task, a
  gateway, an intermediate or an end event, already connected; connects to
  another element; adds an annotation; changes the type; colours; deletes. On
  a pool or a lane it adds a lane.
- **Select and move** — click, Shift+click, or drag a rectangle on empty
  canvas. Dragging moves the selection: the contents of a pool or an expanded
  sub-process move with it, boundary events with their activity, and flows
  are routed again. A task dropped into another lane, sub-process or pool
  moves there in the file too.
- **Resize** — the corner handles of activities, sub-processes, pools, lanes,
  groups and annotations.
- **Name** — double-click (or F2) and type; Enter saves, Shift+Enter breaks
  the line, Escape cancels.
- **Properties** — the panel on the right: id, name, type, event definition,
  interrupting or not, loop, condition and default flow, documentation.
- **Keyboard** — Delete, Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y), Ctrl+A, arrows to
  nudge (Shift for 10 px), Escape.
- **Canvas** — scroll to pan, Ctrl+scroll to zoom, Space+drag or the middle
  button to pan; the zoom controls and "fit" are at the bottom right.
- **Download** — the `.bpmn` file or a picture in `.svg`.

### Props and events

| Prop         | Type                 | Default | Meaning                                          |
| ------------ | -------------------- | ------- | ------------------------------------------------ |
| `modelValue` | `string \| null`     | `null`  | The file's XML (`v-model`); empty for a new diagram |
| `readonly`   | `boolean`            | `false` | A viewer: pan, zoom, clicks                      |
| `properties` | `boolean`            | `false` | Show the properties panel from the start         |
| `diagram`    | `string \| number`   | first   | Which diagram of the file                        |
| `highlight`  | `string[]`           | `[]`    | Elements to outline                              |
| `locale`     | `string`             | page    | `ru…` for Russian, English otherwise             |
| `labels`     | `Partial<BpmnLabels>`| —       | Overrides of the interface texts                 |

| Event               | Payload    | When                                                    |
| ------------------- | ---------- | ------------------------------------------------------- |
| `update:modelValue` | `string`   | After every change, undo and redo                       |
| `change`            | `string`   | The same                                                |
| `select`            | `string[]` | The selection changed                                   |
| `elementClick`      | `string`   | An element was clicked                                  |
| `error`             | `Error`    | An operation the notation does not allow, or an unreadable file |

The component exposes `document` (the `BpmnDocument`), `fit()`, `undo()`,
`redo()`, `toSvg()` and `selection`.

`BpmnView` is the read-only variant: `<BpmnView :xml="xml" :highlight="['Task_1']" @element-click="…" />`.

The editor follows the page's `@dskripchenko/ui` theme, light or dark; the
drawing's own variables (see [Theming](theming.md)) can be set on it too.

## The editing core

`BpmnDocument` works anywhere — in Node, in a worker, behind another UI:

```ts
import { BpmnDocument } from '@dskripchenko/bpmn'

const doc = new BpmnDocument() // or new BpmnDocument(xml)
const task = doc.createShape('userTask', { x: 300, y: 120 }, { name: 'Check order' })
doc.connect('StartEvent_1', task)
doc.undo()
doc.redo()
save(doc.xml)
```

Every operation is one step of history and either completes or leaves the
file as it was; a forbidden one throws `BpmnError`.

| Operation                                   | What it does                                                         |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `createShape(type, centre, options?)`       | Adds a shape; `options`: `name`, `eventDefinition`, `attachTo` (boundary event), `expanded`, `size`. A pool on a process diagram wraps the process |
| `addLane(pool, name?)`                      | Adds a lane; the first call splits the pool in two                   |
| `connect(source, target)`                   | Adds the flow the notation allows: sequence, message, association, data association |
| `canConnect(source, target)`                | That flow's type, or `null`                                          |
| `move(ids, dx, dy)`                         | Moves shapes with their contents; flows follow; containers change when dropped elsewhere |
| `resize(id, bounds)`                        | Resizes; a pool and its lanes follow each other                      |
| `remove(ids)`                               | Removes with contents, attached events, flows and references         |
| `rename(id, text)`                          | Name, annotation text or group category                              |
| `setType(id, type)`                         | Within a family: task → user task, gateway → parallel, start → end   |
| `setEventDefinition(id, kind?)`             | `message`, `timer`, `error`, … or none                               |
| `setLoop(id, loop)`                         | `none`, `standard`, `parallel`, `sequential`                         |
| `setCondition(flow, text)`                  | A sequence flow's condition                                          |
| `setDefaultFlow(flow, isDefault?)`          | The default flow of a gateway or activity                            |
| `setDocumentation(id, text)`                | Documentation                                                        |
| `setAttribute(id, name, value?)`            | Any plain attribute (`isExecutable`, `cancelActivity`, …)            |
| `setId(id, next)`                           | Renames an id with every reference to it                             |
| `setColors(ids, { fill?, stroke? })`        | Colours, as bpmn.io and the OMG extension store them                 |
| `setWaypoints(flow, points)`                | The bends of a flow                                                  |
| `setLabelBounds(id, bounds)`                | Where an external label sits                                         |

Reading: `model`, `diagram`, `xml`, `element(id)`, `shape(id)`, `ends(flow)`,
`processOf(id)`, `containerAt(point)`, `canUndo`, `canRedo`,
`onChange(listener)`, `load(xml)`. New ids follow the modelers' pattern
(`Activity_0b1x2yz`, `Flow_…`).

For an interface of your own, `hitTest`, `elementsIn`, `borderOf` and the
viewport helpers (`zoomAt`, `fitView`, `toWorld`) answer the geometric
questions an editor asks.
