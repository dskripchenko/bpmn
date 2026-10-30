---
'@dskripchenko/bpmn': minor
---

DMN editing: `DmnDocument` (diagram: create, connect by requirement rules, move, resize, remove, rename, ids, colours; logic: decision tables — rules, cells, columns, hit policy — and literal expressions; undo), keeping the layout in DMNDI or, for DMN 1.1, `biodi`, and writing the computed layout into files that have none on their first change. `DmnEditor` and `DmnView` in `@dskripchenko/bpmn/vue`, with `DecisionTableEditor`. The BPMN editor now opens the name of an element placed from the palette reliably.
