# DMN

Пакет читает файлы DMN — диаграммы требований к решениям, таблицы решений и
литеральные выражения — всех опубликованных версий: 1.1 (с раскладкой
`biodi`, которую писали старые инструменты Camunda), 1.2, 1.3, 1.4 и 1.5.

## Диаграмма

```ts
import { renderDmn } from '@dskripchenko/bpmn'

const { svg, width, height, generated } = renderDmn(xml)
```

Решения, входные данные, модели бизнес-знаний, источники знаний, сервисы
решений и текстовые аннотации рисуются так, как их расположил файл;
информационные требования — сплошными стрелками, требования к знаниям —
пунктиром с открытой стрелкой, требования полномочий — пунктиром с точкой
на конце, ассоциации — точками. У решения с таблицей в углу маленькая
таблица, у решения с литеральным выражением — `fx`.

Файл без раскладки — таблица, выгруженная движком, файл, написанный руками, —
получает её: требуемые элементы снизу, решения, которым они нужны, выше, слой
за слоем; тогда `generated` равно `true`.

Параметры те же, что у `render`: `diagram`, `measureText`, `idPrefix`,
`title`, `padding`, `limits`, `nested`.

## Таблицы решений и литеральные выражения

```ts
import { renderDecision } from '@dskripchenko/bpmn'

const { html, kind } = renderDecision(xml, 'Decision_Risk')
container.innerHTML = html
```

`renderDecision(source, decisionId?)` возвращает HTML: таблицу решений с
политикой срабатывания (`U`, `F`, `P`, `A`, `C`, `C+`, `C<`, `C>`, `C#`, `R`,
`O`), входными и выходными столбцами с выражениями и типами, правилами и
столбцами аннотаций (или описаниями правил); литеральное выражение — его
текстом. Без id показывается первое решение с логикой. `kind` — `table`,
`literal`, `other` (другое выражение) или `none`.

Разметка несёт свою таблицу стилей, ограниченную корнем; цвета — CSS-переменные:

| Переменная         | По умолчанию | Для чего                   |
| ------------------ | ------------ | -------------------------- |
| `--dmn-font-family`| Arial, …     | Текст                      |
| `--dmn-text`       | `#22242a`    | Текст                      |
| `--dmn-muted`      | `#5b6472`    | Типы, номера строк, `-`    |
| `--dmn-border`     | `#c7cbd1`    | Границы ячеек              |
| `--dmn-head`       | `#f3f4f6`    | Ячейки заголовка           |
| `--dmn-background` | `#ffffff`    | Ячейки                     |

## Чтение модели

```ts
import { parseDmn } from '@dskripchenko/bpmn'

const model = parseDmn(xml)
model.version // '1.3'
model.decisions // [{ id, name, variable, question, logic: { kind: 'table', hitPolicy, inputs, outputs, rules, … } }]
model.requirements // [{ id, kind: 'information', source, target }]
model.diagrams // [{ shapes, edges }]
```

Как и в BPMN, каждый элемент хранит свой XML-узел вместе с расширениями.

Весь текст из файла экранируется и в SVG, и в HTML.

## Редактирование

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DmnEditor } from '@dskripchenko/bpmn/vue'
import '@dskripchenko/bpmn/style.css'

const xml = ref<string | null>(null) // null — новый файл с одним решением
</script>

<template>
  <DmnEditor v-model="xml" style="height: 600px" />
</template>
```

`DmnEditor` правит диаграмму — палитра ставит решения, входные данные,
модели бизнес-знаний, источники знаний и аннотации; контекстная панель
соединяет их (вид требования следует из того, что соединяется), открывает
логику решения, красит и удаляет; фигуры двигаются и меняют размер; двойной
щелчок правит название — и, в один щелчок, логику решения: политику
срабатывания, столбцы (подпись, выражение или имя, тип), правила и их ячейки
либо литеральное выражение и тип результата. Ячейка записывается, когда
теряет фокус. Отмена, клавиатура и холст — как в редакторе BPMN.

Свойства: `modelValue`, `readonly`, `decision` (открыть логику решения),
`highlight`, `locale`, `labels`. События: `update:modelValue`, `change`,
`select`, `elementClick`, `open` (показанное решение или `null`), `error`.
`DmnView` — вариант только для просмотра.

Раскладка остаётся там, где её хранит файл, — в DMNDI или, для DMN 1.1, в
`biodi`; файл без раскладки получает вычисленную при первом изменении.

Ядро, `DmnDocument`, работает без Vue:

```ts
import { DmnDocument } from '@dskripchenko/bpmn'

const doc = new DmnDocument(xml)
const income = doc.createElement('inputData', { x: 200, y: 300 }, { name: 'Доход' })
doc.connect(income, 'Decision_1')
doc.addRule('Decision_1')
doc.setCell('Decision_1', 0, { kind: 'input', index: 0 }, '> 1000')
doc.setHitPolicy('Decision_1', 'COLLECT', 'SUM')
save(doc.xml)
```

Диаграмма: `createElement`, `connect`, `canConnect`, `move`, `resize`,
`remove`, `rename`, `setId`, `setColors`. Логика: `setLogic` (`table`,
`literal`, `none`), `setLiteral`, `setResultType`, `setHitPolicy`, `addRule`,
`removeRule`, `moveRule`, `setCell`, `addInput`, `addOutput`, `updateInput`,
`updateOutput`, `removeColumn`. А также `undo`, `redo`, `onChange`, `xml`,
`model`, `diagram`.
