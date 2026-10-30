# Editor

Das Paket hat zwei Bearbeitungsschichten: `BpmnDocument`, einen Kern ohne
Framework mit allen Operationen und Rückgängig, und `BpmnEditor`, eine
Vue-Komponente darauf. Beide bearbeiten das XML an Ort und Stelle: Was sie
nicht kennen — Ausführungsattribute, Herstellererweiterungen, weitere
Diagramme der Datei — wird unverändert zurückgeschrieben.

## Der Vue-Editor

```sh
npm install @dskripchenko/bpmn vue @dskripchenko/ui
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { BpmnEditor } from '@dskripchenko/bpmn/vue'
import '@dskripchenko/bpmn/style.css'

const xml = ref<string | null>(null) // null: ein neues Diagramm mit einem Startereignis
</script>

<template>
  <BpmnEditor v-model="xml" style="height: 600px" />
</template>
```

Was man tun kann:

- **Erstellen** — ein Symbol in der Palette links wählen und auf die
  Zeichenfläche klicken. Ein Zwischenereignis auf dem Rand einer Aktivität
  wird zum angehefteten Ereignis. In einer Kollaboration landen Flussknoten
  im Pool und in der Lane unter dem Zeiger.
- **Anhängen** — das Kontextmenü neben einem gewählten Element hängt eine
  Aufgabe, ein Gateway, ein Zwischen- oder Endereignis an, schon verbunden;
  verbindet mit einem anderen Element; fügt eine Anmerkung hinzu; ändert den
  Typ; färbt; löscht. Auf einem Pool oder einer Lane fügt es eine Lane hinzu.
- **Auswählen und verschieben** — Klick, Umschalt+Klick oder ein Rechteck
  auf leerer Fläche ziehen. Ziehen verschiebt die Auswahl: Der Inhalt eines
  Pools oder aufgeklappten Teilprozesses wandert mit, angeheftete Ereignisse
  mit ihrer Aktivität, Flüsse werden neu geführt. Eine Aufgabe, die in einer
  anderen Lane, einem Teilprozess oder Pool landet, zieht auch in der Datei
  dorthin um.
- **Größe ändern** — die Eckgriffe von Aktivitäten, Teilprozessen, Pools,
  Lanes, Gruppen und Anmerkungen.
- **Benennen** — Doppelklick (oder F2) und tippen; Enter speichert,
  Umschalt+Enter bricht die Zeile um, Escape bricht ab.
- **Eigenschaften** — das Panel rechts: id, Name, Typ, Ereignisdefinition,
  unterbrechend oder nicht, Schleife, Bedingung und Standardfluss,
  Dokumentation.
- **Tastatur** — Entf, Strg+Z / Strg+Umschalt+Z (Strg+Y), Strg+A, Pfeile
  zum Verschieben (mit Umschalt um 10 px), Escape.
- **Zeichenfläche** — Scrollen verschiebt, Strg+Scrollen zoomt,
  Leertaste+Ziehen oder die mittlere Taste verschieben; Zoom und „Alles
  zeigen“ unten rechts.
- **Herunterladen** — die `.bpmn`-Datei oder ein Bild als `.svg`.

### Props und Ereignisse

| Prop         | Typ                  | Standard | Bedeutung                                        |
| ------------ | -------------------- | -------- | ------------------------------------------------ |
| `modelValue` | `string \| null`     | `null`   | Das XML der Datei (`v-model`); leer für ein neues Diagramm |
| `readonly`   | `boolean`            | `false`  | Ein Betrachter: verschieben, zoomen, Klicks      |
| `properties` | `boolean`            | `false`  | Das Eigenschaften-Panel von Anfang an zeigen     |
| `diagram`    | `string \| number`   | erstes   | Welches Diagramm der Datei                       |
| `highlight`  | `string[]`           | `[]`     | Hervorzuhebende Elemente                         |
| `locale`     | `string`             | Seite    | `ru…` für Russisch, sonst Englisch               |
| `labels`     | `Partial<BpmnLabels>`| —        | Ersetzte Oberflächentexte                        |

| Ereignis            | Inhalt     | Wann                                                      |
| ------------------- | ---------- | --------------------------------------------------------- |
| `update:modelValue` | `string`   | Nach jeder Änderung, jedem Rückgängig und Wiederholen     |
| `change`            | `string`   | Ebenso                                                    |
| `select`            | `string[]` | Die Auswahl hat sich geändert                             |
| `elementClick`      | `string`   | Ein Element wurde angeklickt                              |
| `error`             | `Error`    | Eine von der Notation nicht erlaubte Operation oder eine unlesbare Datei |

Die Komponente stellt `document` (das `BpmnDocument`), `fit()`, `undo()`,
`redo()`, `toSvg()` und `selection` bereit.

`BpmnView` ist die schreibgeschützte Variante: `<BpmnView :xml="xml" :highlight="['Task_1']" @element-click="…" />`.

Der Editor folgt dem `@dskripchenko/ui`-Thema der Seite, hell oder dunkel;
die Variablen der Zeichnung selbst (siehe [Gestaltung](theming.md)) lassen
sich ebenfalls setzen.

## Der Bearbeitungskern

`BpmnDocument` läuft überall — in Node, in einem Worker, hinter einer anderen
Oberfläche:

```ts
import { BpmnDocument } from '@dskripchenko/bpmn'

const doc = new BpmnDocument() // oder new BpmnDocument(xml)
const task = doc.createShape('userTask', { x: 300, y: 120 }, { name: 'Auftrag prüfen' })
doc.connect('StartEvent_1', task)
doc.undo()
doc.redo()
save(doc.xml)
```

Jede Operation ist ein Schritt der Historie und wird entweder ganz
ausgeführt oder lässt die Datei, wie sie war; eine verbotene wirft
`BpmnError`.

| Operation                                   | Wirkung                                                               |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `createShape(type, centre, options?)`       | Fügt eine Form hinzu; `options`: `name`, `eventDefinition`, `attachTo` (angeheftetes Ereignis), `expanded`, `size`. Ein Pool auf einem Prozessdiagramm umschließt den Prozess |
| `addLane(pool, name?)`                      | Fügt eine Lane hinzu; der erste Aufruf teilt den Pool in zwei         |
| `connect(source, target)`                   | Fügt den Fluss hinzu, den die Notation erlaubt: Sequenz, Nachricht, Assoziation, Datenassoziation |
| `canConnect(source, target)`                | Den Typ dieses Flusses oder `null`                                    |
| `move(ids, dx, dy)`                         | Verschiebt Formen samt Inhalt; Flüsse folgen; Container wechseln beim Ablegen anderswo |
| `resize(id, bounds)`                        | Ändert die Größe; ein Pool und seine Lanes folgen einander            |
| `remove(ids)`                               | Entfernt samt Inhalt, angehefteten Ereignissen, Flüssen und Verweisen |
| `rename(id, text)`                          | Name, Anmerkungstext oder Gruppenkategorie                            |
| `setType(id, type)`                         | Innerhalb einer Familie: Aufgabe → Benutzeraufgabe, Gateway → parallel, Start → Ende |
| `setEventDefinition(id, kind?)`             | `message`, `timer`, `error`, … oder keine                             |
| `setLoop(id, loop)`                         | `none`, `standard`, `parallel`, `sequential`                          |
| `setCondition(flow, text)`                  | Die Bedingung eines Sequenzflusses                                    |
| `setDefaultFlow(flow, isDefault?)`          | Der Standardfluss eines Gateways oder einer Aktivität                 |
| `setDocumentation(id, text)`                | Dokumentation                                                         |
| `setAttribute(id, name, value?)`            | Jedes einfache Attribut (`isExecutable`, `cancelActivity`, …)         |
| `setId(id, next)`                           | Benennt eine id samt aller Verweise um                                |
| `setColors(ids, { fill?, stroke? })`        | Farben, wie bpmn.io und die OMG-Erweiterung sie speichern             |
| `setWaypoints(flow, points)`                | Die Knicke eines Flusses                                              |
| `setLabelBounds(id, bounds)`                | Wo eine äußere Beschriftung steht                                     |

Lesen: `model`, `diagram`, `xml`, `element(id)`, `shape(id)`, `ends(flow)`,
`processOf(id)`, `containerAt(point)`, `canUndo`, `canRedo`,
`onChange(listener)`, `load(xml)`. Neue ids folgen dem Muster der Modeler
(`Activity_0b1x2yz`, `Flow_…`).

Für eine eigene Oberfläche beantworten `hitTest`, `elementsIn`, `borderOf`
und die Ansichtsfunktionen (`zoomAt`, `fitView`, `toWorld`) die
geometrischen Fragen eines Editors.
