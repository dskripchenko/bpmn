# DMN

The package reads DMN files — decision requirements diagrams, decision
tables and literal expressions — from every published version: 1.1 (with
the `biodi` layout older Camunda tools wrote), 1.2, 1.3, 1.4 and 1.5.

## The diagram

```ts
import { renderDmn } from '@dskripchenko/bpmn'

const { svg, width, height, generated } = renderDmn(xml)
```

Decisions, input data, business knowledge models, knowledge sources,
decision services and text annotations are drawn as the file lays them out;
information requirements as solid arrows, knowledge requirements as dashed
open arrows, authority requirements as dashed lines ending in a dot,
associations dotted. A decision shows a small table when its logic is a
decision table and `fx` when it is a literal expression.

A file without a layout — a decision table exported by an engine, a file
written by hand — gets one: required elements below, the decisions that need
them above, layer by layer; `generated` is then `true`.

The options are those of `render`: `diagram`, `measureText`, `idPrefix`,
`title`, `padding`, `limits`, `nested`.

## Decision tables and literal expressions

```ts
import { renderDecision } from '@dskripchenko/bpmn'

const { html, kind } = renderDecision(xml, 'Decision_Risk')
container.innerHTML = html
```

`renderDecision(source, decisionId?)` returns HTML: a decision table with
its hit policy (`U`, `F`, `P`, `A`, `C`, `C+`, `C<`, `C>`, `C#`, `R`, `O`),
input and output columns with their expressions and types, the rules, and
annotation columns (or rule descriptions); a literal expression as its text.
Without an id, the first decision with logic is shown. `kind` is `table`,
`literal`, `other` (another boxed expression) or `none`.

The markup carries its own stylesheet, scoped to its root; its colours are
custom properties:

| Variable           | Default    | Used for                 |
| ------------------ | ---------- | ------------------------ |
| `--dmn-font-family`| Arial, …   | Text                     |
| `--dmn-text`       | `#22242a`  | Text                     |
| `--dmn-muted`      | `#5b6472`  | Types, row numbers, `-`  |
| `--dmn-border`     | `#c7cbd1`  | Cell borders             |
| `--dmn-head`       | `#f3f4f6`  | Header cells             |
| `--dmn-background` | `#ffffff`  | Cells                    |

## Reading the model

```ts
import { parseDmn } from '@dskripchenko/bpmn'

const model = parseDmn(xml)
model.version // '1.3'
model.decisions // [{ id, name, variable, question, logic: { kind: 'table', hitPolicy, inputs, outputs, rules, … } }]
model.requirements // [{ id, kind: 'information', source, target }]
model.diagrams // [{ shapes, edges }]
```

Like BPMN models, every element keeps its XML node, extensions included.

Everything text from the file is escaped in both the SVG and the HTML.
