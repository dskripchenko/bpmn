# 主题

每种颜色都是带浅色默认值的 CSS 自定义属性。可在 SVG 的任意祖先元素上设置：

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

| 变量                       | 默认值        | 用途                 |
| -------------------------- | ------------- | -------------------- |
| `--bpmn-font-family`       | Arial, …      | 所有文本             |
| `--bpmn-background`        | `transparent` | 绘图背景             |
| `--bpmn-stroke`            | `#22242a`     | 轮廓、流、标记       |
| `--bpmn-fill`              | `#ffffff`     | 形状填充             |
| `--bpmn-text`              | `#22242a`     | 名称                 |
| `--bpmn-pool-fill`         | `#ffffff`     | 池                   |
| `--bpmn-lane-fill`         | `transparent` | 泳道                 |
| `--bpmn-group-stroke`      | `#22242a`     | 组                   |
| `--bpmn-annotation-stroke` | `#22242a`     | 文本注释             |
| `--bpmn-label-halo`        | `#ffffff`     | 流名称背后的描边     |

该列表也以 `THEME_VARIABLES` 导出。

## 文件中的颜色

建模工具会为每个元素保存颜色——bpmn.io 使用 `bioc:fill`/`bioc:stroke`，其他工具使用 `color:background-color`/`color:border-color`——这些颜色会被绘制。它们只为所属元素设置相同的变量，其余主题仍然生效。仅当颜色为十六进制值、颜色名称或由数字组成的 `rgb()`/`hsl()` 时才会使用。

## 高亮元素

每个元素都带有其 id，页面可以为其设置样式：

```css
[data-element-id='Task_Check'] { --bpmn-stroke: #dc2626; --bpmn-fill: #fee2e2; }
```
