# 快速开始

```sh
npm install @dskripchenko/bpmn
```

## 绘制文件

```ts
import { render } from '@dskripchenko/bpmn'

const { svg, width, height, warnings } = render(xml)
container.innerHTML = svg
```

`render` 接收 `.bpmn` 文件的文本，返回：

| 字段       | 含义                                                   |
| ---------- | ------------------------------------------------------ |
| `svg`      | 绘图，一个完整的 `<svg>` 元素文本                      |
| `width`    | 宽度（像素）                                           |
| `height`   | 高度（像素）                                           |
| `diagram`  | 所绘制图的 id                                          |
| `warnings` | 被跳过的内容：文件中不存在的元素的形状、缺少坐标点的流 |

绘图遵循文件中保存的布局（`BPMNDiagram` 部分）——每个建模工具都会保存它。不会移动任何元素。没有布局的文件会被拒绝并给出说明。

## 选项

```ts
render(xml, {
  diagram: 'Diagram_2', // 或索引；默认第一个图
  title: '订单处理', // 无障碍标题；默认使用图的名称
  idPrefix: 'order', // SVG 内的 id；同一文件在页面上显示两次时须唯一
  padding: 10, // 绘图周围的留白
  measureText, // 文本测量方式；浏览器中默认使用 canvas
  limits: { maxLength: 1_000_000 }, // 对不可信文件使用更严格的限制
})
```

## 错误

无法读取的文件会抛出 `BpmnError`，包含出错的行号、列号以及可能的提示：

```ts
import { BpmnError, render } from '@dskripchenko/bpmn'

try {
  render(xml)
} catch (e) {
  if (e instanceof BpmnError) console.log(e.message, e.line, e.column, e.hint)
}
```

## 读取模型

`parse` 返回语义和布局，而不进行绘制：

```ts
import { parse } from '@dskripchenko/bpmn'

const model = parse(xml)
model.elements.get('Task_Check') // { id, type: 'userTask', name, parent, eventDefinitions, loop, xml }
model.diagrams[0].shapes // [{ element, bounds, label, isExpanded, colors }, …]
```

每个元素都保留其 XML 节点（`xml`），包括任何命名空间的全部属性和子元素——厂商扩展也不例外。`writeXml(model.document)` 可将文件写回。

`render` 也可以接收模型而非文本，以便在不重新读取文件的情况下绘制同一文件中的多个图。

## 浏览器与服务器

`render` 不需要 DOM。在服务器上用字形宽度表测量文本，在浏览器中用 canvas 测量，因此标签会按读者的字体换行。若要在各处得到相同输出，请传入 `approximateMeasurer`：

```ts
import { approximateMeasurer, render } from '@dskripchenko/bpmn'
render(xml, { measureText: approximateMeasurer })
```

## 绘制内容

各类事件及其所有定义、各类任务、调用活动、子流程（折叠、展开、事件子流程、事务、自由子流程）、循环/多实例/补偿标记、网关、数据对象与数据存储、文本注释、组、池与泳道、所有类型的流以及会话。编排（choreography）以带名称的普通方框绘制。

每个元素都是 `<g class="bpmn-element bpmn-type-userTask" data-element-id="Task_Check">`，页面可以查找、高亮它或绑定事件处理程序。

## 编辑

如需修改图，请参阅[编辑器](editor.md)：一个 Vue 组件和一个不依赖框架的编辑核心。
