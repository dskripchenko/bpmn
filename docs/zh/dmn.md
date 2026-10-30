# DMN

本包可读取所有已发布版本的 DMN 文件——决策需求图、决策表和字面表达式：1.1（含旧版 Camunda 工具写入的 `biodi` 布局）、1.2、1.3、1.4 和 1.5。

## 图

```ts
import { renderDmn } from '@dskripchenko/bpmn'

const { svg, width, height, generated } = renderDmn(xml)
```

决策、输入数据、业务知识模型、知识源、决策服务和文本注释按文件中的布局绘制；信息需求为实线箭头，知识需求为带空心箭头的虚线，权限需求为末端带圆点的虚线，关联为点线。逻辑为决策表的决策显示一个小表格图标，字面表达式显示 `fx`。

没有布局的文件（由引擎导出的决策表、手写的文件）会自动获得布局：被依赖的元素在下，依赖它们的决策在上，逐层排列；此时 `generated` 为 `true`。

选项与 `render` 相同：`diagram`、`measureText`、`idPrefix`、`title`、`padding`、`limits`、`nested`。

## 决策表与字面表达式

```ts
import { renderDecision } from '@dskripchenko/bpmn'

const { html, kind } = renderDecision(xml, 'Decision_Risk')
container.innerHTML = html
```

`renderDecision(source, decisionId?)` 返回 HTML：决策表包括命中策略（`U`、`F`、`P`、`A`、`C`、`C+`、`C<`、`C>`、`C#`、`R`、`O`）、带表达式与类型的输入列和输出列、规则以及注释列（或规则描述）；字面表达式显示为其文本。未提供 id 时显示第一个带逻辑的决策。`kind` 为 `table`、`literal`、`other`（其他盒式表达式）或 `none`。

生成的标记自带限定于其根元素的样式表；颜色为 CSS 自定义属性：

| 变量               | 默认值     | 用途                 |
| ------------------ | ---------- | -------------------- |
| `--dmn-font-family`| Arial, …   | 文本                 |
| `--dmn-text`       | `#22242a`  | 文本                 |
| `--dmn-muted`      | `#5b6472`  | 类型、行号、`-`      |
| `--dmn-border`     | `#c7cbd1`  | 单元格边框           |
| `--dmn-head`       | `#f3f4f6`  | 表头单元格           |
| `--dmn-background` | `#ffffff`  | 单元格               |

## 读取模型

```ts
import { parseDmn } from '@dskripchenko/bpmn'

const model = parseDmn(xml)
model.version // '1.3'
model.decisions // [{ id, name, variable, question, logic: { kind: 'table', hitPolicy, inputs, outputs, rules, … } }]
model.requirements // [{ id, kind: 'information', source, target }]
model.diagrams // [{ shapes, edges }]
```

与 BPMN 一样，每个元素都保留其 XML 节点及扩展。

文件中的所有文本在 SVG 和 HTML 中都会被转义。

## 编辑

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DmnEditor } from '@dskripchenko/bpmn/vue'
import '@dskripchenko/bpmn/style.css'

const xml = ref<string | null>(null) // null：只有一个决策的新文件
</script>

<template>
  <DmnEditor v-model="xml" style="height: 600px" />
</template>
```

`DmnEditor` 可编辑图：调色板放置决策、输入数据、业务知识模型、知识源和注释；上下文面板用于连接它们（需求类型由所连接的元素决定）、打开决策的逻辑、着色和删除；形状可移动和调整大小；双击编辑名称。只需一次点击即可编辑决策的逻辑：命中策略、列（标签、表达式或名称、类型）、规则及其单元格，或字面表达式及其结果类型。单元格在失去焦点时写入。撤销、键盘和画布操作与 BPMN 编辑器相同。

属性：`modelValue`、`readonly`、`decision`（打开某个决策的逻辑）、`highlight`、`locale`、`labels`。事件：`update:modelValue`、`change`、`select`、`elementClick`、`open`（当前显示的决策或 `null`）、`error`。`DmnView` 是只读版本。

布局保存在文件原有的位置——DMNDI，或 DMN 1.1 中的 `biodi`；没有布局的文件会在第一次修改时写入计算出的布局。

核心 `DmnDocument` 无需 Vue 即可使用：

```ts
import { DmnDocument } from '@dskripchenko/bpmn'

const doc = new DmnDocument(xml)
const income = doc.createElement('inputData', { x: 200, y: 300 }, { name: '收入' })
doc.connect(income, 'Decision_1')
doc.addRule('Decision_1')
doc.setCell('Decision_1', 0, { kind: 'input', index: 0 }, '> 1000')
doc.setHitPolicy('Decision_1', 'COLLECT', 'SUM')
save(doc.xml)
```

图：`createElement`、`connect`、`canConnect`、`move`、`resize`、`remove`、`rename`、`setId`、`setColors`。逻辑：`setLogic`（`table`、`literal`、`none`）、`setLiteral`、`setResultType`、`setHitPolicy`、`addRule`、`removeRule`、`moveRule`、`setCell`、`addInput`、`addOutput`、`updateInput`、`updateOutput`、`removeColumn`。另有 `undo`、`redo`、`onChange`、`xml`、`model`、`diagram`。
