# Erste Schritte

```sh
npm install @dskripchenko/bpmn
```

## Eine Datei zeichnen

```ts
import { render } from '@dskripchenko/bpmn'

const { svg, width, height, warnings } = render(xml)
container.innerHTML = svg
```

`render` nimmt den Text einer `.bpmn`-Datei und gibt zurück:

| Feld       | Bedeutung                                                                  |
| ---------- | -------------------------------------------------------------------------- |
| `svg`      | Die Zeichnung, ein vollständiges `<svg>`-Element als Text                  |
| `width`    | Breite in Pixeln                                                           |
| `height`   | Höhe in Pixeln                                                             |
| `diagram`  | Die id des gezeichneten Diagramms                                          |
| `warnings` | Was übersprungen wurde: Formen fehlender Elemente, Flüsse ohne Punkte      |

Die Zeichnung folgt dem in der Datei gespeicherten Layout (Abschnitt
`BPMNDiagram`) — jeder Modeler speichert eines. Nichts wird verschoben. Eine
Datei ohne Layout wird mit einer Erklärung abgelehnt.

## Optionen

```ts
render(xml, {
  diagram: 'Diagram_2', // oder ein Index; standardmäßig das erste Diagramm
  title: 'Auftragsbearbeitung', // barrierefreier Titel; standardmäßig der Diagrammname
  idPrefix: 'order', // ids im SVG; eindeutig, wenn eine Datei zweimal auf der Seite steht
  padding: 10, // Rand um die Zeichnung
  measureText, // wie Text gemessen wird; im Browser standardmäßig per Canvas
  limits: { maxLength: 1_000_000 }, // strengere Grenzen für fremde Dateien
})
```

## Fehler

Eine nicht lesbare Datei wirft einen `BpmnError` mit Zeile und Spalte des
Fehlers und, falls vorhanden, einem Hinweis:

```ts
import { BpmnError, render } from '@dskripchenko/bpmn'

try {
  render(xml)
} catch (e) {
  if (e instanceof BpmnError) console.log(e.message, e.line, e.column, e.hint)
}
```

## Das Modell lesen

`parse` liefert Semantik und Layout, ohne zu zeichnen:

```ts
import { parse } from '@dskripchenko/bpmn'

const model = parse(xml)
model.elements.get('Task_Check') // { id, type: 'userTask', name, parent, eventDefinitions, loop, xml }
model.diagrams[0].shapes // [{ element, bounds, label, isExpanded, colors }, …]
```

Jedes Element behält seinen XML-Knoten (`xml`) mit allen Attributen und
Kindern jedes Namensraums — Herstellererweiterungen eingeschlossen.
`writeXml(model.document)` schreibt die Datei zurück.

Statt des Textes kann `render` ein Modell erhalten, um mehrere Diagramme
einer Datei zu zeichnen, ohne sie erneut zu lesen.

## Im Browser und auf dem Server

`render` braucht kein DOM. Auf dem Server wird Text mit einer Tabelle von
Zeichenbreiten gemessen, im Browser mit einem Canvas, sodass Beschriftungen
passend zu den Schriften des Lesers umbrechen. Für überall gleiche Ausgabe
`approximateMeasurer` übergeben:

```ts
import { approximateMeasurer, render } from '@dskripchenko/bpmn'
render(xml, { measureText: approximateMeasurer })
```

## Was gezeichnet wird

Ereignisse jeder Art und Definition, Aufgaben jedes Typs, Aufrufaktivitäten,
Teilprozesse (zugeklappt, aufgeklappt, Ereignis-, Transaktions- und
Ad-hoc-Teilprozesse), Schleifen-, Mehrfachinstanz- und
Kompensationsmarker, Gateways, Datenobjekte und Datenspeicher,
Textanmerkungen, Gruppen, Pools und Lanes, alle Arten von Flüssen sowie
Konversationen. Choreografien werden als einfache Kästen mit Namen gezeichnet.

Jedes Element ist ein `<g class="bpmn-element bpmn-type-userTask" data-element-id="Task_Check">`,
damit eine Seite es finden, hervorheben oder mit einem Handler versehen kann.

## Bearbeiten

Zum Ändern von Diagrammen siehe den [Editor](editor.md): eine Vue-Komponente und einen Bearbeitungskern ohne Framework.
