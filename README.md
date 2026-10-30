# @dskripchenko/bpmn

BPMN 2.0 and DMN — a viewer that draws files to SVG with **no runtime
dependencies and no DOM**, an editing core with undo, and a Vue editor.
Reads and writes the XML that Camunda Modeler, bpmn.io and other BPMN tools
save, without losing their extensions.

```ts
import { render } from '@dskripchenko/bpmn'

const { svg, width, height } = render(xml)
element.innerHTML = svg
```

```vue
<script setup lang="ts">
import { BpmnEditor } from '@dskripchenko/bpmn/vue'
import '@dskripchenko/bpmn/style.css'
</script>

<template>
  <BpmnEditor v-model="xml" />
</template>
```

- **The whole notation**: start, intermediate, boundary and end events with
  every definition (message, timer, error, escalation, signal, conditional,
  link, compensation, cancel, terminate, multiple, parallel multiple),
  interrupting or not; tasks of every type, call activities, sub-processes
  (collapsed, expanded, event, transaction, ad hoc); loop, multi-instance and
  compensation markers; all five gateways; data objects, inputs, outputs,
  collections and data stores; text annotations, groups, pools and lanes
  (horizontal and vertical); sequence flows with default and conditional
  markers, message flows, associations and data associations; conversations.
- **Runs anywhere**: Node, a worker, a browser. In the browser text is
  measured with a canvas; elsewhere with a built-in glyph table.
- **Safe to insert**: names are escaped, colours from the file are validated,
  a document type declaration is refused (no XXE), work is bounded.
- **Lossless reading**: `parse` keeps every element and attribute of every
  namespace, and `writeXml` writes the file back without losing vendor
  extensions.
- **Themeable**: every colour is a CSS custom property; colours stored by
  modelers (`bioc:fill`, `color:background-color`) are honoured.
- **DMN**: decision requirements diagrams to SVG and decision tables or
  literal expressions to HTML, for DMN 1.1 to 1.5; files without a layout
  get one. `DmnEditor` edits the diagram and decision tables.
- **Editor**: a palette, a context pad, moving and resizing with flows
  routed again, labels typed in place, a properties panel, lanes, undo —
  as a Vue component on `@dskripchenko/ui`, or as `BpmnDocument`, a
  framework-free core for an interface of your own. Edits change the XML in
  place: execution attributes and vendor extensions stay.

## Documentation

- [Getting started](docs/en/getting-started.md) · [Editor](docs/en/editor.md) · [DMN](docs/en/dmn.md) · [Theming](docs/en/theming.md)
- Русский: [начало работы](docs/ru/getting-started.md) · [редактор](docs/ru/editor.md) · [DMN](docs/ru/dmn.md) · [оформление](docs/ru/theming.md)
- Deutsch: [Erste Schritte](docs/de/getting-started.md) · [Editor](docs/de/editor.md) · [DMN](docs/de/dmn.md) · [Gestaltung](docs/de/theming.md)
- 中文：[快速开始](docs/zh/getting-started.md) · [编辑器](docs/zh/editor.md) · [DMN](docs/zh/dmn.md) · [主题](docs/zh/theming.md)

## License

MIT
