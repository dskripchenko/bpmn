# Оформление

Каждый цвет — CSS-переменная со светлым значением по умолчанию. Задайте их
у любого предка SVG:

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

| Переменная                 | По умолчанию  | Для чего                                |
| -------------------------- | ------------- | --------------------------------------- |
| `--bpmn-font-family`       | Arial, …      | Весь текст                              |
| `--bpmn-background`        | `transparent` | Фон рисунка                             |
| `--bpmn-stroke`            | `#22242a`     | Контуры, потоки, маркеры                |
| `--bpmn-fill`              | `#ffffff`     | Заливка фигур                           |
| `--bpmn-text`              | `#22242a`     | Названия                                |
| `--bpmn-pool-fill`         | `#ffffff`     | Пулы                                    |
| `--bpmn-lane-fill`         | `transparent` | Дорожки                                 |
| `--bpmn-group-stroke`      | `#22242a`     | Группы                                  |
| `--bpmn-annotation-stroke` | `#22242a`     | Текстовые аннотации                     |
| `--bpmn-label-halo`        | `#ffffff`     | Обводка под названиями потоков          |

Список также экспортируется как `THEME_VARIABLES`.

## Цвета из файла

Моделеры хранят цвета элементов — bpmn.io как `bioc:fill`/`bioc:stroke`,
другие как `color:background-color`/`color:border-color`, — и они
отрисовываются. Они задают те же переменные только для своего элемента,
поэтому остальная тема продолжает действовать. Цвет используется, только если
это hex-значение, имя цвета или `rgb()`/`hsl()` из чисел.

## Подсветка элемента

Каждый элемент несёт свой id, поэтому страница может его оформить:

```css
[data-element-id='Task_Check'] { --bpmn-stroke: #dc2626; --bpmn-fill: #fee2e2; }
```
