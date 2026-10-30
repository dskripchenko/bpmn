# Theming

Every colour is a CSS custom property with a light default. Set them on any
ancestor of the SVG:

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

| Variable                   | Default       | Used for                                      |
| -------------------------- | ------------- | --------------------------------------------- |
| `--bpmn-font-family`       | Arial, …      | All text                                      |
| `--bpmn-background`        | `transparent` | Behind the drawing                            |
| `--bpmn-stroke`            | `#22242a`     | Outlines, flows, markers                      |
| `--bpmn-fill`              | `#ffffff`     | The inside of shapes                          |
| `--bpmn-text`              | `#22242a`     | Names                                         |
| `--bpmn-pool-fill`         | `#ffffff`     | Pools                                         |
| `--bpmn-lane-fill`         | `transparent` | Lanes                                         |
| `--bpmn-group-stroke`      | `#22242a`     | Groups                                        |
| `--bpmn-annotation-stroke` | `#22242a`     | Text annotations                              |
| `--bpmn-label-halo`        | `#ffffff`     | The outline behind flow names                 |

The list is also exported as `THEME_VARIABLES`.

## Colours from the file

Modelers store colours per element — bpmn.io as `bioc:fill`/`bioc:stroke`,
others as `color:background-color`/`color:border-color` — and they are drawn.
They set the same variables on that element only, so the rest of the theme
still applies. A colour is used only when it is a hex value, a colour name or
an `rgb()`/`hsl()` of numbers.

## Highlighting an element

Each element carries its id, so a page can style it:

```css
[data-element-id='Task_Check'] { --bpmn-stroke: #dc2626; --bpmn-fill: #fee2e2; }
```
