# @dskripchenko/bpmn

BPMN 2.0 diagrams to SVG — with **no runtime dependencies and no DOM**.
Reads the XML that Camunda Modeler, bpmn.io and other BPMN tools save and
draws it exactly as it was laid out there.

```ts
import { render } from '@dskripchenko/bpmn'

const { svg, width, height } = render(xml)
element.innerHTML = svg
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

## Documentation

- [Getting started](docs/en/getting-started.md) · [Theming](docs/en/theming.md)
- Русский: [начало работы](docs/ru/getting-started.md) · [оформление](docs/ru/theming.md)
- Deutsch: [Erste Schritte](docs/de/getting-started.md) · [Gestaltung](docs/de/theming.md)
- 中文：[快速开始](docs/zh/getting-started.md) · [主题](docs/zh/theming.md)

## License

MIT
