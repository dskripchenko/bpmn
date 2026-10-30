# DMN

Das Paket liest DMN-Dateien — Entscheidungsanforderungsdiagramme,
Entscheidungstabellen und literale Ausdrücke — aller veröffentlichten
Versionen: 1.1 (mit dem `biodi`-Layout älterer Camunda-Werkzeuge), 1.2, 1.3,
1.4 und 1.5.

## Das Diagramm

```ts
import { renderDmn } from '@dskripchenko/bpmn'

const { svg, width, height, generated } = renderDmn(xml)
```

Entscheidungen, Eingabedaten, Geschäftswissensmodelle, Wissensquellen,
Entscheidungsdienste und Textanmerkungen werden so gezeichnet, wie die Datei
sie anordnet; Informationsanforderungen als durchgezogene Pfeile,
Wissensanforderungen gestrichelt mit offener Spitze, Autoritätsanforderungen
gestrichelt mit einem Punkt am Ende, Assoziationen gepunktet. Eine
Entscheidung zeigt eine kleine Tabelle, wenn ihre Logik eine
Entscheidungstabelle ist, und `fx` bei einem literalen Ausdruck.

Eine Datei ohne Layout — eine von einer Engine exportierte Tabelle, eine von
Hand geschriebene Datei — erhält eines: benötigte Elemente unten, die
Entscheidungen, die sie brauchen, darüber, Schicht für Schicht; `generated`
ist dann `true`.

Die Optionen sind die von `render`: `diagram`, `measureText`, `idPrefix`,
`title`, `padding`, `limits`, `nested`.

## Entscheidungstabellen und literale Ausdrücke

```ts
import { renderDecision } from '@dskripchenko/bpmn'

const { html, kind } = renderDecision(xml, 'Decision_Risk')
container.innerHTML = html
```

`renderDecision(source, decisionId?)` liefert HTML: eine
Entscheidungstabelle mit ihrer Trefferrichtlinie (`U`, `F`, `P`, `A`, `C`,
`C+`, `C<`, `C>`, `C#`, `R`, `O`), Ein- und Ausgabespalten mit Ausdrücken und
Typen, den Regeln und Anmerkungsspalten (oder Regelbeschreibungen); einen
literalen Ausdruck als Text. Ohne id wird die erste Entscheidung mit Logik
gezeigt. `kind` ist `table`, `literal`, `other` (ein anderer Ausdruck) oder
`none`.

Das Markup bringt ein eigenes, auf seine Wurzel beschränktes Stylesheet mit;
die Farben sind CSS-Variablen:

| Variable           | Standard   | Wofür                    |
| ------------------ | ---------- | ------------------------ |
| `--dmn-font-family`| Arial, …   | Text                     |
| `--dmn-text`       | `#22242a`  | Text                     |
| `--dmn-muted`      | `#5b6472`  | Typen, Zeilennummern, `-`|
| `--dmn-border`     | `#c7cbd1`  | Zellränder               |
| `--dmn-head`       | `#f3f4f6`  | Kopfzellen               |
| `--dmn-background` | `#ffffff`  | Zellen                   |

## Das Modell lesen

```ts
import { parseDmn } from '@dskripchenko/bpmn'

const model = parseDmn(xml)
model.version // '1.3'
model.decisions // [{ id, name, variable, question, logic: { kind: 'table', hitPolicy, inputs, outputs, rules, … } }]
model.requirements // [{ id, kind: 'information', source, target }]
model.diagrams // [{ shapes, edges }]
```

Wie bei BPMN behält jedes Element seinen XML-Knoten samt Erweiterungen.

Jeder Text aus der Datei wird im SVG und im HTML maskiert.
