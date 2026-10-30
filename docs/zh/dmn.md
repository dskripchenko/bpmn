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
