# @dskripchenko/bpmn

## 0.4.1

### Patch Changes

- 3b382e8: DMN auto layout (files without DMNDI): a requirement that has to go around something now runs through the gaps between layers — up out of the source, along the gap to a lane clear of every element in between, into the target from below — instead of leaving the source sideways along its row, where it could run under a neighbouring input. It leaves and enters on the lane's side, so it no longer shares a segment with the requirements that go straight up.

## 0.4.0

### Minor Changes

- 9ff5248: DMN editing: `DmnDocument` (diagram: create, connect by requirement rules, move, resize, remove, rename, ids, colours; logic: decision tables — rules, cells, columns, hit policy — and literal expressions; undo), keeping the layout in DMNDI or, for DMN 1.1, `biodi`, and writing the computed layout into files that have none on their first change. `DmnEditor` and `DmnView` in `@dskripchenko/bpmn/vue`, with `DecisionTableEditor`. The BPMN editor now opens the name of an element placed from the palette reliably.

## 0.3.0

### Minor Changes

- a740a9f: DMN: `parseDmn` reads DMN 1.1 to 1.5 (DMNDI, and bpmn.io's `biodi` layout in 1.1); `renderDmn` draws decision requirements diagrams to SVG — decisions, input data, business knowledge models, knowledge sources, decision services, annotations, every requirement kind — computing a layout for files without one; `renderDecision` renders decision tables (hit policies, typed inputs and outputs, rules, annotation columns) and literal expressions as escaped HTML with their own scoped stylesheet.

## 0.2.0

### Minor Changes

- a29edee: Editing: `BpmnDocument`, a framework-free core with undoable operations (create, move, resize, connect, remove, rename, change type, event definitions, loops, conditions, default flows, documentation, ids, colours, lanes and pools) that edits the XML in place so vendor extensions survive; and `@dskripchenko/bpmn/vue` with `BpmnEditor` (palette, context pad, label editing, properties panel, pan and zoom, download) and the read-only `BpmnView`. Hit-testing and viewport helpers are exported for interfaces of your own; `render` gains a `nested` option.

## 0.1.0

### Minor Changes

- 7b62b05: First release: BPMN 2.0 files to SVG as laid out by the modeler that saved them — every event, task, sub-process, gateway, data, artifact, pool, lane and flow of the notation; a safe lossless XML reader and writer; theming with CSS custom properties and the colours modelers store.
