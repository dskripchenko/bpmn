# Gestaltung

Jede Farbe ist eine CSS-Variable mit einem hellen Standardwert. Setzen Sie
sie an einem beliebigen Vorfahren des SVG:

```css
.dark {
  --bpmn-stroke: #d1d5db;
  --bpmn-fill: #1f2937;
  --bpmn-text: #e5e7eb;
  --bpmn-pool-fill: #111827;
  --bpmn-group-stroke: #9ca3af;
  --bpmn-annotation-stroke: #9ca3af;
  --bpmn-label-halo: #111827;
}
```

| Variable                   | Standard      | Wofür                                   |
| -------------------------- | ------------- | --------------------------------------- |
| `--bpmn-font-family`       | Arial, …      | Aller Text                              |
| `--bpmn-background`        | `transparent` | Hintergrund der Zeichnung               |
| `--bpmn-stroke`            | `#22242a`     | Umrisse, Flüsse, Marker                 |
| `--bpmn-fill`              | `#ffffff`     | Füllung der Formen                      |
| `--bpmn-text`              | `#22242a`     | Namen                                   |
| `--bpmn-pool-fill`         | `#ffffff`     | Pools                                   |
| `--bpmn-lane-fill`         | `transparent` | Lanes                                   |
| `--bpmn-group-stroke`      | `#22242a`     | Gruppen                                 |
| `--bpmn-annotation-stroke` | `#22242a`     | Textanmerkungen                         |
| `--bpmn-label-halo`        | `#ffffff`     | Kontur hinter Flussnamen                |

Die Liste wird auch als `THEME_VARIABLES` exportiert.

## Farben aus der Datei

Modeler speichern Farben je Element — bpmn.io als `bioc:fill`/`bioc:stroke`,
andere als `color:background-color`/`color:border-color` — und sie werden
gezeichnet. Sie setzen dieselben Variablen nur für ihr Element, der Rest des
Themas gilt weiter. Eine Farbe wird nur verwendet, wenn sie ein Hex-Wert, ein
Farbname oder ein `rgb()`/`hsl()` aus Zahlen ist.

## Ein Element hervorheben

Jedes Element trägt seine id, sodass eine Seite es gestalten kann:

```css
[data-element-id='Task_Check'] { --bpmn-stroke: #dc2626; --bpmn-fill: #fee2e2; }
```
