# 编辑器

本包有两层编辑能力：`BpmnDocument`——不依赖框架、包含全部操作与撤销的核心；`BpmnEditor`——基于它的 Vue 组件。两者都在原处修改 XML：它们不认识的内容（执行属性、厂商扩展、文件中的其他图）会原样写回。

## Vue 编辑器

```sh
npm install @dskripchenko/bpmn vue @dskripchenko/ui
```

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { BpmnEditor } from '@dskripchenko/bpmn/vue'
import '@dskripchenko/bpmn/style.css'

const xml = ref<string | null>(null) // null：只有一个开始事件的新图
</script>

<template>
  <BpmnEditor v-model="xml" style="height: 600px" />
</template>
```

可以进行的操作：

- **创建**——在左侧调色板中选择符号，然后点击画布。放到活动边框上的中间事件会成为边界事件。在协作图中，流程节点会进入指针下方的池和泳道。
- **追加**——选中元素旁的上下文面板可以追加已连好线的任务、网关、中间事件或结束事件；连接到其他元素；添加注释；更改类型；着色；删除。在池或泳道上可以添加泳道。
- **选择与移动**——单击、Shift+单击，或在空白画布上拖出矩形。拖动会移动所选内容：池或展开子流程的内容随之移动，边界事件随其活动移动，连线会重新布线。拖入其他泳道、子流程或池的任务，在文件中也会移到那里。
- **调整大小**——活动、子流程、池、泳道、组和注释的角柄。
- **命名**——双击（或 F2）后输入；Enter 保存，Shift+Enter 换行，Escape 取消。
- **属性**——右侧面板：id、名称、类型、事件定义、是否中断、循环、条件与默认流、文档。
- **键盘**——Delete、Ctrl+Z / Ctrl+Shift+Z（Ctrl+Y）、Ctrl+A、方向键微移（按住 Shift 为 10 px）、Escape。
- **画布**——滚动平移，Ctrl+滚动缩放，空格+拖动或鼠标中键平移；缩放与"适应屏幕"在右下角。
- **下载**——`.bpmn` 文件或 `.svg` 图片。

### 属性与事件

| 属性         | 类型                 | 默认值   | 含义                                     |
| ------------ | -------------------- | -------- | ---------------------------------------- |
| `modelValue` | `string \| null`     | `null`   | 文件的 XML（`v-model`）；为空表示新图    |
| `readonly`   | `boolean`            | `false`  | 查看器：平移、缩放、点击                 |
| `properties` | `boolean`            | `false`  | 一开始就显示属性面板                     |
| `diagram`    | `string \| number`   | 第一个   | 文件中的哪个图                           |
| `highlight`  | `string[]`           | `[]`     | 需要描边高亮的元素                       |
| `locale`     | `string`             | 页面语言 | `ru…` 为俄语，否则为英语                 |
| `labels`     | `Partial<BpmnLabels>`| —        | 覆盖界面文本                             |

| 事件                | 数据       | 时机                                   |
| ------------------- | ---------- | -------------------------------------- |
| `update:modelValue` | `string`   | 每次修改、撤销和重做之后               |
| `change`            | `string`   | 同上                                   |
| `select`            | `string[]` | 选择发生变化                           |
| `elementClick`      | `string`   | 点击了某个元素                         |
| `error`             | `Error`    | 表示法不允许的操作，或无法读取的文件   |

组件对外提供 `document`（`BpmnDocument`）、`fit()`、`undo()`、`redo()`、`toSvg()` 和 `selection`。

`BpmnView` 是只读版本：`<BpmnView :xml="xml" :highlight="['Task_1']" @element-click="…" />`。

编辑器跟随页面的 `@dskripchenko/ui` 主题（浅色或深色）；也可以设置绘图本身的变量（见[主题](theming.md)）。

## 编辑核心

`BpmnDocument` 可在任何地方运行——Node、Worker，或其他界面背后：

```ts
import { BpmnDocument } from '@dskripchenko/bpmn'

const doc = new BpmnDocument() // 或 new BpmnDocument(xml)
const task = doc.createShape('userTask', { x: 300, y: 120 }, { name: '检查订单' })
doc.connect('StartEvent_1', task)
doc.undo()
doc.redo()
save(doc.xml)
```

每个操作都是一步历史记录，要么完整执行，要么保持文件原样；被禁止的操作会抛出 `BpmnError`。

| 操作                                        | 作用                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `createShape(type, centre, options?)`       | 添加形状；`options`：`name`、`eventDefinition`、`attachTo`（边界事件）、`expanded`、`size`。在流程图上添加池会把流程包进去 |
| `addLane(pool, name?)`                      | 添加泳道；第一次调用会把池分成两条                                   |
| `connect(source, target)`                   | 添加表示法允许的流：顺序流、消息流、关联、数据关联                   |
| `canConnect(source, target)`                | 该流的类型，或 `null`                                                |
| `move(ids, dx, dy)`                         | 移动形状及其内容；连线随之移动；放到别处时容器随之改变               |
| `resize(id, bounds)`                        | 调整大小；池与其泳道相互跟随                                         |
| `remove(ids)`                               | 连同内容、边界事件、连线和引用一起删除                               |
| `rename(id, text)`                          | 名称、注释文本或组的类别                                             |
| `setType(id, type)`                         | 在同一族内：任务 → 用户任务，网关 → 并行，开始 → 结束                |
| `setEventDefinition(id, kind?)`             | `message`、`timer`、`error`……或无                                    |
| `setLoop(id, loop)`                         | `none`、`standard`、`parallel`、`sequential`                         |
| `setCondition(flow, text)`                  | 顺序流的条件                                                         |
| `setDefaultFlow(flow, isDefault?)`          | 网关或活动的默认流                                                   |
| `setDocumentation(id, text)`                | 文档                                                                 |
| `setAttribute(id, name, value?)`            | 任意普通属性（`isExecutable`、`cancelActivity` 等）                  |
| `setId(id, next)`                           | 重命名 id 及其所有引用                                               |
| `setColors(ids, { fill?, stroke? })`        | 颜色，按 bpmn.io 与 OMG 扩展的方式存储                               |
| `setWaypoints(flow, points)`                | 连线的折点                                                           |
| `setLabelBounds(id, bounds)`                | 外部标签的位置                                                       |

读取：`model`、`diagram`、`xml`、`element(id)`、`shape(id)`、`ends(flow)`、`processOf(id)`、`containerAt(point)`、`canUndo`、`canRedo`、`onChange(listener)`、`load(xml)`。新 id 遵循建模工具的格式（`Activity_0b1x2yz`、`Flow_…`）。

若要构建自己的界面，`hitTest`、`elementsIn`、`borderOf` 以及视口函数（`zoomAt`、`fitView`、`toWorld`）可以回答编辑器需要的几何问题。
