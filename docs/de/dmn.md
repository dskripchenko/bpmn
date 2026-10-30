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

## Bearbeiten

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DmnEditor } from '@dskripchenko/bpmn/vue'
import '@dskripchenko/bpmn/style.css'

const xml = ref<string | null>(null) // null: eine neue Datei mit einer Entscheidung
</script>

<template>
  <DmnEditor v-model="xml" style="height: 600px" />
</template>
```

`DmnEditor` bearbeitet das Diagramm — die Palette setzt Entscheidungen,
Eingabedaten, Geschäftswissensmodelle, Wissensquellen und Anmerkungen; das
Kontextmenü verbindet sie (die Art der Anforderung ergibt sich aus dem
Verbundenen), öffnet die Logik einer Entscheidung, färbt und löscht; Formen
lassen sich verschieben und in der Größe ändern; ein Doppelklick bearbeitet
den Namen — und, einen Klick entfernt, die Logik einer Entscheidung: die
Trefferrichtlinie, die Spalten (Beschriftung, Ausdruck oder Name, Typ), die
Regeln und ihre Zellen oder einen literalen Ausdruck mit Ergebnistyp. Zellen
werden geschrieben, wenn sie den Fokus verlieren. Rückgängig, Tastatur und
Zeichenfläche funktionieren wie im BPMN-Editor.

Props: `modelValue`, `readonly`, `decision` (die Logik einer Entscheidung
öffnen), `highlight`, `locale`, `labels`. Ereignisse: `update:modelValue`,
`change`, `select`, `elementClick`, `open` (die gezeigte Entscheidung oder
`null`), `error`. `DmnView` ist die schreibgeschützte Variante.

Das Layout bleibt, wo die Datei es führt — DMNDI oder `biodi` in DMN 1.1;
eine Datei ohne Layout erhält das berechnete bei ihrer ersten Änderung.

Der Kern, `DmnDocument`, arbeitet ohne Vue:

```ts
import { DmnDocument } from '@dskripchenko/bpmn'

const doc = new DmnDocument(xml)
const income = doc.createElement('inputData', { x: 200, y: 300 }, { name: 'Einkommen' })
doc.connect(income, 'Decision_1')
doc.addRule('Decision_1')
doc.setCell('Decision_1', 0, { kind: 'input', index: 0 }, '> 1000')
doc.setHitPolicy('Decision_1', 'COLLECT', 'SUM')
save(doc.xml)
```

Diagramm: `createElement`, `connect`, `canConnect`, `move`, `resize`,
`remove`, `rename`, `setId`, `setColors`. Logik: `setLogic` (`table`,
`literal`, `none`), `setLiteral`, `setResultType`, `setHitPolicy`, `addRule`,
`removeRule`, `moveRule`, `setCell`, `addInput`, `addOutput`, `updateInput`,
`updateOutput`, `removeColumn`. Dazu `undo`, `redo`, `onChange`, `xml`,
`model`, `diagram`.
